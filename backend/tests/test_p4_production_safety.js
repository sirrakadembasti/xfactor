import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { executeInSandbox } from '../verification/sandboxRunner.js';
import { WindowsSandboxAdapter } from '../verification/adapters/windowsSandbox.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p4-production-safety-evidence');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const verificationRepository = await import('../repositories/verificationRepository.js');
const { evaluateVerificationRun } = await import('../verification/qualityPolicy.js');
const { completeVerifiedProject, assertVerifiedArtifactEvidence } = await import('../projectRepository.js');
const artifactRepository = await import('../repositories/artifactRepository.js');
const crypto = await import('crypto');
const workflowSource = await fs.readFile(new URL('../engine/workflow.js', import.meta.url), 'utf8');

const projectId = 'p4-evidence-project';
const contractId = 'p4-evidence-contract';
db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'P4 evidence', 'running')").run(projectId);
db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at) VALUES (?, ?, 1, 'approved', '{}', 'hash', CURRENT_TIMESTAMP)").run(contractId, projectId);


async function runAsyncTest(name, fn) {
    try { await fn(); console.log(`[PASS] ${name}`); }
    catch (error) { console.error(`[FAIL] ${name}: ${error.message}`); throw error; }
}

await runAsyncTest('P4.2 blocks Windows adapter without proven OS isolation capabilities', async () => {
    const fakeAdapter = { id: 'windows', getCapabilities: () => ({ available: false, reason: 'restricted token unavailable' }), isAvailable: () => true, async execute() { throw new Error('must not execute'); } };
    await assert.rejects(executeInSandbox('node', [], { adapter: fakeAdapter }), /SANDBOX_UNAVAILABLE|restricted token unavailable/);
});
await runAsyncTest('P4.2 Windows availability requires proven isolation', async () => {
    const adapter = new WindowsSandboxAdapter(); const capabilities = adapter.getCapabilities();
    assert.strictEqual(capabilities.available, false); assert.strictEqual(capabilities.isolation, false); assert.strictEqual(adapter.isAvailable(), false);
});
await runAsyncTest('P4.2 portable adapter reports structured capability metadata', async () => {
    const { PortableSandboxAdapter } = await import('../verification/adapters/portableSandbox.js');
    const capabilities = new PortableSandboxAdapter('bubblewrap').getCapabilities();
    for (const key of ['available', 'adapterId', 'isolation', 'jobObject', 'resourceLimits', 'workspaceAcl', 'networkDenied', 'envScrubbed', 'reason']) assert(Object.prototype.hasOwnProperty.call(capabilities, key));
    if (!capabilities.available) assert.match(capabilities.reason, /not available/i);
});
await runAsyncTest('P4.2 unsupported portable adapter fails closed', async () => {
    const { PortableSandboxAdapter } = await import('../verification/adapters/portableSandbox.js');
    const adapter = new PortableSandboxAdapter('bogus');
    const capabilities = adapter.getCapabilities();
    assert.strictEqual(adapter.isAvailable(), false);
    assert.strictEqual(capabilities.available, false);
    assert.match(capabilities.reason, /Unsupported/i);
    const result = await adapter.execute({ command: process.execPath });
    assert.strictEqual(result.status, 'BLOCKED');
});
await runAsyncTest('P4.2 returns complete capability metadata and scrubs secret environment keys', async () => {
    let receivedEnv;
    const capabilities = { available: true, adapterId: 'capable-test', isolation: true, jobObject: true, resourceLimits: true, workspaceAcl: true, networkDenied: true, envScrubbed: true, reason: null };
    const fakeAdapter = { id: 'capable-test', getCapabilities: () => capabilities, async execute(options) { receivedEnv = options.env; return { status: 'PASS', passed: true, exitCode: 0, stdout: 'ok', stderr: '' }; } };
    const result = await executeInSandbox('node', [], { adapter: fakeAdapter, env: { SAFE_VALUE: 'kept', API_KEY: 'must-not-pass' } });
    for (const key of ['adapterId', 'isolation', 'jobObject', 'resourceLimits', 'workspaceAcl', 'networkDenied', 'envScrubbed']) assert.strictEqual(result.capabilities[key], capabilities[key]);
    assert.strictEqual(result.adapterId, 'capable-test'); assert.strictEqual(receivedEnv.API_KEY, undefined);
});
await runAsyncTest('P4.3 rejects sandbox adapters without proven capabilities', async () => {
    const { spawnService } = await import('../verification/processVerifier.js');
    await assert.rejects(spawnService('backend', { command: process.execPath }, {}, { adapter: { id: 'unknown', isAvailable: () => true, spawn() { throw new Error('must not execute'); } } }), /SANDBOX_UNAVAILABLE|no proven capabilities|unavailable/);
});
await runAsyncTest('P4.3 service spawn uses sandbox boundary and blocks when sandbox unavailable', async () => {
    const { spawnService } = await import('../verification/processVerifier.js');
    const adapter = { id: 'fake-unavailable', getCapabilities: () => ({ available: false, reason: 'no job object' }), async execute() { throw new Error('must not execute service on host'); } };
    await assert.rejects(spawnService('backend', { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] }, {}, { adapter }), /SANDBOX_UNAVAILABLE|no job object/);
});
await runAsyncTest('P4.3 missing build script is BLOCKED not PASS for mandatory framework_build', async () => {
    const { validateProjectBuild } = await import('../engine/buildValidator.js'); const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'p4-no-build-'));
    try { await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ scripts: {} })); const result = await validateProjectBuild(tmp, { title: 'No Build Script' }, {}); assert.strictEqual(result.passed, false); assert(result.checks.some(c => c.name === 'framework_build' && c.status !== 'passed')); }
    finally { await fs.rm(tmp, { recursive: true, force: true }); }
});
await runAsyncTest('P4.4 finalized verification check cannot be mutated', async () => {
    const runId = `p4-run-${Date.now()}`;
    verificationRepository.createRun({ id: runId, projectId, contractId, status: 'queued', policyVersion: '2.0' });
    verificationRepository.updateRunStatus(runId, 'running');
    verificationRepository.createCheck({
        id: `${runId}-check`, runId, projectId, contractId, gateName: 'framework_build',
        applicability: 'MANDATORY', status: 'PASS', evidenceJson: { command: 'npm run build' }
    });
    verificationRepository.updateRunStatus(runId, 'verified');
    assert.throws(() => verificationRepository.updateCheck(`${runId}-check`, { status: 'FAIL' }), /finalized|immutable/i);
});

