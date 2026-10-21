#!/usr/bin/env node
// Default is strictly read-only: no db.js import, no migrations or root creation.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditArtifacts, quarantineCandidates, recoverArtifactMaintenance } from '../services/artifactLifecycle.js';

const args = process.argv.slice(2);
const allowed = new Set(['--quarantine', '--orphans-only', '--offline']);
if (args.some(arg => !allowed.has(arg))) throw new Error('Usage: node backend/scripts/artifact-maintenance.js [--quarantine --offline] [--orphans-only]');
const apply = args.includes('--quarantine');
if (apply && !args.includes('--offline')) throw new Error('Stop backend/worker first, then explicitly supply --offline for maintenance writes.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const database = new DatabaseSync(process.env.DB_PATH || path.join(root, 'data', 'projects.db'), { readOnly: !apply });
try {
    const before = auditArtifacts({ database });
    if (!before.success) throw new Error(before.error);
    let changes = null;
    if (apply) {
        if (!database.prepare("SELECT 1 FROM sqlite_master WHERE name='artifact_maintenance'").get()) throw new Error('Run the updated backend once to apply migration 16 before maintenance.');
        if (database.prepare("SELECT 1 FROM workflow_attempts WHERE status='running'").get()) throw new Error('Running workflow exists; pause production before offline maintenance.');
        recoverArtifactMaintenance({ database });
        const candidates = args.includes('--orphans-only') ? before.candidates.filter(c => c.reason === 'unregistered') : before.candidates;
        changes = quarantineCandidates({ database, candidates });
    }
    const report = apply ? auditArtifacts({ database }) : before;
    console.log(JSON.stringify({ ...report, changes }, null, 2));
} finally { database.close(); }
