import { db } from './db.js';
import { cleanupStaleLogs, logError } from './observability.js';
import { reconcileStaleWorkflowAttempts } from './workflowAttempts.js';

const DEFAULT_INTERVAL_MS = 3_600_000;
const SESSION_SWEEP_SQL = `DELETE FROM user_sessions
    WHERE expires_at <= ?
       OR (revoked_at IS NOT NULL AND datetime(revoked_at, '+7 days') <= ?)`;

function normalizeNow(now) {
    const value = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(value.getTime())) {
        throw new Error('Session maintenance clock must be a valid date.');
    }
    return value;
}

export function sweepExpiredSessions(database = db, now = new Date(), retentionDays = 30) {
    const nowIso = normalizeNow(now).toISOString();
    const result = database.prepare(SESSION_SWEEP_SQL).run(nowIso, nowIso);
    const logsDeleted = cleanupStaleLogs(database, retentionDays, now);
    return { sweptCount: Number(result?.changes || 0), logsDeleted };
}

export function recoverInterruptedWorkflows({ database = db } = {}) {
    return reconcileStaleWorkflowAttempts({ database });
}

export function createMaintenanceScheduler({
    database = db,
    intervalMs = DEFAULT_INTERVAL_MS,
    setTimeoutFn = setTimeout,
    setIntervalFn = setInterval,
    clearTimeoutFn = clearTimeout,
    clearIntervalFn = clearInterval
} = {}) {
    let stopped = false;
    const runSweep = () => {
        if (stopped) return;
        try {
            sweepExpiredSessions(database);
        } catch (error) {
            logError('session.maintenance_failed', error);
        }
    };

    const startupTimer = setTimeoutFn(runSweep, 0);
    startupTimer?.unref?.();
    const intervalTimer = setIntervalFn(runSweep, intervalMs);
    intervalTimer?.unref?.();

    return {
        stop() {
            if (stopped) return;
            stopped = true;
            clearTimeoutFn(startupTimer);
            clearIntervalFn(intervalTimer);
        }
    };
}
