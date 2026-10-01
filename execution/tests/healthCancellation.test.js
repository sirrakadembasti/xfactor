import test from 'node:test';
import assert from 'node:assert/strict';
import { probeServiceHealth } from '../../backend/verification/healthProber.js';

const url = 'http://127.0.0.1:12345/health';
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
test('health probe refuses an already aborted operation without requesting service', async () => {
  const controller = new AbortController(); const reason = new Error('Cancelled health probe'); controller.abort(reason);
  let requests = 0;
  await assert.rejects(probeServiceHealth(url, 300, { signal: controller.signal, adapter: { request: async () => { requests++; return { statusCode: 200 }; } } }), error => error === reason);
  assert.equal(requests, 0);
});
test('health probe propagates cancellation during an active adapter execution', async () => {
  const controller = new AbortController(); const reason = new Error('Cancelled health probe'); const started = deferred();
  let requests = 0;
  const adapter = { execute: ({ signal }) => {
    requests++; started.resolve();
    return new Promise((resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  } };
  const result = probeServiceHealth(url, 300, { signal: controller.signal, adapter, initialDelayMs: 20, maxDelayMs: 20 });
  await started.promise; controller.abort(reason);
  await assert.rejects(result, error => error === reason);
  assert.equal(requests, 1);
});
test('health probe interrupts retry backoff instead of waiting its full delay', async () => {
  const controller = new AbortController(); const reason = new Error('Cancelled health probe'); const requested = deferred();
  let requests = 0;
  const result = probeServiceHealth(url, 1100, { signal: controller.signal, initialDelayMs: 1000, adapter: { request: async () => { requests++; requested.resolve(); return { statusCode: 503 }; } } });
  await requested.promise;
  // Let the failed response enter its backoff before cancellation.
  await new Promise(resolve => setTimeout(resolve, 20));
  const abortedAt = Date.now(); controller.abort(reason);
  await assert.rejects(result, error => error === reason);
  assert.ok(Date.now() - abortedAt < 700, 'Cancellation must interrupt the one second backoff');
  assert.equal(requests, 1);
});
test('health probe rejects a late healthy response after cancellation', async () => {
  const controller = new AbortController(); const reason = new Error('Cancelled health probe'); const started = deferred(), reply = deferred();
  const result = probeServiceHealth(url, 300, { signal: controller.signal, adapter: { request: async () => { started.resolve(); return reply.promise; } } });
  await started.promise; controller.abort(reason); reply.resolve({ statusCode: 200, body: 'healthy' });
  await assert.rejects(result, error => error === reason);
});
test('uncancelled health probe retries failed response and accepts actual healthy reply', async () => {
  let requests = 0;
  const result = await probeServiceHealth(url, 500, { initialDelayMs: 10, adapter: { request: async () => (++requests === 1 ? { statusCode: 503 } : { statusCode: 204, body: 'ready' }) } });
  assert.equal(requests, 2); assert.equal(result.responsive, true); assert.equal(result.statusCode, 204); assert.equal(result.body, 'ready');
});
