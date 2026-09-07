import crypto from 'node:crypto';

const IDENTITY = ['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function createExecutionClient(config) {
  const workerUrl = (config.EXECUTION_WORKER_URL || config.WORKER_URL || '').replace(/\/$/, '');
  const workerToken = config.EXECUTION_WORKER_TOKEN || config.WORKER_TOKEN;
  if (!workerToken) throw new Error('Client requires EXECUTION_WORKER_TOKEN');
  const parsedUrl = new URL(workerUrl);
  if (parsedUrl.protocol === 'http:') {
    if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error('Insecure HTTP URL must be loopback');
  } else if (parsedUrl.protocol !== 'https:') throw new Error('URL must be http (loopback) or https');

  const identityOf = (job, operation) => ({ ...job, version: job.version ?? 1, operation });
  function assertIdentity(value, expected) {
    for (const key of IDENTITY) if (value?.[key] !== expected[key]) throw new Error(`Identity mismatch in ${key}`);
  }
  async function request(path, options = {}) {
    const res = await fetch(`${workerUrl}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (!res.ok) {
      let message = res.statusText;
      try { const body = await res.json(); if (body?.error) message = body.error; } catch {}
      throw new Error(`Worker error (${res.status}): ${message}`);
    }
    return res.json();
  }
  async function submitAndPoll(input, operation, signal) {
    const job = identityOf(input, operation);
    if (!job.runId) throw new Error('caller-supplied runId is required');
    const payload = { ...job };
    if (operation === 'prepare_dependencies') {
      const bytes = input.packageJsonBytes ? Buffer.from(input.packageJsonBytes) : (input.packageJsonBase64 ? Buffer.from(input.packageJsonBase64, 'base64') : null);
      if (!input.packageJsonBase64 && bytes) payload.packageJsonBase64 = bytes.toString('base64');
      if (payload.packageJsonBytes !== undefined) delete payload.packageJsonBytes;
      if (!payload.inputSha256 && bytes) payload.inputSha256 = job.inputSha256 = digest(bytes);
    } else if (!payload.inputSha256 && input.archiveBase64) {
      payload.inputSha256 = job.inputSha256 = digest(Buffer.from(input.archiveBase64, 'base64'));
    }
    const submitted = await request('/v1/jobs', { method: 'POST', body: JSON.stringify(payload), signal });
    assertIdentity(submitted, job);
    while (true) {
      if (signal?.aborted) throw new Error('Aborted');
      const status = await request(`/v1/jobs/${encodeURIComponent(job.jobId)}?projectId=${encodeURIComponent(job.projectId)}`, { signal });
      assertIdentity(status, job);
      if (status.result) assertIdentity(status.result, job);
      if (['completed', 'failed', 'cancelled', 'failed_interrupted', 'failed_timeout'].includes(status.status)) return status;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted')); }, { once: true });
      });
    }
  }
  return {
    prepareDependencies: (job, { signal } = {}) => submitAndPoll(job, 'prepare_dependencies', signal),
    verifyArtifact: (job, { signal } = {}) => submitAndPoll(job, 'verify_artifact', signal),
    getCapabilities: ({ signal } = {}) => request('/readyz', { signal }),
    cancelJob: jobId => request(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
  };
}
