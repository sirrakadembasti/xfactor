let DatabaseCtor;

if (typeof Bun !== 'undefined') {
    const sqlite = await import('bun:sqlite');
    DatabaseCtor = sqlite.Database;
} else {
    const sqlite = await import('node:sqlite');
    DatabaseCtor = sqlite.DatabaseSync || sqlite.default?.DatabaseSync;
}

if (!DatabaseCtor) {
    throw new Error('No SQLite database implementation available for this runtime.');
}

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { EventEmitter } from 'events';
import { logError, writeStructuredLog } from './observability.js';

import { getProjectsRoot, isValidProjectId } from './projectPaths.js';
import { reconcileStaleWorkflowAttempts } from './workflowAttempts.js';
export const dbEvents = new EventEmitter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'projects.db');
export const db = new DatabaseCtor(DB_PATH, { create: true });

function columnExists(database, tableName, columnName) {
    try {
        const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
        return columns.some((column) => column.name === columnName);
    } catch {
        return false;
    }
}

export const MIGRATIONS = [
    {
        version: 1,
        name: '001_initial_schema',
        up: (database) => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL,
                    plan TEXT,
                    owner_id TEXT,
                    is_pinned INTEGER DEFAULT 0,
                    workflow_state TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS project_owners (
                    project_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'owner',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (project_id, user_id),
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS user_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL,
                    expires_at DATETIME NOT NULL,
                    revoked_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                );
                
                CREATE TABLE IF NOT EXISTS chat_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    text_content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                );
                
                CREATE TABLE IF NOT EXISTS project_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    agent TEXT,
                    action TEXT,
                    file TEXT,
                    message TEXT,
                    node_id TEXT,
                    parent_node_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS workflow_attempts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    lease_owner TEXT NOT NULL,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_at DATETIME,
                    error TEXT,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                );
            `);
        }
    },
    {
        version: 2,
        name: '002_schema_indexes_and_extensions',
        up: (database) => {
            if (!columnExists(database, 'projects', 'owner_id')) {
                database.exec('ALTER TABLE projects ADD COLUMN owner_id TEXT');
            }
            if (!columnExists(database, 'projects', 'is_pinned')) {
                database.exec('ALTER TABLE projects ADD COLUMN is_pinned INTEGER DEFAULT 0');
            }
            if (!columnExists(database, 'projects', 'workflow_state')) {
                database.exec('ALTER TABLE projects ADD COLUMN workflow_state TEXT');
            }
            if (!columnExists(database, 'users', 'is_admin')) {
                database.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
            }
            database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_attempts_project ON workflow_attempts(project_id, status)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_attempts_heartbeat ON workflow_attempts(status, heartbeat_at)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_project_owners_user_id ON project_owners(user_id)');
        }
    },
    {
        version: 3,
        name: '003_workflow_attempts_running_unique_index',
        up: (database) => {
            // Önce varsa geçmiş testlerden kalma duplicate running attempt'leri stale_terminated yap
            database.exec(`
                UPDATE workflow_attempts
                SET status = 'stale_terminated', ended_at = CURRENT_TIMESTAMP
                WHERE status = 'running' AND id NOT IN (
                    SELECT id FROM workflow_attempts WHERE status = 'running' GROUP BY project_id HAVING MAX(started_at)
                );
            `);
            database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_attempts_running_unique ON workflow_attempts(project_id) WHERE status = \'running\'');
        }
    },
    {
        version: 4,
        name: '004_project_state_revision',
        up: (database) => {
            if (!columnExists(database, 'projects', 'revision')) {
                database.exec('ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
            }
        }
    },
    {
        version: 5,
        name: '005_db_constraints_and_indexes',
        up: (database) => {
            // 1. chat_history ve project_logs için bileşik indeksler
            database.exec('CREATE INDEX IF NOT EXISTS idx_chat_history_project_id ON chat_history(project_id, id)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_project_logs_project_id ON project_logs(project_id, id)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at, revoked_at)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)');
        }
    },
    {
        version: 6,
        name: '006_user_mfa_support',
        up: (database) => {
            if (!columnExists(database, 'users', 'totp_secret')) {
                database.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
            }
            if (!columnExists(database, 'users', 'mfa_enabled')) {
                database.exec('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0');
            }
        }
    }
];
export function runMigrations(targetDb = db) {
    targetDb.exec('PRAGMA foreign_keys = ON;');
    targetDb.exec('PRAGMA journal_mode = WAL;');
    targetDb.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const appliedRows = targetDb.prepare('SELECT version FROM schema_migrations').all();
    const appliedVersions = new Set(appliedRows.map(r => r.version));
    let appliedCount = 0;

    for (const migration of MIGRATIONS) {
        if (!appliedVersions.has(migration.version)) {
            targetDb.exec('BEGIN TRANSACTION;');
            try {
                migration.up(targetDb);
                targetDb.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
                    migration.version,
                    migration.name,
                    new Date().toISOString()
                );
                targetDb.exec('COMMIT;');
                appliedCount++;
            } catch (err) {
                targetDb.exec('ROLLBACK;');
                throw err;
            }
        }
    }

    return appliedCount;
}

export function getSchemaVersion(targetDb = db) {
    try {
        const row = targetDb.prepare('SELECT MAX(version) as max_version FROM schema_migrations').get();
        return row?.max_version || 0;
    } catch {
        return 0;
    }
}

export function checkpointWAL(targetDb = db) {
    try {
        targetDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Veritabanını başlat ve migration'ları uygula
runMigrations(db);
export function formatDBDate(dateVal) {
    if (!dateVal) return '';
    try {
        let d;
        if (typeof dateVal === 'string') {
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateVal)) {
                d = new Date(dateVal.replace(' ', 'T') + 'Z');
            } else {
                d = new Date(dateVal);
            }
        } else if (dateVal instanceof Date) {
            d = dateVal;
        } else {
            d = new Date(dateVal);
        }

        if (isNaN(d.getTime())) return String(dateVal);

        const formattedDate = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedTime = d.toLocaleTimeString('tr-TR', { hour12: false });
        return `${formattedDate} ${formattedTime}`;
    } catch {
        return String(dateVal);
    }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_project_owners_user_id ON project_owners(user_id)');

export function getProjectState(id) {
    const project = db.prepare('SELECT id, title, status, plan, is_pinned, workflow_state, revision, created_at FROM projects WHERE id = ?').get(id);
    if (!project) return null;

    let plan = null;
    if (project.plan) {
        try {
            plan = JSON.parse(project.plan);
        } catch {}
    }

    const chats = db.prepare('SELECT id, role, text_content, created_at FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(id);
    const chatHistory = chats.map(c => {
        const timestamp = formatDBDate(c.created_at);
        return {
            id: c.id,
            role: c.role,
            parts: [{ text: c.text_content }],
            timestamp: timestamp,
            created_at: c.created_at
        };
    });

    let workflow = null;
    if (project.workflow_state) {
        try {
            workflow = JSON.parse(project.workflow_state);
        } catch {}
    }

    return {
        id: project.id,
        title: project.title,
        status: project.status,
        isPinned: Boolean(project.is_pinned),
        createdAt: project.created_at,
        revision: project.revision || 1,
        plan,
        workflow,
        chatHistory
    };
}

export function saveProjectState(state) {
    const planStr = state.plan ? JSON.stringify(state.plan) : null;
    const workflowStr = state.workflow ? JSON.stringify(state.workflow) : null;
    const currentRevision = Number(state.revision || 1);
    const nextRevision = currentRevision + 1;

    const upsertProjectStmt = db.prepare(`
        INSERT INTO projects (id, title, status, plan, workflow_state, revision)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            status = excluded.status,
            plan = excluded.plan,
            workflow_state = excluded.workflow_state,
            revision = excluded.revision
    `);

    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');
    try {
        db.exec('BEGIN IMMEDIATE;');
        upsertProjectStmt.run(
            state.id,
            state.title,
            state.status,
            planStr,
            workflowStr,
            nextRevision
        );
        state.revision = nextRevision;

        const existingCount = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?').get(state.id).count;
        const chatsToSave = (state.chatHistory || []);

        for (let i = existingCount; i < chatsToSave.length; i++) {
            const chat = chatsToSave[i];
            const text = chat?.parts?.[0]?.text || '';
            const createdAt = chat.created_at || new Date().toISOString();
            insertChat.run(state.id, chat.role, text, createdAt);
        }
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
    dbEvents.emit(`stateChange:${state.id}`, state.status);
}

export function getAllProjects() {
    return db.prepare('SELECT id, title, status, is_pinned, created_at FROM projects ORDER BY is_pinned DESC, created_at DESC').all().map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        isPinned: Boolean(p.is_pinned),
        createdAt: p.created_at
    }));
}

export function updateProject(id, updates = {}) {
    const fields = [];
    const values = [];
    if (typeof updates.title === 'string' && updates.title.trim()) {
        fields.push('title = ?');
        values.push(updates.title.trim());
    }
    if (typeof updates.is_pinned !== 'undefined' || typeof updates.isPinned !== 'undefined') {
        const pinVal = updates.is_pinned !== undefined ? (updates.is_pinned ? 1 : 0) : (updates.isPinned ? 1 : 0);
        fields.push('is_pinned = ?');
        values.push(pinVal);
    }
    if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return getProjectState(id);
}

export function deleteProject(id) {
    db.exec('BEGIN');
    try {
        db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }

    // Disk üzerindeki klasörü de temizle
    try {
        const PROJECTS_DIR = path.join(__dirname, '../projects');
        const projectFolder = path.join(PROJECTS_DIR, id);
        if (fs.existsSync(projectFolder)) {
            fs.rmSync(projectFolder, { recursive: true, force: true });
        }
    } catch (error) {
        logError('db.project_directory_delete_failed', error, { projectId: id });
    }
    return true;
}

export function saveProjectLog(logData) {
    const insertLog = db.prepare(`
        INSERT INTO project_logs (project_id, agent, action, file, message, node_id, parent_node_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertLog.run(
        logData.projectId,
        logData.agent || null,
        logData.action || null,
        logData.file || null,
        logData.message || '',
        logData.node_id || null,
        logData.parent_node_id || null,
        logData.created_at || new Date().toISOString()
    );
}

