import { revokeProjectWorkflowLeases, isWorkflowLeaseCurrent } from '../workflowAttempts.js';

const controllers = new Map(); // projectId -> { controller, attemptId, leaseOwner }

export function registerProjectAbortController(projectId, controller, { attemptId = null, leaseOwner = null } = {}) {
    if (!projectId || !controller) return;
    if ((attemptId !== null || leaseOwner !== null) && !isWorkflowLeaseCurrent(attemptId, leaseOwner, { projectId })) {
        controller.abort('LEASE_LOST');
        return;
    }
    controllers.set(projectId, { controller, attemptId, leaseOwner });
}

export function getProjectAbortSignal(projectId) {
    return controllers.get(projectId)?.controller.signal || null;
}

export function abortProjectExecution(projectId, reason = 'ABORTED') {
    // Persist the revocation even when this process has no local controller.
    // Do not acknowledge successful cancellation if SQLite rejects the write.
    try {
        revokeProjectWorkflowLeases(projectId, reason);
    } finally {
        controllers.get(projectId)?.controller.abort(reason);
        controllers.delete(projectId);
    }
    return true;
}

export function unregisterProjectAbortController(projectId, controller = null) {
    if (controller && controllers.get(projectId)?.controller !== controller) return false;
    return controllers.delete(projectId);
}
