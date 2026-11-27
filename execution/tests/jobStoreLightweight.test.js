import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../jobStore.js';

const identity = { version: 1, operation: 'verify_artifact', projectId: 'fixture', contractId: 'contract-1', contractHash: 'c'.repeat(64),
  revision: 1, artifactId: 'artifact-1', nonce: 'nonce-1', inputSha256: 'a'.repeat(64), runId: 'run-1' };
const archive = Buffer.from('archive-bytes'.repeat(1000)).toString('base64');
const makeJob = (overrides = {}) => ({ jobId: 'job-1', ...identity, archiveBase64: archive, contract: { requirements: [] },
  deadline: Date.now() + 60000, ...overrides });
const withStore = (name, work, options) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `xfactor-store-${name}-`));
  const file = path.join(root, 'jobs.json');
  try { return work(file, root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
};

test('a terminal job drops its archive and package payloads but keeps identity and input hash', () => {
  const store = new JobStore();
  store.insertJob(makeJob());
  store.insertJob(makeJob({ jobId: 'job-2', operation: 'prepare_dependencies', archiveBase64: undefined, packageJsonBase64: archive, nonce: 'nonce-2' }));
  for (const jobId of ['job-1', 'job-2']) {
    store.updateJobStatus(jobId, 'pending', 'running');
    assert.ok(store.getJob(jobId, 'fixture').archiveBase64 || store.getJob(jobId, 'fixture').packageJsonBase64, 'running jobs keep their input');
    store.updateJobStatus(jobId, 'running', 'completed', { ok: true });
    const done = store.getJob(jobId, 'fixture');
    assert.equal(done.archiveBase64, undefined);
    assert.equal(done.packageJsonBase64, undefined);
    assert.equal(done.inputSha256, 'a'.repeat(64));
    assert.equal(done.projectId, 'fixture');
    assert.equal(done.status, 'completed');
    assert.equal(done.result.ok, true);
  }
});

test('terminal jobs are not retained with payloads on disk or after a restart', () => withStore('slim', file => {
  const store = new JobStore(file);
  store.insertJob(makeJob());
  store.updateJobStatus('job-1', 'pending', 'running');
  store.updateJobStatus('job-1', 'running', 'failed', { error: 'boom' });
  assert.ok(!fs.readFileSync(file, 'utf8').includes(archive));
  const restarted = new JobStore(file);
  assert.equal(restarted.getJob('job-1', 'fixture').archiveBase64, undefined);
}));

test('payloads already persisted on terminal jobs are dropped when the store is loaded', () => withStore('legacy', file => {
  const legacy = { ...makeJob(), status: 'completed', completedAt: Date.now(), result: { ok: true } };
  fs.writeFileSync(file, JSON.stringify({ 'job-1': legacy }));
  const store = new JobStore(file);
  assert.equal(store.getJob('job-1', 'fixture').archiveBase64, undefined);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(archive));
  assert.equal(store.insertJob(makeJob()), 'exists');
}));

test('a retried terminal job is recognised by identity and input, a different input is refused', () => {
  const store = new JobStore();
  assert.equal(store.insertJob(makeJob()), 'inserted');
  store.updateJobStatus('job-1', 'pending', 'running');
  store.updateJobStatus('job-1', 'running', 'completed', { ok: true });
  assert.equal(store.insertJob(makeJob()), 'exists');
  assert.throws(() => store.insertJob(makeJob({ inputSha256: 'b'.repeat(64) })), /Duplicate jobId with different input/);
  assert.throws(() => store.insertJob(makeJob({ nonce: 'other' })), /Duplicate jobId with different input/);
  assert.throws(() => store.insertJob(makeJob({ contract: { requirements: ['x'] } })), /Duplicate jobId with different input/);
  // Same claimed hash but different bytes must not be mistaken for the finished job.
  assert.throws(() => store.insertJob(makeJob({ archiveBase64: Buffer.from('tampered').toString('base64') })), /Duplicate jobId with different input/);
});

test('a hundred command diagnostics are coalesced into at most two writes', async () => {
  const store = new JobStore(':memory:', { saveCoalesceMs: 30 });
  let saves = 0;
  store.isMemory = false; // exercise the persistence path without touching disk
  store._save = () => { saves++; };
  store.insertJob(makeJob());
  store.updateJobStatus('job-1', 'pending', 'running');
  store.beginDiagnostics('job-1', 'lease');
  saves = 0;
  for (let id = 1; id <= 50; id++) {
    store.recordCommandDiagnostic('job-1', 'lease', { state: 'started', commandId: id, phase: 'dependency_install', executable: 'npm', startedAt: id });
    store.recordCommandDiagnostic('job-1', 'lease', { state: 'finished', commandId: id, endedAt: id + 1, exitCode: 0 });
  }
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.ok(saves <= 2, `expected at most 2 writes, got ${saves}`);
  assert.ok(saves >= 1, 'the coalesced diagnostics must still be persisted');
});

test('close flushes pending diagnostics and terminal transitions write immediately', () => withStore('flush', file => {
  const store = new JobStore(file, { saveCoalesceMs: 60000 });
  store.insertJob(makeJob());
  store.updateJobStatus('job-1', 'pending', 'running');
  store.beginDiagnostics('job-1', 'lease');
  store.recordCommandDiagnostic('job-1', 'lease', { state: 'started', commandId: 1, phase: 'dependency_install', executable: 'npm', startedAt: 1 });
  const commandsOnDisk = () => JSON.parse(fs.readFileSync(file, 'utf8'))['job-1'].diagnostics.commands.length;
  assert.equal(commandsOnDisk(), 1, 'the first event of a quiet period is written at once');
  store.recordCommandDiagnostic('job-1', 'lease', { state: 'started', commandId: 2, phase: 'dependency_install', executable: 'npm', startedAt: 2 });
  assert.equal(commandsOnDisk(), 1, 'a later event inside the interval is coalesced');
  store.close();
  assert.equal(commandsOnDisk(), 2, 'close flushes the pending write');
  store.updateJobStatus('job-1', 'running', 'completed', { ok: true });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))['job-1'].status, 'completed', 'terminal transitions are written at once');
}));

test('a running job still crashes into failed_interrupted on restart', () => withStore('crash', file => {
  const store = new JobStore(file);
  store.insertJob(makeJob());
  store.updateJobStatus('job-1', 'pending', 'running');
  const restarted = new JobStore(file);
  assert.equal(restarted.getJob('job-1', 'fixture').status, 'failed_interrupted');
}));
