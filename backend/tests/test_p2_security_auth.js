import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { createTestHarness } from './testHarness.js';
import { createSecurityHeadersMiddleware, isSecureTransportRequest } from '../security.js';
import {
    createUser,
    createSession,
    verifySessionToken,
    cleanupExpiredSessions,
    listActiveSessionsForUser,
    revokeSession
} from '../auth.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// P2.5: Security Headers
// =========================================================================
await runAsyncTest('P2.5 createSecurityHeadersMiddleware attaches nosniff, frameguard and CSP headers', async () => {
    const mw = createSecurityHeadersMiddleware({ production: false });
    const headers = {};
    const req = { socket: { remoteAddress: '127.0.0.1' } };
    const res = {
        setHeader: (name, value) => { headers[name.toLowerCase()] = value; }
    };
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(headers['x-frame-options'], 'DENY');
    assert.strictEqual(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(headers['content-security-policy'], /default-src 'self'/);
    assert.strictEqual(headers['strict-transport-security'], undefined, 'HSTS must not be set on non-production/insecure transport');
});

await runAsyncTest('P2.5 createSecurityHeadersMiddleware attaches HSTS when in production with secure transport', async () => {
    const mw = createSecurityHeadersMiddleware({ production: true });
    const headers = {};
    const req = {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-forwarded-proto': 'https' }
    };
    const res = {
        setHeader: (name, value) => { headers[name.toLowerCase()] = value; }
    };
    mw(req, res, () => {});

    assert.strictEqual(headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
});

// =========================================================================
// P2.8: Deterministic Package Manager & Engines
// =========================================================================
await runAsyncTest('P2.8 Backend and frontend declare consistent packageManager and engines', async () => {
    const backendPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    const frontendPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../frontend/package.json'), 'utf8'));

    assert.strictEqual(backendPkg.packageManager, 'npm@10.8.2');
    assert.strictEqual(backendPkg.engines?.node, '>=22.5.0');
    assert.strictEqual(frontendPkg.packageManager, 'npm@10.8.2');
    assert.strictEqual(frontendPkg.engines?.node, '>=22.5.0');
});

// =========================================================================
// P2.6: Async scrypt hashing & verification
// =========================================================================
await runAsyncTest('P2.6 hashPasswordAsync and verifyPasswordAsync work without blocking event loop', async () => {
    const { hashPasswordAsync, verifyPasswordAsync } = await import('../auth.js');
    const hash = await hashPasswordAsync('SecureAsyncPassword123!');
    assert.match(hash, /^scrypt\$/, 'Async hash must use scrypt format');

    const valid = await verifyPasswordAsync('SecureAsyncPassword123!', hash);
    assert.strictEqual(valid, true, 'Valid async password check must pass');

    const invalid = await verifyPasswordAsync('WrongPassword123456!', hash);
    assert.strictEqual(invalid, false, 'Invalid async password check must fail');
});

// =========================================================================
// P2.6: MFA / TOTP Secret Generation & Verification
// =========================================================================
await runAsyncTest('P2.6 TOTP secret generation and window verification work RFC-6238 compliant', async () => {
    const { createUser, generateTotpSecret, verifyTotpToken } = await import('../auth.js');
    const user = createUser('mfa_test_user_' + Date.now(), 'Password123456!');
    const secret = generateTotpSecret(user.id);
    assert.ok(typeof secret === 'string' && secret.length === 40, 'Secret must be 40 hex chars');

    // Generate valid TOTP token for current counter
    const crypto = await import('crypto');
    const currentCounter = Math.floor(Math.floor(Date.now() / 1000) / 30);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(currentCounter));
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex')).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    const validOtp = (binary % 1000000).toString().padStart(6, '0');
    assert.strictEqual(verifyTotpToken(secret, '1234567'), false, '7-digit token must return false safely without error');
    assert.strictEqual(verifyTotpToken(secret, 'abc'), false, 'Non-numeric token must return false safely');
    assert.strictEqual(verifyTotpToken(secret, ''), false, 'Empty token must return false');

    assert.strictEqual(verifyTotpToken(secret, validOtp), true, 'Valid OTP token must be accepted');
    assert.strictEqual(verifyTotpToken(secret, '000000'), false, 'Invalid OTP token must be rejected');
});

// =========================================================================
// P2.10 & P2.11: Production Container & CI Hardening
// =========================================================================
await runAsyncTest('P2.10 Dockerfile and .dockerignore strictly isolate secrets and build production container', async () => {
    const dockerfile = fs.readFileSync(path.resolve(__dirname, '../../Dockerfile'), 'utf8');
    const dockerignore = fs.readFileSync(path.resolve(__dirname, '../../.dockerignore'), 'utf8');

    assert.match(dockerfile, /FROM node:22\.5\.0-alpine/, 'Must use pinned node image');
    assert.match(dockerfile, /USER xfactor/, 'Must run as non-root user');
    assert.match(dockerfile, /HEALTHCHECK/, 'Must declare healthcheck');

    assert.match(dockerignore, /\.env/, 'Must exclude .env files');
    assert.match(dockerignore, /projects\/\*/, 'Must exclude project data');
    assert.match(dockerignore, /\*\.db/, 'Must exclude sqlite files');
});

await runAsyncTest('P2.11 CI workflow runs full test suite and frontend build', async () => {
    const ciYaml = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
    assert.match(ciYaml, /npm test/, 'Must execute npm test in CI');
    assert.match(ciYaml, /npm run build/, 'Must execute frontend build in CI');
});
// =========================================================================
// P2.6: Auth Operations & Session Cleanup
// =========================================================================
await runAsyncTest('P2.6 Session expiry cleanup removes expired sessions and lists active sessions', async () => {
    const user = createUser('p2_auth_user_' + Date.now(), 'Password123456!');
    const s1 = createSession(user.id);
    const active = listActiveSessionsForUser(user.id);
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].id, s1.id);

    // Call cleanup with future date
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const cleaned = cleanupExpiredSessions(futureDate);
    assert.ok(cleaned >= 1, 'Should clean up expired session');

    const activeAfter = listActiveSessionsForUser(user.id);
    assert.strictEqual(activeAfter.length, 0);
});

await finish();
