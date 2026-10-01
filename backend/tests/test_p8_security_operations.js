import assert from 'node:assert/strict';
import events from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestHarness } from './testHarness.js';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-p8-security-operations-'));
process.env.DB_PATH = path.join(tempRoot, 'projects.db');
process.env.NODE_ENV = 'test';
process.env.PROJECTS_ROOT = path.join(tempRoot, 'projects');
process.env.ARTIFACTS_ROOT = path.join(tempRoot, 'artifacts');
process.env.TRASH_ROOT = path.join(tempRoot, 'trash');

const { createSecurityHeadersMiddleware } = await import('../security.js');
const dbModule = await import('../db.js');
dbModule.closeDatabase();
dbModule.initializeDatabase({ path: process.env.DB_PATH });
const { db, dbEvents } = dbModule;
const { sweepExpiredSessions, createMaintenanceScheduler } = await import('../maintenance.js');
const { createProject, deleteProject } = await import('../projectRepository.js');
const { writeProjectState, checkPause } = await import('../engine/workflow.js');
const { generateLLMResponse, raceWithAbort } = await import('../llm.js');
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('production and development CSP connect-src directives are exact', async () => {
    const getCsp = production => {
        const headers = {};
        createSecurityHeadersMiddleware({ production })(
            { socket: { remoteAddress: '127.0.0.1' } },
            { setHeader: (name, value) => { headers[name.toLowerCase()] = value; } },
            () => {}
        );
        return headers['content-security-policy'];
    };

    const productionCsp = getCsp(true);
    assert.match(productionCsp, /connect-src 'self'(?:;|$)/);
    assert.match(productionCsp, /worker-src 'self'(?:;|$)/);
    assert.doesNotMatch(productionCsp, /connect-src[^;]*\b(?:ws|wss):/);
    assert.match(getCsp(false), /connect-src 'self' ws: wss:/);
});
await runAsyncTest('raceWithAbort removes SDK abort listeners after resolve and abort', async () => {
    let resolveOperation;
    const resolveController = new AbortController();
    const resolveBefore = events.getEventListeners(resolveController.signal, 'abort').length;
    const resolved = raceWithAbort(new Promise(resolve => { resolveOperation = resolve; }), resolveController.signal);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(events.getEventListeners(resolveController.signal, 'abort').length, resolveBefore + 1);
    resolveOperation('resolved');
    assert.equal(await resolved, 'resolved');
    assert.equal(events.getEventListeners(resolveController.signal, 'abort').length, resolveBefore);

    const abortController = new AbortController();
    const abortBefore = events.getEventListeners(abortController.signal, 'abort').length;
    const aborted = raceWithAbort(new Promise(() => {}), abortController.signal);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(events.getEventListeners(abortController.signal, 'abort').length, abortBefore + 1);
    abortController.abort('test-abort');
    await assert.rejects(aborted, error => error.name === 'AbortError');
    assert.equal(events.getEventListeners(abortController.signal, 'abort').length, abortBefore);
});

await runAsyncTest('session maintenance removes only expired and old-revoked rows', async () => {
    const now = new Date('2026-09-06T00:00:00.000Z');
    const userId = `p8-maintenance-user-${Date.now()}`;
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(userId, userId, 'test');
    const rows = [
        ['active', '2026-09-07T00:00:00.000Z', null],
        ['expired', '2026-09-05T23:59:59.000Z', null],
        ['recent-revoked', '2026-09-07T00:00:00.000Z', '2026-09-03 00:00:00'],
        ['old-revoked', '2026-09-07T00:00:00.000Z', '2026-08-20 00:00:00']
    ];
    for (const [id, expiresAt, revokedAt] of rows) {
        db.prepare('INSERT INTO user_sessions (id, user_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)')
            .run(`p8-${id}-${Date.now()}`, userId, `hash-${id}-${Date.now()}`, expiresAt, revokedAt);
    }

    const { sweptCount } = sweepExpiredSessions(db, now);
    assert.equal(sweptCount, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ? AND (id LIKE ? OR id LIKE ?)').get(userId, 'p8-active-%', 'p8-recent-revoked-%').count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ? AND (id LIKE ? OR id LIKE ?)').get(userId, 'p8-expired-%', 'p8-old-revoked-%').count, 0);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
});

