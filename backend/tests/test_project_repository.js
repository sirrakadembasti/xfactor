import assert from 'assert';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Canonical path helpers should resolve default and custom root directories', async () => {
    const repo = await import('../projectRepository.js');
    const { getProjectsRoot, getProjectDir, isValidProjectId } = repo;

    const defaultRoot = getProjectsRoot({});
    assert.strictEqual(path.isAbsolute(defaultRoot), true);
    assert.strictEqual(path.basename(defaultRoot), 'projects');

    const customRoot = path.join(os.tmpdir(), 'custom-projects-test');
    assert.strictEqual(getProjectsRoot({ PROJECTS_ROOT: customRoot }), path.resolve(customRoot));

    assert.strictEqual(isValidProjectId('project-1786924708852'), true);
    assert.strictEqual(isValidProjectId('project-f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
    assert.strictEqual(isValidProjectId('../malicious'), false);
    assert.strictEqual(isValidProjectId(''), false);
    assert.strictEqual(isValidProjectId('project/nested'), false);

    const projectDir = getProjectDir('project-123', { PROJECTS_ROOT: customRoot });
    assert.strictEqual(projectDir, path.join(path.resolve(customRoot), 'project-123'));
});

await runAsyncTest('2. Path containment must strictly reject path traversal, null bytes, and parent escapes', async () => {
    const repo = await import('../projectRepository.js');
    const { getProjectDir, resolveSafeProjectPath } = repo;
    const customRoot = path.join(os.tmpdir(), 'containment-test');

    assert.throws(() => getProjectDir('../etc/passwd', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);
    assert.throws(() => getProjectDir('project\0id', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);
    assert.throws(() => getProjectDir('..', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);

    const safeFile = resolveSafeProjectPath('project-1', 'src/App.jsx', { PROJECTS_ROOT: customRoot });
    assert.strictEqual(safeFile, path.join(path.resolve(customRoot), 'project-1', 'src', 'App.jsx'));

    assert.throws(() => resolveSafeProjectPath('project-1', '../outside.txt', { PROJECTS_ROOT: customRoot }), /containment|traversal/i);
    assert.throws(() => resolveSafeProjectPath('project-1', '../../etc/shadow', { PROJECTS_ROOT: customRoot }), /containment|traversal/i);
    assert.throws(() => resolveSafeProjectPath('project-1', 'src/\0evil.js', { PROJECTS_ROOT: customRoot }), /invalid|null byte|traversal/i);
});

await runAsyncTest('3. createProject should generate UUIDv4 ID, write SQLite transaction and create disk directory', async () => {
    const repo = await import('../projectRepository.js');
    const { createProject, getProjectDir } = repo;
    const { createUser } = await import('../auth.js');
    const customRoot = await import('fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'create-test-')));
    const env = { PROJECTS_ROOT: customRoot };

    const owner = createUser(`owner${Date.now()}`, 'StrongPassword!2026');
    const project = await createProject({ title: 'Otonom E-Ticaret Projesi', ownerUserId: owner.id, env });

    assert.match(project.id, /^project-[a-f0-9-]{36}$/, 'Project ID must use UUIDv4 format');
    assert.strictEqual(project.title, 'Otonom E-Ticaret Projesi');
    assert.strictEqual(project.status, 'planning');
    assert.ok(Array.isArray(project.chatHistory) && project.chatHistory.length > 0);

    const projectDir = getProjectDir(project.id, env);
    const fs = await import('fs/promises');
    const dirStat = await fs.stat(projectDir);
    assert.strictEqual(dirStat.isDirectory(), true);

    await fs.rm(customRoot, { recursive: true, force: true });
});
await runAsyncTest('4. State persistence and safe delete should cleanly synchronize SQLite and disk', async () => {
    const repo = await import('../projectRepository.js');
    const { createProject, getProject, saveProjectState, deleteProject, getProjectDir } = repo;
    const { createUser } = await import('../auth.js');
    const customRoot = await import('fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'delete-test-')));
    const env = { PROJECTS_ROOT: customRoot };

    const owner = createUser(`owner_del_${Date.now()}`, 'StrongPassword!2026');
    const project = await createProject({ title: 'Silinecek Proje', ownerUserId: owner.id, env });
    const projectDir = getProjectDir(project.id, env);

    project.status = 'pending_approval';
    project.plan = { summary: 'Plan özeti', domains: [{ name: 'backend' }] };
    project.chatHistory.push({ role: 'user', parts: [{ text: 'Onay veriyorum' }] });
    await saveProjectState(project, env);

    const reloaded = getProject(project.id);
    assert.strictEqual(reloaded.status, 'pending_approval');
    assert.strictEqual(reloaded.plan.summary, 'Plan özeti');
    assert.strictEqual(reloaded.chatHistory.length, 2);

    const fs = await import('fs/promises');
    assert.strictEqual((await fs.stat(projectDir)).isDirectory(), true);

    const deleted = await deleteProject(project.id, env);
    assert.strictEqual(deleted, true);
    assert.strictEqual(getProject(project.id), null);

    let existsOnDisk = true;
    try {
        await fs.stat(projectDir);
    } catch {
        existsOnDisk = false;
    }
    assert.strictEqual(existsOnDisk, false, 'Project directory must be completely removed on delete');

    await fs.rm(customRoot, { recursive: true, force: true });
});

await runAsyncTest('5. deleteProject must refuse to delete projects root or escape directories', async () => {
    const repo = await import('../projectRepository.js');
    const { deleteProject } = repo;
    const customRoot = path.join(os.tmpdir(), 'root-protection-test');
    await assert.rejects(() => deleteProject('..', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);
});

finish();
