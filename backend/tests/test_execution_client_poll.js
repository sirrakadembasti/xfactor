import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutionClient } from '../executionClient.js';

test('execution client survives a transient worker poll connection reset', async () => {
    const originalFetch = globalThis.fetch;
    const job = {
        version: 1,
        jobId: 'poll-retry-job',
        projectId: 'poll-retry-project',
        contractId: 'poll-retry-contract',
        contractHash: 'a'.repeat(64),
        revision: 1,
        artifactId: 'poll-retry-artifact',
        nonce: 'b'.repeat(64),
        inputSha256: 'c'.repeat(64),
        runId: 'poll-retry-run',
        deadline: Date.now() + 10000,
        archiveBase64: 'eA=='
    };
    let polls = 0;
    globalThis.fetch = async (url, options) => {
        if (options?.method === 'POST') return new Response(JSON.stringify({ ...job, operation: 'verify_artifact', status: 'queued' }), { status: 200 });
        polls += 1;
        if (polls === 1) throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });
        return new Response(JSON.stringify({ ...job, operation: 'verify_artifact', status: 'completed', result: { ...job, operation: 'verify_artifact', checks: [] } }), { status: 200 });
    };
    try {
        const client = createExecutionClient();
        const result = await client.verifyArtifact(job);
        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(polls, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
