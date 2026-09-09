import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p9-session-revocation');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
process.env.NODE_ENV = 'test';
process.env.MFA_ENCRYPTION_KEY = '66'.repeat(32);
process.env.MFA_PREVIOUS_ENCRYPTION_KEYS = '';
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const [{ db }, auth, sessionAuth, { createAuthRouter }, { createProjectWebSocketHub }, security, { validateRuntimeConfig }] = await Promise.all([
    import('../db.js'),
    import('../auth.js'),
    import('../sessionAuth.js'),
    import('../routes/authRoutes.js'),
    import('../websocketHub.js'),
    import('../security.js'),
    import('../config.js')
]);
isolated.registerDatabase(db);
const {
    changeUserPassword,
    createProjectForUser,
    createSession,
    createUser,
    generateTotpSecret,
    getProjectRole,
    resetUserPassword,
    verifySessionId
} = auth;
const { createRequireAuth, createCsrfProtection } = sessionAuth;
const { isSecureTransportRequest, validateLoginPayload } = security;
const { runAsyncTest, finish } = createTestHarness();
const ALLOWED_ORIGIN = 'https://app.example.test';

const app = express();
app.use(express.json());
app.use('/api', createCsrfProtection({ allowedOrigins: [ALLOWED_ORIGIN] }));
app.use('/api', createAuthRouter({
    requireAuth: createRequireAuth({ production: false }),
    production: false
}));
const httpServer = http.createServer(app);
await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
});
const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

async function requestJson(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: {
            'content-type': 'application/json',
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { response, body };
}

function currentTotp(secret) {
    const counter = Math.floor(Date.now() / 30_000);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex')).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
}

function activeSessionCount(userId) {
    return db.prepare(
        'SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL'
    ).get(userId).count;
}

function sessionCookie(token) {
    return `xfactor_session=${token}`;
}

class TestSocket extends EventEmitter {
    constructor() {
        super();
        this.readyState = 1;
        this.bufferedAmount = 0;
        this.sent = [];
        this.closeCalls = [];
    }

    send(payload) {
        if (this.readyState !== 1) throw new Error('socket is closed');
        this.sent.push(JSON.parse(payload));
    }

    close(code, reason) {
        if (this.readyState !== 1) return;
        this.closeCalls.push({ code, reason: String(reason) });
        this.readyState = 3;
        this.emit('close');
    }

    terminate() {
        this.readyState = 3;
        this.emit('close');
    }

    ping() {}
}

function subscribe(hub, socket, projectId) {
    hub.handleConnection(socket, { url: '/ws/logs', authSessionId: socket.authSessionId });
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'subscribe', projectId })), false);
    assert.deepEqual(socket.sent.at(-1), { type: 'subscribed', projectId });
}

