import crypto from 'crypto';
import { Worker } from 'node:worker_threads';
import { db, getDatabasePath } from './db.js';
import { logError } from './observability.js';
import { WORKFLOW_STATUS } from './engine/stateMachine.js';

// stale_terminated is written only by restart reconciliation, never by a lease holder.
const RELEASABLE_STATUSES = new Set(Object.values(WORKFLOW_STATUS)
    .filter(status => ![WORKFLOW_STATUS.RUNNING, WORKFLOW_STATUS.STALE_TERMINATED].includes(status)));

const activeLeases = new Map(); // projectId -> { attemptId, leaseOwner }
const DEFAULT_HEARTBEAT_TTL_SECONDS = 30;
const STALE_ERROR = 'Lease expired before a replacement attempt was acquired';
const RESTART_ERROR = 'Server restarted while execution was in progress';
const PAUSE_MESSAGE = "⚠️ Sunucu yeniden başlatıldı; süreç güvenle duraklatıldı. Kaldığı yerden devam ettirmek için 'Devam Et' (Resume) butonuna basabilirsiniz.";

function databaseFor(options = {}) {
    return options.database || db;
}

function epochFromTimestamp(value) {
    if (value === null || value === undefined || value === '') return Number.NaN;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : Number.NaN;
    }
    if (value instanceof Date) return value.getTime();
    const text = String(value).trim();
    if (/^\d+(?:\.\d+)?$/.test(text)) {
        const numeric = Number(text);
        return Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Number.NaN;
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
        return Date.parse(`${text.replace(' ', 'T')}Z`);
    }
    return Date.parse(text);
}

function heartbeatValue(row) {
    const numericEpoch = epochFromTimestamp(row?.heartbeat_epoch);
    return Number.isFinite(numericEpoch)
        ? numericEpoch
        : epochFromTimestamp(row?.heartbeat_at);
}

function isFreshTimestamp(value, ttlSeconds, now = Date.now()) {
    const timestamp = epochFromTimestamp(value);
    if (!Number.isFinite(timestamp)) return false;
    return now - timestamp <= (Number(ttlSeconds) * 1000);
}

function sortAttemptsNewestFirst(rows) {
    return [...rows].sort((a, b) => {
        const aEpoch = epochFromTimestamp(a.started_epoch ?? a.started_at);
        const bEpoch = epochFromTimestamp(b.started_epoch ?? b.started_at);
        if (aEpoch !== bEpoch) return bEpoch - aEpoch;
        return String(b.id).localeCompare(String(a.id));
    });
}

export function getActiveWorkflowAttempt(projectId, {
    heartbeatTtlSeconds = DEFAULT_HEARTBEAT_TTL_SECONDS,
    database = db
} = {}) {
    if (!projectId) return null;

    const rows = database.prepare(`
        SELECT id, project_id, status, lease_owner, started_at, started_epoch,
               heartbeat_at, heartbeat_epoch, ended_at, ended_epoch, error
        FROM workflow_attempts
        WHERE project_id = ? AND status = 'running'
    `).all(projectId);
    const row = sortAttemptsNewestFirst(rows)[0];
    if (!row) {
        activeLeases.delete(projectId);
        return null;
    }

    if (!isFreshTimestamp(heartbeatValue(row), heartbeatTtlSeconds)) {
        activeLeases.delete(projectId);
        return null;
    }

    activeLeases.set(projectId, { attemptId: row.id, leaseOwner: row.lease_owner });
    return row;
}

