import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-capability-check');
process.env.DB_PATH = isolated.dbPath;
const { runAsyncTest, finish } = createTestHarness();

try {
    await runAsyncTest('4. Contract validation should reject unsupported frameworks and transition to capability_blocked', async () => {
        const { createProject, deleteProject } = await import('../projectRepository.js');
        const { db } = await import('../db.js');
        isolated.registerDatabase(db);
        const {
            createContractRevision,
            getLatestRevision,
            rejectContractForCapabilities,
            validateContractCapabilities
        } = await import('../contracts/projectContract.js');
        const { PROJECT_STATUS } = await import('../engine/stateMachine.js');

        let project;
        try {
            project = await createProject({ title: 'Capability Block Test' });
            const validPlan = {
                frontend: { framework: 'react' },
                backend: { framework: 'express' },
                database: { engine: 'sqlite' }
            };
            const validCheck = validateContractCapabilities(validPlan);
            assert.strictEqual(validCheck.valid, true);

            const invalidPlan = {
                frontend: { framework: 'nuxt' },
                backend: { framework: 'express' },
                database: { engine: 'sqlite' }
            };
            const invalidCheck = validateContractCapabilities(invalidPlan);
            assert.strictEqual(invalidCheck.valid, false);
            assert.ok(invalidCheck.errors.some(error => error.includes('nuxt')));

            const revision = createContractRevision(project.id, invalidPlan, 200);
            const blockedProject = rejectContractForCapabilities({
                projectId: project.id,
                revision,
                expectedProjectRevision: project.revision,
                errors: invalidCheck.errors
            });
            assert.strictEqual(blockedProject.status, PROJECT_STATUS.CAPABILITY_BLOCKED);

            const latest = getLatestRevision(project.id);
            assert.strictEqual(latest.status, 'rejected');
        } finally {
            if (project) await deleteProject(project.id);
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
