const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000;

function waitForDrain(active, timeoutMs) {
    if (active.size === 0) return Promise.resolve({ timedOut: false });
    return new Promise(resolve => {
        const deadline = Date.now() + Math.max(0, timeoutMs);
        let settled = false;
        const check = () => {
            if (settled) return;
            if (active.size === 0) {
                settled = true;
                resolve({ timedOut: false });
                return;
            }
            if (Date.now() >= deadline) {
                settled = true;
                resolve({ timedOut: true });
                return;
            }
            setTimeout(check, 10);
        };
        setTimeout(check, 10);
    });
}

export function createLifecycleCoordinator({ timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS } = {}) {
    let accepting = true;
    let shuttingDown = false;
    const active = new Map();

    function assertGenerationAllowed() {
        if (!accepting) {
            const error = new Error('Server is shutting down and refuses new generation.');
            error.code = 'SERVER_SHUTTING_DOWN';
            throw error;
        }
    }

    function begin(kind = 'operation', { cancel = null } = {}) {
        if (!accepting) {
            const error = new Error('Server is shutting down and refuses new work.');
            error.code = 'SERVER_SHUTTING_DOWN';
            throw error;
        }
        const id = Symbol(kind);
        let released = false;
        active.set(id, { cancel });
        return {
            id,
            release() {
                if (released) return;
                released = true;
                active.delete(id);
            },
            end() { this.release(); }
        };
    }

    async function quiesce({ timeoutMs: requestedTimeout = timeoutMs } = {}) {
        if (shuttingDown) {
            const error = new Error('Server is shutting down.');
            error.code = 'SERVER_SHUTTING_DOWN';
            throw error;
        }
        accepting = false;
        for (const { cancel } of active.values()) {
            try { await cancel?.(); } catch {}
        }
        const drain = await waitForDrain(active, Math.max(1, Number(requestedTimeout) || DEFAULT_SHUTDOWN_TIMEOUT_MS));
        if (drain.timedOut) throw new Error('Mutations did not drain before backup snapshot.');
        let released = false;
        return async () => {
            if (released || shuttingDown) return;
            released = true;
            accepting = true;
        };
    }

    async function shutdown({
        cancelOwnedJobs = null,
        closeWebSockets = null,
        closeServer = null,
        checkpointDatabase = null,
        closeDatabase = null,
        timeoutMs: requestedTimeout = timeoutMs
    } = {}) {
        if (shuttingDown) return { success: true, alreadyShuttingDown: true };
        shuttingDown = true;
        accepting = false;
        const deadline = Date.now() + Math.max(1, Number(requestedTimeout) || DEFAULT_SHUTDOWN_TIMEOUT_MS);
        for (const { cancel } of active.values()) {
            try { await cancel?.(); } catch {}
        }
        try { await cancelOwnedJobs?.(); } catch {}

        const drain = await waitForDrain(active, Math.max(1, deadline - Date.now()));
        let timedOut = drain.timedOut;
        try { await closeWebSockets?.(); } catch { timedOut = true; }
        if (closeServer) {
            try {
                const remaining = Math.max(1, deadline - Date.now());
                await Promise.race([
                    Promise.resolve().then(closeServer),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP server close timed out')), remaining))
                ]);
            } catch { timedOut = true; }
        }
        try { await checkpointDatabase?.(); } catch { timedOut = true; }
        try { await closeDatabase?.(); } catch { timedOut = true; }
        return { success: !timedOut, timedOut };
    }

    return {
        begin,
        quiesce,
        assertGenerationAllowed,
        refuseNewGeneration() { accepting = false; },
        isAccepting() { return accepting; },
        activeCount() { return active.size; },
        shutdown
    };
}