export function acquireWorkflowLease(projectId, leaseOwner, {
    heartbeatTtlSeconds = DEFAULT_HEARTBEAT_TTL_SECONDS,
    database = db
} = {}) {
    if (!projectId || !leaseOwner) {
        throw new Error('projectId and leaseOwner are required to acquire workflow lease.');
    }

    const attemptId = `attempt-${crypto.randomUUID()}`;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    let transactionOpen = false;
    try {
        database.exec('BEGIN IMMEDIATE;');
        transactionOpen = true;

        const runningRows = database.prepare(`
            SELECT id, project_id, status, lease_owner, started_at, started_epoch,
                   heartbeat_at, heartbeat_epoch, ended_at, ended_epoch, error
            FROM workflow_attempts
            WHERE project_id = ? AND status = 'running'
        `).all(projectId);
        const current = sortAttemptsNewestFirst(runningRows)[0];
        if (current && isFreshTimestamp(heartbeatValue(current), heartbeatTtlSeconds)) {
            activeLeases.set(projectId, { attemptId: current.id, leaseOwner: current.lease_owner });
            database.exec('COMMIT;');
            transactionOpen = false;
            return { acquired: false, attempt: current };
        }

        if (current) {
            const terminated = database.prepare(`
                UPDATE workflow_attempts
                SET status = 'stale_terminated', ended_at = ?, ended_epoch = ?, error = ?
                WHERE id = ? AND project_id = ? AND status = 'running'
            `).run(nowIso, now, STALE_ERROR, current.id, projectId);
            if (terminated.changes === 1) {
                activeLeases.delete(projectId);
            }
        }

        database.prepare(`
            INSERT INTO workflow_attempts (
                id, project_id, status, lease_owner, started_at, started_epoch, heartbeat_at, heartbeat_epoch
            )
            VALUES (?, ?, 'running', ?, ?, ?, ?, ?)
        `).run(attemptId, projectId, leaseOwner, nowIso, now, nowIso, now);

        database.exec('COMMIT;');
        transactionOpen = false;
        activeLeases.set(projectId, { attemptId, leaseOwner });
        const newAttempt = database.prepare('SELECT * FROM workflow_attempts WHERE id = ?').get(attemptId);
        return { acquired: true, attempt: newAttempt };
    } catch (err) {
        if (transactionOpen) {
            try { database.exec('ROLLBACK;'); } catch {}
        }
        const concurrentActive = getActiveWorkflowAttempt(projectId, { heartbeatTtlSeconds, database });
        if (concurrentActive) {
            return { acquired: false, attempt: concurrentActive };
        }
        throw err;
    }
}

export function updateAttemptHeartbeat(attemptId, leaseOwner = null, { database = db } = {}) {
    if (!attemptId || !leaseOwner) return false;
    try {
        const now = Date.now();
        const result = database.prepare(`
            UPDATE workflow_attempts
            SET heartbeat_at = ?, heartbeat_epoch = ?
            WHERE id = ? AND status = 'running' AND lease_owner = ?
        `).run(new Date(now).toISOString(), now, attemptId, leaseOwner);
        if (result.changes > 0) {
            const row = database.prepare('SELECT project_id, lease_owner FROM workflow_attempts WHERE id = ?').get(attemptId);
            if (row) activeLeases.set(row.project_id, { attemptId, leaseOwner: row.lease_owner });
        }
        return result.changes > 0;
    } catch (err) {
        return false;
    }
}

export const LEASE_HEARTBEAT_INTERVAL_MS = 5000;

/**
 * Keeps an attempt's lease alive while its workflow runs. The heartbeat is written from a
 * worker thread with its own connection: synchronous stalls on the main event loop (slow disk,
 * large sync work) no longer starve it past the 30 s TTL and fence a healthy attempt. onLost
 * fires once when the lease is really gone (attempt ended or fenced). Without a file database
 * (':memory:') or if the thread cannot run, the old main-thread timer is used.
 */
export function startLeaseHeartbeat({
    attemptId,
    leaseOwner,
    onLost = () => {},
    intervalMs = LEASE_HEARTBEAT_INTERVAL_MS,
    databasePath = getDatabasePath()
} = {}) {
    if (!attemptId || !leaseOwner) return { mode: 'none', stop: async () => {} };
    let stopped = false, lost = false, timer = null, worker = null;
    const signalLost = () => {
        if (stopped || lost) return;
        lost = true;
        onLost('LEASE_LOST');
    };
    const startInThread = () => {
        timer = setInterval(() => {
            if (!updateAttemptHeartbeat(attemptId, leaseOwner)) signalLost();
        }, intervalMs);
    };
    if (!databasePath) {
        startInThread();
        return { mode: 'in-thread', stop: async () => { stopped = true; clearInterval(timer); } };
    }
    worker = new Worker(new URL('./workflowHeartbeatWorker.js', import.meta.url), {
        workerData: { databasePath, attemptId, leaseOwner, intervalMs }
    });
    let workerExited = false;
    worker.on('exit', () => { workerExited = true; });
    worker.on('message', message => { if (message?.type === 'lost') signalLost(); });
    worker.on('error', error => {
        if (stopped) return;
        logError('workflow.heartbeat_thread_failed', error, { attemptId });
        if (!timer && !lost) startInThread();
    });
    return {
        mode: 'thread',
        stop: async () => {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            // Ask the thread to close its connection and exit between beats; terminating it
            // inside a native SQLite call can abort the whole process.
            if (workerExited) return;
            let timeoutHandle;
            const exited = new Promise(resolve => worker.once('exit', () => resolve('exited')));
            const timeout = new Promise(resolve => { timeoutHandle = setTimeout(resolve, 2000, 'timeout'); });
            worker.postMessage({ type: 'stop' });
            const outcome = await Promise.race([exited, timeout]);
            clearTimeout(timeoutHandle);
            if (outcome === 'timeout') await worker.terminate();
        }
    };
}

