import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-migrations');
process.env.DB_PATH = isolated.dbPath;
const { getSchemaVersion } = await import('../db.js');
let { db } = await import('../db.js');
isolated.registerDatabase(db);
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Schema migration 7 should create contracts, checkpoints, repair issues, and backfill existing plans', async () => {
    const version = getSchemaVersion();
    assert.ok(version >= 7, `Schema version should be at least 7, got: ${version}`);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(table => table.name);
    const requiredTables = [
        'project_contracts',
        'requirements',
        'contract_elements',
        'contract_tasks',
        'requirement_task_links',
        'requirement_element_links',
        'repair_issues',
        'task_checkpoints'
    ];
    for (const table of requiredTables) {
        assert.ok(tables.includes(table), `Table ${table} should exist in database`);
    }

    const projectContractIndexes = db.prepare('PRAGMA index_list(project_contracts)').all();
    assert.ok(
        projectContractIndexes.some(index => index.unique === 1),
        'Unique index must exist on project_contracts'
    );

    db.prepare("INSERT INTO projects (id, title, status) VALUES ('owner-a', 'A', 'planning'), ('owner-b', 'B', 'planning')").run();
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES ('contract-a', 'owner-a', 1, 'draft', '{}', 'hash-a')
    `).run();
    assert.throws(() => db.prepare(`
        INSERT INTO repair_issues (
            id, project_id, contract_id, fingerprint, severity, status
        ) VALUES ('issue-cross-owner', 'owner-b', 'contract-a', 'fp', 'critical', 'open')
    `).run(), /FOREIGN KEY/);
    db.prepare("DELETE FROM projects WHERE id IN ('owner-a', 'owner-b')").run();
});

await runAsyncTest('v17 reopen preserves every legacy evidence field and checkpoint ID without guessing ID syntax', async () => {
    const { initializeDatabase, closeDatabase, runMigrations } = await import('../db.js');
    const { deriveCheckpointId } = await import('../observability.js');
    const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
    db.prepare("INSERT INTO projects (id,title,status) VALUES ('legacy-v16','Legacy','paused')").run();
    db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
        VALUES ('legacy-v16-contract','legacy-v16',1,'approved','{}','legacy-plan')`).run();
    for (const [taskId, status, invalidatedAt, reason] of [
        ['task-' + 'a'.repeat(64), 'completed', null, null],
        ['old-rejected', 'invalidated', '2025-01-02', 'rejected'],
        ['acceptance-retry', 'completed', '2025-01-03', null]
    ]) saveCheckpoint({ projectId: 'legacy-v16', contractId: 'legacy-v16-contract', taskId,
        planHash: 'legacy-plan', taskSpecHash: 'legacy-spec', inputHash: 'legacy-in', outputHash: 'legacy-out',
        status, invalidatedAt, invalidationReason: reason, createdAt: '2025-01-01', revision: 7 });
    db.exec('ALTER TABLE task_checkpoints DROP COLUMN task_identity_version');
    db.prepare('DELETE FROM schema_migrations WHERE version=17').run();
    const before = db.prepare('SELECT * FROM task_checkpoints ORDER BY task_id').all();
    const ids = before.map(deriveCheckpointId);
    closeDatabase();
    db = initializeDatabase({ path: isolated.dbPath });
    isolated.registerDatabase(db);
    runMigrations(db);
    const after = db.prepare('SELECT * FROM task_checkpoints ORDER BY task_id').all();
    assert.deepEqual(after.map(({ task_identity_version, ...row }) => row), before);
    assert.ok(after.every(row => row.task_identity_version === 0));
    assert.deepEqual(after.map(deriveCheckpointId), ids);
    const common = { projectId: 'legacy-v16', contractId: 'legacy-v16-contract', taskId: 'same',
        planHash: 'legacy-plan', taskSpecHash: 'same-spec', inputHash: 'same-in', outputHash: 'same-out' };
    const a = saveCheckpoint({ ...common, teamleaderId: 'frontend.lead' });
    const b = saveCheckpoint({ ...common, teamleaderId: 'backend.lead' });
    assert.notEqual(a.task_id, b.task_id);
    assert.equal(a.task_identity_version, 1); assert.equal(b.task_identity_version, 1);
    closeDatabase(); db = initializeDatabase({ path: isolated.dbPath }); isolated.registerDatabase(db);
    assert.equal(db.prepare('SELECT count(*) AS n FROM task_checkpoints').get().n, 5);
});

finish();
await isolated.cleanup();
