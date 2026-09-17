import crypto from 'crypto';
import { db, dbEvents } from './db.js';
import { canTransitionProject, PROJECT_STATUS } from './engine/stateMachine.js';
import { decryptMfaSecret, encryptMfaSecret, getMfaEncryptionKeys } from './crypto/mfaCrypto.js';

function normalizeUsername(username) {
    return String(username ?? '').trim();
}

const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 256;

function assertPasswordLength(password) {
    if (
        typeof password !== 'string'
        || password.length < PASSWORD_MIN_LENGTH
        || password.length > PASSWORD_MAX_LENGTH
    ) {
        throw new Error(`Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
    }
}

function withImmediateTransaction(work) {
    db.exec('BEGIN IMMEDIATE;');
    try {
        const result = work();
        db.exec('COMMIT;');
        return result;
    } catch (error) {
        try {
            db.exec('ROLLBACK;');
        } catch {}
        throw error;
    }
}

function emitSessionRevoked(sessionId, userId) {
    if (sessionId && userId) {
        dbEvents.emit('sessionRevoked', { sessionId, userId });
    }
}

function emitUserSessionsRevoked(userId) {
    if (userId) {
        dbEvents.emit('userSessionsRevoked', { userId });
    }
}

function passwordHashMatches(userId, passwordHash) {
    if (passwordHash === undefined) {
        return true;
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    return row?.password_hash === passwordHash;
}

export async function hashPasswordAsync(password) {
    assertPasswordLength(password);
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (err, derived) => {
            if (err) return reject(err);
            resolve(derived.toString('hex'));
        });
    });
    return `scrypt$${salt}$${derivedKey}`;
}

export function hashPassword(password) {
    assertPasswordLength(password);

    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derivedKey}`;
}

export async function verifyPasswordAsync(password, storedHash) {
    if (typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') {
        return false;
    }
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
        return false;
    }
    const [, salt, expectedHash] = parts;
    const actualHash = await new Promise((resolve) => {
        crypto.scrypt(password, salt, 64, (err, derived) => {
            if (err) return resolve('');
            resolve(derived.toString('hex'));
        });
    });
    if (!actualHash) return false;
    try {
        return crypto.timingSafeEqual(
            Buffer.from(actualHash, 'hex'),
            Buffer.from(expectedHash, 'hex')
        );
    } catch {
        return false;
    }
}

export function verifyPassword(password, storedHash) {
    if (typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') {
        return false;
    }

    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
        return false;
    }

    const [, salt, expectedHash] = parts;
    const actualHash = crypto.scryptSync(password, salt, 64).toString('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(actualHash, 'hex'),
            Buffer.from(expectedHash, 'hex')
        );
    } catch (error) {
        return false;
    }
}

let passwordVerifier = verifyPasswordAsync;
let syncPasswordVerifier = verifyPassword;
const DUMMY_PASSWORD_HASH = hashPassword('dummy-password-verification-value');

export function setPasswordVerifierForTests(verifier) {
    passwordVerifier = typeof verifier === 'function' ? verifier : verifyPasswordAsync;
    syncPasswordVerifier = typeof verifier === 'function' ? verifier : verifyPassword;
}

