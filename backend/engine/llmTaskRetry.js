import { generateLLMResponse } from '../llm.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS = 3;
const TRANSIENT_FAILURE = /\b(?:timeout|timed\s*out|eai_again|econnreset|econnrefused|enetunreach|enotfound|network(?:\s+error)?|socket\s+hang\s+up|429|5\d\d)\b/i;
const TERMINAL_ABORT = /\b(?:lease[_\s-]*lost|cancel(?:led|ed|lation)?|paused?)\b/i;

function boundedAttemptCount(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_MAX_ATTEMPTS;
    return Math.min(parsed, MAX_ATTEMPTS);
}

function sleep(ms, signal) {
    if (ms <= 0) return Promise.resolve();
    if (signal?.aborted) return Promise.reject(signal.reason || new Error('LLM task aborted'));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            reject(signal.reason || new Error('LLM task aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

export function isTransientLLMTaskFailure(error, signal = null) {
    if (signal?.aborted) return false;
    const message = String(error?.message || error || '');
    if (TERMINAL_ABORT.test(message)) return false;
    if (error?.name === 'TimeoutError') return true;
    if (error?.name === 'AbortError') return /timeout|timed\s*out/i.test(message);
    return TRANSIENT_FAILURE.test(message);
}

function diagnosticFor({ agentRole, taskId, attempt, maxAttempts, startedAt, disposition, retry, error = null }) {
    return {
        agentRole,
        taskId: taskId || null,
        attempt,
        maxAttempts,
        elapsedMs: Date.now() - startedAt,
        retry,
        disposition,
        error: error ? String(error.message || error).replace(/\s+/g, ' ').slice(0, 512) : null
    };
}

/**
 * Runs one agent task with bounded retries for transport failures only. Parsing
 * is inside the boundary so malformed output is recorded but never retried.
 */
export async function runLLMTaskWithRetry({
    agentRole,
    taskId = null,
    messages,
    parseResponse = response => response,
    signal = null,
    maxAttempts = process.env.LLM_TASK_MAX_ATTEMPTS,
    retryDelayMs = 250,
    generate = generateLLMResponse,
    onDiagnostic = async () => {}
} = {}) {
    if (!agentRole) throw new Error('agentRole is required for an LLM task.');
    if (!Array.isArray(messages)) throw new Error('messages must be an array for an LLM task.');
    if (typeof parseResponse !== 'function' || typeof generate !== 'function') throw new Error('LLM task requires generate and parseResponse functions.');

    const attempts = boundedAttemptCount(maxAttempts);
    const startedAt = Date.now();
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        let phase = 'provider';
        try {
            const response = await generate(messages, { signal });
            phase = 'validation';
            const parsed = parseResponse(response);
            await onDiagnostic(diagnosticFor({
                agentRole,
                taskId,
                attempt,
                maxAttempts: attempts,
                startedAt,
                disposition: 'succeeded',
                retry: false
            }));
            return parsed;
        } catch (error) {
            const retry = phase === 'provider' && attempt < attempts && isTransientLLMTaskFailure(error, signal);
            await onDiagnostic(diagnosticFor({
                agentRole,
                taskId,
                attempt,
                maxAttempts: attempts,
                startedAt,
                disposition: retry ? 'retrying' : (phase === 'validation' ? 'validation_failed' : 'failed'),
                retry,
                error
            }));
            if (!retry) throw error;
            await sleep(Number(retryDelayMs) || 0, signal);
        }
    }

    throw new Error('LLM task retry loop exited without a result.');
}
