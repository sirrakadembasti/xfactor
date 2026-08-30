import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-state-transitions');
process.env.DB_PATH = isolated.dbPath;
const { runAsyncTest, finish } = createTestHarness();

try {
    await runAsyncTest('2. Project state machine should block invalid status changes, guard completed writes, and perform CAS check', async () => {
        const { createProject, getProject, saveProjectState, deleteProject } = await import('../projectRepository.js');
        const { db } = await import('../db.js');
        isolated.registerDatabase(db);
        const { PROJECT_STATUS, canTransitionProject } = await import('../engine/stateMachine.js');

        assert.ok(canTransitionProject(PROJECT_STATUS.PLANNING, PROJECT_STATUS.PENDING_APPROVAL));
        assert.strictEqual(canTransitionProject(PROJECT_STATUS.PLANNING, PROJECT_STATUS.COMPLETED), false);
        assert.strictEqual(canTransitionProject(PROJECT_STATUS.PENDING_APPROVAL, PROJECT_STATUS.COMPLETED), false);
        assert.strictEqual(canTransitionProject(PROJECT_STATUS.COMPLETED, PROJECT_STATUS.IMPLEMENTING), false);
        assert.strictEqual(canTransitionProject(PROJECT_STATUS.ARTIFACT_VERIFIED, PROJECT_STATUS.COMPLETED), false);

        let project;
        try {
            project = await createProject({ title: 'CAS State Machine Test' });
            const initialRev = project.revision || 1;

            project.status = PROJECT_STATUS.PENDING_APPROVAL;
            await saveProjectState(project);
            const updated = getProject(project.id);
            assert.strictEqual(updated.status, PROJECT_STATUS.PENDING_APPROVAL);
            assert.strictEqual(updated.revision, initialRev + 1);

            const illegalState = { ...updated, status: PROJECT_STATUS.VERIFICATION_RUNNING };
            await assert.rejects(
                saveProjectState(illegalState),
                /Illegal project transition: pending_approval -> verification_running/
            );

            const staleState = { ...updated, revision: initialRev };
            staleState.status = PROJECT_STATUS.CONTRACT_APPROVED;
            await assert.rejects(saveProjectState(staleState), /CAS Revision conflict/);

            const badCompletedState = { ...updated, status: PROJECT_STATUS.COMPLETED };
            await assert.rejects(
                saveProjectState(badCompletedState),
                /Cannot transition project to completed: required verified lifecycle evidence is missing/
            );
        } finally {
            if (project) await deleteProject(project.id);
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