export function releaseWorkflowLease(attemptId, terminalStatus = 'completed', {
    error = null,
    leaseOwner = null,
    database = db
} = {}) {
    if (!attemptId || !leaseOwner) return false;
    // A caller passing an unknown terminal status is a programming error: surface it instead of
    // letting the schema CHECK reject the update silently and leave the attempt running.
    if (!RELEASABLE_STATUSES.has(terminalStatus)) {
        throw new Error(`Invalid workflow attempt terminal status: ${String(terminalStatus)}`);
    }

    try {
        const attempt = database.prepare(
            'SELECT project_id FROM workflow_attempts WHERE id = ? AND lease_owner = ?'
        ).get(attemptId, leaseOwner);
        const now = Date.now();
        const result = database.prepare(`
            UPDATE workflow_attempts
            SET status = ?, ended_at = ?, ended_epoch = ?, error = ?
            WHERE id = ? AND status = 'running' AND lease_owner = ?
        `).run(
            terminalStatus,
            new Date(now).toISOString(),
            now,
            error ? String(error) : null,
            attemptId,
            leaseOwner
        );
        if (result.changes > 0 && attempt) {
            activeLeases.delete(attempt.project_id);
        }
        return result.changes > 0;
    } catch (err) {
        // Release runs from finally blocks, so throwing would mask the original failure. The
        // attempt stays recoverable by stale-heartbeat reconciliation; the failure is recorded.
        logError('workflow.lease_release_failed', err, { attemptId, terminalStatus });
        return false;
    }
}


export function isWorkflowLeaseCurrent(attemptId, leaseOwner, {
    projectId = null,
    heartbeatTtlSeconds = DEFAULT_HEARTBEAT_TTL_SECONDS,
    database = db
} = {}) {
    if (!attemptId || !leaseOwner) return false;
    const projectClause = projectId ? ' AND project_id = ?' : '';
    const params = projectId ? [attemptId, projectId, leaseOwner] : [attemptId, leaseOwner];
    const row = database.prepare(`
        SELECT id, project_id, lease_owner, heartbeat_at, heartbeat_epoch, status
        FROM workflow_attempts
        WHERE id = ?${projectClause} AND status = 'running' AND lease_owner = ?
    `).get(...params);
    return Boolean(row && isFreshTimestamp(heartbeatValue(row), heartbeatTtlSeconds));
}

export function assertWorkflowLease(attemptId, leaseOwner, options = {}) {
    if (!isWorkflowLeaseCurrent(attemptId, leaseOwner, options)) {
        const error = new Error('Workflow lease is stale or fenced by a newer owner.');
        error.code = 'WORKFLOW_LEASE_FENCED';
        throw error;
    }
    return true;
}

