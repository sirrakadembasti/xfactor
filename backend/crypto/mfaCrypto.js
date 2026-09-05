import crypto from 'node:crypto';

const ENVELOPE_VERSION = 'v1';
const IV_BYTES = 12;
const SECRET_HEX_LENGTH = 40;
const KEY_BYTES = 32;

function invalidKey() {
    return new Error('Invalid MFA_ENCRYPTION_KEY.');
}
function parseKey(value) {
    if (Buffer.isBuffer(value)) {
        if (value.length !== KEY_BYTES) throw invalidKey();
        return Buffer.from(value);
    }
    if (typeof value !== 'string' || value.length === 0) throw invalidKey();
    if (/^[0-9a-fA-F]{64}$/.test(value)) {
        return Buffer.from(value, 'hex');
    }
    if (value.length % 4 === 1 || !/^(?:[A-Za-z0-9+/]{2,4})*(?:={0,2})$/.test(value)) {
        throw invalidKey();
    }
    const decoded = Buffer.from(value, 'base64');
    const canonical = decoded.toString('base64');
    if (decoded.length !== KEY_BYTES ||
        (canonical !== value && canonical.replace(/=+$/, '') !== value)) {
        throw invalidKey();
    }
    return decoded;
}

function parsePreviousKeys(value) {
    if (value == null || value === '') return [];
    const entries = Array.isArray(value) ? value : String(value).split(',');
    return entries.filter(entry => String(entry).length > 0).map(parseKey);
}

export function getMfaEncryptionKeys(env = process.env) {
    const production = String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
    let current;
    if (env.MFA_ENCRYPTION_KEY != null && String(env.MFA_ENCRYPTION_KEY) !== '') {
        current = parseKey(String(env.MFA_ENCRYPTION_KEY));
    } else if (!production && typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.length > 0) {
        current = crypto.createHash('sha256').update(env.JWT_SECRET, 'utf8').digest();
    } else {
        throw invalidKey();
    }
    return { current, previous: parsePreviousKeys(env.MFA_PREVIOUS_ENCRYPTION_KEYS) };
}

function assertPlaintextSecret(plaintextHex) {
    if (typeof plaintextHex !== 'string' || !new RegExp(`^[0-9a-fA-F]{${SECRET_HEX_LENGTH}}$`).test(plaintextHex)) {
        throw new Error('Invalid MFA secret.');
    }
}

function assertKey(key) {
    if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw invalidKey();
}

export function encryptMfaSecret(plaintextHex, key) {
    assertPlaintextSecret(plaintextHex);
    assertKey(key);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintextHex, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENVELOPE_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function envelopeParts(payload) {
    if (typeof payload !== 'string') throw new Error('Invalid MFA secret payload.');
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION ||
        !/^[0-9a-f]{24}$/.test(parts[1]) ||
        !/^[0-9a-f]{32}$/.test(parts[2]) ||
        !/^[0-9a-f]{80}$/.test(parts[3])) {
        throw new Error('Invalid MFA secret payload.');
    }
    return { iv: Buffer.from(parts[1], 'hex'), tag: Buffer.from(parts[2], 'hex'), ciphertext: Buffer.from(parts[3], 'hex') };
}

function keyList(keys) {
    if (Array.isArray(keys)) return keys;
    if (keys && Buffer.isBuffer(keys.current)) return [keys.current, ...(keys.previous || [])];
    throw invalidKey();
}

export function decryptMfaSecret(payload, keys) {
    const { iv, tag, ciphertext } = envelopeParts(payload);
    const candidates = keyList(keys);
    if (candidates.length === 0) throw invalidKey();
    for (let keyIndex = 0; keyIndex < candidates.length; keyIndex++) {
        const key = candidates[keyIndex];
        assertKey(key);
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
            assertPlaintextSecret(plaintext);
            return { plaintext, keyIndex };
        } catch {
            // Try the next configured key without exposing key material or payload details.
        }
    }
    throw new Error('Unable to decrypt MFA secret.');
}
