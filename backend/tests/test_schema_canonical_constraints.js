import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createTestHarness } from './testHarness.js';

const { runMigrations, db } = await import('../db.js');
const { MIGRATIONS, MIGRATION_18_VALUES } = await import('../db/migrations.js');
const { PERSISTED_PROJECT_STATUSES, WORKFLOW_STATUS } = await import('../engine/stateMachine.js');
const { createUser, getProjectRole, setProjectRole, getUserProjects } = await import('../auth.js');
const { createProject } = await import('../projectRepository.js');
const { runAsyncTest, runTest, finish } = createTestHarness();

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-schema-canonical-'));
let databaseCount = 0;

/** A database migrated only up to `version`, as an older installation would be. */
function databaseAt(version) {
    const database = new DatabaseSync(path.join(tempRoot, `schema-${++databaseCount}.db`));
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);');
    for (const migration of MIGRATIONS.filter(item => item.version <= version)) {
        database.exec('BEGIN;');
        migration.up(database);
        database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
        database.exec('COMMIT;');
    }
    return database;
}

const version = database => database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version;

/** Version-17 data shaped like the live installation: legacy owner_id and every repair provenance. */
function seedLegacyData(database) {
    database.exec(`
        INSERT INTO users (id, username, password_hash, is_admin) VALUES ('u-owner', 'legacy-owner', 'scrypt$x$y', 0);
        INSERT INTO projects (id, title, status, owner_id) VALUES ('p-legacy', 'Legacy', 'paused', 'u-owner');
        INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash)
            VALUES ('c-legacy', 'p-legacy', 1, 'approved', '{}', 'hash');
        INSERT INTO workflow_attempts (id, project_id, status, lease_owner) VALUES ('a-static', 'p-legacy', 'failed', 'owner');
        INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at)
            VALUES ('run-worker', 'p-legacy', 'c-legacy', 'failed', '2.0', '2026-11-01T00:00:00.000Z');
        INSERT INTO repair_issues (id, project_id, contract_id, run_id, fingerprint, severity, status, detail_json, attempt_id)
            VALUES ('repair-static', 'p-legacy', 'c-legacy', 'a-static', 'fp-static', 'critical', 'open', '{"issue":"x"}', 'a-static');
        INSERT INTO repair_issues (id, project_id, contract_id, run_id, fingerprint, severity, status, detail_json, attempt_id)
            VALUES ('repair-worker-a', 'p-legacy', 'c-legacy', 'run-worker', 'fp-worker', 'high', 'open', '{"kind":"worker_product_failure"}', 'a-static');
        INSERT INTO repair_issues (id, project_id, contract_id, fingerprint, severity, status, detail_json)
            VALUES ('repair-worker-b', 'p-legacy', 'c-legacy', 'fp-blocker', 'high', 'open', '{"kind":"verification_controller_blocker"}');
        INSERT INTO chat_history (project_id, role, text_content) VALUES ('p-legacy', 'model', 'Merhaba');
    `);
}

