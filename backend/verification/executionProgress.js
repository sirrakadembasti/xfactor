import { projectCommandProgress } from './commandProgressProtocol.js';
const snapshots = new Map();
const operations = new Set(['prepare_dependencies', 'verify_artifact']);
const statuses = new Set(['pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'failed_interrupted', 'failed_timeout']);
const ttlMs = 60 * 60 * 1000;

export function recordExecutionProgress(binding, observation) {
    if (!binding?.projectId || !binding.attemptId || !binding.leaseOwner
        || observation?.projectId !== binding.projectId || !observation.contractId || !observation.contractHash
        || !observation.jobId || !observation.runId || !operations.has(observation.operation) || !statuses.has(observation.status)) return;
    const now = Date.now();
    for (const [id, value] of snapshots) if (now - value.observedMs > ttlMs) snapshots.delete(id);
    if (!snapshots.has(binding.projectId) && snapshots.size >= 256) snapshots.delete(snapshots.keys().next().value);
    snapshots.set(binding.projectId, { projectId: binding.projectId, attemptId: binding.attemptId, leaseOwner: binding.leaseOwner,
        contractId: observation.contractId, contractHash: observation.contractHash, observedMs: now,
        jobId: observation.jobId, runId: observation.runId, operation: observation.operation, status: observation.status,
        commands: projectCommandProgress(observation.commands) });
}

export function readExecutionProgress(binding) {
    const entry = snapshots.get(binding.projectId);
    if (!entry || Date.now() - entry.observedMs > ttlMs || ['attemptId', 'leaseOwner', 'contractId', 'contractHash']
        .some(key => entry[key] !== binding[key])) return null;
    return { projectId: entry.projectId, active: true, available: true, advisory: true,
        jobId: entry.jobId, runId: entry.runId, operation: entry.operation, status: entry.status,
        observedAt: new Date(entry.observedMs).toISOString(), stale: Date.now() - entry.observedMs > 30000,
        commands: projectCommandProgress(entry.commands) };
}
