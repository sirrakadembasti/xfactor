import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: GET /projects and getAllProjects have zero DB/filesystem mutations
// =========================================================================
await runAsyncTest('1. getAllProjects should be a pure query without mutating database or filesystem', async () => {
    const { getAllProjects, db } = await import('../db.js');
    const { createProject, deleteProject } = await import('../projectRepository.js');

    const project = await createProject({ title: 'Pure Read Project' });
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;

    // Call getAllProjects multiple times
    const list1 = getAllProjects();
    const list2 = getAllProjects();

    const countAfter = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
    assert.strictEqual(countBefore, countAfter, 'Proje sayısı GET/listeleme çağrıları sırasında değişmemelidir.');
    assert.strictEqual(list1.length, list2.length);

    await deleteProject(project.id);
});

// =========================================================================
// TEST 2: Protect DB records when mount / root directory is missing
// =========================================================================
await runAsyncTest('2. syncProjectsWithDisk should not purge DB when root directory is missing or unmounted', async () => {
    const { syncProjectsWithDisk, createProject, getProject, deleteProject } = await import('../projectRepository.js');

    const project = await createProject({ title: 'Unmounted Root Project' });
    assert.ok(getProject(project.id));

    // Simulate missing mount / non-existent root
    const missingRootEnv = { PROJECTS_ROOT: path.join(os.tmpdir(), `non-existent-mount-${Date.now()}`) };
    const result = syncProjectsWithDisk(missingRootEnv);

    assert.strictEqual(result.success, false, 'Eksik root dizininde sync işlemi reddedilmelidir.');
    assert.strictEqual(result.orphansRemoved, 0, 'Hiçbir DB kaydı silinmemelidir.');

    // Verify project still exists in DB
    const projectStillExists = getProject(project.id);
    assert.ok(projectStillExists, 'Proje veritabanında korunmalıdır.');

    await deleteProject(project.id);
});

// =========================================================================
// TEST 3: Quarantine invalid project ID directories
// =========================================================================
await runAsyncTest('3. syncProjectsWithDisk should quarantine invalid project ID directories without importing them', async () => {
    const { syncProjectsWithDisk } = await import('../projectRepository.js');
    const customRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'quarantine-test-'));
    const env = { PROJECTS_ROOT: customRoot };
    const invalidDir = path.join(customRoot, 'invalid!@#_project$id');

    await fs.mkdir(invalidDir, { recursive: true });
    try {
        const result = syncProjectsWithDisk(env);
        assert.strictEqual(result.success, true);
        assert.ok(result.quarantined.includes('invalid!@#_project$id'));
    } finally {
        await fs.rm(customRoot, { recursive: true, force: true }).catch(() => {});
    }
});
finish();
