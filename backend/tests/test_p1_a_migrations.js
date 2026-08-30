import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-a-migrations');
process.env.DB_PATH = isolated.dbPath;

const { getSchemaVersion, db } = await import('../db.js');
isolated.registerDatabase(db);

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Schema migration 9 should create artifacts, artifact_files, and requirement link tables', async () => {
    const version = getSchemaVersion();
    assert.strictEqual(version, 9, `Schema version should be 9, got: ${version}`);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const requiredTables = [
        'artifacts',
        'artifact_files',
        'requirement_file_links',
        'requirement_check_links',
        'requirement_artifact_links'
    ];

    for (const table of requiredTables) {
        assert.ok(tables.includes(table), `Table ${table} is missing from database schema`);
    }

    // Verify composite foreign keys work
    db.prepare("INSERT INTO projects (id, title, status) VALUES ('p1-proj-1', 'P1 Test', 'planning')").run();
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES ('p1-contract-1', 'p1-proj-1', 1, 'approved', '{}', 'hash-p1-1')
    `).run();

    db.prepare(`
        INSERT INTO requirements (
            id, contract_id, stable_key, statement, kind, priority, status
        ) VALUES ('req-1', 'p1-contract-1', 'REQ-1', 'Test Statement', 'functional', 'high', 'approved')
    `).run();

    db.prepare(`
        INSERT INTO artifacts (
            id, project_id, contract_id, kind, path, sha256, size, status
        ) VALUES ('art-1', 'p1-proj-1', 'p1-contract-1', 'zip', 'dist/app.zip', 'sha256-1', 1024, 'verified')
    `).run();

    db.prepare(`
        INSERT INTO artifact_files (
            contract_id, artifact_id, path, sha256, size
        ) VALUES ('p1-contract-1', 'art-1', 'src/App.jsx', 'sha256-file-1', 256)
    `).run();

    db.prepare(`
        INSERT INTO requirement_file_links (
            contract_id, requirement_id, artifact_id, path
        ) VALUES ('p1-contract-1', 'req-1', 'art-1', 'src/App.jsx')
    `).run();

    db.prepare(`
        INSERT INTO requirement_artifact_links (
            contract_id, requirement_id, artifact_id
        ) VALUES ('p1-contract-1', 'req-1', 'art-1')
    `).run();

    // Cross-contract foreign key rejection
    assert.throws(() => {
        db.prepare(`
            INSERT INTO requirement_file_links (
                contract_id, requirement_id, artifact_id, path
            ) VALUES ('wrong-contract-id', 'req-1', 'art-1', 'src/App.jsx')
        `).run();
    }, /FOREIGN KEY/i);

    db.prepare("DELETE FROM projects WHERE id = 'p1-proj-1'").run();
});

finish();
await isolated.cleanup();
