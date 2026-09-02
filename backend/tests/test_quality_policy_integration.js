import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { evaluateVerificationRun, MANDATORY_GATES, ACTIVE_POLICY_VERSION } from '../verification/qualityPolicy.js';

const isolated = await setupIsolatedTestDb('p0-b-quality-policy');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { runAsyncTest, finish } = createTestHarness();

const derivedEvidence = {
    kind: 'derived_gate',
    producer: 'quality-policy-test',
    sourceGateNames: ['fixture'],
    computedAt: '2026-09-02T00:00:00.000Z',
    policyVersion: ACTIVE_POLICY_VERSION
};

await runAsyncTest('1. evaluateVerificationRun should reject LLM agent approval when any mandatory gate fails', async () => {
    const runResult = evaluateVerificationRun({
        agentApproved: true,
        agentSummary: 'LLM Tester claimed project is completely fine',
        checks: [
            { gateName: 'package_json', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'lockfile', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'ast_import_inventory', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'clean_install', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'typecheck', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'framework_build', applicability: 'MANDATORY', status: 'FAIL', reason: 'Compilation error TS2304' }
        ]
    });

    assert.strictEqual(runResult.status, 'FAIL');
    assert.strictEqual(runResult.passed, false);
    assert.ok(runResult.failedGates.includes('framework_build'));
});

await runAsyncTest('2. evaluateVerificationRun should report BLOCKED when mandatory gates are missing or blocked', async () => {
    const incompleteRun = evaluateVerificationRun({
        checks: [
            { gateName: 'package_json', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'lockfile', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'typecheck', applicability: 'MANDATORY', status: 'PASS' },
            { gateName: 'framework_build', applicability: 'MANDATORY', status: 'PASS' }
            // Missing other mandatory gates (e.g. clean_install, runtime/artifact)
        ]
    });

    assert.strictEqual(incompleteRun.status, 'BLOCKED');
    assert.strictEqual(incompleteRun.passed, false);
    assert.ok(incompleteRun.missingGates.length > 0);
});

await runAsyncTest('3. evaluateVerificationRun should PASS only when all mandatory gates are verified PASS', async () => {
    const completeChecks = MANDATORY_GATES.map(gateName => ({
        gateName,
        applicability: 'MANDATORY',
        status: 'PASS',
        evidence: { ...derivedEvidence }
    }));

    const completeRun = evaluateVerificationRun({
        checks: completeChecks
    });

    assert.strictEqual(completeRun.status, 'PASS');
    assert.strictEqual(completeRun.passed, true);
    assert.strictEqual(completeRun.failedGates.length, 0);
    assert.strictEqual(completeRun.missingGates.length, 0);
});

finish();
await isolated.cleanup();