await runAsyncTest('P4.4 status-only mandatory PASS is BLOCKED without evidence fields', async () => {
    const result = evaluateVerificationRun({
        checks: [{ gateName: 'framework_build', status: 'PASS', applicability: 'MANDATORY' }],
        requiredGates: ['framework_build']
    });
    assert.strictEqual(result.status, 'BLOCKED');
    assert(result.blockedGates.includes('framework_build'));
});

await runAsyncTest('P4.4 bare derived marker is blocked while validated derived evidence passes', async () => {
    const bare = evaluateVerificationRun({ checks: [{ gateName: 'framework_build', status: 'PASS', derived: true }], requiredGates: ['framework_build'] });
    assert.strictEqual(bare.status, 'BLOCKED');
    const valid = evaluateVerificationRun({
        checks: [{
            gateName: 'framework_build', status: 'PASS',
            evidence: { kind: 'derived_gate', producer: 'quality-policy-test', sourceGateNames: ['package_json'], computedAt: new Date().toISOString(), policyVersion: '2.0' }
        }],
        requiredGates: ['framework_build']
    });
    assert.strictEqual(valid.status, 'PASS');
});

await runAsyncTest('P4.4 malformed derived evidence is blocked', async () => {
    for (const evidence of [
        { kind: 'derived_gate', producer: '', sourceGateNames: [], computedAt: new Date().toISOString(), policyVersion: '2.0' },
        { kind: 'derived_gate', producer: 'untrusted', sourceGateNames: ['x'], computedAt: 'not-a-date', policyVersion: '2.0' },
        { kind: 'derived_gate', producer: 'quality-policy-test', sourceGateNames: ['x'], computedAt: '2020', policyVersion: '2.0' },
        { kind: 'derived_gate', producer: 'quality-policy-test', sourceGateNames: ['x'], computedAt: '2020-02-31T00:00:00Z', policyVersion: '2.0' }
    ]) {
        const result = evaluateVerificationRun({ checks: [{ gateName: 'framework_build', status: 'PASS', evidence }], requiredGates: ['framework_build'] });
        assert.strictEqual(result.status, 'BLOCKED');
    }
});

