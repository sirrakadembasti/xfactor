import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Concurrent project creation race condition
// =========================================================================
await runAsyncTest('1. Concurrent project creation should create distinct directories and DB records cleanly', async () => {
    const { createProject, deleteProject, getProjectDir } = await import('../projectRepository.js');

    const [p1, p2, p3] = await Promise.all([
        createProject({ title: 'Concurrent Project 1' }),
        createProject({ title: 'Concurrent Project 2' }),
        createProject({ title: 'Concurrent Project 3' })
    ]);

    assert.notStrictEqual(p1.id, p2.id);
    assert.notStrictEqual(p2.id, p3.id);
    assert.ok(fsSync.existsSync(getProjectDir(p1.id)));
    assert.ok(fsSync.existsSync(getProjectDir(p2.id)));
    assert.ok(fsSync.existsSync(getProjectDir(p3.id)));

    await Promise.all([
        deleteProject(p1.id),
        deleteProject(p2.id),
        deleteProject(p3.id)
    ]);
});

// =========================================================================
// TEST 2: Active workflow cancellation during delete
// =========================================================================
await runAsyncTest('2. deleteProject should abort active workflow and remove project completely', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const { registerProjectAbortController, getProjectAbortSignal } = await import('../engine/cancellation.js');

    const project = await createProject({ title: 'Active Workflow Delete Project' });
    const controller = new AbortController();
    registerProjectAbortController(project.id, controller);

    assert.strictEqual(controller.signal.aborted, false);

    // Delete project while controller is active
    const deleted = await deleteProject(project.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(controller.signal.aborted, true);
    assert.strictEqual(controller.signal.reason, 'DELETED');
    assert.strictEqual(getProject(project.id), null);
});

// =========================================================================
// TEST 3: Preventing re-importing failed deletions into project list
// =========================================================================
await runAsyncTest('3. syncProjectsWithDisk should not re-import .trash or deleting state projects', async () => {
    const { syncProjectsWithDisk, createProject, deleteProject } = await import('../projectRepository.js');
    const { getProjectsRoot } = await import('../projectPaths.js');

    const root = getProjectsRoot();
    const trashDir = path.join(root, '.trash-test-project-123');
    await fs.mkdir(trashDir, { recursive: true });

    try {
        const result = syncProjectsWithDisk();
        assert.ok(!result.quarantined.includes('.trash-test-project-123'));
    } finally {
        await fs.rm(trashDir, { recursive: true, force: true }).catch(() => {});
    }
});

finish();
