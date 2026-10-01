import { executeJob as executeDockerJob, probeRuntimeReadiness as probeDocker } from './runtime.js';
import { executeLocalJob, probeLocalReadiness } from './localRuntime.js';
export function selectedRuntime() {
  const runtime = process.env.EXECUTION_WORKER_RUNTIME || 'docker';
  if (!['local', 'docker'].includes(runtime)) throw new Error('Unsupported EXECUTION_WORKER_RUNTIME.');
  return runtime;
}
export function executeJob(job, options) { return selectedRuntime() === 'local' ? executeLocalJob(job, options) : executeDockerJob(job, options); }
export function probeRuntimeReadiness() { return selectedRuntime() === 'local' ? probeLocalReadiness() : probeDocker(); }
