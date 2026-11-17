import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateJob } from './protocol.js';
import { JobStore } from './jobStore.js';
import { executeJob, probeRuntimeReadiness, selectedRuntime } from './runtimeSelector.js';
import { projectCommandProgress } from '../backend/verification/commandProgressProtocol.js';
export function createWorkerServer({ config, store, executeJob, responseDelayMs = 0, probeRuntime = probeRuntimeReadiness }) {
  const token = config?.EXECUTION_WORKER_TOKEN || config?.WORKER_TOKEN;
  if (!token || !store || !executeJob) {
    throw new Error('Missing token, store, or executor');
  }
  
  const expectedAuth = Buffer.from(`Bearer ${token}`);
  let isExecuting = false;
  let stopping = false;
  const activeJobs = new Map();
  const terminalMetadata = (config.EXECUTION_WORKER_RUNTIME || process.env.EXECUTION_WORKER_RUNTIME) === 'local' ? { runtime: { runtime: 'local', executionProfile: 'local-trusted', osIsolation: false, isolation: false } } : {};

      const identityResponse = (job, extra = {}) => ({
        ...extra,
        version: job.version,
        jobId: job.jobId,
        operation: job.operation,
        projectId: job.projectId,
        contractId: job.contractId,
        contractHash: job.contractHash,
        revision: job.revision,
        artifactId: job.artifactId,
        nonce: job.nonce,
        inputSha256: job.inputSha256,
        runId: job.runId
      });

  function triggerExecution() {
    if (stopping || isExecuting) return;
    
    const job = store.getNextPendingJob();
    if (!job) return;
    
    if (Date.now() >= job.deadline) {
      store.updateJobStatus(job.jobId, 'pending', 'failed_timeout', { ...terminalMetadata, error: 'Deadline exceeded before execution' });
      return triggerExecution();
    }
    
    if (store.updateJobStatus(job.jobId, 'pending', 'running')) {
      isExecuting = true;
      const diagnosticsLease = crypto.randomUUID();
      store.beginDiagnostics(job.jobId, diagnosticsLease);
      const abortController = new AbortController();
      const deadlineTimer = setTimeout(() => {
        store.updateJobStatus(job.jobId, 'running', 'failed_timeout', { ...terminalMetadata, error: 'Deadline exceeded during execution' });
        abortController.abort(new Error('Job deadline exceeded'));
      }, Math.max(1, job.deadline - Date.now()));
      
      const executionJob = { ...job };
      if (job.operation === 'prepare_dependencies') {
        executionJob.packageJsonBytes = Buffer.from(job.packageJsonBase64, 'base64');
      }
      const p = executeJob(executionJob, {
        signal: abortController.signal,
        onResource: () => {},
        onProgress: event => !abortController.signal.aborted && store.recordCommandDiagnostic(job.jobId, diagnosticsLease, event),
        onPhaseComplete: event => !abortController.signal.aborted && store.recordPhaseDiagnostic(job.jobId, diagnosticsLease, event)
      }).then((result) => {
        if (abortController.signal.aborted) return;
        if (Date.now() >= job.deadline) {
          store.updateJobStatus(job.jobId, 'running', 'failed_timeout', { ...terminalMetadata, error: 'Deadline exceeded during execution' });
        } else if (result?.status === 'success' && result.result && typeof result.result === 'object') {
          store.updateJobStatus(job.jobId, 'running', 'completed', result.result);
        } else if (['failed', 'blocked', 'cancelled'].includes(result?.status)) {
          store.updateJobStatus(job.jobId, 'running', result.status === 'cancelled' ? 'cancelled' : 'failed', result.result || { error: result.error || 'Worker execution failed' });
        } else {
          store.updateJobStatus(job.jobId, 'running', 'failed', { error: 'Worker returned an invalid result.' });
        }
      }).catch((err) => {
        if (!abortController.signal.aborted) {
            store.updateJobStatus(job.jobId, 'running', 'failed', { ...terminalMetadata, error: err.message });
          console.error(`Job ${job.jobId} failed:`, err.message); 
        }
      }).finally(() => {
        clearTimeout(deadlineTimer);
        activeJobs.delete(job.jobId);
        isExecuting = false;
        setImmediate(triggerExecution);
      });

      activeJobs.set(job.jobId, { controller: abortController, promise: p });
    }
  }

  setImmediate(triggerExecution);

  const server = http.createServer(async (req, res) => {
    try {
      // Every worker response body is JSON, including errors and 401/413 rejections.
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const authHeaderStr = req.headers['authorization'] || '';
      const authHeader = Buffer.from(authHeaderStr);
      
      if (authHeader.length !== expectedAuth.length || !crypto.timingSafeEqual(authHeader, expectedAuth)) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      
      if (req.method === 'GET' && url.pathname === '/readyz') {
        try {
          const runtime = await probeRuntime();
          res.writeHead(200);
          return res.end(JSON.stringify({ ...runtime, supportedTypes: ['prepare_dependencies', 'verify_artifact', 'typecheck_artifact'], executionCapacity: true }));
        } catch (error) {
          // Never include runtime messages, stacks, paths, or arbitrary error properties.
          const phase = ['docker_info', 'image_inspect', 'tool_resolution', 'browser_launch', 'renderer_context', 'renderer_page', 'renderer_content', 'renderer_evaluate', 'browser_close'].includes(error?.readinessPhase) ? error.readinessPhase : 'unknown';
          const name = ['Error', 'TimeoutError', 'TypeError'].includes(error?.name) ? error.name : 'unknown';
          const code = ['RUNTIME_COMMAND_FAILED', 'ECONNRESET', 'ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT'].includes(error?.code) ? error.code : 'unknown';
          const timing = {};
          for (const key of ['readinessElapsedMs', 'readinessBudgetMs']) if (Number.isFinite(error?.[key]) && error[key] >= 0 && error[key] <= 120000) timing[key] = Math.round(error[key]);
          console.warn('[execution-worker] readiness failed ' + JSON.stringify({ phase, name, code, ...timing }));
          res.writeHead(503);
          return res.end(JSON.stringify({ supportedTypes: [], executionCapacity: false, error: 'Isolated runtime is unavailable' }));
        }
      }
      let bodyStr = '';
      if (req.method === 'POST') {
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        if (contentLength > 34 * 1024 * 1024) {
          res.writeHead(413);
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
          return;
        }
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 34 * 1024 * 1024) {
            res.writeHead(413);
            res.end(JSON.stringify({ error: 'Payload too large' }));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        }
        bodyStr = Buffer.concat(chunks).toString('utf8');
      }

      if (req.method === 'POST' && url.pathname === '/v1/jobs') {
        let input;
        try {
          input = JSON.parse(bodyStr);
        } catch {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }

        if (input && ['verify_artifact', 'typecheck_artifact'].includes(input.operation) && typeof input.inputSha256 === 'string' && typeof input.archiveBase64 === 'string') {
          const computedHash = crypto.createHash('sha256').update(Buffer.from(input.archiveBase64, 'base64')).digest('hex');
          if (computedHash !== input.inputSha256) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Digest mismatch' }));
          }
        }

        const validation = validateJob(input, Date.now());
        if (!validation.valid) {
          const status = validation.reason.includes('archiveBase64') ? 413 : 400;
          res.writeHead(status);
          return res.end(JSON.stringify({ error: validation.reason }));
        }

        const job = validation.job;
        let responseFinished = false;
        let cancellationPromise = null;
        const cancelOnDisconnect = () => {
          if (responseFinished || res.writableFinished || cancellationPromise) return;
          if (!req.aborted && !res.destroyed) return;
          cancellationPromise = (async () => {
            const active = activeJobs.get(job.jobId);
            if (active) {
              active.controller.abort();
              await active.promise;
            } else {
              store.updateJobStatus(job.jobId, 'pending', 'cancelled', { reason: 'client disconnected before acceptance response' });
            }
          })();
        };
        req.once('aborted', cancelOnDisconnect);
        res.once('close', cancelOnDisconnect);
        res.once('finish', () => { responseFinished = true; res.removeListener('close', cancelOnDisconnect); req.removeListener('aborted', cancelOnDisconnect); });
        try {
          const inserted = store.insertJob(job);
          if (inserted === 'exists') {
            if (responseDelayMs > 0) await new Promise(resolve => setTimeout(resolve, responseDelayMs));
            if (cancellationPromise) { await cancellationPromise; return; }
            return res.end(JSON.stringify(identityResponse(job, { status: 'queued' })));
          }
        } catch (e) {
          if (e.message.includes('Duplicate jobId with different input')) {
            res.writeHead(409);
            return res.end(JSON.stringify({ error: 'Duplicate jobId' }));
          }
          if (e.message.includes('Queue capacity')) {
            res.writeHead(429);
            return res.end(JSON.stringify({ error: 'Queue full' }));
          }
          throw e;
        }
        if (responseDelayMs > 0) await new Promise(resolve => setTimeout(resolve, responseDelayMs));
        if (cancellationPromise) { await cancellationPromise; return; }
        res.end(JSON.stringify(identityResponse(job, { status: 'queued' })));
        triggerExecution();
        return;
      }

      const match = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
      if (match) {
        const jobId = match[1];

        if (req.method === 'GET') {
          const projectId = url.searchParams.get('projectId');
          if (!projectId) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'projectId required' }));
          }

          const job = store.getJob(jobId, projectId);
          if (!job) {
            res.writeHead(403);
            return res.end(JSON.stringify({ error: 'Forbidden or Not Found' }));
          }

          res.writeHead(200);
          return res.end(JSON.stringify(identityResponse(job, {
            status: job.status,
            diagnostics: { commands: projectCommandProgress(job.diagnostics?.commands) },
            ...(job.result ? { result: job.result } : {}),
            ...(job.completedAt ? { completedAt: job.completedAt } : {})
          })));
        }

        if (req.method === 'DELETE') {
          // Cancellation is scoped like status reads: the caller must name the owning project.
          const projectId = url.searchParams.get('projectId');
          if (!projectId) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'projectId required' }));
          }
          if (!store.hasJob(jobId)) {
            res.writeHead(404);
            return res.end(JSON.stringify({ error: 'Job not found' }));
          }
          if (!store.getJob(jobId, projectId)) {
            res.writeHead(403);
            return res.end(JSON.stringify({ error: 'Forbidden or Not Found' }));
          }
          const activeJob = activeJobs.get(jobId);
          if (activeJob) {
            activeJob.controller.abort();
            try { await activeJob.promise; } catch {}
            activeJobs.delete(jobId);
          }
          store.updateJobStatus(jobId, 'running', 'cancelled', { ...terminalMetadata, reason: 'cancelled by client' });
          store.updateJobStatus(jobId, 'pending', 'cancelled', { ...terminalMetadata, reason: 'cancelled by client' });
          res.writeHead(200);
          return res.end(JSON.stringify({ status: 'cancelled' }));
        }
      }

      res.writeHead(404);
      res.end();
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.stopJobs = async () => {
    stopping = true;
    const interrupted = [...activeJobs.entries()];
    for (const [, active] of interrupted) active.controller.abort();
    await Promise.allSettled(interrupted.map(([, active]) => active.promise));
    for (const [jobId] of interrupted) store.updateJobStatus(jobId, 'running', 'failed_interrupted', { ...terminalMetadata, reason: 'worker shutdown' });
  };
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const configuredToken = process.env.EXECUTION_WORKER_TOKEN || process.env.WORKER_TOKEN;
  if (process.env.NODE_ENV === 'production' && (!configuredToken || configuredToken === 'dev-worker-token-internal')) {
    console.error('Production requires an operator-supplied EXECUTION_WORKER_TOKEN.');
    process.exit(1);
  }
  const token = configuredToken || 'dev-worker-token-internal';
  const port = parseInt(process.env.PORT || process.env.EXECUTION_WORKER_PORT || '8099', 10);
  const host = process.env.HOST || '127.0.0.1';
  if (selectedRuntime() === 'local' && (!['127.0.0.1', 'localhost', '::1'].includes(host) || process.env.EXECUTION_WORKER_TRUST_LOCAL_CODE !== '1')) {
    console.error('Local worker requires loopback HOST and EXECUTION_WORKER_TRUST_LOCAL_CODE=1.');
    process.exit(1);
  }
  const dbPath = process.env.EXECUTION_WORKER_DB || path.join(os.tmpdir(), 'xfactor-dev-worker-jobs.json');

  const store = new JobStore(dbPath);
  const server = createWorkerServer({
    config: { EXECUTION_WORKER_TOKEN: token },
    store,
    executeJob
  });

  server.listen(port, host, () => {
    console.log(`[execution-worker] Listening on http://${host}:${port}`);
  });

  let shuttingDown;
  const shutdown = () => shuttingDown || (shuttingDown = (async () => {
    await server.stopJobs();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    store.close();
    process.exit(0);
  })().catch(error => { console.error('Worker shutdown failed:', error.message); process.exit(1); }));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('message', message => { if (message?.type === 'xfactor-worker-shutdown') shutdown(); });
  if (process.connected) process.on('disconnect', shutdown);
}
