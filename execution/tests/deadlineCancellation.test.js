import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';
import * as runtime from '../runtime.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('deadline preserves bounded command metadata after cleanup without promoting partial checks', async t => {
  // Persisted setup can take longer than the test deadline on a busy host.
  // Advance the clock only after the executor has registered its abort handler.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-timeout-diagnostics-'));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const file = path.join(root, 'jobs.json');
  const store = new JobStore(file);
  store.insertJob({ version: 1, jobId: 'diagnostic-timeout', projectId: 'fixture', artifactId: 'artifact-fixture', runId: 'run-fixture', deadline: Date.now() + 200 });
  let lateProgress;
  let started, cleaned;
  const executionStarted = new Promise(resolve => { started = resolve; });
  const cleanupFinished = new Promise(resolve => { cleaned = resolve; });
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture', EXECUTION_WORKER_RUNTIME: 'local' }, store,
    executeJob: async (_, { signal, onProgress }) => {
      lateProgress = onProgress;
      onProgress?.({ state: 'started', commandId: 1, phase: 'dependency_install', executable: 'npm', startedAt: Date.now(), args: ['private-key'], env: { SECRET: 'private-env' }, stdout: 'private-output' });
      onProgress?.({ state: 'finished', commandId: 1, endedAt: Date.now(), exitCode: 0, timedOut: false, stdoutTruncated: false, stderrTruncated: false, stdoutSha256: 'a'.repeat(64), stderrSha256: 'b'.repeat(64) });
      onProgress?.({ state: 'started', commandId: 2, phase: 'prisma_generate', executable: 'npx', startedAt: Date.now(), source: 'private-source' });
      return new Promise(resolve => {
        signal.addEventListener('abort', () => setImmediate(() => {
          fs.rmSync(workspace, { recursive: true, force: true });
          onProgress?.({ state: 'finished', commandId: 2, endedAt: Date.now(), exitCode: 0 });
          resolve({ status: 'success', result: { checks: [{ status: 'passed' }] } });
          cleaned();
        }), { once: true });
        started();
      });
    } });
  try {
    await executionStarted;
    assert.equal(store.getJob('diagnostic-timeout', 'fixture').status, 'running');
    t.mock.timers.tick(201);
    await cleanupFinished;
    const job = store.getJob('diagnostic-timeout', 'fixture');
    assert.equal(job.status, 'failed_timeout');
    assert.equal(fs.existsSync(workspace), false);
    assert.equal(job.result.runId, 'run-fixture');
    assert.equal(job.result.artifactId, 'artifact-fixture');
    assert.equal(job.result.checks, undefined);
    assert.equal(job.result.diagnostics.commands.length, 2);
    assert.equal(job.result.diagnostics.commands[0].exitCode, 0);
    assert.equal(job.result.diagnostics.commands[1].phase, 'prisma_generate');
    assert.equal(job.result.diagnostics.commands[1].endedAt, undefined);
    assert.equal(job.result.diagnostics.commands[1].timedOut, true);
    lateProgress?.({ state: 'started', commandId: 3, phase: 'framework_build', executable: 'npm', startedAt: Date.now() });
    assert.equal(job.result.diagnostics.commands.length, 2);
    const persisted = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(persisted, /private-key|private-env|private-output|private-source/);
    const reopened = new JobStore(file).getJob('diagnostic-timeout', 'fixture');
    assert.deepEqual(reopened.result.diagnostics, job.result.diagnostics);
  } finally { await server.stopJobs(); server.close(); store.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('normal completed verification result is unchanged by diagnostic progress', async () => {
  const store = new JobStore();
  store.insertJob({ jobId: 'diagnostic-success', projectId: 'fixture', deadline: Date.now() + 10000 });
  const evidence = { passed: true, checks: [{ name: 'real_check', status: 'passed', evidence: { receipt: 'existing' } }] };
  const server = createWorkerServer({ config: { WORKER_TOKEN: 'fixture' }, store,
    executeJob: async (_, { onProgress }) => {
      onProgress?.({ state: 'started', commandId: 1, phase: 'typecheck', executable: 'npx', startedAt: Date.now() });
      return { status: 'success', result: evidence };
    } });
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    const job = store.getJob('diagnostic-success', 'fixture');
    assert.equal(job.status, 'completed');
    assert.deepEqual(job.result.checks, evidence.checks);
    assert.equal(job.result.passed, true);
    assert.equal(job.result.diagnostics, undefined);
  } finally { await server.stopJobs(); server.close(); }
});

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
