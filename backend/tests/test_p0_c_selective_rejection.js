import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-c-selective');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const {
    saveCheckpoint,
    getLatestCheckpoint
} = await import('../engine/checkpointRepository.js');

const {
    invalidateCheckpointsByRequirements,
    invalidateDownstreamCheckpoints
} = await import('../engine/checkpointRepository.js');

const { invalidateProjectCheckpoints } = await import('../contracts/projectContract.js');

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-sel-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. Selective rejection should invalidate requirement-linked tasks and cascade downstream in DAG', async () => {
        const projectId = 'proj-sel-dag';
        const contractId = 'contract-sel-1';

        // Setup DB project and contract
        db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Selective DAG Test', 'implementing')").run(projectId);
        db.prepare(`
            INSERT INTO project_contracts (
                id, project_id, revision, status, contract_json, contract_hash
            ) VALUES (?, ?, 1, 'approved', '{}', 'hash-sel-1')
        `).run(contractId, projectId);

        const allTasks = [
            { id: 'task-a', name: 'Task A', targetFiles: ['src/a.js'], dependencies: [], requirementIds: ['REQ-1'] },
            { id: 'task-b', name: 'Task B', targetFiles: ['src/b.js'], dependencies: [], requirementIds: ['REQ-2'] },
            { id: 'task-c', name: 'Task C', targetFiles: ['src/c.js'], dependencies: ['task-a', 'task-b'], requirementIds: ['REQ-3'] }
        ];

        // Save completed checkpoints for all 3 tasks
        for (const task of allTasks) {
            saveCheckpoint({
                projectId,
                taskId: task.id,
                contractId,
                planHash: 'hash-sel-1',
                taskSpecHash: `spec-${task.id}`,
                inputHash: `in-${task.id}`,
                outputHash: `out-${task.id}`,
                gateVersion: '1.0.0',
                status: 'completed',
                requirementIds: task.requirementIds
            });
        }

        // Verify initial state: all completed
        assert.strictEqual(getLatestCheckpoint(projectId, 'task-a').status, 'completed');
        assert.strictEqual(getLatestCheckpoint(projectId, 'task-b').status, 'completed');
        assert.strictEqual(getLatestCheckpoint(projectId, 'task-c').status, 'completed');

        // Selectively invalidate requirement REQ-2 (Task B)
        const invalidatedTaskIds = invalidateCheckpointsByRequirements(projectId, ['REQ-2'], allTasks, 'Requirement REQ-2 verification failed');

        assert.ok(invalidatedTaskIds.includes('task-b'));
        assert.ok(invalidatedTaskIds.includes('task-c'));
        assert.ok(!invalidatedTaskIds.includes('task-a'));

        // Verify database state: Task B and Task C invalidated, Task A still completed
        const cpA = getLatestCheckpoint(projectId, 'task-a');
        const cpB = getLatestCheckpoint(projectId, 'task-b');
        const cpC = getLatestCheckpoint(projectId, 'task-c');

        assert.strictEqual(cpA.status, 'completed');
        assert.strictEqual(cpA.invalidated_at, null);

        assert.strictEqual(cpB.status, 'invalidated');
        assert.ok(cpB.invalidated_at !== null);
        assert.ok(cpB.invalidation_reason.includes('REQ-2'));

        assert.strictEqual(cpC.status, 'invalidated');
        assert.ok(cpC.invalidated_at !== null);
        assert.ok(cpC.invalidation_reason.includes('Cascading dependency'));

        db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    });

    await runAsyncTest('2. Coarse invalidation fallback should invalidate all project checkpoints on contract change', async () => {
        const projectId = 'proj-coarse-fallback';
        const contractId = 'contract-coarse-1';

        db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Coarse Test', 'implementing')").run(projectId);
        db.prepare(`
            INSERT INTO project_contracts (
                id, project_id, revision, status, contract_json, contract_hash
            ) VALUES (?, ?, 1, 'approved', '{}', 'hash-c-1')
        `).run(contractId, projectId);

        saveCheckpoint({
            projectId,
            taskId: 'task-1',
            contractId,
            planHash: 'hash-c-1',
            taskSpecHash: 'spec-1',
            inputHash: 'in-1',
            outputHash: 'out-1',
            gateVersion: '1.0.0',
            status: 'completed'
        });

        saveCheckpoint({
            projectId,
            taskId: 'task-2',
            contractId,
            planHash: 'hash-c-1',
            taskSpecHash: 'spec-2',
            inputHash: 'in-2',
            outputHash: 'out-2',
            gateVersion: '1.0.0',
            status: 'completed'
        });

        // Trigger P0-A coarse invalidation
        invalidateProjectCheckpoints(projectId);

        const cp1 = getLatestCheckpoint(projectId, 'task-1');
        const cp2 = getLatestCheckpoint(projectId, 'task-2');

        assert.ok(cp1.invalidated_at !== null);
        assert.ok(cp2.invalidated_at !== null);

        db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    });

    finish();
} finally {
    await isolated.cleanup();
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
