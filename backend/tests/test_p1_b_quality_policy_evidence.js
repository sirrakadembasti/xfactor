import assert from 'assert';
import express from 'express';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-b-quality-evidence');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const {
    MANDATORY_GATES,
    aggregateVerificationRun,
    evaluateVerificationRun,
    runProjectVerification
} = await import('../verification/qualityPolicy.js');
const { createRun } = await import('../repositories/verificationRepository.js');
const { createProjectRouter } = await import('../routes/projectRoutes.js');

const { runAsyncTest, finish } = createTestHarness();
const projectIds = [];

function seedVerificationCase(label, status = 'verification_running') {
    const projectId = `proj-${label}`;
    const contractId = `contract-${label}`;
    const requirementId = `requirement-${label}`;
    const runId = `run-${label}`;

    projectIds.push(projectId);
    db.prepare('INSERT INTO projects (id, title, status) VALUES (?, ?, ?)').run(
        projectId,
        `Task 9 ${label}`,
        status
    );
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES (?, ?, 1, 'approved', '{}', ?)
    `).run(contractId, projectId, `hash-${label}`);
    db.prepare(`
        INSERT INTO requirements (
            id, contract_id, stable_key, statement, kind, priority, mandatory, status
        ) VALUES (?, ?, ?, 'Runtime behavior must be verified', 'behavior', 'must', 1, 'approved')
    `).run(requirementId, contractId, `REQ-${label}`);
    db.prepare(`
        INSERT INTO task_checkpoints (
            project_id, task_id, contract_id, plan_hash, task_spec_hash,
            input_hash, output_hash, gate_version, status
        ) VALUES (?, 'task-1', ?, 'plan', 'spec', 'input', 'output', 'v1', 'completed')
    `).run(projectId, contractId);
    createRun({
        id: runId,
        projectId,
        contractId,
        status: 'running',
        policyVersion: '1.0'
    });

    return { projectId, contractId, requirementId, runId };
}

function passingChecks(requirementId = null) {
    return MANDATORY_GATES.map(gateName => ({
        gateName,
        status: 'PASS',
        applicability: 'MANDATORY',
        requirementIds: requirementId && gateName === 'api_contract' ? [requirementId] : [],
        command: `${gateName} command`,
        exitCode: 0,
        stdout: `${gateName} stdout`,
        stderr: ''
    }));
}

await runAsyncTest('1. mandatory runtime and smoke gates are part of quality policy', async () => {
    for (const gate of [
        'service_manifest',
        'database_verification',
        'api_contract',
        'browser_journey',
        'smoke_gate',
        'test_infrastructure'
    ]) {
        assert.ok(MANDATORY_GATES.includes(gate), `MANDATORY_GATES must include "${gate}"`);
    }
});

await runAsyncTest('2. duplicate failing evidence cannot be hidden by a passing gate result or LLM approval', async () => {
    const checks = passingChecks();
    checks.push({
        gateName: 'api_contract',
        status: 'FAIL',
        applicability: 'MANDATORY',
        reason: 'Duplicate API evidence failed'
    });

    const evaluation = evaluateVerificationRun({
        checks,
        agentApproved: true,
        agentSummary: 'LLM claimed approval'
    });

    assert.strictEqual(evaluation.passed, false);
    assert.strictEqual(evaluation.status, 'FAIL');
    assert.deepStrictEqual(evaluation.failedGates, ['api_contract']);
});

await runAsyncTest('3. skipped or not-applicable mandatory evidence is BLOCKED', async () => {
    for (const status of ['SKIPPED', 'NOT_APPLICABLE']) {
        const checks = passingChecks();
        checks.find(check => check.gateName === 'smoke_gate').status = status;
        const evaluation = evaluateVerificationRun({ checks });
        assert.strictEqual(evaluation.passed, false);
        assert.strictEqual(evaluation.status, 'BLOCKED');
        assert.ok(evaluation.blockedGates.includes('smoke_gate'));
    }
});

await runAsyncTest('4. aggregate persists duplicate immutable checks, requirement links, and verified state', async () => {
    const seeded = seedVerificationCase('success');
    const checks = passingChecks(seeded.requirementId);
    checks.push({
        ...checks.find(check => check.gateName === 'api_contract'),
        command: 'second api contract command'
    });

    const result = await aggregateVerificationRun(
        seeded.projectId,
        seeded.contractId,
        seeded.runId,
        checks
    );

    assert.deepStrictEqual(result, { passed: true, runStatus: 'verified' });
    const run = db.prepare('SELECT status FROM verification_runs WHERE id = ?').get(seeded.runId);
    assert.strictEqual(run.status, 'verified');
    const persistedChecks = db.prepare(
        'SELECT * FROM verification_checks WHERE run_id = ? ORDER BY started_at, id'
    ).all(seeded.runId);
    assert.strictEqual(persistedChecks.length, checks.length);
    assert.strictEqual(
        persistedChecks.filter(check => check.gate_name === 'api_contract').length,
        2
    );
    const links = db.prepare(
        'SELECT * FROM requirement_check_links WHERE contract_id = ? AND requirement_id = ?'
    ).all(seeded.contractId, seeded.requirementId);
    assert.strictEqual(links.length, 2);
    const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(seeded.projectId);
    assert.strictEqual(project.status, 'runtime_verified');

    await assert.rejects(
        aggregateVerificationRun(seeded.projectId, seeded.contractId, seeded.runId, checks),
        /finalized|already aggregated/i
    );
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM verification_checks WHERE run_id = ?')
            .get(seeded.runId).count,
        checks.length
    );
});

await runAsyncTest('5. failed aggregate invalidates contract checkpoints and stages verification_failed', async () => {
    const seeded = seedVerificationCase('failure');
    const checks = passingChecks(seeded.requirementId);
    checks.find(check => check.gateName === 'api_contract').status = 'FAIL';

    const result = await aggregateVerificationRun(
        seeded.projectId,
        seeded.contractId,
        seeded.runId,
        checks
    );

    assert.deepStrictEqual(result, { passed: false, runStatus: 'failed' });
    const run = db.prepare('SELECT status FROM verification_runs WHERE id = ?').get(seeded.runId);
    assert.strictEqual(run.status, 'failed');
    const checkpoint = db.prepare(`
        SELECT status, invalidated_at, invalidation_reason
        FROM task_checkpoints
        WHERE project_id = ? AND contract_id = ?
    `).get(seeded.projectId, seeded.contractId);
    assert.strictEqual(checkpoint.status, 'invalidated');
    assert.ok(checkpoint.invalidated_at);
    assert.match(checkpoint.invalidation_reason, /verification/i);
    const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(seeded.projectId);
    assert.strictEqual(project.status, 'verification_failed');
});

await runAsyncTest('6. mandatory requirements without passing machine links fail closed', async () => {
    const seeded = seedVerificationCase('unlinked');
    const result = await aggregateVerificationRun(
        seeded.projectId,
        seeded.contractId,
        seeded.runId,
        passingChecks()
    );

    assert.deepStrictEqual(result, { passed: false, runStatus: 'failed' });
    const traceabilityCheck = db.prepare(`
        SELECT status, evidence_json
        FROM verification_checks
        WHERE run_id = ? AND gate_name = 'requirement_traceability'
    `).get(seeded.runId);
    assert.strictEqual(traceabilityCheck.status, 'BLOCKED');
    assert.match(traceabilityCheck.evidence_json, new RegExp(seeded.requirementId));
    assert.strictEqual(
        db.prepare(`
            SELECT COUNT(*) AS count
            FROM requirement_check_links
            WHERE contract_id = ? AND requirement_id = ?
        `).get(seeded.contractId, seeded.requirementId).count,
        0
    );
});

await runAsyncTest('7. state projection failure rolls back run, checks, links, and checkpoint invalidation', async () => {
    const seeded = seedVerificationCase('atomicity');
    db.exec(`
        CREATE TRIGGER reject_task9_state_projection
        BEFORE UPDATE OF status ON projects
        WHEN OLD.id = '${seeded.projectId}'
        BEGIN
            SELECT RAISE(ABORT, 'state projection failed');
        END;
    `);

    const checks = passingChecks(seeded.requirementId);
    checks.find(check => check.gateName === 'api_contract').status = 'FAIL';
    try {
        await assert.rejects(
            aggregateVerificationRun(
                seeded.projectId,
                seeded.contractId,
                seeded.runId,
                checks
            ),
            /state projection failed/
        );
    } finally {
        db.exec('DROP TRIGGER reject_task9_state_projection;');
    }

    const run = db.prepare('SELECT status, ended_at FROM verification_runs WHERE id = ?')
        .get(seeded.runId);
    assert.strictEqual(run.status, 'running');
    assert.strictEqual(run.ended_at, null);
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM verification_checks WHERE run_id = ?')
            .get(seeded.runId).count,
        0
    );
    const checkpoint = db.prepare(`
        SELECT status, invalidated_at
        FROM task_checkpoints
        WHERE project_id = ? AND contract_id = ?
    `).get(seeded.projectId, seeded.contractId);
    assert.strictEqual(checkpoint.status, 'completed');
    assert.strictEqual(checkpoint.invalidated_at, null);
    assert.strictEqual(
        db.prepare('SELECT status FROM projects WHERE id = ?').get(seeded.projectId).status,
        'verification_running'
    );
});

await runAsyncTest('8. production runner links mandatory requirements to passing smoke evidence', async () => {
    const seeded = seedVerificationCase('runner-links', 'implementation_finished');
    const result = await runProjectVerification({
        projectId: seeded.projectId,
        projectDir: 'unused-with-injected-verifiers',
        options: {
            verifiers: {
                dependencies: async () => ({
                    passed: true,
                    checks: [
                        { name: 'package_json', status: 'passed' },
                        { name: 'lockfile', status: 'passed' },
                        { name: 'ast_import_inventory', status: 'passed' },
                        { name: 'clean_install', status: 'passed' }
                    ]
                }),
                build: async () => ({
                    passed: true,
                    checks: [
                        { name: 'typecheck', status: 'passed' },
                        { name: 'framework_build', status: 'passed' }
                    ]
                }),
                smoke: async () => ({
                    passed: true,
                    checks: [
                        { name: 'manifest_presence', status: 'passed' },
                        { name: 'database_connectivity', status: 'passed' },
                        { name: 'api_status_check', status: 'passed' },
                        { name: 'browser_page_load', status: 'passed' },
                        { name: 'smoke_gate', status: 'passed' },
                        { name: 'test_script_presence', status: 'passed' }
                    ]
                })
            }
        }
    });

    assert.strictEqual(result.passed, true);
    const linkedGates = db.prepare(`
        SELECT verification_checks.gate_name
        FROM requirement_check_links
        JOIN verification_checks
          ON verification_checks.contract_id = requirement_check_links.contract_id
         AND verification_checks.id = requirement_check_links.verification_check_id
        WHERE requirement_check_links.contract_id = ?
          AND requirement_check_links.requirement_id = ?
          AND verification_checks.run_id = ?
    `).all(seeded.contractId, seeded.requirementId, result.runId);
    assert.ok(linkedGates.some(row => row.gate_name === 'smoke_gate'));
});

await runAsyncTest('9. invalid requirement link rolls back every evidence write', async () => {
    const seeded = seedVerificationCase('rollback');
    const checks = passingChecks();
    checks.find(check => check.gateName === 'api_contract').requirementIds = ['missing-requirement'];

    await assert.rejects(
        aggregateVerificationRun(seeded.projectId, seeded.contractId, seeded.runId, checks),
        /FOREIGN KEY|requirement/i
    );

    const run = db.prepare('SELECT status, ended_at FROM verification_runs WHERE id = ?')
        .get(seeded.runId);
    assert.strictEqual(run.status, 'running');
    assert.strictEqual(run.ended_at, null);
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM verification_checks WHERE run_id = ?')
            .get(seeded.runId).count,
        0
    );
    const checkpoint = db.prepare(`
        SELECT status, invalidated_at
        FROM task_checkpoints
        WHERE project_id = ? AND contract_id = ?
    `).get(seeded.projectId, seeded.contractId);
    assert.strictEqual(checkpoint.status, 'completed');
    assert.strictEqual(checkpoint.invalidated_at, null);
    const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(seeded.projectId);
    assert.strictEqual(project.status, 'verification_running');
});

await runAsyncTest('10. owner route triggers server verifier without accepting client check verdicts', async () => {
    const seeded = seedVerificationCase('route', 'implementation_finished');
    let runnerInput = null;
    const app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectRouter({
        requireAuth: (req, _res, next) => {
            req.user = { id: 'owner-1', isAdmin: false };
            next();
        },
        projectAccess: role => (req, _res, next) => {
            assert.strictEqual(role, 'owner');
            next();
        },
        wsHub: { broadcast() {} },
        verificationRunner: async input => {
            runnerInput = input;
            return { passed: false, runStatus: 'failed', runId: 'machine-run' };
        }
    }));

    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });

    try {
        const { port } = server.address();
        const response = await fetch(
            `http://127.0.0.1:${port}/api/projects/${seeded.projectId}/verify`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    checks: passingChecks(),
                    agentApproved: true
                })
            }
        );
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(await response.json(), {
            passed: false,
            runStatus: 'failed',
            runId: 'machine-run'
        });
        assert.strictEqual(runnerInput.projectId, seeded.projectId);
        assert.strictEqual(Object.hasOwn(runnerInput, 'checks'), false);
        assert.strictEqual(Object.hasOwn(runnerInput, 'agentApproved'), false);
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
});

for (const projectId of projectIds) {
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
}

finish();
await isolated.cleanup();
