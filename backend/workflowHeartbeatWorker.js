// Writes a workflow lease heartbeat from its own thread and SQLite connection, so a long
// synchronous stall on the main event loop (slow disk, large sync work) cannot make a healthy
// attempt look stale. The thread dies with the process, so crash recovery is unchanged.
import { parentPort, workerData } from 'node:worker_threads';
import { openHeartbeatDatabase } from './workflowHeartbeatConnection.js';

const { databasePath, attemptId, leaseOwner, intervalMs } = workerData;
const database = openHeartbeatDatabase(databasePath);
const update = database.prepare(`
    UPDATE workflow_attempts
    SET heartbeat_at = ?, heartbeat_epoch = ?
    WHERE id = ? AND status = 'running' AND lease_owner = ?
`);

let timer = null;
let failingSince = null;
function beat() {
    let changes;
    const startedAt = Date.now();
    try {
        changes = update.run(new Date(startedAt).toISOString(), startedAt, attemptId, leaseOwner).changes;
    } catch (error) {
        // A busy or briefly locked database is retried on the next beat; report the first
        // failure of a streak so a blocked heartbeat is visible in the log.
        if (failingSince === null) {
            failingSince = startedAt;
            parentPort.postMessage({ type: 'beat_failed', at: new Date(startedAt).toISOString(),
                waitedMs: Date.now() - startedAt, code: error?.code ?? null, message: String(error?.message || error) });
        }
        return;
    }
    const writeMs = Date.now() - startedAt;
    if (failingSince !== null || writeMs > 2000) {
        parentPort.postMessage({ type: 'beat_recovered', failedForMs: failingSince === null ? 0 : startedAt - failingSince, writeMs });
        failingSince = null;
    }
    if (changes === 0) {
        // The attempt ended or another owner fenced it: the lease is gone for good.
        clearInterval(timer);
        try { database.close(); } catch {}
        parentPort.postMessage({ type: 'lost' });
    }
}

beat();
timer = setInterval(beat, intervalMs);
// Stop between beats: terminating a thread inside a native SQLite call can abort the process.
parentPort.on('message', message => {
    if (message?.type !== 'stop') return;
    clearInterval(timer);
    try { database.close(); } catch {}
    parentPort.close();
});
parentPort.postMessage({ type: 'started' });
