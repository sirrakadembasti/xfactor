import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { createBackup, restoreBackup } from '../backupRestore.js';
import { createLifecycleCoordinator } from '../lifecycle.js';

const isolated = await setupIsolatedTestDb('p9-backup-restore');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-p9-backup-'));
process.env.PROJECTS_ROOT = path.join(root, 'projects');
process.env.ARTIFACTS_ROOT = path.join(root, 'artifacts');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });
await fs.mkdir(process.env.ARTIFACTS_ROOT, { recursive: true });
const dbModule = await import('../db.js');
dbModule.initializeDatabase({ path: isolated.dbPath });
const { db } = dbModule;
const { createProject } = await import('../projectRepository.js');
try {
    const project = await createProject({ title: 'Backup Fixture' });
    const contractId = 'contract-backup-fixture';
    const runId = 'run-backup-fixture';
    const artifactId = 'artifact-backup-fixture';
    const archivePath = path.join(process.env.ARTIFACTS_ROOT, `${artifactId}.zip`);
    const fileBytes = Buffer.from('export const restored = true;\n');
    const zip = new JSZip();
    zip.file('src/restored.js', fileBytes);
    const archiveBytes = await zip.generateAsync({ type: 'nodebuffer' });
    const archiveHash = crypto.createHash('sha256').update(archiveBytes).digest('hex');
    await fs.writeFile(archivePath, archiveBytes);
    db.prepare(`INSERT INTO project_contracts
        (id, project_id, revision, status, contract_json, contract_hash, approved_at)
        VALUES (?, ?, 1, 'approved', '{}', ?, CURRENT_TIMESTAMP)`).run(contractId, project.id, 'a'.repeat(64));
    db.prepare(`INSERT INTO verification_runs
        (id, project_id, contract_id, status, policy_version, started_at, ended_at)
        VALUES (?, ?, ?, 'verified', '2.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(runId, project.id, contractId);
    db.prepare(`INSERT INTO artifacts
        (id, project_id, contract_id, kind, path, sha256, size, manifest_json, status, verification_run_id)
        VALUES (?, ?, ?, 'zip', ?, ?, ?, ?, 'verified', ?)`).run(
        artifactId, project.id, contractId, archivePath, archiveHash, archiveBytes.length,
        JSON.stringify([{ path: 'src/restored.js', sha256: crypto.createHash('sha256').update(fileBytes).digest('hex'), size: fileBytes.length }]), runId
    );
    db.prepare(`INSERT INTO artifact_files (contract_id, artifact_id, path, sha256, size)
        VALUES (?, ?, ?, ?, ?)`).run(contractId, artifactId, 'src/restored.js', crypto.createHash('sha256').update(fileBytes).digest('hex'), fileBytes.length);
    db.prepare(`INSERT INTO completion_receipts
        (id, project_id, contract_id, contract_hash, artifact_id, artifact_hash, run_id, policy_version,
         mandatory_gate_digests, previous_revision, next_revision, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, '2.0', '[]', 1, 2, CURRENT_TIMESTAMP)`).run(
        'receipt-backup-fixture', project.id, contractId, 'a'.repeat(64), artifactId, archiveHash, runId
    );
    const coordinator = createLifecycleCoordinator();
    const snapshot = await createBackup({
        dbPath: isolated.dbPath,
        projectsRoot: process.env.PROJECTS_ROOT,
        artifactsRoot: process.env.ARTIFACTS_ROOT,
        destination: path.join(root, 'snapshot'),
        lifecycle: coordinator,
        checkpoint: () => dbModule.checkpointWAL(db)
    });
    assert.equal(snapshot.manifest.schemaVersion, 1);
    assert.ok(snapshot.manifest.files.some(file => file.section === 'artifacts'));

    const tampered = path.join(root, 'tampered');
    await fs.cp(snapshot.root, tampered, { recursive: true });
    await fs.writeFile(path.join(tampered, 'artifacts', `${artifactId}.zip`), Buffer.from('tampered'));
    await assert.rejects(() => restoreBackup(tampered, path.join(root, 'restore-tampered')), /hash|integrity|manifest/i);

    const restored = await restoreBackup(snapshot.root, path.join(root, 'restore-ok'));
    const restoredArchive = path.join(restored.artifactsRoot, `${artifactId}.zip`);
    assert.deepEqual(await fs.readFile(restoredArchive), archiveBytes);
    const restoredDatabase = new DatabaseSync(restored.dbPath);
    try {
        const restoredRow = restoredDatabase.prepare('SELECT path FROM artifacts WHERE id = ?').get(artifactId);
        assert.equal(restoredRow.path, restoredArchive);
        assert.deepEqual(await fs.readFile(restoredRow.path), archiveBytes);
    } finally { restoredDatabase.close(); }

    const timeoutCoordinator = createLifecycleCoordinator({ timeoutMs: 50 });
    const held = timeoutCoordinator.begin('generation', { cancel: () => {} });
    const result = await timeoutCoordinator.shutdown({ timeoutMs: 50 });
    assert.equal(result.success, false);
    assert.equal(result.timedOut, true);
    held.release();
} finally {
    await isolated.cleanup();
    await fs.rm(root, { recursive: true, force: true });
}
console.log('test_p9_backup_restore passed');
