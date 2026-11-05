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
  
  const executeWaitResolvers = new Map();
  const executeJob = async (job, { signal }) => {
    await new Promise(resolve => {
      const finish = () => { executeWaitResolvers.delete(job.jobId); resolve(); };
      executeWaitResolvers.set(job.jobId, finish);
      signal.addEventListener('abort', finish, { once: true });
    });
    if (signal.aborted) return { status: 'cancelled', error: 'cancelled' };
    const identity = Object.fromEntries(['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'].map(key => [key, job[key]]));
    return { status: 'success', result: { ...identity, testOutcome: 'success' } };
  };

  const waitForResolver = async (jobId, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (executeWaitResolvers.has(jobId)) return;
      await new Promise(resolve => setImmediate(resolve));
    }
    throw new Error(`Executor resolver was not registered for ${jobId}`);
  };
  const releaseWhenReady = async (jobId, timeoutMs = 2000) => {
    await waitForResolver(jobId, timeoutMs);
    executeWaitResolvers.get(jobId)?.();
  };
  
  const server = createWorkerServer({ config, store, executeJob, probeRuntime: async () => {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  config.EXECUTION_WORKER_URL = `http://127.0.0.1:${port}`;
  
  t.after(async () => {
    for (const finish of executeWaitResolvers.values()) finish();
    await new Promise(resolve => server.close(resolve));
    assert.equal(executeWaitResolvers.size, 0);
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const client = createExecutionClient(config);

  const getValidJob = () => {
    const archive = Buffer.from('worker-boundary');
    const archiveBase64 = archive.toString('base64');
    return {
      version: 1,
      jobId: crypto.randomUUID(),
      operation: 'verify_artifact',
      projectId: 'proj-123',
      contractId: 'c-1',
      contractHash: crypto.createHash('sha256').update('contract').digest('hex'),
      revision: 1,
      artifactId: 'art-1',
      archiveBase64,
      nonce: crypto.randomBytes(32).toString('hex'),
      inputSha256: crypto.createHash('sha256').update(archive).digest('hex'),
      contract: { some: 'data' },
      runId: `run-${crypto.randomUUID()}`,
      deadline: Date.now() + 60000
    };
  };

  await t.test('no token denied / production client empty token rejects', async () => {
    const devClient = createExecutionClient({ EXECUTION_WORKER_URL: config.EXECUTION_WORKER_URL });
    await assert.rejects(devClient.getCapabilities(), /Worker error \(401\)/);
    assert.throws(
      () => createExecutionClient({ production: true, EXECUTION_WORKER_URL: config.EXECUTION_WORKER_URL }),
      /EXECUTION_WORKER_TOKEN/
    );
    
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
    p.catch(() => {});
    await releaseWhenReady(job.jobId);
    const finalState = await p;
    assert.equal(finalState.status, 'completed');
    assert.equal(finalState.result.testOutcome, 'success');
  });

  await t.test('duplicate jobId handling (exact retry vs collision)', async () => {
    const job = getValidJob();
    const p = client.verifyArtifact(job);
    p.catch(() => {});
    await releaseWhenReady(job.jobId);
    await p;
    const p2 = client.verifyArtifact(job);
    await p2;
    const jobDifferent = { ...job, contractHash: crypto.createHash('sha256').update('different').digest('hex') };
    await assert.rejects(client.verifyArtifact(jobDifferent), /Worker error \(409\)/);
  });

  await t.test('cross-principal polling rejected', async () => {
    const job = getValidJob();
    const p = client.verifyArtifact(job);
    p.catch(() => {});
    await releaseWhenReady(job.jobId);
    await p;
    const url = `${config.EXECUTION_WORKER_URL}/v1/jobs/${job.jobId}?projectId=wrong-proj`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    assert.equal(res.status, 403);
    assert.match(res.headers.get('content-type'), /^application\/json/);
  });

  await t.test('cross-principal cancellation rejected without touching the job', async () => {
    const job = getValidJob();
    const p = client.verifyArtifact(job);
    p.catch(() => {});
    await waitForResolver(job.jobId);
    const cancelUrl = projectId => `${config.EXECUTION_WORKER_URL}/v1/jobs/${job.jobId}${projectId === undefined ? '' : `?projectId=${projectId}`}`;
    const headers = { 'Authorization': `Bearer ${token}` };
    const unscoped = await fetch(cancelUrl(), { method: 'DELETE', headers });
    assert.equal(unscoped.status, 400);
    assert.match(unscoped.headers.get('content-type'), /^application\/json/);
    const foreign = await fetch(cancelUrl('wrong-proj'), { method: 'DELETE', headers });
    assert.equal(foreign.status, 403);
    assert.notEqual(store.getJob(job.jobId, job.projectId).status, 'cancelled');
    await releaseWhenReady(job.jobId);
    assert.equal((await p).status, 'completed');
  });

  await t.test('unauthorized responses are JSON', async () => {
    const res = await fetch(`${config.EXECUTION_WORKER_URL}/readyz`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await res.json(), { error: 'Unauthorized' });
  });

  await t.test('cancellation aborts polling and cleans up', async () => {
    const job = getValidJob();
    const p = client.verifyArtifact(job);
    p.catch(() => {});
    await waitForResolver(job.jobId);
    await client.cancelJob(job.jobId, job.projectId);
    const finalState = await p;
    assert.equal(finalState.status, 'cancelled');
    assert.equal(store.getJob(job.jobId, job.projectId).status, 'cancelled');
  });

  await t.test('local abort requests remote cancellation and awaits cleanup', async () => {
    const job = getValidJob();
    const controller = new AbortController();
    const p = client.verifyArtifact(job, { signal: controller.signal });
    p.catch(() => {});
    await waitForResolver(job.jobId);
    controller.abort();
    await assert.rejects(p, error => error?.name === 'AbortError' || /aborted/i.test(error?.message || ''));
    assert.equal(store.getJob(job.jobId, job.projectId)?.status, 'cancelled');
  });

  await t.test('abort after accepted POST cancels delayed response job', async () => {
    const delayedStore = new JobStore();
    let starts = 0;
    const delayedServer = createWorkerServer({
      config: { EXECUTION_WORKER_TOKEN: token }, store: delayedStore, responseDelayMs: 200,
      executeJob: async () => { starts++; return { status: 'success', result: {} }; }
    });
    await new Promise(resolve => delayedServer.listen(0, '127.0.0.1', resolve));
    try {
      const delayedClient = createExecutionClient({ EXECUTION_WORKER_TOKEN: token, EXECUTION_WORKER_URL: `http://127.0.0.1:${delayedServer.address().port}` });
      const job = getValidJob();
      const controller = new AbortController();
      const pending = delayedClient.verifyArtifact(job, { signal: controller.signal });
      pending.catch(() => {});
      const acceptedDeadline = Date.now() + 2000;
      while (!delayedStore.hasJob(job.jobId) && Date.now() < acceptedDeadline) await new Promise(resolve => setImmediate(resolve));
      assert.equal(delayedStore.hasJob(job.jobId), true, 'delayed POST was not accepted');
      controller.abort();
      await assert.rejects(pending, error => error?.name === 'AbortError');
      assert.equal(delayedStore.getJob(job.jobId, job.projectId)?.status, 'cancelled');
      assert.equal(starts, 0);
    } finally {
      await new Promise(resolve => delayedServer.close(resolve));
      delayedStore.close();
    }
  });
  await t.test('queue capacity (max 8)', async () => {
    const pendingJobs = [];
    const pendingRequests = [];
    for (let i = 0; i < 8; i++) {
      const j = getValidJob();
      pendingRequests.push(client.verifyArtifact(j).catch(() => {}));
      pendingJobs.push(j);
    }
    await new Promise(r => setTimeout(r, 100));
    await assert.rejects(client.verifyArtifact(getValidJob()), /Worker error \(429\)/);
    await Promise.all(pendingJobs.map(j => client.cancelJob(j.jobId, j.projectId)));
    await Promise.all(pendingRequests);
    for (const j of pendingJobs) assert.equal(store.getJob(j.jobId, j.projectId)?.status, 'cancelled');
    assert.equal(executeWaitResolvers.size, 0);
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