// Only synchronous filesystem commits belong here. Preparation/provider work
// must finish before BEGIN so the shared connection never spans an await.
export function commitWorkflowSource(fence, commit) {
    if (!fence) return commit(); // Standalone, non-workflow generation utilities.
    const database = databaseFor(fence);
    database.exec('BEGIN IMMEDIATE;');
    try {
        assertWorkflowLease(fence.attemptId, fence.leaseOwner, { ...fence, database });
        const project = database.prepare('SELECT status FROM projects WHERE id = ?').get(fence.projectId);
        if (fence.signal?.aborted || !project || ['paused', 'deleting'].includes(project.status)) {
            const error = new Error('Workflow source commit cancelled or fenced.');
            error.code = 'WORKFLOW_LEASE_FENCED';
            throw error;
        }
        if (fence.contractId) {
            const contract = database.prepare(`SELECT id, contract_hash FROM project_contracts
                WHERE project_id = ? AND status = 'approved' ORDER BY revision DESC LIMIT 1`).get(fence.projectId);
            if (contract?.id !== fence.contractId || contract.contract_hash !== fence.contractHash) {
                const error = new Error('Workflow source contract changed before commit.');
                error.code = 'WORKFLOW_LEASE_FENCED';
                throw error;
            }
        }
        // Repair CAS must run after async staging while the same lease/contract
        // transaction still excludes cancellation and cooperative source writers.
        if (fence.assertBeforeCommit) {
            const checked = fence.assertBeforeCommit();
            if (checked && typeof checked.then === 'function') throw new Error('Source CAS callback must be synchronous.');
        }
        const result = commit();
        database.exec('COMMIT;');
        return result;
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }
}

// A single SQLite write serializes cancellation with source commits and lease
// acquisition, including cancellation requested in a different server process.
export function revokeProjectWorkflowLeases(projectId, reason = 'ABORTED', { database = db } = {}) {
    if (!database || !projectId) return 0;
    const now = Date.now();
    const result = database.prepare(`
        UPDATE workflow_attempts SET status = ?, ended_at = ?, ended_epoch = ?, error = ?
        WHERE project_id = ? AND status = 'running'
    `).run(reason === 'PAUSED' ? 'paused' : 'aborted', new Date(now).toISOString(), now, String(reason), projectId);
    activeLeases.delete(projectId);
    return result.changes;
}

export function reconcileStaleWorkflowAttempts({
    staleThresholdSeconds = DEFAULT_HEARTBEAT_TTL_SECONDS,
    database = db
} = {}) {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const recoveredProjectIds = [];
    const seenProjectIds = new Set();
    let transactionOpen = false;

    database.exec('BEGIN IMMEDIATE;');
    transactionOpen = true;
    try {
        const runningAttempts = database.prepare(`
            SELECT a.id AS attempt_id, a.project_id,
                   a.heartbeat_at, a.heartbeat_epoch,
                   p.status AS project_status
            FROM workflow_attempts a
            JOIN projects p ON p.id = a.project_id
            WHERE a.status = 'running'
        `).all();
        const updateAttempt = database.prepare(`
            UPDATE workflow_attempts
            SET status = 'stale_terminated', ended_at = ?, ended_epoch = ?, error = ?
            WHERE id = ? AND status = 'running'
        `);
        const updateProject = database.prepare(`
            UPDATE projects
            SET status = 'paused', revision = revision + 1
            WHERE id = ? AND status = 'implementing'
        `);
        const insertChat = database.prepare(
            'INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)'
        );

        for (const row of runningAttempts) {
            if (isFreshTimestamp(heartbeatValue(row), staleThresholdSeconds, now)) continue;
            const terminated = updateAttempt.run(nowIso, now, RESTART_ERROR, row.attempt_id);
            if (terminated.changes !== 1) continue;
            activeLeases.delete(row.project_id);

            if (seenProjectIds.has(row.project_id)) continue;
            const projectResult = updateProject.run(row.project_id);
            if (projectResult.changes === 1) {
                insertChat.run(row.project_id, 'model', PAUSE_MESSAGE, nowIso);
                recoveredProjectIds.push(row.project_id);
                seenProjectIds.add(row.project_id);
            }
        }

        const orphanedRunningProjects = database.prepare(`
            SELECT id
            FROM projects
            WHERE status = 'implementing'
              AND id NOT IN (
                  SELECT project_id FROM workflow_attempts WHERE status = 'running'
              )
        `).all();
        for (const project of orphanedRunningProjects) {
            const projectResult = updateProject.run(project.id);
            if (projectResult.changes === 1) {
                insertChat.run(project.id, 'model', PAUSE_MESSAGE, nowIso);
                if (!seenProjectIds.has(project.id)) {
                    recoveredProjectIds.push(project.id);
                    seenProjectIds.add(project.id);
                }
            }
        }

        database.exec('COMMIT;');
        transactionOpen = false;
    } catch (error) {
        if (transactionOpen) {
            try { database.exec('ROLLBACK;'); } catch {}
        }
        throw error;
    }

    return {
        reconciledCount: recoveredProjectIds.length,
        recoveredProjectIds
    };
}
