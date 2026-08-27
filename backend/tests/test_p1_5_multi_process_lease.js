import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: İki ayrı process/worker'ın aynı projeye eşzamanlı lease alma denemesi
// =========================================================================
await runAsyncTest('1. acquireWorkflowLease eşzamanlı çağrılarda yalnızca 1 process/worker\'a lease vermelidir', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');

    const project = await createProject({ title: 'Concurrent Lease Test' });

    // İki eşzamanlı lease alma denemesi
    const lease1 = acquireWorkflowLease(project.id, 'worker-process-1');
    const lease2 = acquireWorkflowLease(project.id, 'worker-process-2');

    const acquiredCount = (lease1.acquired ? 1 : 0) + (lease2.acquired ? 1 : 0);
    assert.strictEqual(acquiredCount, 1, 'Yalnızca bir process lease alabilmelidir.');

    const activeAttemptId = lease1.acquired ? lease1.attempt.id : lease2.attempt.id;
    releaseWorkflowLease(activeAttemptId, 'completed');

    await deleteProject(project.id);
});

// =========================================================================
// TEST 2: Proje başına tek running attempt sağlayan DB unique constraint
// =========================================================================
await runAsyncTest('2. Veritabanı seviyesinde aynı proje için iki running attempt engellenmelidir', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'DB Constraint Lease Test' });
    const nowIso = new Date().toISOString();

    db.prepare(`
        INSERT INTO workflow_attempts (id, project_id, status, lease_owner, started_at, heartbeat_at)
        VALUES (?, ?, 'running', 'owner-1', ?, ?)
    `).run(`attempt-unique-1-${Date.now()}`, project.id, nowIso, nowIso);
    // İkinci insert partial unique index (idx_workflow_attempts_running_unique) nedeniyle hata vermelidir
    assert.throws(
        () => {
            db.prepare(`
                INSERT INTO workflow_attempts (id, project_id, status, lease_owner, started_at, heartbeat_at)
                VALUES (?, ?, 'running', 'owner-2', ?, ?)
            `).run(`attempt-unique-2-${Date.now()}`, project.id, nowIso, nowIso);
        },
        /UNIQUE constraint failed/i,
        'Aynı proje için ikinci running attempt veritabanı kısıtı ile reddedilmelidir.'
    );

    await deleteProject(project.id);
});

// =========================================================================
// TEST 3: Heartbeat update'in lease owner ve attempt kimliğiyle doğrulanması
// =========================================================================
await runAsyncTest('3. updateAttemptHeartbeat lease owner ve attempt id doğrulaması yapmalıdır', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, updateAttemptHeartbeat, releaseWorkflowLease } = await import('../workflowAttempts.js');

    const project = await createProject({ title: 'Heartbeat Identity Test' });
    const lease = acquireWorkflowLease(project.id, 'legitimate-owner');
    assert.strictEqual(lease.acquired, true);

    // Doğru owner ile heartbeat
    const success = updateAttemptHeartbeat(lease.attempt.id, 'legitimate-owner');
    assert.strictEqual(success, true);

    // Yanlış owner ile heartbeat başarısız olmalı
    const failed = updateAttemptHeartbeat(lease.attempt.id, 'imposter-owner');
    assert.strictEqual(failed, false);

    releaseWorkflowLease(lease.attempt.id, 'completed');
    await deleteProject(project.id);
});

// =========================================================================
// TEST 4: Heartbeat DB hatasının process crash yerine kontrollü false dönmesi
// =========================================================================
await runAsyncTest('4. updateAttemptHeartbeat geçersiz parametre veya DB hatasında process crash oluşturmamalıdır', async () => {
    const { updateAttemptHeartbeat } = await import('../workflowAttempts.js');

    assert.strictEqual(updateAttemptHeartbeat(null), false);
    assert.strictEqual(updateAttemptHeartbeat(undefined), false);
    assert.strictEqual(updateAttemptHeartbeat('non-existent-attempt-id'), false);
});

finish();
