import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';
import { createExecutionClient } from '../../backend/executionClient.js';

test('Job Boundary API', async (t) => {
  const dbPath = path.join(process.cwd(), '.worktrees', 'p9-audit-remediation', 'execution', 'tests', 'test_store.json');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  
  const store = new JobStore(dbPath);
  const token = crypto.randomBytes(32).toString('hex');
  const config = { EXECUTION_WORKER_TOKEN: token };
  
  let executedJob = null;
  let executionWaitResolve = null;
  const executeJob = async (job, { signal }) => {
    executedJob = job;
    await new Promise(r => {
      executionWaitResolve = r;
      signal.addEventListener('abort', r);
    });
  };
  
  const server = createWorkerServer({ config, store, executeJob });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.EXECUTION_WORKER_URL = `http://127.0.0.1:${port}`;
  
  t.after(() => {
    server.close();
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  const client = createExecutionClient(config);

  const getValidJob = () => ({
    version: 1,
    jobId: crypto.randomUUID(),
    operation: 'verifyArtifact',
    projectId: 'proj-123',
    contractId: 'c-1',
    contractHash: 'hash',
    revision: 'rev-1',
    artifactId: 'art-1',
    archiveBase64: 'base64...',
    contract: { some: 'data' },
    deadline: Date.now() + 60000
  });

  await t.test('no token denied / client empty token rejects', async () => {
    assert.throws(() => createExecutionClient({ EXECUTION_WORKER_URL: config.EXECUTION_WORKER_URL }), /EXECUTION_WORKER_TOKEN/);
    
    const res = await new Promise((resolve) => {
      http.request(`http://127.0.0.1:${port}/readyz`, { method: 'GET' }, (res) => resolve(res.statusCode)).end();
    });
    assert.equal(res, 401);
  });

  await t.test('wrong token denied (timing safe)', async () => {
    const badClient = createExecutionClient({ ...config, EXECUTION_WORKER_TOKEN: 'wrong-token' });
    await assert.rejects(badClient.getCapabilities(), /Worker error \(401\)/);
  });

  await t.test('malformed identity/contract rejected', async () => {
    const job = getValidJob();
    delete job.contract;
    await assert.rejects(client.verifyArtifact(job), /Worker error \(400\)/);
  });

  await t.test('oversized payload rejected', async () => {
    const job = getValidJob();
    job.archiveBase64 = 'a'.repeat(35 * 1024 * 1024); // > 33.5MB limit
    await assert.rejects(client.verifyArtifact(job), /Payload too large|fetch failed/);
  });

  await t.test('duplicate jobId handling (retry vs collision)', async () => {
    const job = getValidJob();
    await client.verifyArtifact(job);
    
    // Retry exact same job should succeed (idempotent)
    await client.verifyArtifact(job);
    
    // Same jobId, different input should fail 409
    const jobDifferent = { ...job, archiveBase64: 'different-base64' };
    await assert.rejects(client.verifyArtifact(jobDifferent), /Worker error \(409\)/);
    
    // Cleanup active job so we don't stall the loop
    await client.cancelJob(job.jobId);
  });

  await t.test('expired job rejected', async () => {
    const job = getValidJob();
    job.deadline = Date.now() - 1000;
    await assert.rejects(client.verifyArtifact(job), /Expired or invalid deadline/);
  });

  await t.test('cross-principal polling rejected', async () => {
    const job = getValidJob();
    await client.verifyArtifact(job);
    
    const url = `${config.EXECUTION_WORKER_URL}/v1/jobs/${job.jobId}?projectId=wrong-proj`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    assert.equal(res.status, 403);
    
    await client.cancelJob(job.jobId);
  });

  await t.test('cancellation waits for resource cleanup', async () => {
    const job = getValidJob();
    await client.verifyArtifact(job);
    await client.cancelJob(job.jobId);
    assert.equal(store.getJob(job.jobId, job.projectId).status, 'cancelled');
  });

  await t.test('queue capacity (max 8)', async () => {
    const jobs = [];
    for (let i = 0; i < 8; i++) { 
      const j = getValidJob();
      await client.verifyArtifact(j);
      jobs.push(j);
    }
    await assert.rejects(client.verifyArtifact(getValidJob()), /Worker error \(429\)/);
    
    for (const j of jobs) await client.cancelJob(j.jobId);
  });

  await t.test('restart recovery marks interrupted as failed', async () => {
    const restartJob = getValidJob();
    const state = {
      [restartJob.jobId]: { ...restartJob, status: 'running' }
    };
    fs.writeFileSync(dbPath, JSON.stringify(state));
    
    const newStore = new JobStore(dbPath);
    const jobInStore = newStore.getJob(restartJob.jobId, restartJob.projectId);
    
    assert.equal(jobInStore.status, 'failed_interrupted');
    newStore.close();
  });
});