try {
    await runAsyncTest('password reset revokes an old cookie accepted by the real session endpoint', async () => {
        const password = 'ResetSessionPassword!2026';
        const user = createUser('p9-reset-session', password);
        const session = createSession(user.id);
        const cookie = sessionCookie(session.token);
        const beforeReset = await requestJson('/api/session', { headers: { cookie } });
        assert.equal(beforeReset.response.status, 200);

        resetUserPassword(user.username, 'ResetSessionPassword!2027');

        const afterReset = await requestJson('/api/session', { headers: { cookie } });
        assert.equal(afterReset.response.status, 401);
        assert.equal(activeSessionCount(user.id), 0);
    });

    await runAsyncTest('concurrent reuse of one valid TOTP step creates exactly one session', async () => {
        const password = 'ConcurrentTotpPassword!2026';
        const user = createUser('p9-concurrent-totp', password);
        const secret = generateTotpSecret(user.id);
        const headers = {
            origin: ALLOWED_ORIGIN,
            'x-xfactor-csrf': '1'
        };
        const payload = JSON.stringify({ username: user.username, password, totp: currentTotp(secret) });
        const responses = await Promise.all([
            requestJson('/api/login', { method: 'POST', headers, body: payload }),
            requestJson('/api/login', { method: 'POST', headers, body: payload })
        ]);

        assert.equal(responses.filter(({ response }) => response.status === 200).length, 1);
        assert.equal(activeSessionCount(user.id), 1);
    });

    await runAsyncTest('DB revocation blocks later websocket message/publication and local matching sockets close', async () => {
        const owner = createUser('p9-ws-owner', 'WsOwnerPassword!2026');
        const other = createUser('p9-ws-other', 'WsOtherPassword!2026');
        const ownerProject = createProjectForUser(owner.id, 'Owner project');
        const otherProject = createProjectForUser(other.id, 'Other project');
        const ownerSession = createSession(owner.id);
        const localSession = createSession(owner.id);
        const otherSession = createSession(other.id);
        const messageSocket = new TestSocket();
        const publicationSocket = new TestSocket();
        const localSocket = new TestSocket();
        const otherSocket = new TestSocket();
        const hub = createProjectWebSocketHub({ getProjectRole, verifySessionId });
        const externalDb = new DatabaseSync(isolated.dbPath);
        externalDb.exec('PRAGMA busy_timeout = 5000;');

        try {
            messageSocket.authSessionId = ownerSession.id;
            publicationSocket.authSessionId = ownerSession.id;
            localSocket.authSessionId = localSession.id;
            otherSocket.authSessionId = otherSession.id;
            subscribe(hub, messageSocket, ownerProject.id);
            subscribe(hub, publicationSocket, ownerProject.id);
            subscribe(hub, localSocket, ownerProject.id);
            subscribe(hub, otherSocket, otherProject.id);

            externalDb.prepare(
                'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(ownerSession.id);

            messageSocket.emit(
                'message',
                Buffer.from(JSON.stringify({ type: 'subscribe', projectId: ownerProject.id })),
                false
            );
            assert.equal(messageSocket.closeCalls.at(-1)?.code, 1008);
            assert.equal(messageSocket.closeCalls.at(-1)?.reason, 'SESSION_INVALID');

            hub.publish({ projectId: ownerProject.id, type: 'log', message: 'must not publish' });
            assert.equal(publicationSocket.closeCalls.at(-1)?.code, 1008);
            assert.equal(publicationSocket.closeCalls.at(-1)?.reason, 'SESSION_INVALID');
            assert.equal(publicationSocket.sent.some(payload => payload.type === 'log'), false);

            resetUserPassword(owner.username, 'WsOwnerPassword!2027');
            hub.closeUserSockets(owner.id);
            assert.equal(localSocket.closeCalls.at(-1)?.code, 1008);
            assert.equal(localSocket.closeCalls.at(-1)?.reason, 'SESSION_INVALID');
            assert.equal(otherSocket.readyState, 1);
        } finally {
            clearInterval(hub.heartbeatInterval);
            externalDb.close();
        }
    });

    await runAsyncTest('wrong current password and every out-of-range password leave user/session state unchanged', async () => {
        const originalPassword = 'PasswordBoundsOriginal!2026';
        const user = createUser('p9-password-bounds', originalPassword);
        createSession(user.id);
        const snapshot = () => ({
            user: db.prepare('SELECT password_hash, is_admin FROM users WHERE id = ?').get(user.id),
            sessions: db.prepare(
                'SELECT id, token_hash, expires_at, revoked_at FROM user_sessions WHERE user_id = ? ORDER BY id'
            ).all(user.id)
        });
        const before = snapshot();

        assert.throws(
            () => changeUserPassword(user.username, 'WrongCurrentPassword!2026', 'NewPassword!2027'),
            /credential/i
        );
        assert.deepEqual(snapshot(), before);

        for (const candidate of ['x'.repeat(11), 'x'.repeat(257)]) {
            assert.equal(validateLoginPayload({ username: user.username, password: candidate }), false);
            assert.throws(() => changeUserPassword(user.username, originalPassword, candidate), /password/i);
            assert.deepEqual(snapshot(), before);
            assert.throws(() => resetUserPassword(user.username, candidate), /password/i);
            assert.deepEqual(snapshot(), before);
            assert.throws(() => auth.createUser(`p9-invalid-${candidate.length}`, candidate), /password/i);
            assert.equal(db.prepare('SELECT id FROM users WHERE username = ?').get(`p9-invalid-${candidate.length}`), undefined);
        }

    });

    await runAsyncTest('production transport trusts only explicit loopback proxying and rejects foreign-origin mutation', async () => {
        const loopbackRequest = {
            socket: { remoteAddress: '127.0.0.1' },
            headers: { 'x-forwarded-proto': 'https' }
        };
        const foreignProxyRequest = {
            socket: { remoteAddress: '203.0.113.7' },
            headers: { 'x-forwarded-proto': 'https' }
        };
        assert.equal(
            isSecureTransportRequest(loopbackRequest, { production: true, trustProxy: 'loopback' }),
            true
        );
        assert.equal(
            isSecureTransportRequest(loopbackRequest, { production: true, trustProxy: false }),
            false
        );
        assert.equal(
            isSecureTransportRequest(foreignProxyRequest, { production: true, trustProxy: 'loopback' }),
            false
        );
        assert.doesNotThrow(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            TRUST_PROXY: 'loopback',
            ALLOWED_ORIGINS: ALLOWED_ORIGIN,
            ARTIFACTS_ROOT: path.dirname(isolated.dbPath),
            PROJECTS_ROOT: process.env.PROJECTS_ROOT,
            DB_PATH: isolated.dbPath,
            EXECUTION_WORKER_TOKEN: 'p9-test-worker-token',
            MFA_ENCRYPTION_KEY: '77'.repeat(32)
        }));
        assert.throws(() => validateRuntimeConfig({
            NODE_ENV: 'production',
            TRUST_PROXY: 'true',
            ALLOWED_ORIGINS: ALLOWED_ORIGIN,
            ARTIFACTS_ROOT: path.dirname(isolated.dbPath),
            PROJECTS_ROOT: process.env.PROJECTS_ROOT,
            DB_PATH: isolated.dbPath,
            EXECUTION_WORKER_TOKEN: 'p9-test-worker-token',
            MFA_ENCRYPTION_KEY: '77'.repeat(32)
        }), /TRUST_PROXY/i);

        const user = createUser('p9-origin-user', 'OriginPassword!2026');
        const before = activeSessionCount(user.id);
        const rejected = await requestJson('/api/login', {
            method: 'POST',
            headers: {
                origin: 'https://foreign.example',
                'x-xfactor-csrf': '1'
            },
            body: JSON.stringify({ username: user.username, password: 'OriginPassword!2026' })
        });
        assert.equal(rejected.response.status, 403);
        assert.equal(rejected.body.code, 'CSRF_REJECTED');
        assert.equal(activeSessionCount(user.id), before);
    });
} finally {
    await new Promise(resolve => httpServer.close(resolve));
    finish();
    await isolated.cleanup();
}
