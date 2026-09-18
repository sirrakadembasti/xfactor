import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
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

const [{ db, dbEvents }, auth, mfaCrypto, sessionAuth, { createAuthRouter }, { createProjectWebSocketHub }, security, { validateRuntimeConfig }] = await Promise.all([
    import('../db.js'),
    import('../auth.js'),
    import('../crypto/mfaCrypto.js'),
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
    revokeSession,
    verifySessionId
} = auth;
const { decryptMfaSecret, encryptMfaSecret, getMfaEncryptionKeys } = mfaCrypto;
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
function runTotpWorker({ username, password, token, env }) {
    const dbUrl = new URL('../db.js', import.meta.url).href;
    const authUrl = new URL('../auth.js', import.meta.url).href;
    const source = `
        const { initializeDatabase } = await import(${JSON.stringify(dbUrl)});
        initializeDatabase({ path: process.env.DB_PATH });
        const { authenticateUserAsync, createSessionAfterTotp } = await import(${JSON.stringify(authUrl)});
        const user = await authenticateUserAsync(${JSON.stringify(username)}, ${JSON.stringify(password)});
        const session = user
            ? createSessionAfterTotp(user.id, ${JSON.stringify(token)}, process.env)
            : null;
        process.stdout.write(JSON.stringify({ success: Boolean(session) }) + '\\n', () => process.exit(0));
    `;

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
            env: { ...process.env, ...env },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += String(chunk); });
        child.stderr.on('data', chunk => { stderr += String(chunk); });
        child.once('error', reject);
        child.once('close', code => {
            if (code !== 0) {
                reject(new Error(`TOTP worker failed (${code}): ${stderr}`));
                return;
            }
            try {
                resolve(JSON.parse(stdout.trim().split(/\\r?\\n/).filter(Boolean).at(-1)));
            } catch (error) {
                reject(new Error(`TOTP worker returned invalid output: ${error.message}`));
            }
        });
    });
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

