import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createTestHarness } from './testHarness.js';
import { openHeartbeatDatabase } from '../workflowHeartbeatConnection.js';

const { runAsyncTest, finish } = createTestHarness();
const pragma = (database, name) => Object.values(database.prepare(`PRAGMA ${name}`).get())[0];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-heartbeat-conn-'));
const file = path.join(scratch, 'lease.db');
const main = new DatabaseSync(file);
main.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; CREATE TABLE beats (id INTEGER PRIMARY KEY, at INTEGER)');
main.prepare('INSERT INTO beats (id, at) VALUES (1, 0)').run();

await runAsyncTest('the heartbeat connection never fsyncs per beat and never runs a WAL checkpoint', () => {
    // A fresh node:sqlite connection defaults to synchronous=FULL (2) and wal_autocheckpoint=1000:
    // on a slow disk every 5-second beat would fsync the WAL and some beats would checkpoint.
    const fresh = new DatabaseSync(file);
    assert.equal(pragma(fresh, 'synchronous'), 2);
    assert.equal(pragma(fresh, 'wal_autocheckpoint'), 1000);
    fresh.close();

    const heartbeat = openHeartbeatDatabase(file);
    try {
        assert.equal(pragma(heartbeat, 'synchronous'), 1, 'NORMAL, like the main connection');
        assert.equal(pragma(heartbeat, 'wal_autocheckpoint'), 0);
        assert.equal(pragma(heartbeat, 'busy_timeout'), 5000);
        assert.equal(pragma(heartbeat, 'journal_mode'), 'wal');
    } finally { heartbeat.close(); }
});

await runAsyncTest('the heartbeat connection still writes beats the main connection can read', () => {
    const heartbeat = openHeartbeatDatabase(file);
    try {
        heartbeat.prepare('UPDATE beats SET at = ? WHERE id = 1').run(1234);
        assert.equal(main.prepare('SELECT at FROM beats WHERE id = 1').get().at, 1234);
    } finally { heartbeat.close(); }
});

main.close();
fs.rmSync(scratch, { recursive: true, force: true });
finish();
