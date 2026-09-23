import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-contract-flow');
process.env.DB_PATH = isolated.dbPath;
const { runAsyncTest, finish } = createTestHarness();

try {
    await runAsyncTest('3. Plan ready should save pending revision and approval should activate approved contract status', async () => {
        const { createProject, deleteProject, getProject, saveProjectState } = await import('../projectRepository.js');
        const { db } = await import('../db.js');
        isolated.registerDatabase(db);
        const {
            approveContractRevision,
            createContractRevision,
            getLatestRevision
        } = await import('../contracts/projectContract.js');

        let project;
        try {
            project = await createProject({ title: 'Contract Revision Flow Test' });
            const samplePlan = {
                summary: 'Unit test contract',
                frontend: { framework: 'react', frameworkVersion: '18' },
                backend: { framework: 'express' },
                database: { engine: 'sqlite' }
            };

            const revision = createContractRevision(project.id, samplePlan, 100);
            assert.strictEqual(revision, 1);

            const draft = getLatestRevision(project.id);
            assert.strictEqual(draft.status, 'pending_approval');
            assert.strictEqual(draft.source_message_id, 100);

            approveContractRevision(project.id, 1);

            const approved = getLatestRevision(project.id);
            assert.strictEqual(approved.status, 'approved');
            assert.ok(approved.approved_at !== null);
        } finally {
            if (project) await deleteProject(project.id);
        }
    });

    await runAsyncTest('4. State checkpoints preserve the approved contract revision and content', async () => {
        const { createProject, deleteProject, getProject, saveProjectState } = await import('../projectRepository.js');
        const { createContractRevision, approveContractRevision, getLatestRevision } = await import('../contracts/projectContract.js');
        const { db } = await import('../db.js');
        isolated.registerDatabase(db);

        const project = await createProject({ title: 'Contract checkpoint integrity' });
        try {
            const firstPlan = { summary: 'Book catalogue', domains: [{ name: 'frontend' }] };
            const secondPlan = { summary: 'Library loans and members', domains: [{ name: 'frontend' }] };
            createContractRevision(project.id, firstPlan, 101);
            approveContractRevision(project.id, 1);
            const oldState = getProject(project.id);
            createContractRevision(project.id, secondPlan, 102);
            approveContractRevision(project.id, 2);

            oldState.status = 'pending_approval';
            await saveProjectState(oldState);

            const latest = getLatestRevision(project.id);
            assert.strictEqual(latest.revision, 2);
            assert.strictEqual(latest.status, 'approved');
            assert.deepStrictEqual(JSON.parse(latest.contract_json), secondPlan);
            assert.deepStrictEqual(getProject(project.id).plan, secondPlan);
        } finally {
            await deleteProject(project.id);
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
