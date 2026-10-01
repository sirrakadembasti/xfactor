#!/usr/bin/env node
import { createBackup } from '../backupRestore.js';

function args(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith('--')) continue;
        const key = argv[i].slice(2);
        if (key === 'offline') { result.offline = true; continue; }
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
        offline: options.offline === true
    });
    console.log(JSON.stringify({ root: snapshot.root, manifest: snapshot.manifest }, null, 2));
} catch (error) {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
}
