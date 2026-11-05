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

test('execution client reports identity-checked advisory progress without forwarding raw worker data', async () => {
    const originalFetch = globalThis.fetch;
    const job = { version: 1, jobId: 'progress-job', projectId: 'progress-project', contractId: 'progress-contract',
        contractHash: 'a'.repeat(64), revision: 1, artifactId: 'progress-artifact', nonce: 'b'.repeat(64),
        inputSha256: 'c'.repeat(64), runId: 'progress-run', deadline: Date.now() + 10000, archiveBase64: 'private-archive' };
    let polls = 0;
    const events = [];
    globalThis.fetch = async (_url, options) => new Response(JSON.stringify({ ...job, operation: 'verify_artifact',
        status: options?.method === 'POST' ? 'pending' : ++polls > 1 ? 'completed' : 'running',
        diagnostics: { commands: [{ commandId: 1, phase: 'dependency_install', executable: 'npm', startedAt: Date.now(),
            args: ['private-argument'], stdout: 'private-stdout', env: { SECRET: 'private-env' } }] },
        rawOutput: 'private-output' }), { status: 200 });
    try {
        await createExecutionClient({}, { onProgress: event => events.push(event) }).verifyArtifact(job);
        assert.ok(events.some(event => event.status === 'running'), 'progress is observable before terminal evidence');
        assert.equal(events.find(event => event.status === 'running').commands[0].phase, 'dependency_install');
        assert.ok(!JSON.stringify(events).includes('private-'));
        const mismatched = [];
        globalThis.fetch = async () => new Response(JSON.stringify({ ...job, operation: 'verify_artifact', projectId: 'foreign-project', status: 'running' }));
        await assert.rejects(createExecutionClient({}, { onProgress: event => mismatched.push(event) }).verifyArtifact(job), /Identity mismatch/);
        assert.equal(mismatched.length, 0);
    } finally { globalThis.fetch = originalFetch; }
});
