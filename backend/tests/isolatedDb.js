import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export async function setupIsolatedTestDb(testName) {
    const safeTestName = testName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `xfactor-${safeTestName}-`));
    const dbPath = path.join(tempDir, 'projects.db');
    const roots = {
        DB_PATH: dbPath,
        PROJECTS_ROOT: path.join(tempDir, 'projects'),
        ARTIFACTS_ROOT: path.join(tempDir, 'artifacts'),
        TRASH_ROOT: path.join(tempDir, 'trash')
    };
    const previousEnv = Object.fromEntries(Object.keys(roots).map(key => [key, process.env[key]]));
    const restoreEnv = () => {
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
    let database;
    let dbModule;
    let cleaned = false;
    try {
        // Directly executed suites must have the same filesystem isolation as
        // the outer test runner, before any runtime modules inspect defaults.
        Object.assign(process.env, roots);
        await Promise.all(Object.values(roots).filter(value => value !== dbPath)
            .map(root => fs.mkdir(root, { recursive: true })));
        dbModule = await import('../db.js');
        dbModule.closeDatabase();
        dbModule.initializeDatabase({ path: dbPath });
        database = dbModule.db;
    } catch (error) {
        restoreEnv();
        await fs.rm(tempDir, { recursive: true, force: true });
        throw error;
    }

    return {
        dbPath,
        registerDatabase(db) {
            database = db || dbModule.db;
        },
        async initializeDatabase() {
            dbModule.closeDatabase();
            dbModule.initializeDatabase({ path: dbPath });
            database = dbModule.db;
            return database;
        },
        async cleanup() {
            if (cleaned) return;
            try {
                if (dbModule.db === database) dbModule.closeDatabase();
                // Delete only this helper's fixed temporary directory, never a
                // directory supplied later through a test's environment override.
                await fs.rm(tempDir, {
                    recursive: true,
                    force: true,
                    maxRetries: 5,
                    retryDelay: 100
                });
                cleaned = true;
            } finally {
                restoreEnv();
            }
        }
    };
}
