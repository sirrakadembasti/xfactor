import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTransientLLMTaskFailure, runLLMTaskWithRetry } from '../engine/llmTaskRetry.js';

const wrappedNetworkError = code => new Error('Fetch 3 denemeden sonra başarısız oldu.', {
    cause: new TypeError('fetch failed', { cause: Object.assign(new Error('connection failed'), { code }) })
});

test('wrapped transport causes retry and remain capped at three provider attempts', async () => {
    const diagnostics = [];
    let calls = 0;
    const result = await runLLMTaskWithRetry({ agentRole: 'coder', messages: [], maxAttempts: 99, retryDelayMs: 0,
        generate: async () => { if (++calls < 3) throw wrappedNetworkError('ENOTFOUND'); return 'ok'; },
        onDiagnostic: async item => diagnostics.push(item) });
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
    assert.deepEqual(diagnostics.map(item => item.disposition), ['retrying', 'retrying', 'succeeded']);
    calls = 0;
    await assert.rejects(runLLMTaskWithRetry({ agentRole: 'coder', messages: [], maxAttempts: 99, retryDelayMs: 0,
        generate: async () => { calls++; throw wrappedNetworkError('ECONNRESET'); } }), /Fetch 3/);
    assert.equal(calls, 3);
});

test('cause traversal is bounded, cycle safe, and rejects unknown errors or ordinary HTTP auth errors', () => {
    for (const code of ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT']) assert.equal(isTransientLLMTaskFailure(wrappedNetworkError(code)), true);
    assert.equal(isTransientLLMTaskFailure(wrappedNetworkError('UNRECOGNIZED')), false);
    assert.equal(isTransientLLMTaskFailure(new Error('Google API Hatası: 401')), false);
    const cycle = new Error('unknown failure'); cycle.cause = cycle;
    assert.equal(isTransientLLMTaskFailure(cycle), false);
    let tooDeep = Object.assign(new Error('connection failed'), { code: 'ENOTFOUND' });
    for (let i = 0; i < 5; i++) tooDeep = new Error('opaque wrapper', { cause: tooDeep });
    assert.equal(isTransientLLMTaskFailure(tooDeep), false);
});

test('terminal abort anywhere in the inspected chain wins over transient transport errors', () => {
    const paused = new Error('PAUSED', { cause: wrappedNetworkError('ENOTFOUND') });
    assert.equal(isTransientLLMTaskFailure(paused), false);
    assert.equal(isTransientLLMTaskFailure(new Error('timeout', { cause: new Error('LEASE_LOST') })), false);
    assert.equal(isTransientLLMTaskFailure(new Error('timeout', { cause: Object.assign(new Error('cancelled'), { name: 'AbortError' }) })), false);
    assert.equal(isTransientLLMTaskFailure(Object.assign(new Error('stopped'), { code: 'PAUSED', cause: wrappedNetworkError('ECONNRESET') })), false);
});

test('pause during retry backoff cancels the next provider attempt', async () => {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(runLLMTaskWithRetry({ agentRole: 'coder', messages: [], signal: controller.signal, retryDelayMs: 100,
        generate: async () => { calls++; throw wrappedNetworkError('ETIMEDOUT'); },
        onDiagnostic: async () => { setTimeout(() => controller.abort(new Error('PAUSED')), 5); } }), /PAUSED/);
    assert.equal(calls, 1);
});

test('validation failures never retry even when their cause looks transient', async () => {
    let calls = 0;
    await assert.rejects(runLLMTaskWithRetry({ agentRole: 'coder', messages: [], retryDelayMs: 0,
        generate: async () => { calls++; return 'invalid json'; },
        parseResponse: () => { throw new SyntaxError('invalid output', { cause: wrappedNetworkError('ENOTFOUND') }); } }), /invalid output/);
    assert.equal(calls, 1);
});