export function getProjectLogs(projectId, { cursor = null, limit = 100 } = {}) {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 500);
    let query = 'SELECT * FROM project_logs WHERE project_id = ?';
    const params = [projectId];

    if (cursor !== null && cursor !== undefined) {
        query += ' AND id > ?';
        params.push(Number(cursor));
    }

    query += ' ORDER BY id ASC LIMIT ?';
    params.push(safeLimit);

    return db.prepare(query).all(...params).map(log => {
        const timestamp = formatDBDate(log.created_at);
        return {
            id: log.id,
            projectId: log.project_id,
            timestamp: timestamp,
            created_at: log.created_at,
            agent: log.agent,
            action: log.action,
            file: log.file,
            message: log.message,
            node_id: log.node_id,
            parent_node_id: log.parent_node_id
        };
    });
}

export function getProjectChatHistory(projectId, { cursor = null, limit = 100 } = {}) {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 500);
    let query = 'SELECT id, role, text_content, created_at FROM chat_history WHERE project_id = ?';
    const params = [projectId];

    if (cursor !== null && cursor !== undefined) {
        query += ' AND id > ?';
        params.push(Number(cursor));
    }

    query += ' ORDER BY id ASC LIMIT ?';
    params.push(safeLimit);

    return db.prepare(query).all(...params).map(c => ({
        id: c.id,
        role: c.role,
        parts: [{ text: c.text_content }],
        timestamp: formatDBDate(c.created_at),
        created_at: c.created_at
    }));
}

