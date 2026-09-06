export function createExecutionClient(config) {
  const workerUrl = (config.EXECUTION_WORKER_URL || config.WORKER_URL || '').replace(/\/$/, '');
  const workerToken = config.EXECUTION_WORKER_TOKEN || config.WORKER_TOKEN;

  if (!workerToken) throw new Error('Client requires EXECUTION_WORKER_TOKEN');
  
  const parsedUrl = new URL(workerUrl);
  if (parsedUrl.protocol === 'http:') {
    if (parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
      throw new Error('Insecure HTTP URL must be loopback');
    }
  } else if (parsedUrl.protocol !== 'https:') {
    throw new Error('URL must be http (loopback) or https');
  }

  async function request(path, options = {}) {
    const url = `${workerUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${workerToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch {}
      throw new Error(`Worker error (${res.status}): ${message}`);
    }
    
    return res.json();
  }

  return {
    async prepareDependencies(job, { signal } = {}) {
      const res = await request('/v1/jobs', {
        method: 'POST',
        body: JSON.stringify({ ...job, operation: 'prepareDependencies' }),
        signal
      });
      if (res.jobId !== job.jobId) throw new Error('Identity mismatch in response');
      return res;
    },

    async verifyArtifact(job, { signal } = {}) {
      const res = await request('/v1/jobs', {
        method: 'POST',
        body: JSON.stringify({ ...job, operation: 'verifyArtifact' }),
        signal
      });
      if (res.jobId !== job.jobId) throw new Error('Identity mismatch in response');
      return res;
    },

    async getCapabilities({ signal } = {}) {
      return request('/readyz', { signal });
    },

    async cancelJob(jobId) {
      return request(`/v1/jobs/${jobId}`, { method: 'DELETE' });
    }
  };
}
