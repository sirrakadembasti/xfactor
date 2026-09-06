import assert from 'assert';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p7-sqlite-durability');
process.env.DB_PATH = isolated.dbPath;

const { runAsyncTest, finish } = createTestHarness();

try {
    const { db, runMigrations, setBusyTimeout } = await import('../db.js');
    isolated.registerDatabase(db);

    await runAsyncTest('1. durability PRAGMAs are hardened on init', async () => {
        assert.strictEqual(
            db.prepare('PRAGMA busy_timeout').get().timeout,
            5000,
            'PRAGMA busy_timeout must be 5000'
        );
        assert.strictEqual(
            db.prepare('PRAGMA foreign_keys').get().foreign_keys,
            1,
            'PRAGMA foreign_keys must be ON'
        );
        assert.strictEqual(
            String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(),
            'wal',
            'PRAGMA journal_mode must be WAL'
        );
        assert.strictEqual(
            db.prepare('PRAGMA synchronous').get().synchronous,
            1,
            'PRAGMA synchronous must be NORMAL (1)'
        );
    });

    await runAsyncTest('2. setBusyTimeout helper adjusts the timeout', async () => {
        assert.strictEqual(typeof setBusyTimeout, 'function', 'setBusyTimeout must be exported');
        setBusyTimeout(1234);
        assert.strictEqual(db.prepare('PRAGMA busy_timeout').get().timeout, 1234);
        setBusyTimeout(5000);
        assert.strictEqual(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);

        const peer = new DatabaseSync(isolated.dbPath);
        try {
            setBusyTimeout(777, peer);
            assert.strictEqual(peer.prepare('PRAGMA busy_timeout').get().timeout, 777);
        } finally {
            peer.close();
        }
        setBusyTimeout(5000);
        assert.strictEqual(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
    });

    await runAsyncTest('3. runMigrations reapplies durability PRAGMAs', async () => {
        db.exec('PRAGMA busy_timeout = 0;');
        runMigrations(db);
        assert.strictEqual(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
        assert.strictEqual(db.prepare('PRAGMA synchronous').get().synchronous, 1);
        assert.strictEqual(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
        assert.strictEqual(
            String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(),
            'wal'
        );
    });

    await runAsyncTest('4. concurrent write waits on a held write lock without SQLITE_BUSY', async () => {
        db.exec('CREATE TABLE IF NOT EXISTS p7_durability_probe (id INTEGER PRIMARY KEY, v TEXT)');
        db.exec('DELETE FROM p7_durability_probe');

        const holderCode = [
            "import { parentPort, workerData } from 'node:worker_threads';",
            "import { DatabaseSync } from 'node:sqlite';",
            'const holderDb = new DatabaseSync(workerData.dbPath);',
            "holderDb.exec('PRAGMA busy_timeout = 5000;');",
            "holderDb.exec('BEGIN IMMEDIATE;');",
            "holderDb.prepare('INSERT INTO p7_durability_probe (v) VALUES (?)').run('held');",
            "parentPort.postMessage('locked');",
            "setTimeout(() => { holderDb.exec('COMMIT;'); holderDb.close(); parentPort.postMessage('released'); }, 300);"
        ].join('\n');

        const worker = new Worker(holderCode, { eval: true, workerData: { dbPath: isolated.dbPath } });
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('lock holder never signalled')), 10000);
                worker.once('message', (msg) => {
                    if (msg === 'locked') {
                        clearTimeout(timer);
                        resolve();
                    }
                });
                worker.once('error', (err) => {
                    clearTimeout(timer);
                    reject(err);
                });
            });

            let busyError = null;
            try {
                db.prepare('INSERT INTO p7_durability_probe (v) VALUES (?)').run('main-during-lock');
            } catch (err) {
                busyError = err;
            }
            assert.strictEqual(busyError, null, `write must wait, not throw SQLITE_BUSY (got: ${busyError?.message})`);

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('lock holder never released')), 10000);
                const onMessage = (msg) => {
                    if (msg === 'released') {
                        clearTimeout(timer);
                        resolve();
                    }
                };
                worker.on('message', onMessage);
                worker.once('error', (err) => {
                    clearTimeout(timer);
                    reject(err);
                });
            });

            const rows = db.prepare('SELECT v FROM p7_durability_probe ORDER BY id').all().map((r) => r.v);
            assert.deepStrictEqual(rows, ['held', 'main-during-lock']);
        } finally {
            await worker.terminate();
        }
    });

    await runAsyncTest('5. alternating writes across connections never hit SQLITE_BUSY', async () => {
        db.exec('DELETE FROM p7_durability_probe');
        const peer = new DatabaseSync(isolated.dbPath);
        try {
            peer.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
            for (let i = 0; i < 10; i++) {
                peer.prepare('INSERT INTO p7_durability_probe (v) VALUES (?)').run(`peer-${i}`);
                db.prepare('INSERT INTO p7_durability_probe (v) VALUES (?)').run(`main-${i}`);
            }
            const count = db.prepare('SELECT COUNT(*) AS c FROM p7_durability_probe').get().c;
            assert.strictEqual(count, 20);
        } finally {
            peer.close();
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
