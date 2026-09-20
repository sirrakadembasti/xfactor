import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('dev-verification-fallback');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createProject, assertVerifiedArtifactEvidence, completeVerifiedProject } = await import('../projectRepository.js');
const { PROJECT_STATUS } = await import('../engine/stateMachine.js');

let verifyArtifactDevFallback;
try {
    ({ verifyArtifactDevFallback } = await import('../verification/devVerificationRunner.js'));
} catch (e) {
    // Expected to fail before implementation
}

assert.ok(verifyArtifactDevFallback, 'verifyArtifactDevFallback must be exported from devVerificationRunner.js');

// -------------------------------------------------------------
// TEST CASE 1: SUCCESS PATH
// All checks pass, artifact verified, project completed.
// -------------------------------------------------------------
const project = await createProject({ title: "Dev Fallback Test App" });
const contractId = `contract-${Date.now()}`;
const contractHash = 'c'.repeat(64);
db.prepare(`
    INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
    VALUES (?, ?, 1, 'approved', ?, ?, CURRENT_TIMESTAMP)
`).run(contractId, project.id, JSON.stringify({ domains: [{ name: 'web' }] }), contractHash);

const reqId = `req-${Date.now()}`;
db.prepare(`
    INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
    VALUES (?, ?, 'REQ-1', 'Basic App Requirement', 'functional', 'high', 1, 'approved')
`).run(reqId, contractId);
const artifactId = `artifact-${Date.now()}`;
const zipPath = path.join(path.dirname(isolated.dbPath), 'dummy.zip');
await fs.writeFile(zipPath, 'PK\x05\x06' + '\x00'.repeat(18));
const zipBytes = await fs.readFile(zipPath);
const artifactSha = crypto.createHash('sha256').update(zipBytes).digest('hex');
db.prepare(`
    INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status)
    VALUES (?, ?, ?, 'zip', ?, ?, ?, 'built')
`).run(artifactId, project.id, contractId, zipPath, artifactSha, zipBytes.length);

const runId = `run-${Date.now()}`;
const result = await verifyArtifactDevFallback({
    projectId: project.id,
    contractId,
    artifactId,
    runId,
    contract: { domains: [{ name: 'web' }] },
    files: [
        { path: 'package.json', content: '{"name":"app","scripts":{"test":"echo ok"}}' },
        { path: 'package-lock.json', content: '{}' },
        { path: 'service-manifest.json', content: '{"services":{"web":{"port":3000}}}' },
        { path: 'prisma/schema.prisma', content: 'model User { id Int @id }' }
    ]
});

assert.strictEqual(result.passed, true);
assert.strictEqual(result.status, 'verified');

// Verify that assertVerifiedArtifactEvidence passes strictly
const verifiedEvidence = assertVerifiedArtifactEvidence({
    projectId: project.id,
    contractId,
    artifactId,
    strict: true
});
assert.ok(verifiedEvidence.artifact, 'Artifact evidence must be verified');
assert.strictEqual(verifiedEvidence.run.status, 'verified');

// Verify completeVerifiedProject
db.prepare("UPDATE projects SET status = 'artifact_verified' WHERE id = ?").run(project.id);
const completionResult = completeVerifiedProject({
    projectId: project.id,
    contractId,
    artifactId,
    expectedRevision: 1
});
assert.strictEqual(completionResult.status, PROJECT_STATUS.COMPLETED);
assert.ok(completionResult.completionReceiptId);
console.log('[PASS] Test Case 1: Success path and completeVerifiedProject transitioned project to completed');


// -------------------------------------------------------------
// TEST CASE 2: FAIL-CLOSED SECURITY PATH
// One of the critical checks fails (e.g. invalid service-manifest.json),
// verification must fail and artifact status must be rejected.
// -------------------------------------------------------------
const projectFailed = await createProject({ title: "Dev Fallback Failed App" });
const contractIdFailed = `contract-failed-${Date.now()}`;
db.prepare(`
    INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
    VALUES (?, ?, 1, 'approved', ?, ?, CURRENT_TIMESTAMP)
`).run(contractIdFailed, projectFailed.id, JSON.stringify({ domains: [{ name: 'web' }] }), contractHash);

const reqIdFailed = `req-failed-${Date.now()}`;
db.prepare(`
    INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
    VALUES (?, ?, 'REQ-1', 'Basic App Requirement', 'functional', 'high', 1, 'approved')
`).run(reqIdFailed, contractIdFailed);

const artifactIdFailed = `artifact-failed-${Date.now()}`;
db.prepare(`
    INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status)
    VALUES (?, ?, ?, 'zip', ?, ?, ?, 'built')
`).run(artifactIdFailed, projectFailed.id, contractIdFailed, zipPath, artifactSha, zipBytes.length);

const runIdFailed = `run-failed-${Date.now()}`;
// Intentionally pass an invalid service-manifest.json content (not valid JSON)
const resultFailed = await verifyArtifactDevFallback({
    projectId: projectFailed.id,
    contractId: contractIdFailed,
    artifactId: artifactIdFailed,
    runId: runIdFailed,
    contract: { domains: [{ name: 'web' }] },
    files: [
        { path: 'package.json', content: '{"name":"app","scripts":{"test":"echo ok"}}' },
        { path: 'package-lock.json', content: '{}' },
        { path: 'service-manifest.json', content: 'INVALID_JSON_CONTENT' },
        { path: 'prisma/schema.prisma', content: 'model User { id Int @id }' }
    ]
});

// Assert that verification correctly fails (Fail-Closed)
assert.strictEqual(resultFailed.passed, false, 'Verification must fail when a check fails');
assert.strictEqual(resultFailed.status, 'rejected', 'Artifact status must be rejected');

// Confirm DB states are correctly updated
const dbArtifact = db.prepare('SELECT status, verification_run_id FROM artifacts WHERE id = ?').get(artifactIdFailed);
assert.strictEqual(dbArtifact.status, 'rejected', 'DB Artifact status must be rejected');

const dbRun = db.prepare('SELECT status FROM verification_runs WHERE id = ?').get(runIdFailed);
assert.strictEqual(dbRun.status, 'failed', 'DB Run status must be failed');

console.log('[PASS] Test Case 2: Fail-Closed security path validated (invalid files reject artifact and fail run)');
console.log('[PASS] All test cases in test_dev_verification_fallback passed completely!');
await isolated.cleanup();
