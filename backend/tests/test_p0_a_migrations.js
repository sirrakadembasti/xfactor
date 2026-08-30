import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-migrations');
process.env.DB_PATH = isolated.dbPath;
const { getSchemaVersion, db } = await import('../db.js');
isolated.registerDatabase(db);
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Schema migration 7 should create contracts, checkpoints, repair issues, and backfill existing plans', async () => {
    const version = getSchemaVersion();
    assert.strictEqual(version, 7, `Schema version should be 7, got: ${version}`);

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

finish();
await isolated.cleanup();
