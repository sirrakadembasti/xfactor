import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../jobStore.js';

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
