import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('workflow-dev-fallback');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createProject, getProject, assertVerifiedArtifactEvidence } = await import('../projectRepository.js');
const { verifyArtifactAndProject } = await import('../verification/verificationCli.js');
const { PROJECT_STATUS } = await import('../engine/stateMachine.js');

const project = await createProject({ title: "Workflow Dev Fallback App" });
const contractId = `contract-${Date.now()}`;
const contractHash = 'd'.repeat(64);
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
const zipPath = path.join(path.dirname(isolated.dbPath), 'dummy-app.zip');
await fs.writeFile(zipPath, 'PK\x05\x06' + '\x00'.repeat(18));
const zipBytes = await fs.readFile(zipPath);
const artifactSha = crypto.createHash('sha256').update(zipBytes).digest('hex');
db.prepare(`
    INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status)
    VALUES (?, ?, ?, 'zip', ?, ?, ?, 'built')
`).run(artifactId, project.id, contractId, zipPath, artifactSha, zipBytes.length);

// Set project status to implementing
db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);

const failingVerificationRunner = async () => {
    throw new Error('Docker daemon is not running (ECONNREFUSED / pipe error)');
};

const runId = `run-${Date.now()}`;
const completion = await verifyArtifactAndProject({
    projectId: project.id,
    contractId,
    artifactId,
    expectedRevision: 1,
    complete: true,
    verificationRunner: failingVerificationRunner,
    options: {
        runId,
        allowDevFallback: true,
        files: [
            { path: 'package.json', content: '{"name":"app","scripts":{"test":"echo ok"}}' },
            { path: 'package-lock.json', content: '{}' },
            { path: 'service-manifest.json', content: '{"services":{"web":{"port":3000}}}' },
            { path: 'prisma/schema.prisma', content: 'model User { id Int @id }' }
        ],
        contract: { domains: [{ name: 'web' }] }
    }
});

assert.strictEqual(completion.passed, true, 'Completion passed should be true');
assert.strictEqual(completion.completed, true, 'Completion completed should be true');
assert.strictEqual(completion.fallbackUsed, true, 'Fallback should be marked as used');

const updatedProject = getProject(project.id);
assert.strictEqual(updatedProject.status, PROJECT_STATUS.COMPLETED, 'Project should be in COMPLETED state');

const evidence = assertVerifiedArtifactEvidence({
    projectId: project.id,
    contractId,
    artifactId,
    strict: true
});
assert.strictEqual(evidence.artifact.status, 'verified');
console.log('[PASS] Case 1: Docker connection error gracefully fell back and completed.');

// Case 2: Runner completed with passed: false (Plan 1 Docker ran and rejected artifact)
// Must NEVER fall back to dev verification (Fail-Closed & Plan 1 Priority)
const project2 = await createProject({ title: "Workflow Plan 1 Fail App" });
const contractId2 = `contract-${Date.now()}`;
db.prepare(`
    INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
    VALUES (?, ?, 1, 'approved', ?, ?, CURRENT_TIMESTAMP)
`).run(contractId2, project2.id, JSON.stringify({ domains: [{ name: 'web' }] }), contractHash);

const artifactId2 = `artifact-${Date.now()}`;
db.prepare(`
    INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status)
    VALUES (?, ?, ?, 'zip', ?, ?, ?, 'built')
`).run(artifactId2, project2.id, contractId2, zipPath, artifactSha, zipBytes.length);

db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project2.id);

const rejectingRunner = async () => {
    return {
        passed: false,
        status: 'failed',
        runId: `run-${Date.now()}`
    };
};

const rejectingCompletion = await verifyArtifactAndProject({
    projectId: project2.id,
    contractId: contractId2,
    artifactId: artifactId2,
    expectedRevision: 1,
    complete: true,
    verificationRunner: rejectingRunner,
    options: {
        allowDevFallback: true,
        files: [
            { path: 'package.json', content: '{"name":"app","scripts":{"test":"echo ok"}}' }
        ],
        contract: { domains: [{ name: 'web' }] }
    }
});

assert.strictEqual(rejectingCompletion.passed, false, 'Plan 1 failure must NOT be converted to pass');
assert.strictEqual(rejectingCompletion.completed, false, 'Project must NOT be completed on Plan 1 failure');
assert.strictEqual(rejectingCompletion.fallbackUsed, false, 'Fallback must NOT have run');
console.log('[PASS] Case 2: Plan 1 Docker test failure correctly failed without fallback (Fail-Closed).');

console.log('[PASS] test_workflow_dev_fallback passed completely');
await isolated.cleanup();