await runAsyncTest('P4.4 finalized check cannot be re-ended while run remains running', async () => {
    const runId = `p4-running-${Date.now()}`;
    const checkId = `${runId}-check`;
    verificationRepository.createRun({ id: runId, projectId, contractId, status: 'queued', policyVersion: '2.0' });
    verificationRepository.updateRunStatus(runId, 'running');
    verificationRepository.startCheck({ id: checkId, runId, contractId, gateName: 'framework_build' });
    verificationRepository.endCheck({ id: checkId, runId, contractId, status: 'PASS', exitCode: 0, endedAt: new Date().toISOString() });
    assert.throws(() => verificationRepository.updateCheck(checkId, { status: 'FAIL' }), /finalized|immutable/i);
    assert.throws(() => verificationRepository.endCheck({ id: checkId, runId, contractId, status: 'FAIL' }), /finalized|immutable/i);
});

await runAsyncTest('P4.4 artifact status transitions are guarded', async () => {
    const artifactId = `p4-artifact-${Date.now()}`;
    artifactRepository.createArtifact({ id: artifactId, projectId, contractId, kind: 'zip', path: 'x.zip', sha256: 'a'.repeat(64), size: 1 });
    assert.throws(() => artifactRepository.updateArtifactStatus({ projectId, contractId, artifactId, status: 'verified' }), /verification_run_id|invalid|immutable/i);
    artifactRepository.updateArtifactStatus({ projectId, contractId, artifactId, status: 'built' });
    assert.throws(() => artifactRepository.updateArtifactStatus({ projectId, contractId, artifactId, status: 'draft' }), /invalid|immutable/i);
});

await runAsyncTest('P4.5 completion returns a durable receipt containing the complete audit identity', async () => {
    const suffix = Date.now();
    const p = `p4-receipt-${suffix}`;
    const c = `c4-receipt-${suffix}`;
    const a = `a4-receipt-${suffix}`;
    const r = `r4-receipt-${suffix}`;
    const file = path.join(os.tmpdir(), `${a}.zip`);
    const timestamp = new Date().toISOString();
    await fs.writeFile(file, 'p4-receipt-artifact');
    const artifactHash = crypto.createHash('sha256').update('p4-receipt-artifact').digest('hex');
    db.prepare("INSERT INTO projects (id,title,status,revision) VALUES (?, 'receipt', 'artifact_verified', 4)").run(p);
    db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash,approved_at) VALUES (?, ?, 7, 'approved', '{}', 'contract-receipt-hash', CURRENT_TIMESTAMP)").run(c, p);
    db.prepare("INSERT INTO verification_runs (id,project_id,contract_id,status,policy_version,started_at,ended_at) VALUES (?, ?, ?, 'verified', '2.0', ?, ?)").run(r, p, c, timestamp, timestamp);
    for (const gateName of [
        'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
        'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
        'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
        'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
    ]) {
        db.prepare(`
            INSERT INTO verification_checks
              (id, contract_id, run_id, gate_name, applicability, status, command, exit_code,
               started_at, ended_at, stdout_digest, stderr_digest, evidence_json)
            VALUES (?, ?, ?, ?, 'MANDATORY', 'PASS', 'node gate', 0, ?, ?, ?, ?, '{"ok":true}')
        `).run(`${r}-${gateName}`, c, r, gateName, timestamp, timestamp, `stdout-${gateName}`, `stderr-${gateName}`);
    }
    artifactRepository.createArtifact({
        id: a, projectId: p, contractId: c, kind: 'zip', path: file,
        sha256: artifactHash, size: 20, status: 'verification_pending'
    });
    artifactRepository.updateArtifactStatus({
        projectId: p, contractId: c, artifactId: a, status: 'verified', verificationRunId: r
    });
    const result = completeVerifiedProject({ projectId: p, contractId: c, artifactId: a, expectedRevision: 4 });
    const receipt = db.prepare('SELECT * FROM completion_receipts WHERE id = ?').get(result.completionReceiptId);
    assert(receipt, 'completion receipt must be durable');
    assert.deepStrictEqual(
        {
            project_id: receipt.project_id, contract_id: receipt.contract_id,
            contract_hash: receipt.contract_hash, artifact_id: receipt.artifact_id,
            artifact_hash: receipt.artifact_hash, run_id: receipt.run_id,
            policy_version: receipt.policy_version, mandatory_gate_digests: JSON.parse(receipt.mandatory_gate_digests),
            previous_revision: receipt.previous_revision, next_revision: receipt.next_revision,
            completed_at: receipt.completed_at
        },
        {
            project_id: p, contract_id: c, contract_hash: 'contract-receipt-hash',
            artifact_id: a, artifact_hash: artifactHash, run_id: r, policy_version: '2.0',
            mandatory_gate_digests: JSON.parse(JSON.stringify(
                db.prepare('SELECT gate_name, stdout_digest, stderr_digest FROM verification_checks WHERE run_id = ? AND applicability = ? ORDER BY gate_name')
                    .all(r, 'MANDATORY')
            )),
            previous_revision: 4, next_revision: 5, completed_at: receipt.completed_at
        }
    );
    assert.strictEqual(result.completionReceiptId, receipt.id);
    await fs.rm(file, { force: true });
});

