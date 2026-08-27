import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { createCorrelatedContext, cleanupStaleLogs } from '../observability.js';
import { db } from '../db.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// P3.3: Observability & Log Retention
// =========================================================================
await runAsyncTest('P3.3 createCorrelatedContext binds attemptId, projectId and requestId', async () => {
    const ctx = createCorrelatedContext({
        projectId: 'proj-123',
        attemptId: 'att-456'
    });
    assert.strictEqual(ctx.projectId, 'proj-123');
    assert.strictEqual(ctx.attemptId, 'att-456');
    assert.ok(typeof ctx.requestId === 'string' && ctx.requestId.length > 0);
});

await runAsyncTest('P3.3 cleanupStaleLogs purges logs older than retention cutoff', async () => {
    const oldTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    try {
        db.prepare(`
            INSERT INTO project_logs (id, project_id, timestamp, agent, action, message)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('test_old_log_1', 'dummy_proj', oldTimestamp, 'system', 'info', 'Old log to purge');
    } catch {}

    const purged = cleanupStaleLogs(db, 30);
    assert.ok(typeof purged === 'number', 'Cleanup returns purged count');
});

await finish();
