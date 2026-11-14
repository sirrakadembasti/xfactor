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

test('worker requests are bounded even when the worker accepts the socket but never answers', async () => {
    const http = await import('node:http');
    const held = [];
    const server = http.createServer((req, res) => { held.push(res); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
        const client = createExecutionClient({ EXECUTION_WORKER_URL: url, EXECUTION_WORKER_REQUEST_TIMEOUT_MS: 200 });
        const started = Date.now();
        await assert.rejects(client.getCapabilities(), error => error.code === 'WORKER_REQUEST_TIMEOUT'
            && /timed out after 200 ms: \/readyz/.test(error.message));
        assert.ok(Date.now() - started < 5000, 'timeout must fire near the configured bound');
        await assert.rejects(client.cancelJob('hung-job', 'hung-project'), error => error.code === 'WORKER_REQUEST_TIMEOUT'
            && !error.message.includes('hung-project'), 'timeout message must not echo query values');

        const controller = new AbortController();
        const callerAbort = client.getCapabilities({ signal: controller.signal });
        controller.abort();
        await assert.rejects(callerAbort, error => error.code !== 'WORKER_REQUEST_TIMEOUT',
            'a caller abort is not reported as a worker timeout');
    } finally {
        for (const res of held) res.destroy();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('a single unanswered status poll is retried like a transport failure', async () => {
    const originalFetch = globalThis.fetch;
    const job = { version: 1, jobId: 'hung-poll-job', projectId: 'hung-poll-project', contractId: 'hung-poll-contract',
        contractHash: 'a'.repeat(64), revision: 1, artifactId: 'hung-poll-artifact', nonce: 'b'.repeat(64),
        inputSha256: 'c'.repeat(64), runId: 'hung-poll-run', deadline: Date.now() + 10000, archiveBase64: 'eA==' };
    let polls = 0;
    globalThis.fetch = (url, options) => {
        if (options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ ...job, operation: 'verify_artifact', status: 'queued' })));
        polls += 1;
        // The first poll never answers; it only ends when the client's own deadline aborts it.
        if (polls === 1) return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
        return Promise.resolve(new Response(JSON.stringify({ ...job, operation: 'verify_artifact', status: 'completed',
            result: { ...job, operation: 'verify_artifact', checks: [] } })));
    };
    // AbortSignal.timeout does not keep the process alive; a running backend's HTTP server does.
    const keepAlive = setInterval(() => {}, 1000);
    try {
        const result = await createExecutionClient({ EXECUTION_WORKER_REQUEST_TIMEOUT_MS: 150 }).verifyArtifact(job);
        assert.strictEqual(result.status, 'completed');
        assert.strictEqual(polls, 2);
    } finally {
        clearInterval(keepAlive);
        globalThis.fetch = originalFetch;
    }
});
