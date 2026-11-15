// Writes a workflow lease heartbeat from its own thread and SQLite connection, so a long
// synchronous stall on the main event loop (slow disk, large sync work) cannot make a healthy
// attempt look stale. The thread dies with the process, so crash recovery is unchanged.
import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';

const { databasePath, attemptId, leaseOwner, intervalMs } = workerData;
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA busy_timeout = 5000;');
const update = database.prepare(`
    UPDATE workflow_attempts
    SET heartbeat_at = ?, heartbeat_epoch = ?
    WHERE id = ? AND status = 'running' AND lease_owner = ?
`);

let timer = null;
function beat() {
    let changes;
    try {
        const now = Date.now();
        changes = update.run(new Date(now).toISOString(), now, attemptId, leaseOwner).changes;
    } catch {
        // A busy or briefly locked database is retried on the next beat; the TTL tolerates it.
        return;
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
