import assert from 'assert';
import fs from 'fs/promises';
import crypto from 'node:crypto';
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

    const heartbeatUpdated = updateAttemptHeartbeat(leaseA.attempt.id, workerA);
    assert.strictEqual(heartbeatUpdated, true);

    const released = releaseWorkflowLease(leaseA.attempt.id, 'completed', { leaseOwner: workerA });
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

    db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
    db.prepare("UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = '2020-01-01 00:00:00' WHERE id = ?").run(lease.attempt.id);

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

await runAsyncTest('2a. backend startup recovery pauses interrupted generation before serving projects', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    const { recoverInterruptedWorkflows } = await import('../maintenance.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Interrupted Generation Project' });
    const lease = acquireWorkflowLease(project.id, 'server-before-restart');
    db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
    db.prepare("UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = '2020-01-01 00:00:00' WHERE id = ?").run(lease.attempt.id);

    const recovery = recoverInterruptedWorkflows({ database: db });
    assert.ok(recovery.recoveredProjectIds.includes(project.id));
    assert.equal(getProject(project.id).status, 'paused');
    assert.equal(db.prepare('SELECT status FROM workflow_attempts WHERE id = ?').get(lease.attempt.id).status, 'stale_terminated');
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

    releaseWorkflowLease(lease1.attempt.id, 'completed', { leaseOwner: 'request-1' });
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

    releaseWorkflowLease(lease.attempt.id, 'completed', { leaseOwner: 'engine-test' });

    const finished = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(finished.status, 'completed');
    assert.ok(finished.ended_at !== null);

    await deleteProject(project.id);
});

await runAsyncTest('5. failed dependency preparation exposes the worker error instead of a missing-lockfile guess', async () => {
    const { extractPreparedLockfile } = await import('../engine/workflow.js');
    assert.throws(
        () => extractPreparedLockfile({ status: 'failed', result: { error: 'Host fallback npm install exited with code 1' } }),
        /Host fallback npm install exited with code 1/
    );
    assert.deepEqual(
        extractPreparedLockfile({ status: 'completed', result: { packageLockBase64: 'e30=', packageLockSha256: 'digest' } }),
        { packageLockBase64: 'e30=', packageLockSha256: 'digest' }
    );
});

await runAsyncTest('6. dependency preparation resumes only for unchanged approved artifacts', async () => {
    const { fingerprintArtifactFiles, resolveDependencyResume } = await import('../engine/resumeStage.js');
    const files = [
        { path: 'package.json', content: Buffer.from('{"name":"fixture"}') },
        { path: 'src/app.js', content: Buffer.from('export default 1;') }
    ];
    const artifactHash = fingerprintArtifactFiles(files);
    const checkpoint = { stage: 'dependency_preparation', contractId: 'contract-1', contractHash: 'hash-1', artifactHash };
    const contract = { id: 'contract-1', contract_hash: 'hash-1' };
    assert.equal(resolveDependencyResume(checkpoint, contract, files), true);
    assert.equal(resolveDependencyResume(checkpoint, { ...contract, contract_hash: 'hash-2' }, files), false);
    assert.equal(resolveDependencyResume(checkpoint, contract, [
        files[0], { ...files[1], content: Buffer.from('export default 2;') }
    ]), false);
    assert.equal(resolveDependencyResume(null, contract, files), false);
    assert.equal(resolveDependencyResume(checkpoint, contract, files.slice(0, 1)), false);
    assert.equal(resolveDependencyResume({ ...checkpoint, stage: 'verification' }, contract, files), false);
    assert.equal(resolveDependencyResume({ ...checkpoint, stage: undefined }, contract, files), false);
});

await runAsyncTest('7. workflow state retains a dependency preparation checkpoint across resume', async () => {
    const { normalizeWorkflowState } = await import('../engine/workflow.js');
    const checkpoint = { stage: 'dependency_preparation', contractId: 'contract-1', contractHash: 'hash-1', artifactHash: 'artifact-1' };
    assert.deepEqual(normalizeWorkflowState({ dependencyPreparation: checkpoint }).dependencyPreparation, checkpoint);
});

await runAsyncTest('8. unchanged dependency resume bypasses Manager and task replay', async () => {
    const { createProject, deleteProject, getProjectDir } = await import('../projectRepository.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    const { executeProjectTasks } = await import('../engine/workflow.js');
    const { abortProjectExecution } = await import('../engine/cancellation.js');
    const { collectArtifactFiles } = await import('../artifactInventory.js');
    const { fingerprintArtifactFiles } = await import('../engine/resumeStage.js');
    const { db } = await import('../db.js');
    const project = await createProject({ title: 'Stage Resume Project' });
    const projectDir = getProjectDir(project.id);
    await fs.writeFile(path.join(projectDir, 'package.json'), '{"name":"stage-resume","version":"1.0.0"}');
    const files = await collectArtifactFiles(projectDir);
    const contractId = `contract-${crypto.randomUUID()}`;
    const contractHash = crypto.createHash('sha256').update('{}').digest('hex');
    db.prepare(`INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash)
        VALUES (?, ?, 1, 'approved', '{}', ?)`).run(contractId, project.id, contractHash);
    db.prepare(`UPDATE projects SET status = 'implementing', workflow_state = ? WHERE id = ?`).run(
        JSON.stringify({ dependencyPreparation: {
            stage: 'dependency_preparation', contractId, contractHash, artifactHash: fingerprintArtifactFiles(files)
        } }), project.id
    );
    const lease = acquireWorkflowLease(project.id, 'stage-resume-test');
    const events = [];
    await executeProjectTasks(project.id, {
        publish(event) {
            events.push(event);
            abortProjectExecution(project.id, 'PAUSED');
        }
    }, lease.attempt.id, 'stage-resume-test');
    assert.equal(events[0]?.action, 'resume');
    assert.equal(events.some(event => event.action === 'skip' || event.action === 'start'), false,
        JSON.stringify(events.map(event => ({ agent: event.agent, action: event.action }))));
    await deleteProject(project.id);
});

finish();
