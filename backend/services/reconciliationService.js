import fsSync from 'fs';
import path from 'path';
import { db } from '../db.js';
import { getProjectsRoot, isValidProjectId } from '../projectPaths.js';

/**
 * Non-destructive reconciliation between SQLite `projects` and on-disk
 * project directories. NEVER deletes database rows: projects missing on
 * disk are collected into `missingOnDisk` for the caller to report.
 */
export function reconcileProjectsWithDisk({ env = process.env, projectsRoot = null } = {}) {
    const root = projectsRoot || getProjectsRoot(env);

    if (!fsSync.existsSync(root)) {
        return {
            success: false,
            error: `Projects root "${root}" does not exist`,
            syncedCount: 0,
            missingOnDisk: [],
            quarantined: [],
            cleanedOrphans: 0,
            orphansRemoved: 0
        };
    }

    const entries = fsSync.readdirSync(root, { withFileTypes: true });
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

    const dbProjects = db.prepare('SELECT id FROM projects').all().map(p => p.id);
    const dbSet = new Set(dbProjects);

    let syncedCount = 0;
    const missingOnDisk = [];

    db.exec('BEGIN IMMEDIATE;');
    try {
        for (const diskId of validDiskDirs) {
            if (!dbSet.has(diskId)) {
                db.prepare("INSERT INTO projects (id, title, status, plan, workflow_state) VALUES (?, ?, 'completed', NULL, NULL)").run(diskId, diskId);
                syncedCount++;
            }
        }
        for (const dbId of dbProjects) {
            const expectedDir = path.join(root, dbId);
            if (!fsSync.existsSync(expectedDir)) {
                missingOnDisk.push(dbId);
                // NEVER DELETE DB ROWS HERE!
            }
        }
        db.exec('COMMIT;');
    } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
    }

    return { success: true, syncedCount, missingOnDisk, quarantined, cleanedOrphans: 0, orphansRemoved: 0 };
}
