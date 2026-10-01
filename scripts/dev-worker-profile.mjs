import crypto from 'node:crypto';

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
    env.HOST = '127.0.0.1';
    env.EXECUTION_WORKER_TOKEN ||= env.WORKER_TOKEN || crypto.randomBytes(32).toString('hex');
  }
}
