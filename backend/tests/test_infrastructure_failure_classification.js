import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestHarness } from './testHarness.js';
import { verifyDependencies, isTransientRegistryFailure } from '../verification/packageVerifier.js';
import { summarizeWorkerRejection } from '../verification/workerFailures.js';

const { runAsyncTest, finish } = createTestHarness();
const E502 = 'npm error code E502\nnpm error 502 Bad Gateway - GET http://proxy/x';
const files = [
    { path: 'package.json', content: '{"name":"infra-fixture"}' },
    { path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' },
    { path: 'src/index.js', content: 'export const ready = true;' }
];
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-infra-'));

function install(results) {
    const calls = [];
    const adapter = { id: 'infra-fixture', isAvailable: () => true, execute: async request => {
        calls.push(request);
        return results[Math.min(calls.length - 1, results.length - 1)];
    } };
    return { calls, run: options => verifyDependencies(workspace, {}, { files, adapter, ...options }) };
}
const failure = stderr => ({ passed: false, exitCode: 1, stdout: '', stderr });
const success = { passed: true, exitCode: 0, stdout: 'ok', stderr: '' };
const cleanInstall = result => result.checks.find(check => check.name === 'clean_install');

await runAsyncTest('transient registry detector retries only network outages', () => {
    for (const text of ['npm error code E502', 'E503', 'E504', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND registry', 'socket hang up']) {
        assert.equal(isTransientRegistryFailure(text), true, text);
    }
    for (const text of ['npm error code ERESOLVE', 'npm error code ETARGET', 'npm error code E404', 'npm error code EINTEGRITY', '',
        'ERESOLVE unable to resolve\nnpm error ECONNRESET']) {
        assert.equal(isTransientRegistryFailure(text), false, text);
    }
});

await runAsyncTest('a single transient registry failure is retried once and the install passes', async () => {
    const { calls, run } = install([failure(E502), success]);
    const check = cleanInstall(await run());
    assert.equal(calls.length, 2);
    assert.equal(check.status, 'passed');
    assert.equal(check.evidence.retries.length, 1);
    assert.equal(check.evidence.classification, undefined);
    assert.match(check.reason, /1 geçici registry hatasından sonra yeniden denendi/);
});

await runAsyncTest('two consecutive registry failures are BLOCKED as infrastructure, never PASS', async () => {
    const { calls, run } = install([failure(E502), failure(E502)]);
    const result = await run();
    const check = cleanInstall(result);
    assert.equal(calls.length, 2);
    assert.equal(check.status, 'blocked');
    assert.equal(check.evidence.classification, 'infrastructure');
    assert.equal(result.passed, false);
    assert.match(check.reason, /ağ\/registry hatası nedeniyle tamamlanamadı \(E502\)/);
});

await runAsyncTest('real dependency errors are neither retried nor reclassified', async () => {
    for (const code of ['ERESOLVE', 'ETARGET', 'E404', 'EINTEGRITY']) {
        const { calls, run } = install([failure(`npm error code ${code}`), success]);
        const check = cleanInstall(await run());
        assert.equal(calls.length, 1, code);
        assert.equal(check.status, 'failed', code);
        assert.equal(check.evidence, undefined, code);
    }
});

await runAsyncTest('an aborted verification is not retried', async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, run } = install([failure(E502), success]);
    const check = cleanInstall(await run({ signal: controller.signal }));
    assert.equal(calls.length, 1);
    assert.notEqual(check.status, 'passed');
});

await runAsyncTest('worker rejection summary separates infrastructure-only from mixed outcomes', () => {
    const identity = { contractId: 'c', contractHash: 'h' };
    const infra = { id: 'ci', name: 'clean_install', status: 'BLOCKED', reason: 'ağ/registry (E502)', evidence: { classification: 'infrastructure' } };
    const dependent = { id: 'tc', name: 'typecheck', status: 'BLOCKED', reason: 'install blocked' };
    const base = { identity, terminalStatus: 'failed', artifactManifest: [], rawChecks: [infra, dependent],
        records: [{ gateName: 'clean_install', status: 'BLOCKED' }, { gateName: 'typecheck', status: 'BLOCKED' }] };
    const pure = summarizeWorkerRejection(base);
    assert.equal(pure.infrastructureBlockers.length, 1);
    assert.deepEqual(pure.blockers, []);
    assert.ok(!pure.blockers.some(item => /No safely routable|Additional unrepairable/.test(item)), JSON.stringify(pure.blockers));
    const mixed = summarizeWorkerRejection({ ...base, acceptanceBlockers: ['Worker returned an unknown mandatory gate.'] });
    assert.deepEqual(mixed.infrastructureBlockers, []);
    assert.ok(mixed.blockers.some(item => item.startsWith('clean_install:')));
    const failedGate = summarizeWorkerRejection({ ...base, records: [...base.records, { gateName: 'smoke_gate', status: 'FAIL' }] });
    assert.deepEqual(failedGate.infrastructureBlockers, []);
    assert.ok(failedGate.blockers.some(item => /Additional unrepairable gate smoke_gate: FAIL/.test(item)));
});

await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
finish();
