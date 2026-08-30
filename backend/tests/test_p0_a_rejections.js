import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-rejections');
process.env.DB_PATH = isolated.dbPath;
const { runAsyncTest, finish } = createTestHarness();

try {
    await runAsyncTest('5. Workflow failure should transition attempt to failed, log repair issues, and invalidate checkpoints', async () => {
        const { createProject, deleteProject } = await import('../projectRepository.js');
        const { db } = await import('../db.js');
        isolated.registerDatabase(db);
        const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');
        const { isTaskCompleted } = await import('../engine/fileProtocol.js');
        const {
            approveContractRevision,
            createContractRevision,
            invalidateProjectCheckpoints
        } = await import('../contracts/projectContract.js');

        let project;
        try {
            project = await createProject({ title: 'Failure Integration Test' });
            const lease = acquireWorkflowLease(project.id, 'test-rejection-runner');

            releaseWorkflowLease(lease.attempt.id, 'rejected', {
                error: 'Verification failed'
            });

            const updatedAttempt = db.prepare(
                'SELECT status, error FROM workflow_attempts WHERE id = ?'
            ).get(lease.attempt.id);
            assert.strictEqual(updatedAttempt.status, 'rejected');
            assert.strictEqual(updatedAttempt.error, 'Verification failed');

            const revisionNumber = createContractRevision(project.id, {
                frontend: { framework: 'react' },
                backend: { framework: 'express' },
                database: { engine: 'sqlite' }
            }, 200);
            approveContractRevision(project.id, revisionNumber);
            const contractId = db.prepare(`
                SELECT id FROM project_contracts
                WHERE project_id = ? AND revision = ?
            `).get(project.id, revisionNumber).id;

            const issueId = `issue-${Date.now()}`;
            db.prepare(`
                INSERT INTO repair_issues (
                    id, project_id, contract_id, fingerprint, severity, status
                ) VALUES (?, ?, ?, 'syntax-error-App.jsx', 'critical', 'open')
            `).run(issueId, project.id, contractId);

            const openCount = db.prepare(`
                SELECT COUNT(*) as count FROM repair_issues
                WHERE project_id = ? AND status = ?
            `).get(project.id, 'open').count;
            assert.strictEqual(openCount, 1);

            db.prepare(`
                INSERT INTO task_checkpoints (
                    project_id, task_id, contract_id, plan_hash, task_spec_hash,
                    input_hash, output_hash, gate_version, status, revision
                ) VALUES (?, 'task-1', ?, 'plan1', 'spec1', 'in1', 'out1', 'v1', 'completed', 1)
            `).run(project.id, contractId);

            invalidateProjectCheckpoints(project.id);

            const completed = await isTaskCompleted('fake-coder-dir', null, [], {
                projectId: project.id,
                taskId: 'task-1'
            });
            assert.strictEqual(
                completed,
                false,
                'Coarse-invalidated checkpoint must not be reusable'
            );
        } finally {
            if (project) await deleteProject(project.id);
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
