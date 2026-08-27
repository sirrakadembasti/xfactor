import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Immediate approve -> pause race condition
// =========================================================================
await runAsyncTest('1. Immediate approve->pause race: abortProjectExecution should abort lease cleanly', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, getActiveWorkflowAttempt } = await import('../workflowAttempts.js');
    const { registerProjectAbortController, abortProjectExecution } = await import('../engine/cancellation.js');
    const { executeProjectTasks } = await import('../engine/workflow.js');

    const project = await createProject({ title: 'Race Approve Pause Project' });
    const lease = acquireWorkflowLease(project.id, 'test-race-worker');
    assert.strictEqual(lease.acquired, true);

    const controller = new AbortController();
    registerProjectAbortController(project.id, controller);

    // Simulate instant pause right after approve
    abortProjectExecution(project.id, 'PAUSED');
    assert.strictEqual(controller.signal.aborted, true);
    assert.strictEqual(controller.signal.reason, 'PAUSED');

    // Run executeProjectTasks; it should quickly exit with paused status
    await executeProjectTasks(project.id, null, lease.attempt.id);

    const activeAttempt = getActiveWorkflowAttempt(project.id);
    assert.strictEqual(activeAttempt, null, 'Attempt should be released after execution terminates');

    await deleteProject(project.id);
});

// =========================================================================
// TEST 2: Worker checkPause waiting resume
// =========================================================================
await runAsyncTest('2. checkPause should resolve when state changes from paused to running, and honor abort', async () => {
    const { checkPause } = await import('../engine/workflow.js');
    const { createProject, saveProjectState, deleteProject } = await import('../projectRepository.js');

    const project = await createProject({ title: 'CheckPause Resume Test' });
    project.status = 'paused';
    await saveProjectState(project.id, project);

    const controller = new AbortController();

    // checkPause should wait until state change or abort
    const checkPromise = checkPause(project.id, controller.signal);

    setTimeout(async () => {
        project.status = 'running';
        await saveProjectState(project.id, project);
    }, 50);

    const statusAfterResume = await checkPromise;
    assert.strictEqual(statusAfterResume, 'running');

    // Test abort while waiting
    project.status = 'paused';
    await saveProjectState(project.id, project);

    const abortController = new AbortController();
    const abortPromise = checkPause(project.id, abortController.signal);

    setTimeout(() => {
        abortController.abort('USER_CANCELLED');
    }, 50);

    const statusAfterAbort = await abortPromise;
    assert.strictEqual(statusAfterAbort, 'paused');

    await deleteProject(project.id);
});

// =========================================================================
// TEST 3: Paused worker heartbeat and lease release
// =========================================================================
await runAsyncTest('3. Paused worker lease release should record paused/terminal status in DB', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Lease Release Test Project' });
    const lease = acquireWorkflowLease(project.id, 'test-paused-worker');
    assert.strictEqual(lease.acquired, true);

    const released = releaseWorkflowLease(lease.attempt.id, 'paused');
    assert.strictEqual(released, true);

    const attemptRow = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(attemptRow.status, 'paused');
    assert.ok(attemptRow.ended_at !== null);

    await deleteProject(project.id);
});

// =========================================================================
// TEST 4: Resume acquiring new lease after pause
// =========================================================================
await runAsyncTest('4. Resume after pause should acquire new lease and not deadlock', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');

    const project = await createProject({ title: 'Resume Lease Test Project' });
    const lease1 = acquireWorkflowLease(project.id, 'worker-1');
    assert.strictEqual(lease1.acquired, true);

    // Pause worker 1
    releaseWorkflowLease(lease1.attempt.id, 'paused');

    // Worker 2 (resume) acquires lease
    const lease2 = acquireWorkflowLease(project.id, 'worker-2');
    assert.strictEqual(lease2.acquired, true);
    assert.notStrictEqual(lease1.attempt.id, lease2.attempt.id);

    releaseWorkflowLease(lease2.attempt.id, 'completed');
    await deleteProject(project.id);
});

// =========================================================================
// TEST 5: Stale running attempts transition to terminal state
// =========================================================================
await runAsyncTest('5. reconcileStaleWorkflowAttempts should transition dead running attempts', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, reconcileStaleWorkflowAttempts } = await import('../workflowAttempts.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Stale Attempt Test Project' });
    const lease = acquireWorkflowLease(project.id, 'stale-worker');
    assert.strictEqual(lease.acquired, true);

    // Set heartbeat back in time
    const oldTime = new Date(Date.now() - 60000).toISOString();
    db.prepare("UPDATE workflow_attempts SET heartbeat_at = ? WHERE id = ?").run(oldTime, lease.attempt.id);
    db.prepare("UPDATE projects SET status = 'running' WHERE id = ?").run(project.id);

    const reconciled = reconcileStaleWorkflowAttempts({ staleThresholdSeconds: 10 });
    assert.ok(reconciled.reconciledCount >= 1);
    assert.ok(reconciled.recoveredProjectIds.includes(project.id));

    const attemptRow = db.prepare('SELECT status FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(attemptRow.status, 'stale_terminated');

    const projectRow = db.prepare('SELECT status FROM projects WHERE id = ?').get(project.id);
    assert.strictEqual(projectRow.status, 'paused');

    await deleteProject(project.id);
});

finish();
