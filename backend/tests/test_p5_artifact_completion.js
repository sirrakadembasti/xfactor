import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p5-artifact-completion');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createArtifact, getArtifact } = await import('../repositories/artifactRepository.js');
const { getProject } = await import('../projectRepository.js');
const { verifyArtifactAndProject } = await import('../verification/verificationCli.js');
const { runAsyncTest, finish } = createTestHarness();

const projectId = 'p5-artifact-completion-project';
const contractId = 'p5-artifact-completion-contract';
const artifactId = 'p5-artifact-completion-artifact';
const runId = 'p5-artifact-completion-run';
const legacyProjectId = 'p5-legacy-synthetic-project';
const legacyContractId = 'p5-legacy-synthetic-contract';
const legacyArtifactId = 'p5-legacy-synthetic-artifact';
const legacyRunId = 'p5-legacy-synthetic-run';
const timestamp = new Date().toISOString();
const artifactPath = path.join(path.dirname(isolated.dbPath), 'artifact.zip');
const mandatoryGates = [
    'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
    'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
    'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
    'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
];

try {
    await fs.writeFile(artifactPath, 'canonical artifact evidence');
    const artifactContent = await fs.readFile(artifactPath);
    const artifactHash = crypto.createHash('sha256').update(artifactContent).digest('hex');

    db.prepare("INSERT INTO projects (id, title, status, revision) VALUES (?, 'Canonical artifact', 'runtime_verified', 1)")
        .run(projectId);
    db.prepare(`
        INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
        VALUES (?, ?, 1, 'approved', '{"name":"canonical"}', 'canonical-contract-hash', ?)
    `).run(contractId, projectId, timestamp);
    db.prepare(`
        INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at)
        VALUES (?, ?, ?, 'verified', '2.0', ?, ?)
    `).run(runId, projectId, contractId, timestamp, timestamp);
    for (const gateName of mandatoryGates) {
        db.prepare(`
            INSERT INTO verification_checks
              (id, contract_id, run_id, gate_name, applicability, status, command, exit_code,
               started_at, ended_at, stdout_digest, stderr_digest, evidence_json)
            VALUES (?, ?, ?, ?, 'MANDATORY', 'PASS', 'node gate', 0, ?, ?, ?, ?, '{"ok":true}')
        `).run(`${runId}-${gateName}`, contractId, runId, gateName, timestamp, timestamp, `stdout-${gateName}`, `stderr-${gateName}`);
    }
    createArtifact({
        id: artifactId,
        projectId,
        contractId,
        kind: 'zip',
        path: artifactPath,
        sha256: artifactHash,
        size: artifactContent.length,
        manifestJson: '[]',
        status: 'verified'
    });
    db.prepare('UPDATE artifacts SET verification_run_id = ? WHERE contract_id = ? AND id = ?')
        .run(runId, contractId, artifactId);

    await runAsyncTest('legacy synthetic verified rows are retained but not exposed as latestArtifact', async () => {
        db.prepare("INSERT INTO projects (id, title, status, revision) VALUES (?, 'Legacy synthetic artifact', 'completed', 1)")
            .run(legacyProjectId);
        db.prepare(`
            INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
            VALUES (?, ?, 1, 'approved', '{"name":"legacy"}', 'legacy-contract-hash', ?)
        `).run(legacyContractId, legacyProjectId, timestamp);
        db.prepare(`
            INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at)
            VALUES (?, ?, ?, 'verified', '2.0', ?, ?)
        `).run(legacyRunId, legacyProjectId, legacyContractId, timestamp, timestamp);
        createArtifact({
            id: legacyArtifactId,
            projectId: legacyProjectId,
            contractId: legacyContractId,
            kind: 'zip',
            path: artifactPath,
            sha256: artifactHash,
            size: artifactContent.length,
            manifestJson: '[]',
            status: 'verified'
        });
        db.prepare('UPDATE artifacts SET verification_run_id = ? WHERE contract_id = ? AND id = ?')
            .run(legacyRunId, legacyContractId, legacyArtifactId);

        assert.strictEqual(getProject(legacyProjectId).latestArtifact, null);
        assert.ok(db.prepare('SELECT id FROM artifacts WHERE id = ?').get(legacyArtifactId));
    });

    for (const scenario of ['contract replaced', 'contract hash changed', 'signal aborted', 'project paused']) {
        await runAsyncTest(`late custom verification runner cannot publish receipt after ${scenario}`, async () => {
            const controller = new AbortController();
            const originalWorkflow = db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(projectId).workflow_state;
            try {
                await assert.rejects(verifyArtifactAndProject({ projectId, contractId, artifactId, complete: true,
                    options: { signal: controller.signal },
                    verificationRunner: async () => {
                        if (scenario === 'contract replaced') {
                            db.prepare("UPDATE project_contracts SET status='superseded' WHERE id=?").run(contractId);
                            db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
                                VALUES ('custom-replacement',?,2,'approved','{}','new-hash')`).run(projectId);
                        }
                        if (scenario === 'contract hash changed') db.prepare("UPDATE project_contracts SET contract_hash='changed-hash' WHERE id=?").run(contractId);
                        if (scenario === 'signal aborted') controller.abort('PAUSED');
                        if (scenario === 'project paused') db.prepare("UPDATE projects SET status='paused' WHERE id=?").run(projectId);
                        return { passed: true, status: 'verified', runId };
                    }
                }), /contract|cancel|abort|paused/i);
                assert.equal(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(projectId).workflow_state, originalWorkflow);
                assert.equal(db.prepare('SELECT COUNT(*) AS count FROM completion_receipts WHERE project_id=?').get(projectId).count, 0);
                assert.notEqual(db.prepare('SELECT status FROM projects WHERE id=?').get(projectId).status, 'artifact_verified');
                assert.notEqual(db.prepare('SELECT status FROM projects WHERE id=?').get(projectId).status, 'completed');
            } finally {
                db.prepare("DELETE FROM project_contracts WHERE id='custom-replacement'").run();
                db.prepare("UPDATE project_contracts SET status='approved',contract_hash='canonical-contract-hash' WHERE id=?").run(contractId);
                db.prepare("UPDATE projects SET status='runtime_verified',revision=1,workflow_state=? WHERE id=?").run(originalWorkflow, projectId);
            }
        });
    }
    for (const evidence of [null, '{}']) {
        await runAsyncTest(`empty mandatory evidence ${evidence} cannot complete or create a receipt`, async () => {
            const checkId = `${runId}-clean_install`;
            const original = db.prepare('SELECT evidence_json FROM verification_checks WHERE id=?').get(checkId).evidence_json;
            try {
                db.prepare('UPDATE verification_checks SET evidence_json=? WHERE id=?').run(evidence, checkId);
                await assert.rejects(verifyArtifactAndProject({ projectId, contractId, artifactId, complete: true,
                    verificationRunner: async () => ({ passed: true, status: 'verified', runId }) }), /evidence/i);
                assert.equal(db.prepare('SELECT COUNT(*) AS count FROM completion_receipts WHERE project_id=?').get(projectId).count, 0);
                assert.notEqual(db.prepare('SELECT status FROM projects WHERE id=?').get(projectId).status, 'completed');
            } finally {
                db.prepare('UPDATE verification_checks SET evidence_json=? WHERE id=?').run(original, checkId);
                db.prepare("UPDATE projects SET status='runtime_verified',revision=1,workflow_state=NULL WHERE id=?").run(projectId);
            }
        });
    }

    await runAsyncTest('canonical artifact identity authorizes completion with its verified run receipt', async () => {
        db.prepare('UPDATE projects SET workflow_state = ? WHERE id = ?')
            .run(JSON.stringify({ last_error: 'Earlier failed verification' }), projectId);
        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.projectId, projectId);
        assert.strictEqual(artifact.contractId, contractId);
        assert.strictEqual(artifact.verificationRunId, runId);
        assert.strictEqual('project_id' in artifact, false);
        assert.strictEqual('verification_run_id' in artifact, false);

        const result = await verifyArtifactAndProject({
            projectId,
            contractId,
            artifactId,
            complete: true,
            verificationRunner: async () => ({ passed: true, status: 'verified', runId })
        });
        const receipt = db.prepare(
            'SELECT artifact_id, run_id FROM completion_receipts WHERE id = ?'
        ).get(result.completionReceiptId);
        assert.deepStrictEqual({ ...receipt }, { artifact_id: artifactId, run_id: runId });

        const project = getProject(projectId);
        assert.strictEqual(project.last_error, null);
        assert.strictEqual(project.contractId, contractId);
        assert.deepStrictEqual(project.latestArtifact, {
            id: artifactId,
            status: 'verified',
            sha256: artifactHash,
            size: artifactContent.length,
            verificationRunId: runId
        });
        assert.strictEqual('path' in project.latestArtifact, false);
    });
    await runAsyncTest('cancellation and restart reconciliation preserve a completed historical receipt', async () => {
        const { abortProjectExecution } = await import('../engine/cancellation.js');
        const { reconcileStaleWorkflowAttempts } = await import('../workflowAttempts.js');
        const before = db.prepare('SELECT * FROM completion_receipts WHERE project_id=?').all(projectId);
        assert.equal(before.length, 1);
        abortProjectExecution(projectId, 'PAUSED');
        reconcileStaleWorkflowAttempts();
        assert.deepEqual(db.prepare('SELECT * FROM completion_receipts WHERE project_id=?').all(projectId), before);
        assert.equal(getProject(projectId).status, 'completed');
    });
    await runAsyncTest('execution entry refuses completed history without changing source state or receipt', async () => {
        const { executeProjectTasks } = await import('../engine/workflow.js');
        const { acquireWorkflowLease } = await import('../workflowAttempts.js');
        const before = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
        const receipts = db.prepare('SELECT * FROM completion_receipts WHERE project_id=?').all(projectId);
        const lease = acquireWorkflowLease(projectId, 'completed-execution');
        const events = [];
        await assert.rejects(executeProjectTasks(projectId, { publish(event) {
            events.push(event);
            if (event.action === 'start') throw new Error('Completed execution reached dispatch');
        } }, lease.attempt.id, 'completed-execution'), /execution.*status|execution.*state/i);
        assert.deepEqual(db.prepare('SELECT * FROM projects WHERE id=?').get(projectId), before);
        assert.deepEqual(db.prepare('SELECT * FROM completion_receipts WHERE project_id=?').all(projectId), receipts);
        assert.equal(events.length, 0);
    });
} finally {
    await fs.rm(artifactPath, { force: true });
    finish();
    await isolated.cleanup();
}
