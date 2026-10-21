import crypto from 'node:crypto';
import { verificationJobTimeoutMs, MAX_VERIFICATION_JOB_MS } from '../backend/verification/verificationBudget.js';

export function configureDevWorker(env, args) {
  if (args.includes('--local-worker') && args.includes('--docker-worker')) {
    throw new Error('Conflicting worker runtime flags.');
  }
  if (args.includes('--docker-worker')) {
    env.EXECUTION_WORKER_RUNTIME = 'docker';
    delete env.EXECUTION_WORKER_TRUST_LOCAL_CODE;
  } else {
    env.EXECUTION_WORKER_RUNTIME = 'local';
    env.EXECUTION_WORKER_TRUST_LOCAL_CODE = '1';
    // The renderer readiness probe is bounded at 30s; its HTTP caller needs
    // time to receive the result instead of aborting a healthy local worker.
    env.READINESS_WORKER_TIMEOUT_MS ||= '35000';
    if (env.VERIFICATION_JOB_TIMEOUT_MS == null || String(env.VERIFICATION_JOB_TIMEOUT_MS).trim() === '') {
      env.VERIFICATION_JOB_TIMEOUT_MS = String(MAX_VERIFICATION_JOB_MS);
    }
    env.HOST = '127.0.0.1';
    env.EXECUTION_WORKER_TOKEN ||= env.WORKER_TOKEN || crypto.randomBytes(32).toString('hex');
  }
  verificationJobTimeoutMs(env);
}
