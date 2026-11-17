import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'tests', 'data', 'scripts']);

// The backend shares ONE node:sqlite connection. A real I/O `await` between BEGIN and COMMIT lets
// the event loop run other requests inside that transaction (or fail with "cannot start a
// transaction within a transaction"), and it keeps the write lock away from the heartbeat thread.
//
// Allowed: `writeProjectState(...)` awaits. `saveProjectState` performs no real I/O, so these only
// yield a microtask. Keyed by file and trimmed line text (not line number) so the list survives
// unrelated edits. A repeated line is allowed as many times as it is listed.
const ALLOWED = [
    ['routes/projectContractRoutes.js', 'await writeProjectState(id, state, { inTransaction: true, onTransaction: recordAction });', 1],
    ['routes/projectRepairRoutes.js', 'if (state.status !== PROJECT_STATUS.PAUSED) { state.status = PROJECT_STATUS.PAUSED; await writeProjectState(id, state, options); }', 1],
    ['routes/projectRepairRoutes.js', 'if (state.status !== PROJECT_STATUS.PAUSED) { state.status = PROJECT_STATUS.PAUSED; await writeProjectState(id, state, writeOptions); }', 1],
    ['routes/projectRepairRoutes.js', 'await writeProjectState(id, state, { attemptId: lease.attempt.id, leaseOwner, inTransaction: true });', 1],
    ['routes/projectRoutes.js', 'await writeProjectState(projectId, state, { inTransaction: true, onTransaction: () => {', 1],
    ['routes/projectRoutes.js', 'await writeProjectState(id, state, {', 2],
    ['routes/projectRoutes.js', 'await writeProjectState(', 1],
];

function sourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(js|cjs|mjs)$/.test(entry.name) ? [full] : [];
    });
}

export function findAwaitsInsideTransactions(root = backendRoot) {
    const found = [];
    for (const file of sourceFiles(root)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (!/exec\(['"`]BEGIN/.test(line)) return;
            for (let next = index + 1; next < Math.min(lines.length, index + 400); next++) {
                if (/exec\(['"`]COMMIT/.test(lines[next])) break;
                if (/\bawait\b/.test(lines[next])) {
                    found.push({ file: path.relative(root, file).replace(/\\/g, '/'), text: lines[next].trim(), line: next + 1 });
                    break;
                }
            }
        });
    }
    return found;
}

await runAsyncTest('no real I/O await sits between BEGIN and COMMIT on the shared connection', () => {
    const budget = new Map(ALLOWED.map(([file, text, count]) => [`${file}|${text}`, count]));
    const violations = [];
    for (const item of findAwaitsInsideTransactions()) {
        const key = `${item.file}|${item.text}`;
        if (budget.get(key) > 0) budget.set(key, budget.get(key) - 1);
        else violations.push(`${item.file}:${item.line} ${item.text.slice(0, 110)}`);
    }
    assert.deepEqual(violations, [], `await inside a transaction:\n${violations.join('\n')}`);
});

await runAsyncTest('the allowlist only names awaits that still exist', () => {
    const present = new Map();
    for (const item of findAwaitsInsideTransactions()) present.set(`${item.file}|${item.text}`, (present.get(`${item.file}|${item.text}`) || 0) + 1);
    const stale = ALLOWED.filter(([file, text, count]) => (present.get(`${file}|${text}`) || 0) < count).map(([file, text]) => `${file}: ${text.slice(0, 80)}`);
    assert.deepEqual(stale, [], `stale allowlist entries:\n${stale.join('\n')}`);
});

await runAsyncTest('artifact transaction is synchronous, commits sync work and rolls back async callbacks', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { withArtifactTransaction } = await import('../repositories/artifactRepository.js');
    const database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE rows (id INTEGER)');
    assert.equal(withArtifactTransaction(() => { database.exec('INSERT INTO rows VALUES (1)'); return 'done'; }, database), 'done');
    assert.throws(() => withArtifactTransaction(async () => { database.exec('INSERT INTO rows VALUES (2)'); }, database), /synchronous/);
    assert.throws(() => withArtifactTransaction(() => { database.exec('INSERT INTO rows VALUES (3)'); throw new Error('boom'); }, database), /boom/);
    assert.deepEqual(database.prepare('SELECT id FROM rows ORDER BY id').all().map(row => row.id), [1]);
    // The connection is not left inside a transaction.
    database.exec('BEGIN IMMEDIATE;'); database.exec('COMMIT;');
    database.close();
});

finish();
