import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTransientLLMTaskFailure, runLLMTaskWithRetry } from '../engine/llmTaskRetry.js';
import { generateLLMResponse } from '../llm.js';

const wrappedNetworkError = code => new Error('Fetch 3 denemeden sonra başarısız oldu.', {
    cause: new TypeError('fetch failed', { cause: Object.assign(new Error('connection failed'), { code }) })
});
test('explicit bounded large-file output budget reaches the provider without retrying truncated output',async()=>{
 let calls=0;
 await assert.rejects(runLLMTaskWithRetry({agentRole:'coder',messages:[],maxAttempts:1,maxOutputTokens:32768,
  generate:async(_messages,options)=>{calls++;assert.equal(options.maxOutputTokens,32768);assert.equal(options.maxTransportAttempts,1);throw Object.assign(new Error('Model yanıtı token sınırında kesildi.'),{code:'LLM_TRUNCATED'});}}),error=>error.code==='LLM_TRUNCATED');
 assert.equal(calls,1);
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

// Exercise the real task -> provider adapter -> fetch path. Removing the
// single retry-owner boundary multiplies these HTTP calls to nine (or adds a
// Google SDK request before REST), even though the task-layer unit tests pass.
test('one agent task has one retry owner across real provider transports', async () => {
    const originalFetch = globalThis.fetch;
    try {
        for (const provider of ['openai', 'anthropic', 'google']) {
            let requests = 0;
            globalThis.fetch = async () => {
                requests++;
                return new Response(JSON.stringify({ error: { message: 'Fixture upstream unavailable' } }), { status: 503 });
            };
            await assert.rejects(runLLMTaskWithRetry({
                agentRole: 'coder', messages: [{ role: 'user', content: 'Fixture task' }],
                maxAttempts: 3, retryDelayMs: 0,
                generate: (messages, options) => generateLLMResponse(messages, {
                    ...options, provider, apiKey: 'fixture-key', model: 'fixture-model',
                    useManagedProfile: false, allowMockFallback: false,
                    // Native Google default path must not secretly add SDK ->
                    // REST calls below the outer task's retry budget.
                    baseURL: provider === 'google' ? undefined : 'https://provider.example/v1'
                })
            }), /503/);
            assert.equal(requests, 3, `${provider}: outer task budget must bound actual HTTP requests`);
            requests = 0;
            globalThis.fetch = async () => {
                if (++requests < 3) return new Response('{}', { status: 503 });
                return new Response(JSON.stringify({
                    choices: [{ message: { content: 'recovered' } }],
                    content: [{ type: 'text', text: 'recovered' }],
                    candidates: [{ content: { parts: [{ text: 'recovered' }] } }]
                }), { status: 200 });
            };
            assert.equal(await runLLMTaskWithRetry({
                agentRole: 'coder', messages: [{ role: 'user', content: 'Fixture task' }],
                maxAttempts: 3, retryDelayMs: 0,
                generate: (messages, options) => generateLLMResponse(messages, {
                    ...options, provider, apiKey: 'fixture-key', model: 'fixture-model',
                    useManagedProfile: false, allowMockFallback: false,
                    baseURL: provider === 'google' ? undefined : 'https://provider.example/v1'
                })
            }), 'recovered');
            assert.equal(requests, 3, `${provider}: a successful third request must remain usable`);
        }
    } finally { globalThis.fetch = originalFetch; }
});

test('malformed output is retried once only when the caller opts in, with the answer echoed back', async () => {
    const parse = text => { const value = JSON.parse(text); if (!Array.isArray(value.files)) throw new Error('no files'); return value; };
    const seen = [], diagnostics = [];
    const result = await runLLMTaskWithRetry({ agentRole: 'coder', maxAttempts: 1, messages: [{ role: 'user', content: 'repair' }],
        formatRetryMessage: 'Return only JSON.', parseResponse: parse, onDiagnostic: async d => { diagnostics.push(d.disposition); },
        generate: async messages => { seen.push(messages); return seen.length === 1 ? 'import x from "y";' : '{"files":[{"path":"a.ts","content":"ok"}]}'; } });
    assert.deepEqual(result.files, [{ path: 'a.ts', content: 'ok' }]);
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[1].slice(-2), [{ role: 'assistant', content: 'import x from "y";' }, { role: 'user', content: 'Return only JSON.' }]);
    assert.deepEqual(diagnostics, ['format_retry', 'succeeded']);

    let calls = 0;
    await assert.rejects(runLLMTaskWithRetry({ agentRole: 'coder', maxAttempts: 1, messages: [], formatRetryMessage: 'Return only JSON.',
        parseResponse: parse, generate: async () => { calls++; return 'still not json'; } }), SyntaxError);
    assert.equal(calls, 2, 'exactly one format correction, then the failure stands');

    calls = 0;
    await assert.rejects(runLLMTaskWithRetry({ agentRole: 'coder', maxAttempts: 3, messages: [], parseResponse: parse,
        generate: async () => { calls++; return 'not json'; } }), SyntaxError);
    assert.equal(calls, 1, 'without the opt-in, malformed output is never retried');
});
