import assert from 'assert';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('project-action-chat-audit');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
const { db, getSchemaVersion } = await import('../db.js');
isolated.registerDatabase(db);
const { createProject, appendProjectActionMessages } = await import('../projectRepository.js');
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('action message append persists an ordered user/model pair once', async () => {
    const project = await createProject({ title: 'Action Audit Pair' });
    const result = appendProjectActionMessages(project.id, {
        actionId: 'approve-action-1',
        userText: '✅ Mimari planı onayladım. Uygulama üretimini başlat.',
        modelText: '🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.'
    });

    assert.strictEqual(result.inserted, true);
    assert.strictEqual(result.messages.length, 2);
    assert.deepStrictEqual(result.messages.map(message => message.role), ['user', 'model']);
    assert.deepStrictEqual(result.messages.map(message => Object.keys(message).sort()), [
        ['created_at', 'id', 'parts', 'role'],
        ['created_at', 'id', 'parts', 'role']
    ]);
    assert.deepStrictEqual(result.messages.map(message => message.parts[0].text), [
        '✅ Mimari planı onayladım. Uygulama üretimini başlat.',
        '🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.'
    ]);

    const duplicate = appendProjectActionMessages(project.id, {
        actionId: 'approve-action-1',
        userText: 'ignored duplicate',
        modelText: 'ignored duplicate'
    });
    assert.strictEqual(duplicate.inserted, false);
    assert.deepStrictEqual(duplicate.messages.map(message => message.parts[0].text), result.messages.map(message => message.parts[0].text));

    const rows = db.prepare('SELECT role, text_content, action_key FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL ORDER BY id').all(project.id);
    assert.deepStrictEqual(rows.map(row => row.role), ['user', 'model']);
    assert.deepStrictEqual(rows.map(row => row.action_key), ['approve-action-1:user', 'approve-action-1:model']);
});

await runAsyncTest('same action identity appends independently for different projects', async () => {
    const firstProject = await createProject({ title: 'Action Audit Project A' });
    const secondProject = await createProject({ title: 'Action Audit Project B' });
    const first = appendProjectActionMessages(firstProject.id, {
        actionId: 'shared-action-1',
        userText: 'project A user',
        modelText: 'project A model'
    });
    const second = appendProjectActionMessages(secondProject.id, {
        actionId: 'shared-action-1',
        userText: 'project B user',
        modelText: 'project B model'
    });

    assert.strictEqual(first.inserted, true);
    assert.strictEqual(second.inserted, true);
    const rows = db.prepare(`
        SELECT project_id, action_key
        FROM chat_history
        WHERE action_key IN ('shared-action-1:user', 'shared-action-1:model')
        ORDER BY id
    `).all().map(row => ({ project_id: row.project_id, action_key: row.action_key }));
    assert.deepStrictEqual(rows, [
        { project_id: firstProject.id, action_key: 'shared-action-1:user' },
        { project_id: firstProject.id, action_key: 'shared-action-1:model' },
        { project_id: secondProject.id, action_key: 'shared-action-1:user' },
        { project_id: secondProject.id, action_key: 'shared-action-1:model' }
    ]);
});

await runAsyncTest('action message append rejects invalid action identities', async () => {
    const project = await createProject({ title: 'Action Audit Validation' });
    for (const actionId of ['', '   ', null, 'x'.repeat(129)]) {
        assert.throws(
            () => appendProjectActionMessages(project.id, { actionId, userText: 'user', modelText: 'model' }),
            /actionId/i,
            `actionId ${JSON.stringify(actionId)} should be rejected`
        );
    }
});

await runAsyncTest('action message append returns existing rows when either key already exists', async () => {
    const project = await createProject({ title: 'Action Audit Partial Pair' });
    const createdAt = '2026-09-19T12:00:00.000Z';
    db.prepare('INSERT INTO chat_history (project_id, role, text_content, action_key, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(project.id, 'user', 'already persisted', 'partial-action:user', createdAt);

    const result = appendProjectActionMessages(project.id, {
        actionId: 'partial-action',
        userText: 'ignored',
        modelText: 'ignored',
        createdAt: '2026-09-19T12:01:00.000Z'
    });

    assert.strictEqual(result.inserted, false);
    assert.strictEqual(result.messages.length, 1);
    assert.deepStrictEqual(result.messages[0], {
        id: result.messages[0].id,
        role: 'user',
        parts: [{ text: 'already persisted' }],
        created_at: createdAt
    });
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count, 1);
});

await runAsyncTest('action message append rolls back the user row when the model insert fails', async () => {
    const project = await createProject({ title: 'Action Audit Atomicity' });
    db.exec(`
        CREATE TRIGGER fail_action_audit_model_insert
        BEFORE INSERT ON chat_history
        WHEN NEW.action_key LIKE '%:model'
        BEGIN
            SELECT RAISE(ABORT, 'model insert blocked');
        END;
    `);

    assert.throws(() => appendProjectActionMessages(project.id, {
        actionId: 'atomic-action',
        userText: 'user should roll back',
        modelText: 'model should fail'
    }), /model insert blocked/);
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count,
        0
    );
});

assert.strictEqual(getSchemaVersion(), 14);
finish();
await isolated.cleanup();
