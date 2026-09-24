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
