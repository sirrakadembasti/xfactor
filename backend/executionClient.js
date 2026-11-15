import crypto from 'node:crypto';
import { projectCommandProgress } from './verification/commandProgressProtocol.js';

const IDENTITY = ['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'];
const TERMINAL_JOB_STATUSES = ['completed', 'failed', 'cancelled', 'failed_interrupted', 'failed_timeout'];
const CANCEL_RETRY_WINDOW_MS = 3000;
const CANCEL_RETRY_INTERVAL_MS = 25;
const TRANSPORT_RETRY_WINDOW_MS = 60000;
const TRANSPORT_RETRY_INTERVAL_MS = 1000;
const POLL_INTERVAL_MS = 500;
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const jobPath = (jobId, projectId) => `/v1/jobs/${encodeURIComponent(jobId)}?projectId=${encodeURIComponent(projectId)}`;

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
    if (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
        throw new Error('Insecure HTTP URL must be loopback');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL must be http (loopback) or https');

    const identityOf = (job, operation) => ({ ...job, version: job.version ?? 1, operation });
    const assertIdentity = (value, expected) => {
        for (const key of IDENTITY) {
            if (value?.[key] !== expected[key]) throw new Error(`Identity mismatch in ${key}`);
        }
    };
    const reportProgress = status => {
        if (typeof onProgress !== 'function') return;
        const observation = {
            ...Object.fromEntries(IDENTITY.map(key => [key, status[key]])),
            status: status.status,
            commands: projectCommandProgress(status.diagnostics?.commands)
        };
        // Advisory observation cannot interrupt job polling or authorize acceptance.
        try {
            Promise.resolve(onProgress(observation)).catch(() => {});
        } catch {}
    };

    const configuredTimeout = Number(config.EXECUTION_WORKER_REQUEST_TIMEOUT_MS);
    const requestTimeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_REQUEST_TIMEOUT_MS;

    // Every worker call is bounded: a worker that accepts the socket but never answers must not hang the
    // backend. The caller's signal still aborts first; only our own deadline becomes WORKER_REQUEST_TIMEOUT.
    async function request(path, options = {}) {
        const timeout = AbortSignal.timeout(requestTimeoutMs);
        const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
        try {
            const res = await fetch(`${workerUrl}${path}`, {
                ...options,
                signal,
                headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
            });
            if (!res.ok) {
                let message = res.statusText;
                try {
                    const body = await res.json();
                    if (body?.error) message = body.error;
                } catch {}
                throw new Error(`Worker error (${res.status}): ${message}`);
            }
            return await res.json();
        } catch (error) {
            if (timeout.aborted && !options.signal?.aborted) {
                throw Object.assign(
                    new Error(`Worker request timed out after ${requestTimeoutMs} ms: ${path.split('?')[0]}`, { cause: error }),
                    { code: 'WORKER_REQUEST_TIMEOUT' }
                );
            }
            throw error;
        }
    }

    function buildPayload(input, job, operation) {
        const payload = { ...job };
        if (operation === 'prepare_dependencies') {
            const bytes = input.packageJsonBytes
                ? Buffer.from(input.packageJsonBytes)
                : (input.packageJsonBase64 ? Buffer.from(input.packageJsonBase64, 'base64') : null);
            if (!input.packageJsonBase64 && bytes) payload.packageJsonBase64 = bytes.toString('base64');
            delete payload.packageJsonBytes;
            if (!payload.inputSha256 && bytes) payload.inputSha256 = job.inputSha256 = digest(bytes);
        } else if (!payload.inputSha256 && input.archiveBase64) {
            payload.inputSha256 = job.inputSha256 = digest(Buffer.from(input.archiveBase64, 'base64'));
        }
        return payload;
    }

    async function submitAndPoll(input, operation, signal) {
        const job = identityOf(input, operation);
        if (!job.runId) throw new Error('caller-supplied runId is required');
        const payload = buildPayload(input, job, operation);

        // A cancel can race the worker's own job registration, so a 404 is retried briefly.
        let cancellation;
        const cancel = () => cancellation || (cancellation = (async () => {
            const until = Date.now() + CANCEL_RETRY_WINDOW_MS;
            while (Date.now() < until) {
                try {
                    return await request(jobPath(job.jobId, job.projectId), { method: 'DELETE' });
                } catch (error) {
                    if (!/Worker error \(404\)/.test(error.message)) throw error;
                    await sleep(CANCEL_RETRY_INTERVAL_MS);
                }
            }
            return { status: 'not_found' };
        })());
        const abort = async () => {
            try {
                await cancel();
            } catch (e) {
                throw new Error(`Abort cancellation failed: ${e.message}`, { cause: e });
            }
            throw new DOMException('The operation was aborted', 'AbortError');
        };
        if (signal?.aborted) return abort();

        let submitted;
        try {
            submitted = await request('/v1/jobs', { method: 'POST', body: JSON.stringify(payload), signal });
        } catch (error) {
            if (signal?.aborted) await abort();
            throw error;
        }
        assertIdentity(submitted, job);
        reportProgress(submitted);

        let firstTransportFailureAt = null;
        while (true) {
            if (signal?.aborted) await abort();
            let status;
            try {
                status = await request(jobPath(job.jobId, job.projectId), { signal });
                firstTransportFailureAt = null;
            } catch (error) {
                if (signal?.aborted) await abort();
                const transient = (error instanceof TypeError && /fetch failed/i.test(error.message)) || error?.code === 'WORKER_REQUEST_TIMEOUT';
                if (!transient) throw error;
                firstTransportFailureAt ??= Date.now();
                if (Date.now() >= Math.min(job.deadline || Infinity, firstTransportFailureAt + TRANSPORT_RETRY_WINDOW_MS)) throw error;
                await sleep(TRANSPORT_RETRY_INTERVAL_MS);
                continue;
            }
            assertIdentity(status, job);
            if (status.result) assertIdentity(status.result, job);
            reportProgress(status);
            if (TERMINAL_JOB_STATUSES.includes(status.status)) return status;
            await new Promise((resolve, reject) => {
                let done = false;
                const onAbort = () => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    abort().then(reject, reject);
                };
                const timer = setTimeout(() => {
                    done = true;
                    signal?.removeEventListener('abort', onAbort);
                    resolve();
                }, POLL_INTERVAL_MS);
                signal?.addEventListener('abort', onAbort, { once: true });
            });
        }
    }

    return {
        prepareDependencies: (job, { signal } = {}) => submitAndPoll(job, 'prepare_dependencies', signal),
        verifyArtifact: (job, { signal } = {}) => submitAndPoll(job, 'verify_artifact', signal),
        getCapabilities: ({ signal } = {}) => request('/readyz', { signal }),
        cancelJob: (jobId, projectId) => request(jobPath(jobId, projectId), { method: 'DELETE' })
    };
}
