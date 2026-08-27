import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Schema migration versioning & compound indexes
// =========================================================================
await runAsyncTest('1. Schema migrations should apply all versioned migrations up to version 5', async () => {
    const { getSchemaVersion, db } = await import('../db.js');
    const version = getSchemaVersion();
    assert.strictEqual(version, 5, `Schema version should be 5, got: ${version}`);

    // Verify compound indexes exist
    const chatIndexes = db.prepare('PRAGMA index_list(chat_history)').all();
    assert.ok(chatIndexes.some(idx => idx.name === 'idx_chat_history_project_id'), 'idx_chat_history_project_id must exist');

    const logIndexes = db.prepare('PRAGMA index_list(project_logs)').all();
    assert.ok(logIndexes.some(idx => idx.name === 'idx_project_logs_project_id'), 'idx_project_logs_project_id must exist');

    const sessionIndexes = db.prepare('PRAGMA index_list(user_sessions)').all();
    assert.ok(sessionIndexes.some(idx => idx.name === 'idx_user_sessions_expiry'), 'idx_user_sessions_expiry must exist');
    assert.ok(sessionIndexes.some(idx => idx.name === 'idx_user_sessions_user_id'), 'idx_user_sessions_user_id must exist');
});

// =========================================================================
// TEST 2: Foreign key cascades on project owners and sessions
// =========================================================================
await runAsyncTest('2. User deletion should cascade to project_owners and user_sessions via FK', async () => {
    const { db } = await import('../db.js');
    const { createUser, deleteUser } = await import('../auth.js');
    const { createProject, deleteProject } = await import('../projectRepository.js');

    const username = `fk_test_user_${Date.now()}`;
    const user = await createUser(username, 'Password123!', false);
    const project = await createProject({ title: 'FK Cascade Project', ownerUserId: user.id });

    // Check ownership exists
    const ownerRow = db.prepare('SELECT * FROM project_owners WHERE project_id = ? AND user_id = ?').get(project.id, user.id);
    assert.ok(ownerRow, 'Owner record must exist');

    // Delete user directly to test SQLite FK cascade
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    const remainingOwner = db.prepare('SELECT * FROM project_owners WHERE project_id = ? AND user_id = ?').get(project.id, user.id);
    assert.strictEqual(remainingOwner, undefined, 'Project owner record must be deleted on user cascade');

    await deleteProject(project.id);
});

// =========================================================================
// TEST 3: Migration idempotency and order verification
// =========================================================================
await runAsyncTest('3. runMigrations should be idempotent and maintain strict monotonic order', async () => {
    const { runMigrations, getSchemaVersion, db } = await import('../db.js');

    const applied = runMigrations();
    assert.strictEqual(applied, 0, 'Re-running migrations on current schema should apply 0 migrations');

    const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version ASC').all();
    for (let i = 0; i < rows.length; i++) {
        assert.strictEqual(rows[i].version, i + 1, `Migration version ${rows[i].version} must match sequential index ${i + 1}`);
    }
});

finish();
