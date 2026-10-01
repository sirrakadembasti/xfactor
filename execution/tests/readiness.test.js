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
