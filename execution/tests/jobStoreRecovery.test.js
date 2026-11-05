import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../jobStore.js';

test('completed phase diagnostics survive deadlines as bounded advisory data without acceptance checks', () => {
  const store = new JobStore();
  store.insertJob({ jobId: 'phase', projectId: 'fixture', deadline: Date.now() + 10000 });
  store.updateJobStatus('phase', 'pending', 'running'); store.beginDiagnostics('phase', 'lease');
  const event = { phase: 'build', checks: [{ name: 'typecheck', status: 'failed', stdout: 'password=fixture-secret\n' + 'x'.repeat(20000),
    stderr: 'compiler diagnostic', exitCode: 2, stdoutSha256: 'a'.repeat(64), arbitrary: 'private' }] };
  assert.equal(store.recordPhaseDiagnostic('phase', 'wrong', event), false);
  assert.equal(store.recordPhaseDiagnostic('phase', 'lease', event), true);
  assert.equal(store.recordPhaseDiagnostic('phase', 'lease', event), false);
  store.updateJobStatus('phase', 'running', 'failed_timeout', { error: 'deadline' });
  const job = store.getJob('phase', 'fixture');
  const row = job.result.diagnostics.phases[0].checks[0];
  assert.equal(row.status, 'failed'); assert.equal(row.exitCode, 2);
  assert.ok(!row.stdout.includes('fixture-secret')); assert.ok(Buffer.byteLength(row.stdout) <= 4096);
  assert.equal(row.stdoutTruncated, true); assert.equal(row.stdoutDigest, 'a'.repeat(64));
  assert.equal(row.arbitrary, undefined); assert.equal(job.result.checks, undefined);
  assert.equal(store.recordPhaseDiagnostic('phase', 'lease', { ...event, phase: 'runtime' }), false);
});

test('corrupt persisted jobs stop startup without overwriting evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-store-corrupt-'));
  try {
    const file = path.join(root, 'jobs.json');
    fs.writeFileSync(file, '{broken');
    assert.throws(() => new JobStore(file), /job store|corrupt/i);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('interrupted jobs persist their completion time across restart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-store-restart-'));
  try {
    const file = path.join(root, 'jobs.json');
    fs.writeFileSync(file, JSON.stringify({ fixture: { jobId: 'fixture', projectId: 'project', status: 'running', deadline: Date.now() + 10000 } }));
    const job = new JobStore(file).getJob('fixture', 'project');
    assert.equal(job.status, 'failed_interrupted');
    assert.ok(Number.isFinite(job.completedAt));
    const reopened = new JobStore(file).getJob('fixture', 'project');
    assert.equal(reopened.completedAt, job.completedAt);
    assert.equal(JSON.parse(fs.readFileSync(file)).fixture.status, 'failed_interrupted');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('diagnostics enforce lease, fixed fields, ring bound and immutable terminal snapshots', () => {
  const store = new JobStore();
  store.insertJob({ jobId: 'progress', projectId: 'fixture', deadline: Date.now() + 10000 });
  store.updateJobStatus('progress', 'pending', 'running');
  assert.equal(store.beginDiagnostics('progress', 'owned-lease'), true);
  const start = id => ({ state: 'started', commandId: id, phase: 'typecheck', executable: 'npx', startedAt: 100,
    argv: ['private-source'], stdout: 'private-output', env: { SECRET: 'private-env' } });
  assert.equal(store.recordCommandDiagnostic('progress', 'wrong-lease', start(1)), false);
  assert.equal(store.recordCommandDiagnostic('progress', 'owned-lease', { ...start(1), phase: 'private-phase' }), false);
  for (let id = 1; id <= 70; id++) {
    assert.equal(store.recordCommandDiagnostic('progress', 'owned-lease', start(id)), true);
    assert.equal(store.recordCommandDiagnostic('progress', 'owned-lease', { state: 'finished', commandId: id, endedAt: 101, exitCode: 0, stdoutSha256: 'not-a-digest', secret: 'private-secret' }), true);
  }
  const progress = store.getJob('progress', 'fixture');
  assert.equal(progress.diagnostics.commands.length, 64);
  assert.equal(progress.diagnostics.commands[0].commandId, 7);
  assert.equal(progress.diagnostics.commands[0].stdoutSha256, undefined);
  assert.doesNotMatch(JSON.stringify(progress.diagnostics), /private-/);
  store.updateJobStatus('progress', 'running', 'cancelled', { reason: 'cancelled' });
  const frozen = JSON.stringify(progress.result);
  assert.equal(store.recordCommandDiagnostic('progress', 'owned-lease', start(71)), false);
  assert.equal(store.beginDiagnostics('progress', 'replacement-lease'), false);
  assert.equal(JSON.stringify(progress.result), frozen);
  assert.equal(progress.result.checks, undefined);
  assert.equal(progress.status, 'cancelled');
});

test('expiry sweep and restart preserve diagnostics without accepting a late lease', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-store-diagnostic-recovery-'));
  try {
    const file = path.join(root, 'jobs.json');
    const store = new JobStore(file);
    store.insertJob({ jobId: 'active', projectId: 'fixture', runId: 'bound-run', deadline: Date.now() + 10000 });
    store.updateJobStatus('active', 'pending', 'running');
    store.beginDiagnostics('active', 'owned-lease');
    store.recordCommandDiagnostic('active', 'owned-lease', { state: 'started', commandId: 1, phase: 'framework_build', executable: 'npm', startedAt: 100 });
    const reopened = new JobStore(file).getJob('active', 'fixture');
    assert.equal(reopened.status, 'failed_interrupted');
    assert.equal(reopened.result.runId, 'bound-run');
    assert.equal(reopened.result.diagnostics.commands[0].phase, 'framework_build');
    store.getJob('active', 'fixture').deadline = Date.now() - 1;
    store.insertJob({ jobId: 'next', projectId: 'fixture', deadline: Date.now() + 10000 });
    const expired = store.getJob('active', 'fixture');
    assert.equal(expired.status, 'failed_timeout');
    assert.equal(expired.result.diagnostics.commands[0].timedOut, true);
    assert.equal(store.recordCommandDiagnostic('active', 'owned-lease', { state: 'finished', commandId: 1, endedAt: 101, exitCode: 0 }), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
