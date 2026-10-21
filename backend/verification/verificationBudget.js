import { MAX_JOB_MS } from '../../execution/limits.js';

export const DEFAULT_VERIFICATION_JOB_MS = 15 * 60 * 1000;
export const MAX_VERIFICATION_JOB_MS = MAX_JOB_MS;

/** Operator configuration only; never read a project contract or job-provided env. */
export function verificationJobTimeoutMs(env = process.env) {
    const raw = String(env.VERIFICATION_JOB_TIMEOUT_MS ?? '').trim();
    if (!raw) return DEFAULT_VERIFICATION_JOB_MS;
    const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_JOB_MS) {
        throw new Error(`VERIFICATION_JOB_TIMEOUT_MS must be an integer between 1 and ${MAX_JOB_MS}.`);
    }
    return value;
}

export function verificationJobDeadline({ deadline, env = process.env, now = Date.now() } = {}) {
    if (!Number.isSafeInteger(now)) throw new Error('Verification deadline clock is invalid.');
    if (deadline != null) {
        if (!Number.isSafeInteger(deadline) || deadline <= now || deadline - now > MAX_JOB_MS) {
            throw new Error('Verification deadline exceeded or invalid.');
        }
        return deadline;
    }
    return now + verificationJobTimeoutMs(env);
}
