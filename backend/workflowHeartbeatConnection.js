import { DatabaseSync } from 'node:sqlite';

// Opens the heartbeat thread's own SQLite connection. The beat is a liveness signal, so it must
// never wait on slow disk work that the main connection can absorb:
// - A fresh connection defaults to synchronous=FULL and would fsync the WAL on every 5-second beat.
//   The main connection (db.js) uses NORMAL; match it. A beat lost to a power cut is irrelevant.
// - A fresh connection auto-checkpoints at 1000 pages, so a beat could stall on a checkpoint
//   (fsync of the WAL and the database). Leave checkpointing to the main connection.
export function openHeartbeatDatabase(databasePath) {
    const database = new DatabaseSync(databasePath);
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec('PRAGMA synchronous = NORMAL;');
    database.exec('PRAGMA wal_autocheckpoint = 0;');
    return database;
}
