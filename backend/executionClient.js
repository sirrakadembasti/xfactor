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
  
  async function submitAndPoll(job, operation, signal) {
    const res = await request('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({ ...job, operation }),
      signal
    });
    
    if (res.jobId !== job.jobId) throw new Error('Identity mismatch in response');
    
    // Poll for terminal status
    while (true) {
      if (signal && signal.aborted) {
        throw new Error('Aborted');
      }
      
      const statusRes = await request(`/v1/jobs/${job.jobId}?projectId=${job.projectId}`, {
        method: 'GET',
        signal
      });
      
      // Strict identity validation on the polled job
      if (
        statusRes.jobId !== job.jobId ||
        statusRes.contractHash !== job.contractHash ||
        statusRes.nonce !== job.nonce ||
        statusRes.inputSha256 !== job.inputSha256
      ) {
         throw new Error('Identity mismatch in status response');
      }
      
      if (statusRes.status === 'completed' || statusRes.status === 'failed' || statusRes.status === 'cancelled' || statusRes.status === 'failed_interrupted' || statusRes.status === 'failed_timeout') {
        return statusRes;
      }
      
      // Wait before polling again
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return {
    async prepareDependencies(job, { signal } = {}) {
      return submitAndPoll(job, 'prepare_dependencies', signal);
    },

    async verifyArtifact(job, { signal } = {}) {
      return submitAndPoll(job, 'verify_artifact', signal);
    },

    async getCapabilities({ signal } = {}) {
      return request('/readyz', { signal });
    },

    async cancelJob(jobId) {
      return request(`/v1/jobs/${jobId}`, { method: 'DELETE' });
    }
  };
}
