#!/usr/bin/env node
import { createBackup } from '../backupRestore.js';
import { checkpointWAL, closeDatabase, db } from '../db.js';

function args(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith('--')) continue;
        const key = argv[i].slice(2);
        result[key] = argv[++i];
    }
    return result;
}

const options = args(process.argv.slice(2));
try {
    const snapshot = await createBackup({
        dbPath: options.db || process.env.DB_PATH,
        projectsRoot: options.projects || process.env.PROJECTS_ROOT,
        artifactsRoot: options.artifacts || process.env.ARTIFACTS_ROOT,
        destination: options.output,
        checkpoint: () => db ? checkpointWAL(db) : undefined
    });
    console.log(JSON.stringify({ root: snapshot.root, manifest: snapshot.manifest }, null, 2));
} catch (error) {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    try { closeDatabase(); } catch {}
}
