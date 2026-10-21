import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';

test('readiness reports native trust profile without claiming isolation', async () => {
  const store = new JobStore();
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture-token' }, store,
    executeJob: async () => {}, probeRuntime: async () => ({ executionProfile: 'local-trusted', osIsolation: false, isolation: false }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/readyz`, { headers: { authorization: 'Bearer fixture-token' } });
    const body = await response.json();
    assert.equal(body.executionProfile, 'local-trusted'); assert.equal(body.osIsolation, false); assert.equal(body.executionCapacity, true);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});

test('readiness fails closed when runtime probe fails', async () => {
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture-token' }, store: new JobStore(),
    executeJob: async () => {}, probeRuntime: async () => { throw new Error('Docker unavailable'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/readyz`, { headers: { authorization: 'Bearer fixture-token' } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).executionCapacity, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('readiness failure logs only bounded allowlisted operator diagnostics', async () => {
  const secret = 'secret-token-C:/private/path\nINJECTED';
  const failures = [
    Object.assign(new Error(secret), { readinessPhase: 'browser_launch', code: 'ENOENT' }),
    { readinessPhase: secret, name: secret, code: secret, message: secret, stack: secret },
    ...['tool_resolution', 'renderer_context', 'renderer_page', 'renderer_content', 'renderer_evaluate', 'browser_close']
      .map(readinessPhase => ({ readinessPhase, name: 'TimeoutError', code: 'ETIMEDOUT', message: secret }))
  ];
  const lines = [];
  const originalWarn = console.warn;
  const store = new JobStore();
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture-token' }, store,
    executeJob: async () => {}, probeRuntime: async () => { throw failures.shift(); } });
  console.warn = (...args) => lines.push(args);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const expected = [
      { phase: 'browser_launch', name: 'Error', code: 'ENOENT' },
      { phase: 'unknown', name: 'unknown', code: 'unknown' },
      ...['tool_resolution', 'renderer_context', 'renderer_page', 'renderer_content', 'renderer_evaluate', 'browser_close']
        .map(phase => ({ phase, name: 'TimeoutError', code: 'ETIMEDOUT' }))
    ];
    for (const fields of expected) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/readyz`, { headers: { authorization: 'Bearer fixture-token' } });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { supportedTypes: [], executionCapacity: false, error: 'Isolated runtime is unavailable' });
      const args = lines.at(-1);
      assert.equal(args?.length, 1, 'one bounded warning per failure');
      const prefix = '[execution-worker] readiness failed ';
      assert.ok(args[0].startsWith(prefix));
      assert.deepEqual(JSON.parse(args[0].slice(prefix.length)), fields);
      assert.ok(args[0].length < 200);
      assert.ok(!args[0].includes(secret));
      assert.ok(!args[0].includes('\n'));
    }
    assert.equal(lines.length, expected.length);
  } finally {
    console.warn = originalWarn;
    await new Promise(resolve => server.close(resolve)); store.close();
  }
});

test('unauthorized readiness request neither probes runtime nor logs a failure', async () => {
  let probes = 0;
  const lines = [];
  const originalWarn = console.warn;
  const store = new JobStore();
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture-token' }, store,
    executeJob: async () => {}, probeRuntime: async () => { probes++; throw new Error('secret'); } });
  console.warn = (...args) => lines.push(args);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/readyz`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
    assert.equal(probes, 0);
    assert.deepEqual(lines, []);
  } finally {
    console.warn = originalWarn;
    await new Promise(resolve => server.close(resolve)); store.close();
  }
});
