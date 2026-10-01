import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';
import * as runtime from '../runtime.js';

test('commands cannot extend the remaining job deadline', () => {
  assert.equal(typeof runtime.commandTimeoutMs, 'function');
  assert.equal(runtime.commandTimeoutMs(900000, 1010, 1000), 10);
  assert.equal(runtime.commandTimeoutMs(5, 1010, 1000), 5);
  assert.throws(() => runtime.commandTimeoutMs(900000, 1000, 1000), /deadline/i);
});

test('shutdown aborts active execution without starting a queued job', async () => {
  const store = new JobStore();
  for (const jobId of ['shutdown-active', 'shutdown-pending']) store.insertJob({ jobId, projectId: 'fixture', deadline: Date.now() + 60000 });
  let count = 0, started;
  const ready = new Promise(resolve => { started = resolve; });
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture', EXECUTION_WORKER_RUNTIME: 'local' }, store,
    executeJob: async (_, { signal }) => { count++; started(); return new Promise(resolve => signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true })); } });
  try {
    await ready; await server.stopJobs(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(count, 1); assert.equal(store.getJob('shutdown-pending', 'fixture').status, 'pending');
  } finally { await server.stopJobs(); server.close(); store.close(); }
});

test('running jobs are aborted at deadline and persist a timeout', async () => {
  const store = new JobStore();
  store.insertJob({ jobId: 'deadline-test', projectId: 'fixture', deadline: Date.now() + 150 });
  let aborted = false;
  let finish;
  const execution = new Promise(resolve => { finish = resolve; });
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture', EXECUTION_WORKER_RUNTIME: 'local' }, store,
    executeJob: async (_, { signal }) => {
      signal.addEventListener('abort', () => { aborted = true; finish({ status: 'cancelled' }); }, { once: true });
      return execution;
    } });
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(aborted, true);
    assert.equal(store.getJob('deadline-test', 'fixture').status, 'failed_timeout');
    assert.equal(store.getJob('deadline-test', 'fixture').result.runtime.osIsolation, false);
  } finally { finish({ status: 'cancelled' }); server.close(); }
});
