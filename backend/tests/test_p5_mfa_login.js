import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p5-mfa-login');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const [{ db }, { createUser, generateTotpSecret }, { createAuthRouter }] = await Promise.all([
    import('../db.js'),
    import('../auth.js'),
    import('../routes/authRoutes.js')
]);
isolated.registerDatabase(db);
const { runAsyncTest, finish } = createTestHarness();

function currentTotp(secret) {
    const counter = Math.floor(Math.floor(Date.now() / 1000) / 30);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex')).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return (binary % 1000000).toString().padStart(6, '0');
}

const normalUser = createUser('p5-normal-user', 'NormalPassword123!');
const mfaUser = createUser('p5-mfa-user', 'MfaPassword123456!');
const mfaSecret = generateTotpSecret(mfaUser.id);
const app = express();
app.use(express.json());
app.use(createAuthRouter({ requireAuth: () => {}, production: false }));
const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

async function postLogin(payload) {
    const response = await fetch(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', connection: 'close' },
        body: JSON.stringify(payload)
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
}

function activeSessionCount(userId) {
    return db.prepare('SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL').get(userId).count;
}

try {
    await runAsyncTest('MFA login challenges and rejects without creating sessions, then accepts current TOTP', async () => {
        const username = 'p5-mfa-user';
        const password = 'MfaPassword123456!';
        const challenge = await postLogin({ username, password });
        assert.strictEqual(challenge.status, 202);
        assert.deepStrictEqual(challenge.body, { mfaRequired: true });
        assert.strictEqual(challenge.headers.get('set-cookie'), null);
        assert.strictEqual(activeSessionCount(mfaUser.id), 0);

        const rejected = await postLogin({ username, password, totp: '000000' });
        assert.strictEqual(rejected.status, 401);
        assert.strictEqual(activeSessionCount(mfaUser.id), 0);

        const accepted = await postLogin({ username, password, totp: currentTotp(mfaSecret) });
        assert.strictEqual(accepted.status, 200);
        assert.match(accepted.headers.get('set-cookie'), /xfactor_session=/);
        assert.strictEqual(activeSessionCount(mfaUser.id), 1);
    });

    await runAsyncTest('normal user receives a session without TOTP', async () => {
        const accepted = await postLogin({ username: normalUser.username, password: 'NormalPassword123!' });
        assert.strictEqual(accepted.status, 200);
        assert.match(accepted.headers.get('set-cookie'), /xfactor_session=/);
    });

    await runAsyncTest('malformed TOTP is rejected as an invalid login payload', async () => {
        const response = await postLogin({ username: mfaUser.username, password: 'MfaPassword123456!', totp: '12345' });
        assert.strictEqual(response.status, 400);
        assert.strictEqual(activeSessionCount(mfaUser.id), 1);
    });
} finally {
    server.closeAllConnections();
    server.close();
    finish();
    await isolated.cleanup();
}
