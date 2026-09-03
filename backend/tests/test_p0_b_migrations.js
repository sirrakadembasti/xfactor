import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-b-migrations');
process.env.DB_PATH = isolated.dbPath;

const { getSchemaVersion, db } = await import('../db.js');
isolated.registerDatabase(db);

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Verification run schema and lifecycle rules', async () => {
    const version = getSchemaVersion();
    assert.ok(version >= 8, `Schema version should include verification tables, got: ${version}`);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert.ok(tables.includes('verification_runs'), 'verification_runs table missing');
    assert.ok(tables.includes('verification_checks'), 'verification_checks table missing');

    const {
        createRun,
        updateRunStatus,
        startCheck,
        endCheck,
        getRunEvidence
    } = await import('../repositories/verificationRepository.js');

    // Create project and contract
    db.prepare("INSERT INTO projects (id, title, status) VALUES ('run-owner-a', 'Project A', 'planning'), ('run-owner-b', 'Project B', 'planning')").run();
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES ('run-contract-a', 'run-owner-a', 1, 'approved', '{}', 'hash-a')
    `).run();

    // Cross-project / contract ownership FK rejection
    assert.throws(() => createRun({
        id: 'cross-owner-run',
        projectId: 'run-owner-b',
        contractId: 'run-contract-a',
        status: 'queued',
        policyVersion: '1.0',
        startedAt: new Date().toISOString()
    }), /FOREIGN KEY/);

    // Valid runs start queued and transition through the lifecycle explicitly.
    const runId = 'valid-run-1';
    assert.throws(() => createRun({
        id: 'terminal-run-verified',
        projectId: 'run-owner-a',
        contractId: 'run-contract-a',
        status: 'verified',
        policyVersion: '1.0'
    }), /initial|queued|non-terminal/i);
    assert.throws(() => createRun({
        id: 'terminal-run-failed',
        projectId: 'run-owner-a',
        contractId: 'run-contract-a',
        status: 'failed',
        policyVersion: '1.0'
    }), /initial|queued|non-terminal/i);
    createRun({
        id: runId,
        projectId: 'run-owner-a',
        contractId: 'run-contract-a',
        status: 'queued',
        policyVersion: '1.0',
        startedAt: new Date().toISOString()
    });
    assert.strictEqual(updateRunStatus(runId, 'running').status, 'running');

    // Start a check
    const checkId = 'check-tsc-1';
    startCheck({
        id: checkId,
        contractId: 'run-contract-a',
        runId,
        gateName: 'typecheck',
        applicability: 'MANDATORY',
        command: 'tsc --noEmit',
        cwd: '/workspace',
        startedAt: new Date().toISOString()
    });

    // End check
    endCheck({
        id: checkId,
        contractId: 'run-contract-a',
        runId,
        status: 'PASS',
        exitCode: 0,
        endedAt: new Date().toISOString(),
        timedOut: false,
        stdoutDigest: 'abc',
        stderrDigest: 'def',
        evidenceJson: JSON.stringify({ errors: [] })
    });

    const evidence = getRunEvidence(runId);
    assert.strictEqual(evidence.run.id, runId);
    assert.strictEqual(evidence.checks.length, 1);
    assert.strictEqual(evidence.checks[0].gate_name, 'typecheck');
    assert.strictEqual(evidence.checks[0].status, 'PASS');
    assert.strictEqual(updateRunStatus(runId, 'verified').status, 'verified');
    assert.throws(() => updateRunStatus(runId, 'failed'), /terminal|immutable|transition/i);

    db.prepare("DELETE FROM projects WHERE id IN ('run-owner-a', 'run-owner-b')").run();
});

finish();
await isolated.cleanup();
