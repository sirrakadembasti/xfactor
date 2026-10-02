import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLLMResponse } from '../llm.js';

const messages = [{ role: 'user', content: 'Hello' }];
const defaults = { apiKey: 'fixture-key', model: 'fixture-model', baseURL: 'https://provider.example/v1', useManagedProfile: false };
async function withFetch(mock, operation) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await operation(); } finally { globalThis.fetch = original; }
}
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], candidates: [{ content: { parts: [{ text: 'ok' }] } }], content: [{ type: 'text', text: 'ok' }] }), { status: 200 });

test('Manager rejects partial responses for every transport while production retains its policy', async () => {
  await withFetch(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }], candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }], stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] }), { status: 200 }), async () => {
    for (const provider of ['google', 'anthropic', 'openai', 'xiaomi_mimo']) {
      await assert.rejects(() => generateLLMResponse(messages, { ...defaults, provider, purpose: 'manager' }), error => error.code === 'LLM_TRUNCATED');
      assert.equal(await generateLLMResponse(messages, { ...defaults, provider }), 'partial');
    }
  });
});

test('provider requests use the configured output budget', async () => {
  await withFetch(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig?.maxOutputTokens ?? body.max_completion_tokens ?? body.max_tokens, 2048);
    return ok();
  }, async () => {
    for (const provider of ['google', 'anthropic', 'openai', 'xiaomi_mimo', 'deepseek']) {
      assert.equal(await generateLLMResponse(messages, { ...defaults, provider, maxOutputTokens: 2048 }), 'ok');
    }
  });
});

test('MiMo Manager auto disables thinking while production auto preserves the provider default', async () => {
  let body;
  await withFetch(async (_url, options) => { body = JSON.parse(options.body); return ok(); }, async () => {
    const settings = { ...defaults, provider: 'xiaomi_mimo', thinking: 'auto' };
    await generateLLMResponse(messages, { ...settings, purpose: 'manager' });
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal(body.max_completion_tokens, 8192);
    assert.equal(Object.hasOwn(body, 'max_tokens'), false);
    await generateLLMResponse(messages, settings);
    assert.equal(Object.hasOwn(body, 'thinking'), false);
    for (const thinking of ['enabled', 'disabled']) {
      await generateLLMResponse(messages, { ...settings, thinking, purpose: 'manager' });
      assert.deepEqual(body.thinking, { type: thinking });
    }
  });
});

test('runtime rejects invalid budgets before contacting the provider', async () => {
  await withFetch(() => { throw new Error('unexpected request'); }, async () => {
    for (const timeoutMs of [0, -1, NaN, Infinity, 300001]) {
      await assert.rejects(() => generateLLMResponse(messages, { ...defaults, provider: 'openai', timeoutMs }), /timeout/i);
    }
    for (const maxOutputTokens of [0, -1, 1.5, NaN, Infinity, 32769]) {
      await assert.rejects(() => generateLLMResponse(messages, { ...defaults, provider: 'openai', maxOutputTokens }), /token/i);
    }
  });
});

test('short explicit deadlines abort pending calls and preserve their timeout cause', async () => {
  await withFetch((_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }), async () => {
    // Keep the event loop alive because AbortSignal.timeout uses an unref timer.
    const keepAlive = setTimeout(() => {}, 1000);
    try {
      await assert.rejects(() => generateLLMResponse(messages, { ...defaults, provider: 'openai', timeoutMs: 5 }), error => error.name === 'TimeoutError');
    } finally { clearTimeout(keepAlive); }
  });
});

test('provider HTTP failures expose a machine readable status', async () => {
  await withFetch(async () => new Response('unauthorized', { status: 401 }), async () => {
    for (const provider of ['google', 'anthropic', 'openai']) {
      await assert.rejects(() => generateLLMResponse(messages, { ...defaults, provider }), error => error.upstreamStatus === 401);
    }
  });
});

test('network retries preserve nested causes for Manager error categorization', async () => {
  const socketError = Object.assign(new Error('DNS failure'), { code: 'ENOTFOUND' });
  const fetchError = new TypeError('fetch failed', { cause: socketError });
  await withFetch(async () => { throw fetchError; }, async () => {
    await assert.rejects(() => generateLLMResponse(messages, { ...defaults, provider: 'openai' }), error => error.cause?.cause?.cause === socketError);
  });
});
