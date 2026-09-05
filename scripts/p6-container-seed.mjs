import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const backend = process.env.P6_BACKEND_ROOT || '/app/backend';
const load = file => import(pathToFileURL(path.join(backend, file)).href);
const [{ createUser }, { createProject }, { db }, { createProjectZip }, { safeExtractZip }, { updateArtifactStatus }, { completeVerifiedProject }] = await Promise.all([
  load('auth.js'), load('projectRepository.js'), load('db.js'), load('utils/archive.js'),
  load('verification/safeExtractor.js'), load('repositories/artifactRepository.js'), load('projectRepository.js')
]);

const mandatoryGates = [
  'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
  'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
  'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
  'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
];
const suffix = crypto.randomUUID();
const username = `p6_${suffix.replaceAll('-', '').slice(0, 20)}`;
const password = `P6Container-${crypto.randomBytes(18).toString('base64url')}`;
const now = new Date().toISOString();
const cleanRoom = await fs.mkdtemp(path.join(os.tmpdir(), 'p6-extract-'));

try {
  const user = createUser(username, password);
  const unverified = await createProject({ title: 'P6 Unverified Project', ownerUserId: user.id });
  const completed = await createProject({ title: 'P6 Verified Project', ownerUserId: user.id });
  const contractId = `contract-${suffix}`;
  const runId = `run-${suffix}`;
  db.prepare("UPDATE projects SET status = 'artifact_verified', revision = 1 WHERE id = ?").run(completed.id);
  db.prepare(`INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
    VALUES (?, ?, 1, 'approved', ?, ?, ?)`).run(contractId, completed.id, JSON.stringify({ name: 'P6 verified project' }), crypto.randomBytes(32).toString('hex'), now);

  const source = 'export const productionSmoke = true;\n';
  const artifact = await createProjectZip(completed.id, contractId, [
    { path: 'src/index.js', content: source },
    { path: 'package.json', content: '{"name":"p6-production-smoke"}\n' }
  ]);
  const extracted = await safeExtractZip(artifact.path, cleanRoom);
  assert.equal(extracted.success, true);
  assert.equal(await fs.readFile(path.join(cleanRoom, 'src/index.js'), 'utf8'), source);

  db.prepare(`INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at)
    VALUES (?, ?, ?, 'verified', '2.0', ?, ?)`).run(runId, completed.id, contractId, now, now);
  for (const gateName of mandatoryGates) {
    db.prepare(`INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, command, exit_code,
      started_at, ended_at, stdout_digest, stderr_digest, evidence_json)
      VALUES (?, ?, ?, ?, 'MANDATORY', 'PASS', 'p6 smoke gate', 0, ?, ?, ?, ?, '{"producer":"p6-production-smoke"}')`)
      .run(`${runId}-${gateName}`, contractId, runId, gateName, now, now, `stdout-${gateName}`, `stderr-${gateName}`);
  }
  updateArtifactStatus({ projectId: completed.id, contractId, artifactId: artifact.id, status: 'built' });
  updateArtifactStatus({ projectId: completed.id, contractId, artifactId: artifact.id, status: 'verification_pending' });
  updateArtifactStatus({ projectId: completed.id, contractId, artifactId: artifact.id, status: 'verified', verificationRunId: runId });
  const completedProject = completeVerifiedProject({ projectId: completed.id, contractId, artifactId: artifact.id, expectedRevision: 1 });
  assert.equal(completedProject.status, 'completed');
  assert.equal(completedProject.latestArtifact.sha256, artifact.sha256);
  console.log(JSON.stringify({ username, password, projectId: completed.id, contractId, artifactId: artifact.id, sha256: artifact.sha256 }));
} finally {
  await fs.rm(cleanRoom, { recursive: true, force: true });
}