await runAsyncTest('maintenance scheduler executes session and log sweeps and stops idempotently', async () => {
    const timeouts = [];
    const intervals = [];
    const clearedTimeouts = [];
    const clearedIntervals = [];
    let shouldThrow = false;
    const operations = { sessions: 0, logs: 0 };
    const database = {
        prepare: sql => ({
            run: () => {
                if (shouldThrow) throw new Error('maintenance test failure');
                if (String(sql).includes('project_logs')) operations.logs++;
                else operations.sessions++;
                return { changes: 0 };
            }
        })
    };
    const makeTimer = (collection, callback, delay) => {
        const timer = { callback, delay, unrefCalls: 0, unref() { this.unrefCalls++; } };
        collection.push(timer);
        return timer;
    };
    const scheduler = createMaintenanceScheduler({
        database,
        setTimeoutFn: (callback, delay) => makeTimer(timeouts, callback, delay),
        setIntervalFn: (callback, delay) => makeTimer(intervals, callback, delay),
        clearTimeoutFn: timer => clearedTimeouts.push(timer),
        clearIntervalFn: timer => clearedIntervals.push(timer)
    });

    assert.equal(timeouts.length, 1);
    assert.equal(timeouts[0].delay, 0);
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 3_600_000);
    assert.equal(timeouts[0].unrefCalls, 1);
    assert.equal(intervals[0].unrefCalls, 1);
    timeouts[0].callback();
    intervals[0].callback();
    assert.ok(operations.sessions > 0);
    assert.ok(operations.logs > 0);

    shouldThrow = true;
    assert.doesNotThrow(() => intervals[0].callback());
    shouldThrow = false;
    const operationCountsBeforeStop = { ...operations };
    scheduler.stop();
    scheduler.stop();
    assert.deepEqual(clearedTimeouts, [timeouts[0]]);
    assert.deepEqual(clearedIntervals, [intervals[0]]);
    timeouts[0].callback();
    intervals[0].callback();
    assert.deepEqual(operations, operationCountsBeforeStop);
});

await runAsyncTest('repeated generateLLMResponse operations remove abort listeners after completion and abort', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' } }] })
        });
        for (let attempt = 0; attempt < 3; attempt++) {
            const mergedController = new AbortController();
            const completedBefore = events.getEventListeners(mergedController.signal, 'abort').length;
            await generateLLMResponse([{ role: 'user', content: 'hello' }], {
                provider: 'openai',
                apiKey: 'test-key',
                baseURL: 'https://provider.example.test/chat/completions',
                signal: new AbortController().signal,
                signalCombiner: () => mergedController.signal
            });
            assert.equal(events.getEventListeners(mergedController.signal, 'abort').length, completedBefore);
        }

        globalThis.fetch = (_url, { signal }) => new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            }, { once: true });
        });
        for (let attempt = 0; attempt < 3; attempt++) {
            const mergedController = new AbortController();
            const abortedBefore = events.getEventListeners(mergedController.signal, 'abort').length;
            const responsePromise = generateLLMResponse([{ role: 'user', content: 'hello' }], {
                provider: 'openai',
                apiKey: 'test-key',
                baseURL: 'https://provider.example.test/chat/completions',
                signal: new AbortController().signal,
                signalCombiner: () => mergedController.signal
            });
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(events.getEventListeners(mergedController.signal, 'abort').length, abortedBefore + 1);
            mergedController.abort('test-abort');
            await assert.rejects(responsePromise, /aborted/i);
            assert.equal(events.getEventListeners(mergedController.signal, 'abort').length, abortedBefore);
        }
    } finally {
        globalThis.fetch = originalFetch;
    }
});

await runAsyncTest('repeated checkPause operations remove abort listeners after completion and abort', async () => {
    const project = await createProject({ title: `P8 listener project ${Date.now()}` });
    try {
        project.status = 'pending_approval';
        await writeProjectState(project.id, project);
        project.status = 'contract_approved';
        await writeProjectState(project.id, project);
        project.status = 'implementing';
        await writeProjectState(project.id, project);
        project.status = 'paused';
        await writeProjectState(project.id, project);
        const stateEvent = `stateChange:${project.id}`;

        for (let attempt = 0; attempt < 3; attempt++) {
            const completedController = new AbortController();
            const completedBefore = events.getEventListeners(completedController.signal, 'abort').length;
            const dbListenersBefore = events.getEventListeners(dbEvents, stateEvent).length;
            const completed = checkPause(project.id, completedController.signal);
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(events.getEventListeners(completedController.signal, 'abort').length, completedBefore + 1);
            assert.equal(events.getEventListeners(dbEvents, stateEvent).length, dbListenersBefore + 1);
            dbEvents.emit(stateEvent, 'implementing');
            assert.equal(await completed, 'implementing');
            assert.equal(events.getEventListeners(completedController.signal, 'abort').length, completedBefore);
            assert.equal(events.getEventListeners(dbEvents, stateEvent).length, dbListenersBefore);
            db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('paused', project.id);
        }

        for (let attempt = 0; attempt < 3; attempt++) {
            const abortedController = new AbortController();
            const abortedBefore = events.getEventListeners(abortedController.signal, 'abort').length;
            const dbListenersBefore = events.getEventListeners(dbEvents, stateEvent).length;
            const aborted = checkPause(project.id, abortedController.signal);
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(events.getEventListeners(abortedController.signal, 'abort').length, abortedBefore + 1);
            assert.equal(events.getEventListeners(dbEvents, stateEvent).length, dbListenersBefore + 1);
            abortedController.abort('test-abort');
            assert.equal(await aborted, 'paused');
            assert.equal(events.getEventListeners(abortedController.signal, 'abort').length, abortedBefore);
            assert.equal(events.getEventListeners(dbEvents, stateEvent).length, dbListenersBefore);
        }
    } finally {
        await deleteProject(project.id);
    }
});


finish();
dbModule.closeDatabase();
await fs.rm(tempRoot, { recursive: true, force: true });
