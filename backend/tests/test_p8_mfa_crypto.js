import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { createTestHarness } from './testHarness.js';

const isolated = await setupIsolatedTestDb('p8-mfa-crypto');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
process.env.NODE_ENV = 'test';
process.env.MFA_ENCRYPTION_KEY = '11'.repeat(32);
process.env.MFA_PREVIOUS_ENCRYPTION_KEYS = '';
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const [{ db }, cryptoModule, authModule] = await Promise.all([
    import('../db.js'),
    import('../crypto/mfaCrypto.js'),
    import('../auth.js')
]);
isolated.registerDatabase(db);
const { getMfaEncryptionKeys, encryptMfaSecret, decryptMfaSecret } = cryptoModule;
const {
    createUser,
    generateTotpSecret,
    verifyUserTotp,
    toPublicUser,
    authenticateUser,
    authenticateUserAsync,
    setPasswordVerifierForTests
} = authModule;
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

try {
    await runAsyncTest('key parsing enforces production requirements and derives deterministic keys', async () => {
        const derived = getMfaEncryptionKeys({ NODE_ENV: 'test' }).current;
        assert.strictEqual(derived.toString('hex'), crypto.createHash('sha256').update('dev-secret').digest('hex'));
        const first = getMfaEncryptionKeys({ NODE_ENV: 'test', JWT_SECRET: 'first-secret' }).current;
        const second = getMfaEncryptionKeys({ NODE_ENV: 'test', JWT_SECRET: 'second-secret' }).current;
        assert.notDeepStrictEqual(first, second);
        const secret = 'aa'.repeat(20);
        const payload = encryptMfaSecret(secret, first);
        assert.strictEqual(decryptMfaSecret(payload, { current: first, previous: [] }).plaintext, secret);
        assert.throws(() => getMfaEncryptionKeys({ NODE_ENV: 'production' }), /MFA_ENCRYPTION_KEY/i);
        assert.throws(() => getMfaEncryptionKeys({ NODE_ENV: 'production', MFA_ENCRYPTION_KEY: '00' }), /MFA_ENCRYPTION_KEY/i);
    });

    await runAsyncTest('whitespace-padded comma previous keys and Buffer previous keys decrypt', async () => {
        const previousHex = '22'.repeat(32);
        const secret = 'bb'.repeat(20);
        const payload = encryptMfaSecret(secret, Buffer.from(previousHex, 'hex'));
        const padded = getMfaEncryptionKeys({
            NODE_ENV: 'test',
            MFA_ENCRYPTION_KEY: '11'.repeat(32),
            MFA_PREVIOUS_ENCRYPTION_KEYS: `  ${previousHex}  `
        });
        assert.strictEqual(decryptMfaSecret(payload, padded).plaintext, secret);
        const buffers = getMfaEncryptionKeys({
            NODE_ENV: 'test',
            MFA_ENCRYPTION_KEY: '11'.repeat(32),
            MFA_PREVIOUS_ENCRYPTION_KEYS: [Buffer.from(previousHex, 'hex')]
        });
        assert.strictEqual(decryptMfaSecret(payload, buffers).plaintext, secret);
    });

    await runAsyncTest('malformed previous key is rejected', async () => {
        assert.throws(() => getMfaEncryptionKeys({
            NODE_ENV: 'test',
            MFA_ENCRYPTION_KEY: '11'.repeat(32),
            MFA_PREVIOUS_ENCRYPTION_KEYS: ` ${'22'.repeat(32)}, malformed`
        }), /MFA_ENCRYPTION_KEY/i);
    });

    await runAsyncTest('empty previous key entry is rejected', async () => {
        assert.throws(() => getMfaEncryptionKeys({
            NODE_ENV: 'test',
            MFA_ENCRYPTION_KEY: '11'.repeat(32),
            MFA_PREVIOUS_ENCRYPTION_KEYS: `${'22'.repeat(32)},  `
        }), /MFA_ENCRYPTION_KEY/i);
    });
    await runAsyncTest('AES-GCM round trip uses a random 12-byte IV and preserves the 40-char secret', async () => {
        const keys = getMfaEncryptionKeys(process.env);
        const payload = encryptMfaSecret('ab'.repeat(20), keys.current);
        assert.match(payload, /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]{80}$/);
        assert.strictEqual(decryptMfaSecret(payload, keys).plaintext, 'ab'.repeat(20));
        assert.notStrictEqual(payload, encryptMfaSecret('ab'.repeat(20), keys.current));
    });

    await runAsyncTest('AES-GCM rejects changed IV, tag, or ciphertext', async () => {
        const keys = getMfaEncryptionKeys(process.env);
        const payload = encryptMfaSecret('cd'.repeat(20), keys.current);
        const parts = payload.split(':');
        for (const index of [1, 2, 3]) {
            const altered = [...parts];
            altered[index] = altered[index].replace(/^../, value => value === '00' ? '01' : '00');
            assert.throws(() => decryptMfaSecret(altered.join(':'), keys), /invalid|decrypt|payload/i);
        }
    });

    await runAsyncTest('invalid production key is rejected before enrollment mutation', async () => {
        const user = createUser('p8-invalid-key', 'StrongPassword123!');
        const before = db.prepare('SELECT totp_secret, mfa_enabled FROM users WHERE id = ?').get(user.id);
        assert.throws(() => generateTotpSecret(user.id, {
            NODE_ENV: 'production',
            MFA_ENCRYPTION_KEY: 'not-a-key'
        }), /MFA_ENCRYPTION_KEY/i);
        assert.deepStrictEqual(db.prepare('SELECT totp_secret, mfa_enabled FROM users WHERE id = ?').get(user.id), before);
    });

    await runAsyncTest('enrollment returns plaintext but stores only an encrypted payload', async () => {
        const user = createUser('p8-enrollment', 'StrongPassword123!');
        const secret = generateTotpSecret(user.id, process.env);
        const row = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id);
        assert.match(row.totp_secret, /^v1:/);
        assert.ok(!row.totp_secret.includes(secret));
        assert.strictEqual(secret.length, 40);
        assert.strictEqual(toPublicUser({ ...user, totpSecret: row.totp_secret }).totpSecret, undefined);
    });

    await runAsyncTest('legacy plaintext migrates only after a valid token', async () => {
        const user = createUser('p8-legacy', 'StrongPassword123!');
        const secret = 'ef'.repeat(20);
        db.prepare('UPDATE users SET totp_secret = ?, mfa_enabled = 1 WHERE id = ?').run(secret, user.id);
        const mapped = authModule.findUserByUsername(user.username);
        assert.strictEqual(verifyUserTotp(mapped, '000000', process.env), false);
        assert.strictEqual(db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id).totp_secret, secret);
        assert.strictEqual(verifyUserTotp(mapped, currentTotp(secret), process.env), true);
        assert.match(db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id).totp_secret, /^v1:/);
    });

    await runAsyncTest('previous-key ciphertext verifies and rotates with a CAS update', async () => {
        const previous = Buffer.alloc(32, 0x33);
        const env = { ...process.env, MFA_ENCRYPTION_KEY: '22'.repeat(32), MFA_PREVIOUS_ENCRYPTION_KEYS: previous.toString('hex') };
        const user = createUser('p8-rotation', 'StrongPassword123!');
        const secret = '12'.repeat(20);
        const oldPayload = encryptMfaSecret(secret, previous);
        db.prepare('UPDATE users SET totp_secret = ?, mfa_enabled = 1 WHERE id = ?').run(oldPayload, user.id);
        const mapped = authModule.findUserByUsername(user.username);
        assert.strictEqual(verifyUserTotp(mapped, currentTotp(secret), env), true);
        const rotated = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(user.id).totp_secret;
        assert.match(rotated, /^v1:/);
        assert.strictEqual(decryptMfaSecret(rotated, getMfaEncryptionKeys(env)).keyIndex, 0);
    });

    await runAsyncTest('unknown-user and wrong-password paths both invoke the same verifier', async () => {
        const user = createUser('p8-timing', 'StrongPassword123!');
        const calls = [];
        setPasswordVerifierForTests(async (password, hash) => {
            calls.push({ password, hash });
            return hash === user.passwordHash && password === 'StrongPassword123!';
        });
        await authenticateUserAsync(user.username, 'wrong-password');
        await authenticateUserAsync('p8-missing-user', 'wrong-password');
        setPasswordVerifierForTests(null);
        assert.strictEqual(calls.length, 2);
        assert.strictEqual(calls[0].hash, user.passwordHash);
        assert.match(calls[1].hash, /^scrypt\$/);
    });
    await runAsyncTest('synchronous unknown-user authentication invokes the dummy verifier', async () => {
        const calls = [];
        setPasswordVerifierForTests((password, hash) => {
            calls.push({ password, hash });
            return false;
        });
        assert.strictEqual(authenticateUser('p8-missing-sync', 'wrong-password'), null);
        setPasswordVerifierForTests(null);
        assert.strictEqual(calls.length, 1);
        assert.match(calls[0].hash, /^scrypt\$/);
    });
} finally {
    setPasswordVerifierForTests(null);
    finish();
    await isolated.cleanup();
}
