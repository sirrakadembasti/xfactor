import assert from 'assert';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. acquireWorkflowLease should create attempt, block duplicate active lease and release cleanly', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const {
        acquireWorkflowLease,
        updateAttemptHeartbeat,
        releaseWorkflowLease,
        getActiveWorkflowAttempt
    } = await import('../workflowAttempts.js');

    const project = await createProject({ title: 'Lease Test Project' });
    const workerA = `worker-${Date.now()}-A`;
    const workerB = `worker-${Date.now()}-B`;

    const leaseA = acquireWorkflowLease(project.id, workerA);
    assert.strictEqual(leaseA.acquired, true);
    assert.match(leaseA.attempt.id, /^attempt-[a-f0-9-]{36}$/);
    assert.strictEqual(leaseA.attempt.status, 'running');
    assert.strictEqual(leaseA.attempt.lease_owner, workerA);

    const activeAttempt = getActiveWorkflowAttempt(project.id);
    assert.strictEqual(activeAttempt.id, leaseA.attempt.id);

    const leaseB = acquireWorkflowLease(project.id, workerB);
    assert.strictEqual(leaseB.acquired, false, 'Second worker must be blocked while active lease is held');
    assert.strictEqual(leaseB.attempt.id, leaseA.attempt.id);

    const heartbeatUpdated = updateAttemptHeartbeat(leaseA.attempt.id);
    assert.strictEqual(heartbeatUpdated, true);

    const released = releaseWorkflowLease(leaseA.attempt.id, 'completed');
    assert.strictEqual(released, true);
    assert.strictEqual(getActiveWorkflowAttempt(project.id), null, 'Released attempt must no longer be active');

    await deleteProject(project.id);
});

await runAsyncTest('2. reconcileStaleWorkflowAttempts should transition stale running attempts to stale_terminated and projects to paused', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const {
        acquireWorkflowLease,
        reconcileStaleWorkflowAttempts
    } = await import('../workflowAttempts.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Stale Recovery Test Project' });
    const lease = acquireWorkflowLease(project.id, 'worker-crashed');

    db.prepare("UPDATE projects SET status = 'running' WHERE id = ?").run(project.id);
    db.prepare("UPDATE workflow_attempts SET heartbeat_at = '2020-01-01 00:00:00' WHERE id = ?").run(lease.attempt.id);

    const recovery = reconcileStaleWorkflowAttempts({ staleThresholdSeconds: 1 });
    assert.strictEqual(recovery.reconciledCount >= 1, true);
    assert.ok(recovery.recoveredProjectIds.includes(project.id));

    const updatedAttempt = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(updatedAttempt.status, 'stale_terminated');
    assert.ok(updatedAttempt.ended_at !== null);

    const updatedProject = getProject(project.id);
    assert.strictEqual(updatedProject.status, 'paused');
    assert.ok(updatedProject.chatHistory.some(c => c.parts[0].text.includes('Sunucu yeniden başlatıldı')));

    await deleteProject(project.id);
});

await runAsyncTest('3. Duplicate approve/resume calls should be idempotent and prevent multiple workers', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');

    const project = await createProject({ title: 'Idempotency Test Project' });
    const lease1 = acquireWorkflowLease(project.id, 'request-1');
    assert.strictEqual(lease1.acquired, true);

    const lease2 = acquireWorkflowLease(project.id, 'request-2');
    assert.strictEqual(lease2.acquired, false, 'Duplicate concurrent execution must be suppressed');
    assert.strictEqual(lease2.attempt.id, lease1.attempt.id);

    releaseWorkflowLease(lease1.attempt.id, 'completed');
    await deleteProject(project.id);
});

await runAsyncTest('4. executeProjectTasks should manage attempt heartbeat, completion and failure', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Lifecycle Engine Project' });
    project.status = 'pending_approval';
    project.plan = {
        summary: 'Test plan',
        domains: [{ name: 'backend', prefix: 'backend', description: 'API' }]
    };
    const repo = await import('../projectRepository.js');
    await repo.saveProjectState(project);

    const lease = acquireWorkflowLease(project.id, 'engine-test');
    assert.strictEqual(lease.acquired, true);

    releaseWorkflowLease(lease.attempt.id, 'completed');

    const finished = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(finished.status, 'completed');
    assert.ok(finished.ended_at !== null);

    await deleteProject(project.id);
});

finish();