function wireRevocationEvents(hub, observed) {
    const sessionListener = event => {
        observed.session = event;
        if (event?.sessionId) {
            hub.closeSessionSockets(event.sessionId);
        }
    };
    const userListener = event => {
        observed.user = event;
        if (event?.userId) {
            hub.closeUserSockets(event.userId);
        }
    };
    dbEvents.on('sessionRevoked', sessionListener);
    dbEvents.on('userSessionsRevoked', userListener);
    return () => {
        dbEvents.off('sessionRevoked', sessionListener);
        dbEvents.off('userSessionsRevoked', userListener);
    };
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

    await runAsyncTest('password reset racing in-flight authentication cannot mint a session', async () => {
        const password = 'StaleAuthenticationPassword!2026';
        const user = createUser('p9-stale-auth', password);
        let releaseVerifier;
        let verifierStartedResolve;
        const verifierStarted = new Promise(resolve => {
            verifierStartedResolve = resolve;
        });
        const verifierGate = new Promise(resolve => {
            releaseVerifier = resolve;
        });
        const realVerifier = auth.verifyPasswordAsync;
        auth.setPasswordVerifierForTests(async (candidate, storedHash) => {
            verifierStartedResolve();
            const verified = await realVerifier(candidate, storedHash);
            await verifierGate;
            return verified;
        });

        try {
            const pendingLogin = requestJson('/api/login', {
                method: 'POST',
                headers: {
                    origin: ALLOWED_ORIGIN,
                    'x-xfactor-csrf': '1'
                },
                body: JSON.stringify({ username: user.username, password })
            });
            await verifierStarted;
            resetUserPassword(user.username, 'StaleAuthenticationPassword!2027');
            releaseVerifier();

            const result = await pendingLogin;
            assert.equal(result.response.status, 401);
            assert.equal(activeSessionCount(user.id), 0);
        } finally {
            releaseVerifier?.();
            auth.setPasswordVerifierForTests(null);
        }
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

    await runAsyncTest('the same TOTP step across independent processes is consumed once and rotates a prior key', async () => {
        const password = 'ProcessTotpPassword!2026';
        const user = createUser('p9-process-totp', password);
        const currentKey = '99'.repeat(32);
        const previousKey = '88'.repeat(32);
        const plaintextSecret = crypto.randomBytes(20).toString('hex');
        const previousCiphertext = encryptMfaSecret(
            plaintextSecret,
            Buffer.from(previousKey, 'hex')
        );
        db.prepare(`
            UPDATE users
            SET totp_secret = ?, mfa_enabled = 1, totp_last_counter = NULL
            WHERE id = ?
        `).run(previousCiphertext, user.id);
        const token = currentTotp(plaintextSecret);
        const workerEnv = {
            DB_PATH: isolated.dbPath,
            PROJECTS_ROOT: process.env.PROJECTS_ROOT,
            NODE_ENV: 'test',
            MFA_ENCRYPTION_KEY: currentKey,
            MFA_PREVIOUS_ENCRYPTION_KEYS: previousKey
        };

        const [first, second] = await Promise.all([
            runTotpWorker({ username: user.username, password, token, env: workerEnv }),
            runTotpWorker({ username: user.username, password, token, env: workerEnv })
        ]);
        assert.equal([first.success, second.success].filter(Boolean).length, 1);
        assert.equal(activeSessionCount(user.id), 1);

        const row = db.prepare(
            'SELECT totp_secret, totp_last_counter FROM users WHERE id = ?'
        ).get(user.id);
        assert.equal(Number.isSafeInteger(row.totp_last_counter), true);
        assert.notEqual(row.totp_secret, previousCiphertext);
        assert.deepEqual(
            decryptMfaSecret(row.totp_secret, getMfaEncryptionKeys({
                NODE_ENV: 'test',
                MFA_ENCRYPTION_KEY: currentKey,
                MFA_PREVIOUS_ENCRYPTION_KEYS: previousKey
            })),
            { plaintext: plaintextSecret, keyIndex: 0 }
        );
    });

    await runAsyncTest('DB revocation blocks later websocket message/publication and local matching sockets close', async () => {
        const owner = createUser('p9-ws-owner', 'WsOwnerPassword!2026');
        const other = createUser('p9-ws-other', 'WsOtherPassword!2026');
        const ownerProject = createProjectForUser(owner.id, 'Owner project');
        const otherProject = createProjectForUser(other.id, 'Other project');
        const ownerSession = createSession(owner.id);
        const crossProcessSession = createSession(owner.id);
        const localSession = createSession(owner.id);
        const otherSession = createSession(other.id);
        const sessionSocket = new TestSocket();
        const messageSocket = new TestSocket();
        const publicationSocket = new TestSocket();
        const localSocket = new TestSocket();
        const otherSocket = new TestSocket();
        const hub = createProjectWebSocketHub({ getProjectRole, verifySessionId });
        const observedEvents = {};
        const removeRevocationListeners = wireRevocationEvents(hub, observedEvents);
        const externalDb = new DatabaseSync(isolated.dbPath);
        externalDb.exec('PRAGMA busy_timeout = 5000;');

        try {
            sessionSocket.authSessionId = ownerSession.id;
            messageSocket.authSessionId = crossProcessSession.id;
            publicationSocket.authSessionId = crossProcessSession.id;
            localSocket.authSessionId = localSession.id;
            otherSocket.authSessionId = otherSession.id;
            subscribe(hub, sessionSocket, ownerProject.id);
            subscribe(hub, messageSocket, ownerProject.id);
            subscribe(hub, publicationSocket, ownerProject.id);
            subscribe(hub, localSocket, ownerProject.id);
            subscribe(hub, otherSocket, otherProject.id);

            revokeSession(ownerSession.token);
            assert.deepEqual(observedEvents.session, {
                sessionId: ownerSession.id,
                userId: owner.id
            });
            assert.equal(sessionSocket.closeCalls.at(-1)?.code, 1008);
            assert.equal(sessionSocket.closeCalls.at(-1)?.reason, 'SESSION_INVALID');
            assert.equal(messageSocket.readyState, 1);
            assert.equal(publicationSocket.readyState, 1);
            assert.equal(localSocket.readyState, 1);
            assert.equal(otherSocket.readyState, 1);

            externalDb.prepare(
                'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(crossProcessSession.id);

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
            assert.deepEqual(observedEvents.user, { userId: owner.id });
            assert.equal(localSocket.closeCalls.at(-1)?.code, 1008);
            assert.equal(localSocket.closeCalls.at(-1)?.reason, 'SESSION_INVALID');
            assert.equal(otherSocket.readyState, 1);
        } finally {
            removeRevocationListeners();
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

        for (const candidate of ['x'.repeat(5), 'x'.repeat(257)]) {
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