export async function authenticateUserAsync(username, password) {
    const user = findUserByUsername(username);
    const verified = await passwordVerifier(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    return user && verified ? user : null;
}

export function generateTotpSecret(userId, env = process.env) {
    const keys = getMfaEncryptionKeys(env);
    const secret = crypto.randomBytes(20).toString('hex');
    const encrypted = encryptMfaSecret(secret, keys.current);
    db.prepare('UPDATE users SET totp_secret = ?, mfa_enabled = 1 WHERE id = ?').run(encrypted, userId);
    return secret;
}

function decodeTotpSecret(storedSecret, keys) {
    if (/^[0-9a-fA-F]{40}$/.test(storedSecret)) {
        return { plaintext: storedSecret, keyIndex: -1 };
    }
    return decryptMfaSecret(storedSecret, keys);
}

function matchingTotpCounter(secret, token, nowMs = Date.now()) {
    if (typeof secret !== 'string' || typeof token !== 'string') {
        return null;
    }
    const cleanToken = token.trim();
    if (!/^\d{6}$/.test(cleanToken)) {
        return null;
    }

    const currentCounter = Math.floor(nowMs / 1000 / 30);
    for (let offset = -1; offset <= 1; offset++) {
        const counter = currentCounter + offset;
        const counterBuf = Buffer.alloc(8);
        counterBuf.writeBigInt64BE(BigInt(counter));
        const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex')).update(counterBuf).digest();
        const codeOffset = hmac[hmac.length - 1] & 0x0f;
        const binary = ((hmac[codeOffset] & 0x7f) << 24)
            | ((hmac[codeOffset + 1] & 0xff) << 16)
            | ((hmac[codeOffset + 2] & 0xff) << 8)
            | (hmac[codeOffset + 3] & 0xff);
        const otp = (binary % 1000000).toString().padStart(6, '0');
        if (crypto.timingSafeEqual(Buffer.from(otp), Buffer.from(cleanToken))) {
            return counter;
        }
    }
    return null;
}

export function verifyUserTotp(user, token, env = process.env) {
    if (!user || typeof user.totpSecret !== 'string') {
        return false;
    }

    const storedSecret = user.totpSecret;
    let plaintext;
    let keyIndex = -1;
    let keys;
    try {
        keys = getMfaEncryptionKeys(env);
        ({ plaintext, keyIndex } = decodeTotpSecret(storedSecret, keys));
    } catch {
        return false;
    }

    if (matchingTotpCounter(plaintext, token) === null) {
        return false;
    }

    if (keyIndex !== 0) {
        const encrypted = encryptMfaSecret(plaintext, keys.current);
        db.prepare(`
            UPDATE users
            SET totp_secret = ?
            WHERE id = ? AND totp_secret = ?
        `).run(encrypted, user.id, storedSecret);
    }
    return true;
}

export function verifyTotpToken(secret, token) {
    return matchingTotpCounter(secret, token) !== null;
}


function mapUserRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        isAdmin: row.is_admin === 1,
        mfaEnabled: row.mfa_enabled === 1,
        totpSecret: row.totp_secret || null
    };
}

export function toPublicUser(user) {
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin === true
    };
}

export function findUserByUsername(username) {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) {
        return null;
    }

    return mapUserRow(db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername));
}

export function getUserById(userId) {
    return mapUserRow(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

export function createUser(username, password) {
    const cleanUsername = normalizeUsername(username);
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanUsername)) {
        throw new Error('Username must be 3-32 chars and contain only letters, numbers, underscore or hyphen.');
    }

    assertPasswordLength(password);

    const existing = findUserByUsername(cleanUsername);
    if (existing) {
        return existing;
    }

    const id = crypto.randomUUID();
    const passwordHash = hashPassword(password);

    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
      .run(id, cleanUsername, passwordHash);

    return {
        id,
        username: cleanUsername,
        passwordHash,
        isAdmin: false
    };
}

