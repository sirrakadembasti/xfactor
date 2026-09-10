import fsSync from 'fs';
import path from 'path';
import { db } from '../db.js';
import { getProjectsRoot, isValidProjectId } from '../projectPaths.js';

/**
 * Non-destructive reconciliation between SQLite `projects` and on-disk
 * project directories. NEVER deletes database rows: projects missing on
 * disk are collected into `missingOnDisk` for the caller to report.
 */
export function reconcileProjectsWithDisk({ env = process.env, projectsRoot = null, database = db } = {}) {
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
    const unverified = [];

    for (const d of entries) {
        if (!d.isDirectory() || d.name.startsWith('.')) continue;
        if (isValidProjectId(d.name)) {
            validDiskDirs.push(d.name);
        } else {
            quarantined.push(d.name);
        }
    }

    const dbProjects = database.prepare('SELECT id FROM projects').all().map(p => p.id);
    const dbSet = new Set(dbProjects);
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

    let syncedCount = 0;
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

    return { success: true, syncedCount, missingOnDisk, quarantined, unverified, cleanedOrphans: 0, orphansRemoved: 0 };
}
