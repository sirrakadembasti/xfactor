import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';
import { createExecutionClient } from '../../backend/executionClient.js';

test('Job Boundary API', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-test-'));
  const dbPath = path.join(tmpDir, 'test_store.json');
  
  const store = new JobStore(dbPath);
  const token = crypto.randomBytes(32).toString('hex');
  const config = { EXECUTION_WORKER_TOKEN: token };
  
  let executeWaitResolve = null;
  const executeJob = async (job, { signal }) => {
    await new Promise(r => {
      executeWaitResolve = r;
      signal.addEventListener('abort', r);
    });
    return { testOutcome: 'success' };
  };
  
  const server = createWorkerServer({ config, store, executeJob });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.EXECUTION_WORKER_URL = `http://127.0.0.1:${port}`;
  
  t.after(() => {
    server.close();
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const client = createExecutionClient(config);

  const getValidJob = () => {
    const archiveBase64 = 'base64...';
    return {
      version: 1,
      jobId: crypto.randomUUID(),
      operation: 'verify_artifact',
      projectId: 'proj-123',
      contractId: 'c-1',
      contractHash: 'hash',
      revision: 'rev-1',
      artifactId: 'art-1',
      archiveBase64,
      nonce: crypto.randomBytes(32).toString('hex'),
      inputSha256: crypto.createHash('sha256').update(archiveBase64).digest('hex'),
      contract: { some: 'data' },
      deadline: Date.now() + 60000
    };
  };

  await t.test('no token denied / client empty token rejects', async () => {
    assert.throws(() => createExecutionClient({ EXECUTION_WORKER_URL: config.EXECUTION_WORKER_URL }), /EXECUTION_WORKER_TOKEN/);
    
    const res = await new Promise((resolve) => {
      http.request(`http://127.0.0.1:${port}/readyz`, { method: 'GET' }, (res) => resolve(res.statusCode)).end();
    });
    assert.equal(res, 401);
  });

  await t.test('wrong token denied (timing safe)', async () => {
    const badClient = createExecutionClient({ ...config, EXECUTION_WORKER_TOKEN: crypto.randomBytes(32).toString('hex') });
    await assert.rejects(badClient.getCapabilities(), /Worker error \(401\)/);
  });
  
  await t.test('forbidden host/Docker field rejected', async () => {
    const job = getValidJob();
    job.contract.hostPath = '/etc/passwd';
    await assert.rejects(client.verifyArtifact(job), /Worker error \(400\)/);
  });
  
  await t.test('invalid operation rejected', async () => {
    const job = getValidJob();
    job.operation = 'some_arbitrary_op';
    const res = await fetch(`${config.EXECUTION_WORKER_URL}/v1/jobs`, {
      method: 'POST',
      body: JSON.stringify(job),
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    assert.equal(res.status, 400);
  });

  await t.test('digest identity mismatch rejected', async () => {
    const job = getValidJob();
    job.inputSha256 = crypto.randomBytes(32).toString('hex'); // Wrong hash
    await assert.rejects(client.verifyArtifact(job), /Worker error \(400\)/);
  });

  await t.test('oversized payload rejected', async () => {
    const job = getValidJob();
    job.archiveBase64 = 'a'.repeat(35 * 1024 * 1024); // > 33.5MB limit
    job.inputSha256 = crypto.createHash('sha256').update(job.archiveBase64).digest('hex');
    await assert.rejects(client.verifyArtifact(job), /Payload too large|fetch failed/);
  });

  await t.test('polling awaits terminal outcome', async () => {
    const job = getValidJob();
    const p = client.verifyArtifact(job);
    
    setTimeout(() => {
      if (executeWaitResolve) executeWaitResolve();
    }, 100);
    
    const finalState = await p;
    assert.equal(finalState.status, 'completed');
    assert.equal(finalState.result.testOutcome, 'success');
  });

  await t.test('duplicate jobId handling (exact retry vs collision)', async () => {
    const job = getValidJob();
    const p = client.verifyArtifact(job);
    setTimeout(() => { if (executeWaitResolve) executeWaitResolve(); }, 50);
    await p;
    
    // Retry exact same job should succeed (idempotent, return completed immediately)
    const p2 = client.verifyArtifact(job);
    setTimeout(() => { if (executeWaitResolve) executeWaitResolve(); }, 50);
    await p2;
    
    // Same jobId, different input (e.g., changed contractHash) should fail 409
    const jobDifferent = { ...job, contractHash: 'different' };
    await assert.rejects(client.verifyArtifact(jobDifferent), /Worker error \(409\)/);
  });

  await t.test('cross-principal polling rejected', async () => {
    const job = getValidJob();
    const p = client.verifyArtifact(job);
    setTimeout(() => { if (executeWaitResolve) executeWaitResolve(); }, 50);
    await p;
    
    const url = `${config.EXECUTION_WORKER_URL}/v1/jobs/${job.jobId}?projectId=wrong-proj`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    assert.equal(res.status, 403);
  });

  await t.test('cancellation aborts polling and cleans up', async () => {
    const job = getValidJob();
    
    const abortController = new AbortController();
    const p = client.verifyArtifact(job, { signal: abortController.signal });
    
    setTimeout(async () => {
       await client.cancelJob(job.jobId);
       abortController.abort();
    }, 50);
    
    await assert.rejects(p, /Aborted/);
    
    const jobInStore = store.getJob(job.jobId, job.projectId);
    assert.equal(jobInStore.status, 'cancelled');
  });

  await t.test('queue capacity (max 8)', async () => {
    const pendingJobs = [];
    for (let i = 0; i < 8; i++) { 
      const j = getValidJob();
      client.verifyArtifact(j).catch(()=>{}); 
      pendingJobs.push(j);
    }
    
    await new Promise(r => setTimeout(r, 100));
    
    await assert.rejects(client.verifyArtifact(getValidJob()), /Worker error \(429\)/);
    
    for (const j of pendingJobs) await client.cancelJob(j.jobId);
    if (executeWaitResolve) executeWaitResolve();
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