export function authenticateUser(username, password) {
    const user = findUserByUsername(username);
    const verified = syncPasswordVerifier(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    return user && verified === true ? user : null;
}

export function promoteUserToAdmin(username, password) {
    let user = findUserByUsername(username);
    if (user && !verifyPassword(password, user.passwordHash)) {
        throw new Error('Existing user credentials do not match.');
    }
    if (!user) {
        user = createUser(username, password);
    }

    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    return toPublicUser({ ...user, isAdmin: true });
}
export async function ensureDefaultAdminUser() {
    if (!db) return null;
    const existing = findUserByUsername('admin');
    if (existing) {
        return existing;
    }
    const id = crypto.randomUUID();
    const passwordHash = await hashPasswordAsync('xfactor');
    db.prepare('INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run(id, 'admin', passwordHash);
    return {
        id,
        username: 'admin',
        passwordHash,
        isAdmin: true
    };
}

export function changeUserPassword(username, currentPassword, newPassword) {
    assertPasswordLength(newPassword);
    const passwordHash = hashPassword(newPassword);
    const result = withImmediateTransaction(() => {
        const user = findUserByUsername(username);
        if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
            throw new Error('Existing user credentials do not match.');
        }

        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
        const revoked = revokeAllSessionsForUserInTransaction(user.id);
        return { user: toPublicUser(user), revoked, userId: user.id };
    });
    if (result.revoked) {
        emitUserSessionsRevoked(result.userId);
    }
    return result.user;
}

export function resetUserPassword(username, newPassword) {
    assertPasswordLength(newPassword);
    const passwordHash = hashPassword(newPassword);
    const result = withImmediateTransaction(() => {
        const user = findUserByUsername(username);
        if (!user) {
            throw new Error('User not found.');
        }

        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
        const revoked = revokeAllSessionsForUserInTransaction(user.id);
        return { user: toPublicUser(user), revoked, userId: user.id };
    });
    if (result.revoked) {
        emitUserSessionsRevoked(result.userId);
    }
    return result.user;
}


export const PROJECT_LIFECYCLE = Object.values(PROJECT_STATUS);

export function isValidProjectStatus(status) {
    return typeof status === 'string' && PROJECT_LIFECYCLE.includes(status);
}

export function canTransitionProjectStatus(fromStatus, toStatus) {
    return canTransitionProject(fromStatus, toStatus);
}

export function getProjectRole(userId, projectId) {
    if (!userId || !projectId) {
        return null;
    }

    const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
    if (project && project.owner_id === userId) {
        return 'owner';
    }

    const row = db.prepare('SELECT role FROM project_owners WHERE project_id = ? AND user_id = ? LIMIT 1').get(projectId, userId);
    return row ? row.role : null;
}

export function userCanAccessProject(userId, projectId) {
    return Boolean(getProjectRole(userId, projectId));
}

export function canViewProject(userId, projectId) {
    return userCanAccessProject(userId, projectId);
}

export function canEditProject(userId, projectId) {
    const role = getProjectRole(userId, projectId);
    return role === 'owner' || role === 'editor';
}

export function canDeleteProject(userId, projectId) {
    return getProjectRole(userId, projectId) === 'owner';
}

export function createProjectForUser(userId, title) {
    const safeTitle = String(title ?? '').trim() || 'İsimsiz Proje';
    const id = `project-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    db.prepare(`
        INSERT INTO projects (id, title, status, plan, owner_id)
        VALUES (?, ?, 'planning', NULL, ?)
    `).run(id, safeTitle, userId);

    db.prepare(`
        INSERT INTO project_owners (project_id, user_id, role)
        VALUES (?, ?, 'owner')
    `).run(id, userId);

    return {
        id,
        title: safeTitle,
        ownerId: userId,
        status: 'planning'
    };
}

export function getUserProjects(userId) {
    return db.prepare(`
        SELECT p.id, p.title, p.status, p.owner_id AS ownerId, p.is_pinned AS isPinned, p.created_at AS createdAt
        FROM projects p
        INNER JOIN project_owners po ON po.project_id = p.id
        WHERE po.user_id = ?
        ORDER BY p.is_pinned DESC, p.created_at DESC
    `).all(userId).map(p => ({
        ...p,
        isPinned: Boolean(p.isPinned)
    }));
}
export function setProjectRole(projectId, userId, role) {
    const allowedRoles = new Set(['owner', 'editor', 'viewer']);
    const safeRole = allowedRoles.has(role) ? role : 'viewer';
    const existing = db.prepare('SELECT role FROM project_owners WHERE project_id = ? AND user_id = ?').get(projectId, userId);

    if (existing) {
        db.prepare('UPDATE project_owners SET role = ? WHERE project_id = ? AND user_id = ?').run(safeRole, projectId, userId);
        return { projectId, userId, role: safeRole };
    }

    db.prepare('INSERT INTO project_owners (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, userId, safeRole);
    return { projectId, userId, role: safeRole };
}

export function getProjectMembers(projectId) {
    const rows = db.prepare(`
        SELECT po.user_id AS userId, po.role, u.username
        FROM project_owners po
        INNER JOIN users u ON u.id = po.user_id
        WHERE po.project_id = ?
        ORDER BY po.role ASC, u.username ASC
    `).all(projectId);

    return rows.map((row) => ({
        userId: row.userId,
        role: row.role,
        username: row.username
    }));
}

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeNow(now) {
    const value = now instanceof Date ? now : new Date(now ?? Date.now());
    if (!Number.isFinite(value.getTime())) {
        throw new Error('Session clock must be a valid date.');
    }
    return value;
}

function mapSessionRow(row, nowMs) {
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= nowMs) {
        return null;
    }

    return {
        id: row.session_id,
        expiresAt: row.expires_at,
        user: {
            id: row.user_id,
            username: row.username,
            isAdmin: row.is_admin === 1
        }
    };
}

function readSession(whereClause, value, now) {
    const row = db.prepare(`
        SELECT
            s.id AS session_id,
            s.expires_at,
            s.revoked_at,
            u.id AS user_id,
            u.username,
            u.is_admin
        FROM user_sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE ${whereClause} = ?
        LIMIT 1
    `).get(value);
    return mapSessionRow(row, now.getTime());
}

function insertSession(userId, now) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    const sessionId = crypto.randomUUID();

    db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(now.toISOString());
    db.prepare(`
        INSERT INTO user_sessions (id, user_id, token_hash, expires_at, revoked_at)
        VALUES (?, ?, ?, ?, NULL)
    `).run(sessionId, userId, hashSessionToken(token), expiresAt);

    return { id: sessionId, userId, token, expiresAt };
}

export function createSession(userId, { now: nowInput, passwordHash } = {}) {
    const now = normalizeNow(nowInput);
    return withImmediateTransaction(() => {
        if (!passwordHashMatches(userId, passwordHash)) {
            return null;
        }
        return insertSession(userId, now);
    });
}

export function createSessionAfterTotp(userId, token, env = process.env, { now: nowInput, passwordHash } = {}) {
    let keys;
    try {
        keys = getMfaEncryptionKeys(env);
    } catch {
        return null;
    }

    const now = normalizeNow(nowInput);
    try {
        return withImmediateTransaction(() => {
            const row = db.prepare(`
                SELECT password_hash, totp_secret, totp_last_counter
                FROM users
                WHERE id = ? AND mfa_enabled = 1
            `).get(userId);
            if (
                !row
                || (passwordHash !== undefined && row.password_hash !== passwordHash)
                || typeof row.totp_secret !== 'string'
                || !row.totp_secret
            ) {
                return null;
            }

            const { plaintext, keyIndex } = decodeTotpSecret(row.totp_secret, keys);
            const counter = matchingTotpCounter(plaintext, token, now.getTime());
            if (counter === null) {
                return null;
            }

            const lastCounter = row.totp_last_counter === null
                || row.totp_last_counter === undefined
                ? null
                : Number(row.totp_last_counter);
            if (lastCounter !== null && (!Number.isSafeInteger(lastCounter) || counter <= lastCounter)) {
                return null;
            }

            const storedSecret = row.totp_secret;
            const nextSecret = keyIndex === 0
                ? storedSecret
                : encryptMfaSecret(plaintext, keys.current);
            const result = db.prepare(`
                UPDATE users
                SET totp_last_counter = ?, totp_secret = ?
                WHERE id = ?
                  AND mfa_enabled = 1
                  AND totp_secret = ?
                  AND (totp_last_counter IS NULL OR totp_last_counter < ?)
            `).run(counter, nextSecret, userId, storedSecret, counter);
            if (result.changes !== 1) {
                return null;
            }

            return insertSession(userId, now);
        });
    } catch {
        return null;
    }
}

export function verifySessionToken(token, { now: nowInput } = {}) {
    if (typeof token !== 'string' || !token.trim()) {
        return null;
    }

    const now = normalizeNow(nowInput);
    return readSession('s.token_hash', hashSessionToken(token), now);
}

export function verifySessionId(sessionId, { now: nowInput } = {}) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
        return null;
    }

    const now = normalizeNow(nowInput);
    return readSession('s.id', sessionId, now);
}

export function revokeSession(token) {
    if (typeof token !== 'string' || !token.trim()) {
        return false;
    }
    const tokenHash = hashSessionToken(token);

    const row = db.prepare(
        'SELECT id AS session_id, user_id FROM user_sessions WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1'
    ).get(tokenHash);
    const result = db.prepare(`
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE token_hash = ? AND revoked_at IS NULL
    `).run(tokenHash);

    if (result.changes > 0) {
        emitSessionRevoked(row?.session_id, row?.user_id);
    }
    return result.changes > 0;
}

function revokeAllSessionsForUserInTransaction(userId) {
    const result = db.prepare(`
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL
    `).run(userId);
    return result.changes > 0;
}

export function revokeAllSessionsForUser(userId) {
    const revoked = revokeAllSessionsForUserInTransaction(userId);
    if (revoked) {
        emitUserSessionsRevoked(userId);
    }
    return revoked;
}


export function cleanupExpiredSessions(now = new Date()) {
    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
    const result = db.prepare('DELETE FROM user_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND datetime(revoked_at, \'+7 days\') <= ?)').run(nowIso, nowIso);
    return result.changes;
}

export function listActiveSessionsForUser(userId, now = new Date()) {
    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
    return db.prepare(`
        SELECT id, expires_at, created_at
        FROM user_sessions
        WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
        ORDER BY expires_at DESC
    `).all(userId, nowIso);
}
