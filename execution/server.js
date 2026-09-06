import http from 'node:http';
import crypto from 'node:crypto';
import { validateJob } from './protocol.js';

export function createWorkerServer({ config, store, executeJob }) {
  const token = config?.EXECUTION_WORKER_TOKEN || config?.WORKER_TOKEN;
  if (!token || !store || !executeJob) {
    throw new Error('Missing token, store, or executor');
  }
  
  const expectedAuth = Buffer.from(`Bearer ${token}`);
  let isExecuting = false;
  const activeJobs = new Map();

  function triggerExecution() {
    if (isExecuting) return;
    
    const job = store.getNextPendingJob();
    if (!job) return;
    
    // Check deadline before running
    if (Date.now() >= job.deadline) {
      store.updateJobStatus(job.jobId, 'pending', 'failed');
      return triggerExecution();
    }
    
    if (store.updateJobStatus(job.jobId, 'pending', 'running')) {
      isExecuting = true;
      const abortController = new AbortController();
      
      const p = executeJob(job, {
        signal: abortController.signal,
        onResource: () => {} 
      }).then(() => {
        if (!abortController.signal.aborted) {
          store.updateJobStatus(job.jobId, 'running', 'completed');
        }
      }).catch((err) => {
        if (!abortController.signal.aborted) {
          store.updateJobStatus(job.jobId, 'running', 'failed');
          console.error(`Job ${job.jobId} failed:`, err.message); 
        }
      }).finally(() => {
        activeJobs.delete(job.jobId);
        isExecuting = false;
        // Schedule next execution
        setImmediate(triggerExecution);
      });

      activeJobs.set(job.jobId, { controller: abortController, promise: p });
    }
  }

  // Kick off any pending jobs from restart
  setImmediate(triggerExecution);

  const server = http.createServer(async (req, res) => {
    try {
      const authHeaderStr = req.headers['authorization'] || '';
      const authHeader = Buffer.from(authHeaderStr);
      
      if (authHeader.length !== expectedAuth.length || !crypto.timingSafeEqual(authHeader, expectedAuth)) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      
      if (req.method === 'GET' && url.pathname === '/readyz') {
        res.writeHead(200);
        return res.end(JSON.stringify({ supportedTypes: ['prepareDependencies', 'verifyArtifact'] }));
      }

      let bodyStr = '';
      if (req.method === 'POST') {
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        if (contentLength > 34 * 1024 * 1024) { // ~34MB max
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

        const validation = validateJob(input, Date.now());
        if (!validation.valid) {
          const status = validation.reason.includes('archiveBase64') ? 413 : 400;
          res.writeHead(status);
          return res.end(JSON.stringify({ error: validation.reason }));
        }

        const job = validation.job;
        try {
          const inserted = store.insertJob(job);
          if (inserted === 'exists') {
            res.writeHead(202);
            return res.end(JSON.stringify({ jobId: job.jobId, status: 'queued' }));
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

        res.writeHead(202);
        res.end(JSON.stringify({ jobId: job.jobId, status: 'queued' }));
        
        // Notify execution loop
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
          return res.end(JSON.stringify(job));
        }

        if (req.method === 'DELETE') {
          const activeJob = activeJobs.get(jobId);
          if (activeJob) {
            activeJob.controller.abort();
            try { await activeJob.promise; } catch {} // await cleanup
            activeJobs.delete(jobId);
          }
          store.updateJobStatus(jobId, 'running', 'cancelled');
          store.updateJobStatus(jobId, 'pending', 'cancelled');
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

  return server;
}
