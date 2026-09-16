const controllers = new Map(); // projectId -> AbortController
const recentAborts = new Map(); // projectId -> { reason, timestamp }

export function registerProjectAbortController(projectId, controller) {
    if (!projectId || !controller) return;
    const recent = recentAborts.get(projectId);
    if (recent && Date.now() - recent.timestamp < 30000) {
        recentAborts.delete(projectId);
        controller.abort(recent.reason);
    }
    controllers.set(projectId, controller);
}

export function getProjectAbortSignal(projectId) {
    return controllers.get(projectId)?.signal || null;
}

export function abortProjectExecution(projectId, reason = 'ABORTED') {
    recentAborts.set(projectId, { reason, timestamp: Date.now() });
    const controller = controllers.get(projectId);
    if (!controller) return true;
    controller.abort(reason);
    controllers.delete(projectId);
    return true;
}

export function unregisterProjectAbortController(projectId) {
    recentAborts.delete(projectId);
    return controllers.delete(projectId);
}
