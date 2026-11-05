import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { createTestHarness } from './testHarness.js';

// Set isolated database/filesystem roots before importing runtime repositories.
// The worker is an in-process response stub; no actual execution is dispatched.
const isolated = await setupIsolatedTestDb('reverification-checkpoint-preservation');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createArtifact } = await import('../repositories/artifactRepository.js');
const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
const { verifyArtifact } = await import('../verification/artifactVerifier.js');
const { runAsyncTest, finish } = createTestHarness();
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function fixture(label) {
  const projectId = `checkpoint-project-${label}`;
  const contractId = `checkpoint-contract-${label}`;
  const artifactId = `checkpoint-artifact-${label}`;
  const runId = `fresh-run-${label}`;
  const contractHash = digest('approved-contract');
  db.prepare("INSERT INTO projects(id,title,status) VALUES (?, 'Checkpoint fixture', 'implementation_finished')").run(projectId);
  db.prepare(`INSERT INTO project_contracts(id,project_id,revision,contract_hash,status,contract_json)
    VALUES (?,?,1,?,'approved','{}')`).run(contractId, projectId, contractHash);
  saveCheckpoint({ projectId, contractId, taskId: 'generation-task', teamleaderId: 'ui.team',
    planHash: digest('plan'), taskSpecHash: digest('task-spec'), inputHash: digest('source-input'),
    outputHash: digest('reviewed-source-output'), gateVersion: '1.0.0', status: 'completed',
    requirementIds: [], revision: 4, createdAt: '2026-01-01T00:00:00.000Z' });
  const readCheckpoint = () => db.prepare('SELECT * FROM task_checkpoints WHERE project_id=? AND contract_id=?').get(projectId, contractId);
  const before = readCheckpoint();
  assert.equal(before.status, 'completed');
  assert.equal(before.task_identity_version, 1);
  assert.equal(before.invalidated_at, null);
  assert.equal(before.invalidation_reason, null);

  const zip = new JSZip();
  const files = [
    ['package.json', Buffer.from('{"name":"checkpoint-fixture","version":"1.0.0","dependencies":{}}')],
    ['package-lock.json', Buffer.from('{"name":"checkpoint-fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}')]
  ];
  const manifest = files.map(([entryPath, bytes]) => {
    zip.file(entryPath, bytes);
    return { path: entryPath, sha256: digest(bytes), size: bytes.length };
  });
  const archiveBytes = await zip.generateAsync({ type: 'nodebuffer' });
  const archiveHash = digest(archiveBytes);
  const archivePath = path.join(process.env.ARTIFACTS_ROOT, `${artifactId}.zip`);
  await fs.writeFile(archivePath, archiveBytes);
  createArtifact({ id: artifactId, projectId, contractId, kind: 'zip', path: archivePath,
    sha256: archiveHash, size: archiveBytes.length, manifestJson: JSON.stringify(manifest), status: 'draft' });
  for (const entry of manifest) {
    db.prepare('INSERT INTO artifact_files(contract_id,artifact_id,path,sha256,size) VALUES (?,?,?,?,?)')
      .run(contractId, artifactId, entry.path, entry.sha256, entry.size);
  }
  const identity = { version: 1, jobId: `job-${label}`, operation: 'verify_artifact',
    projectId, contractId, contractHash, revision: 1, artifactId, nonce: `nonce-${label}`,
    inputSha256: archiveHash, runId };
  return { projectId, contractId, artifactId, runId, identity, archiveBytes, before, readCheckpoint };
}

async function exerciseFailure(f, mode, preserveGenerationRecords) {
  let workerCalls = 0;
  const transportFailure = new Error('fixture worker transport failed');
  const options = { runId: f.runId, activeJob: f.identity, archiveBase64: f.archiveBytes.toString('base64'),
    ...(preserveGenerationRecords ? { preserveGenerationRecords: true } : {}),
    executionClient: { verifyArtifact: async job => {
      workerCalls++;
      assert.equal(job.runId, f.runId);
      assert.equal(job.artifactId, f.artifactId);
      if (mode === 'throw') throw transportFailure;
      const timestamp = new Date().toISOString();
      return { ...f.identity, status: 'failed', error: 'fixture clean install failed',
        result: { ...f.identity, status: 'failed', checks: [{ name: 'clean_install', status: 'failed',
          command: 'npm ci', exitCode: 1, startedAt: timestamp, endedAt: timestamp,
          stdoutDigest: digest(''), stderrDigest: digest('fixture install failure') }] } };
    } } };
  if (mode === 'throw') {
    await assert.rejects(verifyArtifact(f, options), error => error === transportFailure);
  } else {
    const result = await verifyArtifact(f, options);
    assert.equal(result.passed, false);
    assert.equal(result.status, 'failed');
  }
  // Assert we reached the intended failure path before checking preservation:
  // archive/identity/schema errors must not provide a misleading RED result.
  assert.equal(workerCalls, 1);
  assert.equal(db.prepare('SELECT status FROM verification_runs WHERE id=?').get(f.runId).status, 'failed');
  assert.equal(db.prepare('SELECT status FROM artifacts WHERE id=?').get(f.artifactId).status, 'rejected');
}

try {
  for (const mode of ['fail', 'throw']) {
    await runAsyncTest(`preserveGenerationRecords keeps every completed checkpoint field unchanged after worker ${mode}`, async () => {
      const f = await fixture(`preserve-${mode}`);
      await exerciseFailure(f, mode, true);
      // RED: both failure commits currently rewrite status, reason and timestamp
      // even when the caller explicitly requests a diagnostic-only reverify.
      assert.deepEqual(f.readCheckpoint(), f.before,
        `preserveGenerationRecords:true must preserve the complete checkpoint row after worker ${mode}`);
    });
  }
  for (const mode of ['fail', 'throw']) {
    await runAsyncTest(`ordinary verification still invalidates checkpoints after worker ${mode}`, async () => {
      const f = await fixture(`ordinary-${mode}`);
      await exerciseFailure(f, mode, false);
      const after = f.readCheckpoint();
      assert.equal(after.status, 'invalidated');
      assert.equal(after.invalidation_reason, 'VERIFICATION_FAILED');
      assert.ok(after.invalidated_at);
      assert.deepEqual({ ...after, status: f.before.status, invalidation_reason: f.before.invalidation_reason,
        invalidated_at: f.before.invalidated_at }, { ...f.before }, 'Ordinary invalidation must leave checkpoint identity/evidence unchanged');
    });
  }
} finally {
  finish();
  await isolated.cleanup();
}
