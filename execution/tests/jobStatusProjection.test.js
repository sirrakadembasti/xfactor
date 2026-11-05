import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';

test('job polling omits submitted archive and contract bytes', async () => {
    const store = new JobStore();
    store.insertJob({
        version: 1,
        jobId: 'projection-job',
        operation: 'verify_artifact',
        projectId: 'projection-project',
        contractId: 'projection-contract',
        contractHash: 'a'.repeat(64),
        revision: 1,
        artifactId: 'projection-artifact',
        nonce: 'nonce',
        inputSha256: 'b'.repeat(64),
        runId: 'projection-run',
        deadline: Date.now() + 60000,
        archiveBase64: 'large-private-archive',
        packageJsonBase64: 'private-manifest',
        contract: { secret: 'private-contract' },
    });
    const server = createWorkerServer({
        config: { EXECUTION_WORKER_TOKEN: 'test-token' },
        store,
        executeJob: async () => ({ status: 'success', result: {} }),
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/jobs/projection-job?projectId=projection-project`, {
            headers: { Authorization: 'Bearer test-token' },
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.ok(['pending', 'running', 'completed'].includes(body.status));
        assert.equal(body.jobId, 'projection-job');
        assert.equal(body.archiveBase64, undefined);
        assert.equal(body.packageJsonBase64, undefined);
        assert.equal(body.contract, undefined);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('running job polling exposes bounded command progress without private arguments or output', async () => {
    const store = new JobStore();
    store.insertJob({ version: 1, jobId: 'live-progress-job', operation: 'verify_artifact', projectId: 'live-progress-project',
        contractId: 'contract', contractHash: 'a'.repeat(64), revision: 1, artifactId: 'artifact', nonce: 'nonce',
        inputSha256: 'b'.repeat(64), runId: 'run', deadline: Date.now() + 60000 });
    let release;
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const server = createWorkerServer({ config: { EXECUTION_WORKER_TOKEN: 'test-token' }, store,
        executeJob: async (_job, { onProgress, onPhaseComplete }) => {
            onPhaseComplete({phase:'build',checks:[{name:'typecheck',status:'failed',stderr:'private-compiler-output',exitCode:2}]});
            onProgress({ state: 'started', commandId: 1, phase: 'dependency_install', executable: 'npm', startedAt: Date.now(),
                args: ['private-argument'], stdout: 'private-output' });
            await new Promise(resolve => { release = resolve; started(); });
            return { status: 'success', result: {} };
        } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await ready;
        const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/jobs/live-progress-job?projectId=live-progress-project`, {
            headers: { Authorization: 'Bearer test-token' }
        });
        const data = await response.json();
        assert.equal(data.status, 'running');
        assert.equal(data.diagnostics?.commands[0]?.phase, 'dependency_install');
        assert.ok(!JSON.stringify(data).includes('private-'));
    } finally { release?.(); await new Promise(resolve => server.close(resolve)); }
});
