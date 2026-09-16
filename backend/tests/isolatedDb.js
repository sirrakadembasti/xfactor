import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export async function setupIsolatedTestDb(testName) {
    const safeTestName = testName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `xfactor-${safeTestName}-`));
    const dbPath = path.join(tempDir, 'projects.db');
    let database;
    const dbModule = await import('../db.js');
    process.env.DB_PATH = dbPath;
    dbModule.closeDatabase();
    dbModule.initializeDatabase({ path: dbPath });
    database = dbModule.db;

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
            if (dbModule.db === database) dbModule.closeDatabase();
            await fs.rm(tempDir, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100
            });
        }
    };
}
