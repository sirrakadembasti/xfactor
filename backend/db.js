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
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { assertWorkflowLease } from './workflowAttempts.js';
import { MIGRATIONS, columnExists } from './db/migrations.js';

export { assertWorkflowLease } from './workflowAttempts.js';
export { MIGRATIONS, columnExists } from './db/migrations.js';

export const dbEvents = new EventEmitter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'projects.db');

export let db = null;

function configureDatabase(database) {
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec('PRAGMA journal_mode = WAL;');
    database.exec('PRAGMA synchronous = NORMAL;');
}

export function initializeDatabase({ path: databasePath = DEFAULT_DB_PATH } = {}) {
    if (db) return db;
    if (typeof databasePath !== 'string' || !databasePath.trim()) {
        throw new Error('A database path is required.');
    }
    if (databasePath !== ':memory:') {
        fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
    }
    const database = new DatabaseCtor(databasePath, { create: true });
    try {
        configureDatabase(database);
        runMigrations(database);
        database.exec('CREATE INDEX IF NOT EXISTS idx_project_owners_user_id ON project_owners(user_id)');
    } catch (error) {
        try { database.close(); } catch {}
        throw error;
    }
    db = database;
    return db;
}

export function closeDatabase() {
    if (!db) return;
    const current = db;
    db = null;
    current.close();
}

export function setBusyTimeout(timeoutMs, targetDb = db) {
    targetDb.exec(`PRAGMA busy_timeout = ${parseInt(timeoutMs, 10)};`);
}
export function runMigrations(targetDb = db) {
    targetDb.exec('PRAGMA busy_timeout = 5000;');
    targetDb.exec('PRAGMA foreign_keys = ON;');
    targetDb.exec('PRAGMA journal_mode = WAL;');
    targetDb.exec('PRAGMA synchronous = NORMAL;');
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
            // Table rebuilds must not run with enforcement on: dropping a parent table would
            // cascade-delete its children. The pragma cannot change inside a transaction, so it is
            // switched around it and every key is re-checked before the rebuild may commit.
            const rebuildsTables = migration.disableForeignKeys === true;
            if (rebuildsTables) targetDb.exec('PRAGMA foreign_keys = OFF;');
            targetDb.exec('BEGIN TRANSACTION;');
            try {
                migration.up(targetDb);
                if (rebuildsTables) {
                    const violations = targetDb.prepare('PRAGMA foreign_key_check').all();
                    if (violations.length) {
                        const sample = violations.slice(0, 5).map(row => `${row.table}#${row.rowid}->${row.parent}`).join(', ');
                        throw new Error(`Migration ${migration.name} would leave ${violations.length} foreign key violation(s): ${sample}`);
                    }
                }
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
            } finally {
                if (rebuildsTables) targetDb.exec('PRAGMA foreign_keys = ON;');
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


export function saveProjectLog(logData, leaseOptions = null) {
    const options = leaseOptions || (
        logData?.attemptId || logData?.leaseOwner
            ? { attemptId: logData.attemptId, leaseOwner: logData.leaseOwner }
            : null
    );
    const attemptId = options?.attemptId ?? null;
    const leaseOwner = options?.leaseOwner ?? null;
    db.exec('BEGIN IMMEDIATE;');
    try {
        if (options) {
            assertWorkflowLease(attemptId, leaseOwner, { projectId: logData.projectId, database: db });
        }
        db.prepare(`
            INSERT INTO project_logs (
                project_id, agent, action, file, message, node_id, parent_node_id, created_at, attempt_id, lease_owner
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            logData.projectId,
            logData.agent || null,
            logData.action || null,
            logData.file || null,
            logData.message || '',
            logData.node_id || null,
            logData.parent_node_id || null,
            logData.created_at || new Date().toISOString(),
            attemptId,
            leaseOwner
        );
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
}

export function getProjectLogs(projectId, { cursor = null, limit = 500 } = {}) {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 500);
    if (cursor === null || cursor === undefined || cursor === '') {
        const latest = db.prepare('SELECT * FROM project_logs WHERE project_id = ? ORDER BY id DESC LIMIT ?').all(projectId, safeLimit);
        return latest.reverse().map(formatProjectLog);
    }
    let query = 'SELECT * FROM project_logs WHERE project_id = ?';
    const params = [projectId];

    if (cursor !== null && cursor !== undefined) {
        query += ' AND id > ?';
        params.push(Number(cursor));
    }

    query += ' ORDER BY id ASC LIMIT ?';
    params.push(safeLimit);

    return db.prepare(query).all(...params).map(formatProjectLog);
}

function formatProjectLog(log) {
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
