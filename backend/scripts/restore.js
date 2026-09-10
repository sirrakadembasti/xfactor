#!/usr/bin/env node
import { restoreBackup } from '../backupRestore.js';

function args(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith('--')) continue;
        result[argv[i].slice(2)] = argv[++i];
    }
    return result;
}

const options = args(process.argv.slice(2));
try {
    if (!options.snapshot || !options.target) throw new Error('Usage: restore.js --snapshot <path> --target <new-empty-path>');
    const restored = await restoreBackup(options.snapshot, options.target);
    console.log(JSON.stringify(restored, null, 2));
} catch (error) {
    console.error(`Restore failed: ${error.message}`);
    process.exitCode = 1;
}
