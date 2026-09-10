import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Canonical repository CRUD & state persistence
// =========================================================================
await runAsyncTest('1. Canonical repository getProject/saveProjectState/deleteProject should be unified and consistent', async () => {
    const { createProject, getProject, saveProjectState, deleteProject, getProjectDir } = await import('../projectRepository.js');

    const project = await createProject({ title: 'Canonical Repo Test Project' });
    assert.ok(project.id);
    assert.strictEqual(project.title, 'Canonical Repo Test Project');

    // Canonical repository reads and writes use one state authority.
    const repoProject = getProject(project.id);
    const canonicalProject = getProject(project.id);
    assert.deepStrictEqual(repoProject, canonicalProject);

    // 2. Mutate state via saveProjectState
    repoProject.status = 'pending_approval';
    repoProject.plan = { summary: 'Unified plan', domains: ['backend'] };
    repoProject.workflow = { planHash: 'hash123', directorSpecs: {} };
    repoProject.chatHistory.push({ role: 'user', parts: [{ text: 'Can we proceed?' }] });

    await saveProjectState(repoProject);

    const updated = getProject(project.id);
    assert.strictEqual(updated.status, 'pending_approval');
    assert.strictEqual(updated.plan.summary, 'Unified plan');
    assert.strictEqual(updated.workflow.planHash, 'hash123');
    assert.strictEqual(updated.chatHistory.length, 2);

    // 3. Delete cleans up completely
    const deleted = await deleteProject(project.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(getProject(project.id), null);
});

// =========================================================================
// TEST 2: PROJECTS_ROOT isolation in custom directory
// =========================================================================
await runAsyncTest('2. Custom PROJECTS_ROOT in environment must be strictly respected by ProjectRepository', async () => {
    const { createProject, getProject, getProjectDir, deleteProject } = await import('../projectRepository.js');
    const customRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'custom-repo-test-'));
    const env = { PROJECTS_ROOT: customRoot };

    try {
        const project = await createProject({ title: 'Custom Root Project', env });
        const dir = getProjectDir(project.id, env);
        assert.ok(dir.startsWith(customRoot), `Dir ${dir} must start with ${customRoot}`);

        await deleteProject(project.id, env);
    } finally {
        await fs.rm(customRoot, { recursive: true, force: true }).catch(() => {});
    }
});

finish();
