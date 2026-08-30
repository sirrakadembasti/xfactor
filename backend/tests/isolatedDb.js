import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export async function setupIsolatedTestDb(testName) {
    const safeTestName = testName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `xfactor-${safeTestName}-`));
    const dbPath = path.join(tempDir, 'projects.db');
    let database;

    return {
        dbPath,
        registerDatabase(db) {
            database = db;
        },
        async cleanup() {
            database?.close();
            await fs.rm(tempDir, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100
            });
        }
    };
}
