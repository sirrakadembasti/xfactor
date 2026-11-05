import crypto from 'node:crypto';
import { projectCommandProgress } from './verification/commandProgressProtocol.js';
const IDENTITY = ['version','jobId','operation','projectId','contractId','contractHash','revision','artifactId','nonce','inputSha256','runId'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function createExecutionClient(config = {}, { onProgress } = {}) {
  const isProduction = config.production === true || process.env.NODE_ENV === 'production';
  let workerToken = config.EXECUTION_WORKER_TOKEN || config.WORKER_TOKEN;
  if (!workerToken) {
    if (isProduction) {
      throw new Error('Client requires EXECUTION_WORKER_TOKEN');
    }
    workerToken = 'dev-worker-token-internal';
  }
  const workerUrl = (config.EXECUTION_WORKER_URL || config.WORKER_URL || 'http://127.0.0.1:8099').replace(/\/$/, '');
  const parsed = new URL(workerUrl);
  if (parsed.protocol === 'http:' && !['127.0.0.1','localhost'].includes(parsed.hostname)) throw new Error('Insecure HTTP URL must be loopback');
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('URL must be http (loopback) or https');
  const identityOf = (job, operation) => ({ ...job, version: job.version ?? 1, operation });
  const assertIdentity = (value, expected) => { for (const key of IDENTITY) if (value?.[key] !== expected[key]) throw new Error(`Identity mismatch in ${key}`); };
  const reportProgress = status => {
    if (typeof onProgress !== 'function') return;
    const observation = { ...Object.fromEntries(IDENTITY.map(key => [key, status[key]])), status: status.status,
      commands: projectCommandProgress(status.diagnostics?.commands) };
    // Advisory observation cannot interrupt job polling or authorize acceptance.
    try { Promise.resolve(onProgress(observation)).catch(() => {}); } catch {}
  };
  async function request(path, options = {}) {
    const res = await fetch(`${workerUrl}${path}`, { ...options, headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!res.ok) { let message = res.statusText; try { const body = await res.json(); if (body?.error) message = body.error; } catch {} throw new Error(`Worker error (${res.status}): ${message}`); }
    return res.json();
  }
  async function submitAndPoll(input, operation, signal) {
    const job = identityOf(input, operation); if (!job.runId) throw new Error('caller-supplied runId is required');
    const payload = { ...job };
    if (operation === 'prepare_dependencies') { const bytes = input.packageJsonBytes ? Buffer.from(input.packageJsonBytes) : (input.packageJsonBase64 ? Buffer.from(input.packageJsonBase64, 'base64') : null); if (!input.packageJsonBase64 && bytes) payload.packageJsonBase64 = bytes.toString('base64'); delete payload.packageJsonBytes; if (!payload.inputSha256 && bytes) payload.inputSha256 = job.inputSha256 = digest(bytes); }
    else if (!payload.inputSha256 && input.archiveBase64) payload.inputSha256 = job.inputSha256 = digest(Buffer.from(input.archiveBase64, 'base64'));
    let cancellation;
    const cancel = () => cancellation || (cancellation = (async () => { const until = Date.now() + 3000; while (Date.now() < until) { try { return await request(`/v1/jobs/${encodeURIComponent(job.jobId)}?projectId=${encodeURIComponent(job.projectId)}`, { method: 'DELETE' }); } catch (error) { if (!/Worker error \(404\)/.test(error.message)) throw error; await new Promise(resolve => setTimeout(resolve, 25)); } } return { status: 'not_found' }; })());
    const abort = async () => { try { await cancel(); } catch (e) { throw new Error(`Abort cancellation failed: ${e.message}`, { cause: e }); } throw new DOMException('The operation was aborted', 'AbortError'); };
    if (signal?.aborted) return abort();
    try {
      let submitted; try { submitted = await request('/v1/jobs', { method: 'POST', body: JSON.stringify(payload), signal }); } catch (error) { if (signal?.aborted) await abort(); throw error; }
      assertIdentity(submitted, job);
      reportProgress(submitted);
      let firstTransportFailureAt = null;
      while (true) {
        if (signal?.aborted) await abort();
        let status;
        try {
          status = await request(`/v1/jobs/${encodeURIComponent(job.jobId)}?projectId=${encodeURIComponent(job.projectId)}`, { signal });
          firstTransportFailureAt = null;
        } catch (error) {
          if (signal?.aborted) await abort();
          if (!(error instanceof TypeError) || !/fetch failed/i.test(error.message)) throw error;
          firstTransportFailureAt ??= Date.now();
          if (Date.now() >= Math.min(job.deadline || Infinity, firstTransportFailureAt + 60000)) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        assertIdentity(status, job);
        if (status.result) assertIdentity(status.result, job);
        reportProgress(status);
        if (['completed','failed','cancelled','failed_interrupted','failed_timeout'].includes(status.status)) return status;
        await new Promise((resolve, reject) => { let done = false; const onAbort = () => { if (done) return; done = true; clearTimeout(timer); abort().then(reject, reject); }; const timer = setTimeout(() => { done = true; signal?.removeEventListener('abort', onAbort); resolve(); }, 500); signal?.addEventListener('abort', onAbort, { once: true }); });
      }
    } finally {}
  }
  return { prepareDependencies: (job, { signal } = {}) => submitAndPoll(job, 'prepare_dependencies', signal), verifyArtifact: (job, { signal } = {}) => submitAndPoll(job, 'verify_artifact', signal), getCapabilities: ({ signal } = {}) => request('/readyz', { signal }), cancelJob: (jobId, projectId) => request(`/v1/jobs/${encodeURIComponent(jobId)}?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' }) };
}
