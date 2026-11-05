import assert from 'node:assert/strict';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';
const isolated = await setupIsolatedTestDb('requirement-coverage-pipeline');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { runVerificationChecks } = await import('../verification/runChecks.js');
const { combineRuntimeGate, RUNTIME_GATE_MEMBERS } = await import('../verification/qualityPolicy.js');
const { evaluateRequirementCoverage } = await import('../verification/requirementCoverage.js');
const { runAsyncTest, runTest, finish } = createTestHarness();
async function evaluate(requirementIds, concrete = []) {
    return runVerificationChecks({ files: [], requirementIds, runId: 'coverage-run', verifiers: {
        dependencies: async () => ({ checks: concrete }), build: async () => ({ checks: [] }),
        readme: async () => ({ passed: true }), smoke: async () => ({ checks: [] })
    } });
}
await runAsyncTest('empty worker scope cannot become passing requirement traceability', async () => {
    const result = await evaluate([]);
    assert.notEqual(result.checks.find(c => c.name === 'requirement_traceability').status, 'passed');
});
await runAsyncTest('worker without scope or plan delegates traceability to the backend without passing it', async () => {
    const result = await evaluate([], [{ id: 'gate', name: 'typecheck', status: 'passed', requirementIds: [] }]);
    const trace = result.checks.find(c => c.name === 'requirement_traceability');
    assert.equal(trace.status, 'skipped');
    assert.equal(trace.exitCode, 1);
    assert.equal(trace.evidence.scope, 'backend-authoritative');
    assert.deepEqual(trace.evidence.coveredIds, []);
    assert.deepEqual(trace.evidence.issues, [{ code: 'missing-authoritative-scope' }]);
    // Other worker gates decide the job; the backend still recomputes coverage fail-closed.
    assert.equal(result.passed, true);
});
await runAsyncTest('supplied but uncovered worker scope still blocks the job', async () => {
    const result = await evaluate(['req-a'], [{ id: 'gate', name: 'typecheck', status: 'passed', requirementIds: [] }]);
    const trace = result.checks.find(c => c.name === 'requirement_traceability');
    assert.equal(trace.status, 'blocked');
    assert.equal(trace.evidence.scope, undefined);
    assert.equal(result.passed, false);
});
await runAsyncTest('caller scope is not copied onto unrelated machine checks', async () => {
    const result = await evaluate(['req-a', 'req-b'], [{ id: 'owned', name: 'typecheck', status: 'passed', requirementIds: ['req-a'] }]);
    assert.deepEqual(result.checks.find(c => c.id === 'owned').requirementIds, ['req-a']);
    assert.deepEqual(result.checks.find(c => c.name === 'readme_check').requirementIds, []);
    assert.notEqual(result.checks.find(c => c.name === 'requirement_traceability').status, 'passed');
});
await runAsyncTest('explicit concrete coverage survives the worker pipeline without inventing other ownership', async () => {
    const result = await evaluate(['req-a'], [{ id: 'owned', name: 'typecheck', status: 'passed', requirementIds: ['req-a'] }]);
    const trace = result.checks.find(c => c.name === 'requirement_traceability');
    assert.equal(trace.status, 'passed');
    assert.deepEqual(trace.evidence.coveredIds, ['req-a']);
    assert.deepEqual(trace.requirementIds, []);
});
runTest('successful smoke aggregation cannot claim every mandatory requirement', () => {
    const checks = [...RUNTIME_GATE_MEMBERS.smoke_gate].map(name => ({ name, status: 'passed' }));
    const aggregate = combineRuntimeGate('smoke_gate', checks, ['unowned-requirement']);
    assert.equal(aggregate.status, 'PASS');
    assert.deepEqual(aggregate.requirementIds, []);
});
await runAsyncTest('opaque worker evidence retains a blocking marker through downstream transport', async () => {
    const opaque = '{"kind":"derived_gate"}';
    const result = await evaluate(['req-a'], [{ id: 'opaque', name: 'typecheck', status: 'passed', requirementIds: ['req-a'], evidence: opaque }]);
    assert.equal(result.checks.find(c => c.id === 'opaque').evidence.invalidEvidenceShape, true);
    assert.equal(evaluateRequirementCoverage({ mandatoryRequirementIds: ['req-a'], checks: JSON.parse(JSON.stringify(result.checks)) }).passed, false);
    assert.notEqual(result.checks.find(c => c.name === 'requirement_traceability').status, 'passed');
});
finish();
await isolated.cleanup();