await runAsyncTest('P4.5 completion rejects an incomplete active-policy mandatory gate set', async () => {
    const suffix = Date.now();
    const p = `p4-gate-${suffix}`;
    const c = `c4-gate-${suffix}`;
    const a = `a4-gate-${suffix}`;
    const r = `r4-gate-${suffix}`;
    const file = path.join(os.tmpdir(), `${a}.zip`);
    await fs.writeFile(file, 'p4-gate-artifact');
    const hash = crypto.createHash('sha256').update('p4-gate-artifact').digest('hex');
    db.prepare("INSERT INTO projects (id,title,status,revision) VALUES (?, 'gate', 'artifact_verified', 1)").run(p);
    db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash,approved_at) VALUES (?, ?, 1, 'approved', '{}', 'h', CURRENT_TIMESTAMP)").run(c, p);
    db.prepare("INSERT INTO requirements (id,contract_id,stable_key,statement,kind,priority,mandatory,status) VALUES (?, ?, 'REQ', 'gate', 'functional', 'high', 1, 'approved')").run(r, c);
    db.prepare("INSERT INTO verification_runs (id,project_id,contract_id,status,policy_version,started_at,ended_at) VALUES (?, ?, ?, 'verified', '2.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").run(`run-${suffix}`, p, c);
    artifactRepository.createArtifact({ id: a, projectId: p, contractId: c, kind: 'zip', path: file, sha256: hash, size: 17, status: 'verified' });
    db.prepare('UPDATE artifacts SET verification_run_id = ? WHERE id = ?').run(`run-${suffix}`, a);
    assert.throws(() => completeVerifiedProject({ projectId: p, contractId: c, artifactId: a, expectedRevision: 1 }), /mandatory gate set/i);
    await fs.rm(file, { force: true });
});

await runAsyncTest('P4.5 download authorization rejects artifact linked to non-verified run', async () => {
    const suffix = Date.now();
    const p = `p4-download-${suffix}`;
    const c = `c4-download-${suffix}`;
    const a = `a4-download-${suffix}`;
    db.prepare("INSERT INTO projects (id,title,status) VALUES (?, 'download', 'artifact_verified')").run(p);
    db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash,approved_at) VALUES (?, ?, 1, 'approved', '{}', 'h', CURRENT_TIMESTAMP)").run(c, p);
    db.prepare("INSERT INTO verification_runs (id,project_id,contract_id,status,policy_version,started_at) VALUES (?, ?, ?, 'failed', '2.0', CURRENT_TIMESTAMP)").run(`run-${suffix}`, p, c);
    artifactRepository.createArtifact({ id: a, projectId: p, contractId: c, kind: 'zip', path: 'missing.zip', sha256: 'a'.repeat(64), size: 1, status: 'verified' });
    db.prepare('UPDATE artifacts SET verification_run_id = ? WHERE id = ?').run(`run-${suffix}`, a);
    assert.throws(() => assertVerifiedArtifactEvidence({ projectId: p, contractId: c, artifactId: a }), /not verified/i);
});

await runAsyncTest('P4.5 workflow has no direct product-completion write', async () => {
    assert(!/finalState\.status\s*=\s*['"]completed['"]/.test(workflowSource));
    assert(workflowSource.includes('completeVerifiedProject'));
});

await isolated.cleanup();
