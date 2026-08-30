import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-cutover');
process.env.DB_PATH = isolated.dbPath;
const { runAsyncTest, finish } = createTestHarness();

try {
    await runAsyncTest('6. Project repository should elide read/write actions on the legacy plan column', async () => {
        const {
            createProject,
            deleteProject,
            saveProjectState
        } = await import('../projectRepository.js');
        const { db } = await import('../db.js');
        isolated.registerDatabase(db);

        let project;
        try {
            project = await createProject({ title: 'Cutover Test Proj' });
            project.plan = { summary: 'Legacy bypass check' };
            await saveProjectState(project);

            const row = db.prepare(
                'SELECT plan FROM projects WHERE id = ?'
            ).get(project.id);
            assert.strictEqual(
                row.plan,
                null,
                'Plan column in projects table must be null post-cutover'
            );
        } finally {
            if (project) await deleteProject(project.id);
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
