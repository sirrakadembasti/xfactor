import { db, measureTransaction } from '../db.js';
import { assertWorkflowLease } from '../workflowAttempts.js';

const ELIGIBLE_STATUSES = new Set(['implementing', 'implementation_finished', 'verification_pending',
    'verification_running', 'build_verified', 'runtime_verified', 'acceptance_verified', 'artifact_verified']);

export function readApprovedVerificationContract(projectId, database = db) {
    return database.prepare(`SELECT id, revision, contract_hash, contract_json FROM project_contracts
        WHERE project_id = ? AND status = 'approved' ORDER BY revision DESC, id ASC LIMIT 1`).get(projectId);
}

// Call inside the write transaction: the lease and approved identity must still
// authorize these exact results when they become durable, not just at dispatch.
export function assertVerificationContext(context, database = db) {
    const { projectId, contractId, contractHash, revision, attemptId, leaseOwner, signal, deadline } = context;
    if (attemptId != null || leaseOwner != null) assertWorkflowLease(attemptId, leaseOwner, { projectId, database });
    if (signal?.aborted) throw new Error('Verification cancelled by abort signal.');
    if (deadline != null && Date.now() > Number(deadline)) throw new Error('Verification deadline exceeded.');
    const project = database.prepare('SELECT status FROM projects WHERE id = ?').get(projectId);
    if (!project || !ELIGIBLE_STATUSES.has(project.status)) {
        throw new Error(`Verification cancelled: project status is ${project?.status || 'missing'}.`);
    }
    const contract = readApprovedVerificationContract(projectId, database);
    if (!contract || contract.id !== contractId || contract.contract_hash !== contractHash
        || Number(contract.revision) !== Number(revision)) {
        throw new Error('Verification contract changed or is no longer approved.');
    }
}

export function commitVerificationContext(context, write, database = db) {
    return measureTransaction('commitVerificationContext', () => commitContext(context, write, database));
}

function commitContext(context, write, database) {
    database.exec('BEGIN IMMEDIATE;');
    try {
        assertVerificationContext(context, database);
        const result = write();
        database.exec('COMMIT;');
        return result;
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }
}