export function syncProjectsWithDisk(env = process.env) {
    const PROJECTS_DIR = getProjectsRoot(env);
    if (!fs.existsSync(PROJECTS_DIR)) {
        return { syncedOnDisk: 0, cleanedOrphans: 0 };
    }
    const onDiskProjectIds = new Set();
    try {
        const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.') && isValidProjectId(entry.name)) {
                onDiskProjectIds.add(entry.name);
                const exists = db.prepare('SELECT id, title, status FROM projects WHERE id = ?').get(entry.name);
                if (!exists) {
                    db.prepare('INSERT INTO projects (id, title, status, plan, is_pinned) VALUES (?, ?, ?, NULL, 0)')
                        .run(entry.name, entry.name, 'planning');
                    writeStructuredLog('info', 'db.project_sync_created', { projectId: entry.name });
                }
            }
        }
        const allDbProjects = db.prepare('SELECT id, title, status FROM projects').all();
        let cleanedCount = 0;
        for (const p of allDbProjects) {
            if (!onDiskProjectIds.has(p.id)) {
                db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(p.id);
                db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(p.id);
                db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(p.id);
                db.prepare('DELETE FROM workflow_attempts WHERE project_id = ?').run(p.id);
                db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            writeStructuredLog('info', 'db.project_sync_orphans_cleaned', { count: cleanedCount });
        }
        return { syncedOnDisk: onDiskProjectIds.size, cleanedOrphans: cleanedCount };
    } catch (error) {
        logError('db.project_sync_failed', error);
        return { error: 'PROJECT_SYNC_FAILED' };
    }
}

// Başlangıçta senkronizasyonu ve çökme kurtarmayı çalıştır
try {
    syncProjectsWithDisk();
} catch (error) {
    logError('db.startup_sync_failed', error);
}
try {
    reconcileStaleWorkflowAttempts();
} catch (error) {
    logError('db.startup_reconciliation_failed', error);
}
