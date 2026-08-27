/**
 * Sub-project 5.1: Database Versioning, Migrations & Integrity
 * Test Suite
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import {
    db,
    runMigrations,
    getSchemaVersion,
    checkpointWAL,
    saveProjectLog
} from '../db.js';
import { createProject, deleteProject, getProjectDir } from '../projectRepository.js';

let testProjectId = null;

async function setup() {
    const project = await createProject({
        title: 'DB Migration Test Project',
        description: 'Testing migrations and cascade integrity'
    });
    testProjectId = project.id;
}

async function teardown() {
    if (testProjectId) {
        try {
            await deleteProject(testProjectId);
        } catch {}
    }
}

async function runTests() {
    console.log('==================================================');
    console.log('⚡ Sub-project 5.1: Database Migrations & Integrity');
    console.log('==================================================');

    let passed = 0;
    let failed = 0;

    await setup();

    try {
        // Test 1: Schema migrations table and version tracking
        try {
            const version = getSchemaVersion();
            assert(typeof version === 'number' && version >= 1, `Schema version should be >= 1, got ${version}`);

            const migrations = db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC').all();
            assert(Array.isArray(migrations) && migrations.length >= 1, 'Should have applied migration records');
            assert(migrations[0].name, 'Migration record must have a name');
            assert(migrations[0].applied_at, 'Migration record must have applied_at timestamp');

            console.log(`  [PASS] 1. Versioned schema tracking (current version: ${version}, migrations: ${migrations.length})`);
            passed++;
        } catch (err) {
            console.log('  [FAIL] 1. Versioned schema tracking:', err.message);
            failed++;
        }

        // Test 2: Migration idempotency
        try {
            const initialVersion = getSchemaVersion();
            const appliedCount = runMigrations();
            const nextVersion = getSchemaVersion();

            assert.strictEqual(appliedCount, 0, 'Re-running migrations on up-to-date DB should apply 0 migrations');
            assert.strictEqual(nextVersion, initialVersion, 'Schema version should not change on re-run');

            console.log('  [PASS] 2. Migration idempotency on existing database');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 2. Migration idempotency:', err.message);
            failed++;
        }

        // Test 3: Foreign key enforcement and cascade integrity
        try {
            // Save logs and chat
            saveProjectLog({
                projectId: testProjectId,
                agent: 'Tester',
                action: 'write',
                file: 'test.js',
                message: 'Testing cascade delete',
                node_id: 'test-node'
            });

            const initialLogs = db.prepare('SELECT COUNT(*) as cnt FROM project_logs WHERE project_id = ?').get(testProjectId);
            assert(initialLogs.cnt >= 1, 'Log should be inserted for project');

            const initialChats = db.prepare('SELECT COUNT(*) as cnt FROM chat_history WHERE project_id = ?').get(testProjectId);
            assert(initialChats.cnt >= 1, 'Chat should exist for project');

            // Delete project from database directly to test SQLite foreign key CASCADE
            db.prepare('DELETE FROM projects WHERE id = ?').run(testProjectId);

            const remainingLogs = db.prepare('SELECT COUNT(*) as cnt FROM project_logs WHERE project_id = ?').get(testProjectId);
            assert.strictEqual(remainingLogs.cnt, 0, 'Foreign key cascade should delete associated project_logs');

            const remainingChats = db.prepare('SELECT COUNT(*) as cnt FROM chat_history WHERE project_id = ?').get(testProjectId);
            assert.strictEqual(remainingChats.cnt, 0, 'Foreign key cascade should delete associated chat_history');

            const remainingOwners = db.prepare('SELECT COUNT(*) as cnt FROM project_owners WHERE project_id = ?').get(testProjectId);
            assert.strictEqual(remainingOwners.cnt, 0, 'Foreign key cascade should delete associated project_owners');

            testProjectId = null; // Already deleted
            console.log('  [PASS] 3. SQLite foreign key cascade deletion across related tables');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 3. Foreign key cascade deletion:', err.message);
            failed++;
        }

        // Test 4: WAL checkpointing and database maintenance
        try {
            const checkpointRes = checkpointWAL();
            assert(typeof checkpointRes === 'object', 'Checkpoint result should be an object');
            assert(checkpointRes.success === true, 'Checkpoint should execute successfully');

            console.log('  [PASS] 4. SQLite WAL checkpointing and maintenance');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 4. SQLite WAL checkpointing:', err.message);
            failed++;
        }

    } finally {
        await teardown();
    }

    console.log('==================================================');
    console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı`);
    console.log('==================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
