import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-c-checkpoints');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. task_checkpoints table should have correct columns and composite primary key', async () => {
    const tableInfo = db.prepare('PRAGMA table_info(task_checkpoints)').all();
    const columnNames = tableInfo.map(c => c.name);

    const requiredColumns = [
        'project_id', 'task_id', 'contract_id', 'plan_hash', 'task_spec_hash',
        'input_hash', 'output_hash', 'gate_version', 'status', 'requirement_ids',
        'created_at', 'invalidated_at', 'invalidation_reason'
    ];

    for (const col of requiredColumns) {
        assert.ok(columnNames.includes(col), `Column ${col} is missing from task_checkpoints`);
    }

    const pkColumns = tableInfo.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
    assert.deepStrictEqual(pkColumns, [
        'project_id', 'task_id', 'contract_id', 'plan_hash', 'task_spec_hash',
        'input_hash', 'output_hash', 'gate_version'
    ]);

    const { saveCheckpoint, getCheckpoint, deleteCheckpoint } = await import('../engine/checkpointRepository.js');

    // Create project and contract fixtures
    db.prepare("INSERT INTO projects (id, title, status) VALUES ('cp-proj-1', 'CP Project', 'planning')").run();
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES ('cp-contract-1', 'cp-proj-1', 1, 'approved', '{}', 'hash-1')
    `).run();

    const sampleCheckpoint = {
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0',
        status: 'completed',
        requirementIds: ['REQ-1', 'REQ-2'],
        revision: 1
    };

    saveCheckpoint(sampleCheckpoint);

    const retrieved = getCheckpoint({
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0'
    });

    assert.ok(retrieved);
    assert.strictEqual(retrieved.status, 'completed');
    assert.deepStrictEqual(JSON.parse(retrieved.requirement_ids), ['REQ-1', 'REQ-2']);

    // Primary key constraint violation on duplicate insert
    assert.throws(() => {
        saveCheckpoint({
            ...sampleCheckpoint,
            status: 'invalidated'
        });
    }, /UNIQUE constraint failed|PRIMARY KEY/i);

    // Delete checkpoint
    deleteCheckpoint({
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0'
    });

    const afterDelete = getCheckpoint({
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0'
    });

    assert.strictEqual(afterDelete, null);

    db.prepare("DELETE FROM projects WHERE id = 'cp-proj-1'").run();
});

finish();
await isolated.cleanup();