try {
    runTest('migration 18 value sets match the code that writes these columns', () => {
        assert.deepEqual([...MIGRATION_18_VALUES.projectStatus].sort(), [...PERSISTED_PROJECT_STATUSES].sort());
        assert.deepEqual([...MIGRATION_18_VALUES.attemptStatus].sort(), Object.values(WORKFLOW_STATUS).sort());
        assert.deepEqual([...MIGRATION_18_VALUES.projectRole].sort(), ['editor', 'owner', 'viewer']);
        assert.deepEqual([...MIGRATION_18_VALUES.chatRole].sort(), ['model', 'user']);
    });

    runTest('legacy version-17 data migrates with ownership, provenance and immutability preserved', () => {
        const database = databaseAt(17);
        seedLegacyData(database);
        database.exec(`INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id)
            VALUES ('art', 'p-legacy', 'c-legacy', 'zip', 'a.zip', 'sha', 1, 'verified', 'run-worker');
            INSERT INTO completion_receipts (id, project_id, contract_id, contract_hash, artifact_id, artifact_hash, run_id, policy_version,
                mandatory_gate_digests, previous_revision, next_revision, completed_at, attempt_id)
            VALUES ('receipt', 'p-legacy', 'c-legacy', 'hash', 'art', 'sha', 'run-worker', '2.0', '{}', 1, 2, '2026-11-01', 'a-static');`);
        assert.equal(runMigrations(database), 1);
        assert.equal(version(database), 18);
        assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
        assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1, 'enforcement must be restored');
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('projects') WHERE name = 'owner_id'").get().count, 0);
        assert.deepEqual(database.prepare("SELECT user_id, role FROM project_owners WHERE project_id = 'p-legacy'").all().map(row => ({ ...row })),
            [{ user_id: 'u-owner', role: 'owner' }], 'legacy owner_id becomes a project_owners membership');
        assert.deepEqual(database.prepare('SELECT id, origin, run_id, attempt_id FROM repair_issues ORDER BY id').all().map(row => ({ ...row })), [
            { id: 'repair-static', origin: 'static_audit', run_id: null, attempt_id: 'a-static' },
            { id: 'repair-worker-a', origin: 'worker_rejection', run_id: 'run-worker', attempt_id: 'a-static' },
            { id: 'repair-worker-b', origin: 'verification_blocker', run_id: null, attempt_id: null }
        ]);
        for (const table of ['contract_elements', 'requirement_element_links']) {
            assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = ?").get(table).count, 0);
        }
        assert.throws(() => database.exec("DELETE FROM completion_receipts"), /completion receipts are immutable/);
        assert.throws(() => database.exec("UPDATE completion_receipts SET policy_version = 'x'"), /completion receipts are immutable/);
        database.close();
    });

    runTest('unknown repair provenance fails closed and leaves version 17 data untouched', () => {
        const database = databaseAt(17);
        seedLegacyData(database);
        database.exec(`INSERT INTO repair_issues (id, project_id, contract_id, run_id, fingerprint, severity, status)
            VALUES ('repair-mystery', 'p-legacy', 'c-legacy', 'not-a-run-or-attempt', 'fp', 'high', 'open')`);
        assert.throws(() => runMigrations(database), /unknown provenance: repair-mystery/);
        assert.equal(version(database), 17);
        assert.equal(database.prepare("SELECT owner_id FROM projects WHERE id = 'p-legacy'").get().owner_id, 'u-owner');
        assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'contract_elements'").get().count, 1);
        assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
        database.close();
    });

    runTest('values outside the canonical sets and non-empty unused tables stop the migration by name', () => {
        const badStatus = databaseAt(17);
        seedLegacyData(badStatus);
        badStatus.exec("UPDATE projects SET status = 'running' WHERE id = 'p-legacy'");
        assert.throws(() => runMigrations(badStatus), /projects\.status has values outside the canonical set: running/);
        assert.equal(version(badStatus), 17);
        badStatus.close();

        const usedTable = databaseAt(17);
        seedLegacyData(usedTable);
        usedTable.exec(`INSERT INTO contract_elements (id, contract_id, element_type, stable_key, spec_json)
            VALUES ('el', 'c-legacy', 'screen', 'k', '{}')`);
        assert.throws(() => runMigrations(usedTable), /contract_elements is not empty/);
        assert.equal(version(usedTable), 17);
        usedTable.close();
    });

    runTest('canonical schema rejects invalid states, roles, provenance and dangling links', () => {
        const database = databaseAt(18);
        database.exec(`
            INSERT INTO users (id, username, password_hash, is_admin) VALUES ('u-owner', 'canonical-db-owner', 'scrypt$x$y', 0);
            INSERT INTO projects (id, title, status) VALUES ('p-legacy', 'Canonical', 'paused');
            INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash)
                VALUES ('c-legacy', 'p-legacy', 1, 'approved', '{}', 'hash');
            INSERT INTO workflow_attempts (id, project_id, status, lease_owner) VALUES ('a-static', 'p-legacy', 'failed', 'owner');
            INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at)
                VALUES ('run-worker', 'p-legacy', 'c-legacy', 'failed', '2.0', '2026-11-01T00:00:00.000Z');
        `);
        const rejects = (sql, pattern) => assert.throws(() => database.exec(sql), pattern, sql);
        rejects("UPDATE projects SET status = 'running' WHERE id = 'p-legacy'", /CHECK constraint failed/);
        rejects("UPDATE project_contracts SET status = 'archived'", /CHECK constraint failed/);
        rejects("UPDATE workflow_attempts SET status = 'cancelled'", /CHECK constraint failed/);
        rejects("INSERT INTO chat_history (project_id, role, text_content) VALUES ('p-legacy', 'assistant', 'x')", /CHECK constraint failed/);
        rejects("INSERT INTO project_owners (project_id, user_id, role) VALUES ('p-legacy', 'u-owner', 'admin')", /CHECK constraint failed/);
        rejects(`INSERT INTO repair_issues (id, project_id, contract_id, fingerprint, severity, status, origin)
            VALUES ('r1', 'p-legacy', 'c-legacy', 'fp', 'critical', 'open', 'guess')`, /CHECK constraint failed/);
        rejects(`INSERT INTO repair_issues (id, project_id, contract_id, run_id, fingerprint, severity, status, origin)
            VALUES ('r2', 'p-legacy', 'c-legacy', 'run-worker', 'fp', 'critical', 'open', 'static_audit')`, /CHECK constraint failed/);
        rejects(`INSERT INTO repair_issues (id, project_id, contract_id, fingerprint, severity, status, origin)
            VALUES ('r3', 'p-legacy', 'c-legacy', 'fp', 'high', 'open', 'worker_rejection')`, /CHECK constraint failed/);
        rejects(`INSERT INTO repair_issues (id, project_id, contract_id, run_id, fingerprint, severity, status, origin)
            VALUES ('r4', 'p-legacy', 'c-legacy', 'missing-run', 'fp', 'high', 'open', 'worker_rejection')`, /FOREIGN KEY constraint failed/);
        rejects("INSERT INTO project_logs (project_id, message, attempt_id) VALUES ('p-legacy', 'x', 'missing-attempt')", /FOREIGN KEY constraint failed/);
        rejects(`INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, source_message_id)
            VALUES ('c2', 'p-legacy', 2, 'pending_approval', '{}', 'h', 999999)`, /FOREIGN KEY constraint failed/);

        // Provenance links survive their target only as NULL; project deletion order stays valid.
        database.exec("INSERT INTO project_logs (project_id, message, attempt_id) VALUES ('p-legacy', 'kept', 'a-static')");
        database.exec("DELETE FROM workflow_attempts WHERE id = 'a-static'");
        assert.equal(database.prepare("SELECT attempt_id FROM project_logs WHERE message = 'kept'").get().attempt_id, null);
        database.close();
    });

    await runAsyncTest('project authority comes only from project_owners and fails closed', async () => {
        const owner = createUser('canonical-owner', 'CanonicalOwner!2026');
        const project = await createProject({ title: 'Canonical Ownership', ownerUserId: owner.id });
        assert.equal(getProjectRole(owner.id, project.id), 'owner');
        assert.equal(getUserProjects(owner.id).find(row => row.id === project.id).ownerId, owner.id);
        db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(project.id);
        assert.equal(getProjectRole(owner.id, project.id), null, 'removing the membership row revokes authority');
        assert.throws(() => setProjectRole(project.id, owner.id, 'admin'), /Geçersiz proje rolü/);
        assert.equal(getProjectRole(owner.id, project.id), null, 'an invalid role is not silently downgraded to viewer');
        // createProject validates synchronously, before any promise exists.
        assert.throws(() => createProject({ title: 'Phantom Owner', ownerUserId: 'user-that-does-not-exist' }),
            /Proje sahibi olarak belirtilen kullanıcı bulunamadı/);
        const unowned = await createProject({ title: 'Unowned Project' });
        assert.equal(unowned.ownerId, null);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM project_owners WHERE project_id = ?').get(unowned.id).count, 0);
    });
} finally {
    finish();
    await fs.rm(tempRoot, { recursive: true, force: true });
}
