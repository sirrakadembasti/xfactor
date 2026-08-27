const controllers = new Map(); // projectId -> AbortController

export function registerProjectAbortController(projectId, controller) {
    if (!projectId || !controller) return;
    controllers.set(projectId, controller);
}

export function getProjectAbortSignal(projectId) {
    return controllers.get(projectId)?.signal || null;
}

export function abortProjectExecution(projectId, reason = 'ABORTED') {
    const controller = controllers.get(projectId);
    if (!controller) return false;
    controller.abort(reason);
    controllers.delete(projectId);
    return true;
}

export function unregisterProjectAbortController(projectId) {
    return controllers.delete(projectId);
}
