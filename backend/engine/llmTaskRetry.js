import { generateLLMResponse } from '../llm.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS = 3;
const TRANSIENT_FAILURE = /\b(?:timeout|timed\s*out|eai_again|econnreset|econnrefused|enetunreach|enotfound|network(?:\s+error)?|socket\s+hang\s+up|429|5\d\d)\b/i;
const TERMINAL_ABORT = /\b(?:lease[_\s-]*lost|cancel(?:led|ed|lation)?|paused?)\b/i;
const TRANSIENT_CAUSE_CODE = /^(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ENOTFOUND|ETIMEDOUT)$/i;

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
    const chain = [], seen = new Set();
    let current = error;
    // A malformed, cyclic or excessively deep chain is not retry evidence.
    for (let depth = 0; current != null && depth < 5; depth++) {
        if (seen.has(current)) return false;
        seen.add(current);
        chain.push({ name: current?.name,
            message: typeof current === 'string' ? current : String(current?.message || ''),
            code: typeof current?.code === 'string' ? current.code : '' });
        current = current?.cause;
    }
    if (current != null) return false;
    // Cancellation/lease loss anywhere wins even when an outer wrapper says timeout.
    if (chain.some(item => TERMINAL_ABORT.test(item.message) || TERMINAL_ABORT.test(item.code)
        || (item.name === 'AbortError' && !/timeout|timed\s*out/i.test(item.message)))) return false;
    return chain.some(item => item.name === 'TimeoutError' || TRANSIENT_CAUSE_CODE.test(item.code)
        || TRANSIENT_FAILURE.test(item.message));
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
    onUsage = null,
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
            // This boundary owns retries for agent tasks. An adapter must make
            // a single transport attempt rather than multiplying this budget.
            const response = await generate(messages, { signal, onUsage, maxTransportAttempts: 1 });
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
