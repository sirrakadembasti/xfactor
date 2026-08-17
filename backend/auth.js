import crypto from 'crypto';
import { db } from './db.js';

function normalizeUsername(username) {
    return String(username ?? '').trim();
}

export function hashPassword(password) {
    if (typeof password !== 'string' || password.length < 12) {
        throw new Error('Password must be a non-empty string with at least 12 characters.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derivedKey}`;
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

export function findUserByUsername(username) {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) {
        return null;
    }

    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername);
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash
    };
}

export function getUserById(userId) {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash
    };
}

export function createUser(username, password) {
    const cleanUsername = normalizeUsername(username);
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanUsername)) {
        throw new Error('Username must be 3-32 chars and contain only letters, numbers, underscore or hyphen.');
    }

    if (typeof password !== 'string' || password.length < 12) {
        throw new Error('Password must be at least 12 characters long.');
    }

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
        passwordHash
    };
}

export function authenticateUser(username, password) {
    const user = findUserByUsername(username);
    if (!user) {
        return null;
    }

    return verifyPassword(password, user.passwordHash) ? user : null;
}

export const PROJECT_LIFECYCLE = ['planning', 'pending_approval', 'running', 'paused', 'completed'];

export function isValidProjectStatus(status) {
    return typeof status === 'string' && PROJECT_LIFECYCLE.includes(status);
}

export function canTransitionProjectStatus(fromStatus, toStatus) {
    if (!isValidProjectStatus(fromStatus) || !isValidProjectStatus(toStatus)) {
        return false;
    }

    const allowed = {
        planning: ['pending_approval', 'running', 'completed'],
        pending_approval: ['running', 'completed'],
        running: ['paused', 'completed'],
        paused: ['running', 'completed', 'planning'],
        completed: []
    };

    return allowed[fromStatus]?.includes(toStatus) === true;
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

export function createSession(userId, opts = {}) {
    const ttlHours = Number(opts.ttlHours ?? 24);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
    const sessionId = crypto.randomUUID();

    db.prepare(`
        INSERT INTO user_sessions (id, user_id, token_hash, expires_at, revoked_at)
        VALUES (?, ?, ?, ?, NULL)
    `).run(sessionId, userId, crypto.createHash('sha256').update(token).digest('hex'), expiresAt);

    return { id: sessionId, userId, token, expiresAt };
}

export function verifySessionToken(token) {
    if (typeof token !== 'string' || !token.trim()) {
        return null;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = db.prepare(`
        SELECT user_id, expires_at, revoked_at
        FROM user_sessions
        WHERE token_hash = ?
        LIMIT 1
    `).get(tokenHash);

    if (!row) {
        return null;
    }

    if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
        return null;
    }

    return row.user_id;
}

export function revokeSession(token) {
    if (typeof token !== 'string' || !token.trim()) {
        return false;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = db.prepare(`
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE token_hash = ? AND revoked_at IS NULL
    `).run(tokenHash);

    return result.changes > 0;
}

export function revokeAllSessionsForUser(userId) {
    const result = db.prepare(`
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND revoked_at IS NULL
    `).run(userId);

    return result.changes > 0;
}
