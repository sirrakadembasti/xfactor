import fsSync from 'fs';
import path from 'path';
import { db } from '../db.js';
import { getProjectsRoot, isValidProjectId } from '../projectPaths.js';

function readProjectTitleFromDisk(dirPath, defaultTitle) {
    try {
        const pkgPath = path.join(dirPath, 'package.json');
        if (fsSync.existsSync(pkgPath)) {
            const pkgData = JSON.parse(fsSync.readFileSync(pkgPath, 'utf8'));
            if (pkgData && typeof pkgData === 'object') {
                const title = pkgData.title || pkgData.name || pkgData.description;
                if (title && typeof title === 'string' && title.trim().length > 0) {
                    return title.trim();
                }
            }
        }
    } catch {}

    try {
        const talimatPath = path.join(dirPath, 'TALIMATNAME.md');
        if (fsSync.existsSync(talimatPath)) {
            const content = fsSync.readFileSync(talimatPath, 'utf8');
            const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (line.startsWith('#')) {
                    const heading = line.replace(/^#+\s*/, '').trim();
                    if (heading.length > 0) return heading;
                }
            }
            if (lines.length > 0 && lines[0].length > 0) {
                return lines[0].slice(0, 100);
            }
        }
    } catch {}

    try {
        const statePath = path.join(dirPath, 'state.json');
        if (fsSync.existsSync(statePath)) {
            const stateData = JSON.parse(fsSync.readFileSync(statePath, 'utf8'));
            if (stateData && typeof stateData === 'object') {
                const title = stateData.title || stateData.name;
                if (title && typeof title === 'string' && title.trim().length > 0) {
                    return title.trim();
                }
            }
        }
    } catch {}

    return defaultTitle;
}
function detectProjectStatusFromDisk(dirPath) {
    try {
        const statePath = path.join(dirPath, 'state.json');
        if (fsSync.existsSync(statePath)) {
            const state = JSON.parse(fsSync.readFileSync(statePath, 'utf8'));
            if (state && typeof state.status === 'string' && state.status.trim()) {
                return state.status.trim();
            }
        }
        const raporPath = path.join(dirPath, 'RAPOR.md');
        if (fsSync.existsSync(raporPath)) {
            return 'completed';
        }
    } catch {}
    return 'planning';
}


/**
 * Safely registers valid unimported directories found in projectsRoot into SQLite projects table.
 */
export function autoRegisterDiscoveredProjects({ env = process.env, projectsRoot = null, database = db } = {}) {
    const root = projectsRoot || getProjectsRoot(env);

    if (!fsSync.existsSync(root)) {
        return {
            success: false,
            error: `Projects root "${root}" does not exist`,
            registered: []
        };
    }

    let entries;
    try {
        entries = fsSync.readdirSync(root, { withFileTypes: true });
    } catch (error) {
        return {
            success: false,
            error: `Projects root "${root}" could not be read: ${error.message}`,
            registered: []
        };
    }

    const validDiskDirs = [];
    for (const d of entries) {
        if (!d.isDirectory() || d.name.startsWith('.')) continue;
        if (isValidProjectId(d.name)) {
            validDiskDirs.push(d.name);
        }
    }

    const dbProjects = database.prepare('SELECT id FROM projects').all().map(p => p.id);
    const dbSet = new Set(dbProjects);
    const registered = [];
    const nowIso = new Date().toISOString();
    const insertStmt = database.prepare(
        'INSERT INTO projects (id, title, status, plan, is_pinned, created_at) VALUES (?, ?, ?, NULL, 0, ?)'
    );
    let adminUser = null;
    let insertOwnerStmt = null;
    try {
        adminUser = database.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
        if (adminUser) {
            insertOwnerStmt = database.prepare(
                'INSERT OR IGNORE INTO project_owners (project_id, user_id, role, created_at) VALUES (?, ?, "owner", ?)'
            );
        }
    } catch {}

    database.exec('BEGIN IMMEDIATE;');
    try {
        for (const diskId of validDiskDirs) {
            if (!dbSet.has(diskId)) {
                const dirPath = path.join(root, diskId);
                const title = readProjectTitleFromDisk(dirPath, diskId);
                const status = detectProjectStatusFromDisk(dirPath);
                insertStmt.run(diskId, title, status, nowIso);
                if (insertOwnerStmt && adminUser) {
                    insertOwnerStmt.run(diskId, adminUser.id, nowIso);
                }
                registered.push({ id: diskId, title, status });
            }
        }
        if (adminUser) {
            database.prepare(`
                INSERT OR IGNORE INTO project_owners (project_id, user_id, role, created_at)
                SELECT p.id, ?, 'owner', ?
                FROM projects p
                LEFT JOIN project_owners po ON po.project_id = p.id
                WHERE po.project_id IS NULL
            `).run(adminUser.id, nowIso);
        }
        database.exec('COMMIT;');
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }

    return { success: true, registered };
}

/**
 * Non-destructive reconciliation between SQLite `projects` and on-disk
 * project directories. NEVER deletes database rows: projects missing on
 * disk are collected into `missingOnDisk` for the caller to report.
 */
export function reconcileProjectsWithDisk({ env = process.env, projectsRoot = null, database = db, autoRegister = false } = {}) {
    const root = projectsRoot || getProjectsRoot(env);

    if (!fsSync.existsSync(root)) {
        return {
            success: false,
            error: `Projects root "${root}" does not exist`,
            syncedCount: 0,
            missingOnDisk: [],
            quarantined: [],
            unverified: [],
            cleanedOrphans: 0,
            orphansRemoved: 0
        };
    }

    let entries;
    try {
        entries = fsSync.readdirSync(root, { withFileTypes: true });
    } catch (error) {
        return {
            success: false,
            error: `Projects root "${root}" could not be read: ${error.message}`,
            syncedCount: 0,
            missingOnDisk: [],
            quarantined: [],
            unverified: [],
            cleanedOrphans: 0,
            orphansRemoved: 0
        };
    }
    const validDiskDirs = [];
    const quarantined = [];

    for (const d of entries) {
        if (!d.isDirectory() || d.name.startsWith('.')) continue;
        if (isValidProjectId(d.name)) {
            validDiskDirs.push(d.name);
        } else {
            quarantined.push(d.name);
        }
    }

    let autoRegistered = [];
    if (autoRegister) {
        const regRes = autoRegisterDiscoveredProjects({ env, projectsRoot: root, database });
        if (regRes.success) {
            autoRegistered = regRes.registered || [];
        }
    }

    const dbProjects = database.prepare('SELECT id FROM projects').all().map(p => p.id);
    const dbSet = new Set(dbProjects);
    const unverified = [];

    for (const diskId of validDiskDirs) {
        if (!dbSet.has(diskId)) {
            unverified.push({
                id: diskId,
                path: path.join(root, diskId),
                verified: false,
                reason: 'directory_not_registered'
            });
        }
    }

    let syncedCount = autoRegistered.length;
    const missingOnDisk = [];

    database.exec('BEGIN IMMEDIATE;');
    try {
        for (const dbId of dbProjects) {
            const expectedDir = path.join(root, dbId);
            if (!fsSync.existsSync(expectedDir)) {
                missingOnDisk.push(dbId);
            }
        }
        database.exec('COMMIT;');
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }

    return {
        success: true,
        syncedCount,
        missingOnDisk,
        quarantined,
        unverified,
        autoRegistered,
        cleanedOrphans: 0,
        orphansRemoved: 0
    };
}
