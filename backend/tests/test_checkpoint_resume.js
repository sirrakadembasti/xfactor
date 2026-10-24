import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestHarness } from './testHarness.js';

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-checkpoint-resume-'));
process.env.DB_PATH = path.join(workspace, 'test.db');
const database = await import('../db.js');
database.initializeDatabase({ path: process.env.DB_PATH });
const { db, closeDatabase } = database;
const { saveCheckpoint, getLatestCheckpoint, invalidateCheckpoint } = await import('../engine/checkpointRepository.js');
const { isTaskCheckpointValid } = await import('../engine/fileProtocol.js');
const { computeTaskSpecHash, computeInputHash, computeOutputHash } = await import('../engine/checkpointHelper.js');
const { runAsyncTest, finish } = createTestHarness();

try {
    db.prepare("INSERT INTO projects (id, title, status) VALUES ('resume', 'Resume', 'paused')").run();
    db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash) VALUES ('contract', 'resume', 1, 'approved', '{}', 'plan')").run();
    const task = { id: 'schema', title: 'Schema', description: 'Create schema', targetFiles: ['schema.prisma'], dependencies: [], requirementIds: ['REQ-1'] };
    await fs.writeFile(path.join(workspace, 'schema.prisma'), 'model User { id Int @id }');
    const checkpoint = {
        projectId: 'resume', taskId: task.id, contractId: 'contract', planHash: 'plan',
        taskSpecHash: computeTaskSpecHash(task), inputHash: await computeInputHash(workspace, []),
        outputHash: await computeOutputHash(workspace, task.targetFiles), requirementIds: task.requirementIds,
        gateVersion: '1.0.0', createdAt: '2026-10-19T00:00:00.000Z'
    };
    const options = { contractId: 'contract', planHash: 'plan' };
    saveCheckpoint(checkpoint);

    await runAsyncTest('fresh Reviewer approval can renew an invalidated identical checkpoint', async () => {
        invalidateCheckpoint(checkpoint, 'Reviewer revalidation required');
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, options), false);
        // This call represents a NEW successful Coder/Reviewer run, never a resume shortcut.
        saveCheckpoint({ ...checkpoint, refreshReviewed: true, createdAt: '2026-10-19T00:01:00.000Z' });
        const stored = getLatestCheckpoint('resume', task.id);
        assert.equal(stored.status, 'completed');
        assert.equal(stored.invalidated_at, null);
        assert.equal(stored.invalidation_reason, null);
        assert.deepEqual(JSON.parse(stored.requirement_ids), ['REQ-1']);
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, options), true);
    });

    await runAsyncTest('repeated unchanged resumes do not enter Coder/Reviewer execution', async () => {
        let coderCalls = 0;
        let reviewerCalls = 0;
        for (let resume = 0; resume < 4; resume++) {
            if (!await isTaskCheckpointValid(workspace, 'resume', task, options)) {
                coderCalls++;
                reviewerCalls++;
            }
        }
        assert.equal(coderCalls, 0);
        assert.equal(reviewerCalls, 0);
    });

    await runAsyncTest('changed task scope, contract, dependency or output cannot reuse a checkpoint', async () => {
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', { ...task, description: 'Create a different schema' }, options), false);
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, { ...options, contractId: 'other' }), false);
        await fs.writeFile(path.join(workspace, 'dependency.js'), 'changed input');
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, { ...options, dependencyTargetFiles: ['dependency.js'] }), false);
        await fs.writeFile(path.join(workspace, 'schema.prisma'), 'changed output');
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, options), false);
        await fs.writeFile(path.join(workspace, 'schema.prisma'), 'model User { id Int @id }');
    });

    await runAsyncTest('manual invalidation is not bypassed by resume or acceptance retry', async () => {
        invalidateCheckpoint(checkpoint, 'manual rejection');
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, options), false);
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, { ...options, allowAcceptanceRetry: true }), false);
    });

    await runAsyncTest('stale workflow cannot renew evidence and strict inserts remain strict', async () => {
        assert.throws(() => saveCheckpoint({ ...checkpoint, refreshReviewed: true, attemptId: 'stale-attempt', leaseOwner: 'stale-owner' }), error => error.code === 'WORKFLOW_LEASE_FENCED');
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, options), false);
        assert.throws(() => saveCheckpoint(checkpoint), /UNIQUE constraint failed/);
        assert.throws(() => saveCheckpoint({ ...checkpoint, refreshReviewed: true, status: 'invalidated' }), /newly reviewed completed/);
    });
    await runAsyncTest('legacy reuse needs complete unique ownership and never rewrites or revives old evidence', async () => {
        const { workflowCheckpointInventory } = await import('../engine/checkpointIdentity.js');
        saveCheckpoint({ ...checkpoint, refreshReviewed: true });
        const before = db.prepare('SELECT * FROM task_checkpoints WHERE project_id=?').all('resume');
        const inventoryInput = { contractId: 'contract', domains: [{ prefix: 'core' }],
            directorSpecs: { core: { teamleaders: [{ prefix: 'a' }, { prefix: 'b' }] } },
            teamleaderPlans: { 'core.a': { tasks: [task] }, 'core.b': { tasks: [{ ...task, description: 'Different task content' }] } } };
        const scoped = { ...options, teamleaderId: 'core.a', ownershipInventory: workflowCheckpointInventory(inventoryInput) };
        assert.equal(scoped.ownershipInventory.complete, true);
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, scoped), true, 'same ID with distinct specs is safely attributable');
        const incomplete = structuredClone(inventoryInput);
        delete incomplete.teamleaderPlans['core.b'];
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, { ...scoped,
            ownershipInventory: workflowCheckpointInventory(incomplete) }), false, 'not-yet-planned team must prevent legacy reuse');
        const ambiguous = structuredClone(inventoryInput);
        ambiguous.teamleaderPlans['core.b'].tasks = [task];
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, { ...scoped,
            ownershipInventory: workflowCheckpointInventory(ambiguous) }), false);
        assert.deepEqual(db.prepare('SELECT * FROM task_checkpoints WHERE project_id=?').all('resume'), before);
        const qualified = { ...checkpoint, teamleaderId: 'core.a', createdAt: '2999-01-01' };
        saveCheckpoint(qualified);
        invalidateCheckpoint(qualified, 'Rejected qualified execution');
        assert.equal(await isTaskCheckpointValid(workspace, 'resume', task, scoped), false, 'qualified rejection cannot fall back to legacy success');
        const { invalidateDownstreamCheckpoints } = await import('../engine/checkpointRepository.js');
        const mutationBefore = db.prepare('SELECT * FROM task_checkpoints WHERE project_id=?').all('resume');
        assert.throws(() => invalidateDownstreamCheckpoints('resume', [task.id], [task], 'Ambiguous',
            { ...scoped, ownershipInventory: workflowCheckpointInventory(ambiguous) }), { code: 'CHECKPOINT_OWNERSHIP_AMBIGUOUS' });
        assert.deepEqual(db.prepare('SELECT * FROM task_checkpoints WHERE project_id=?').all('resume'), mutationBefore);
    });
    await runAsyncTest('checkpoint storage outage stops execution instead of treating every task as new', async () => {
        // Production scope must preserve the same fail-closed boundary.
        closeDatabase();
        await assert.rejects(isTaskCheckpointValid(workspace, 'resume', task, options), error => error.code === 'CHECKPOINT_READ_FAILED');
        await assert.rejects(isTaskCheckpointValid(workspace, 'resume', task, { ...options, teamleaderId: 'core.lead' }),
            error => error.code === 'CHECKPOINT_READ_FAILED');
    });
    finish();
} finally {
    closeDatabase();
    await fs.rm(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
