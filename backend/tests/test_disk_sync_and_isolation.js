import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-p9-disk-isolation-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(isolatedRoot, 'projects.db');
process.env.PROJECTS_ROOT = path.join(isolatedRoot, 'projects');
process.env.ARTIFACTS_ROOT = path.join(isolatedRoot, 'artifacts');
process.env.TRASH_ROOT = path.join(isolatedRoot, 'trash');
const dbModule = await import('../db.js');
dbModule.closeDatabase();
dbModule.initializeDatabase({ path: process.env.DB_PATH });
const db = dbModule.db;
const { runAsyncTest, finish } = createTestHarness();

console.log('==================================================');
console.log('⚡ XFactor Disk Senkronizasyonu & İzolasyon Test Süiti');
await runAsyncTest('1. configured PROJECTS_ROOT is isolated and absolute', async () => {
    const { getProjectsRoot } = await import('../projectPaths.js');
    const configuredRoot = process.env.PROJECTS_ROOT;
    assert.strictEqual(path.isAbsolute(getProjectsRoot(process.env)), true);
    assert.strictEqual(getProjectsRoot(process.env), path.resolve(configuredRoot));
});

await runAsyncTest('2. syncProjectsWithDisk reports unregistered directories as unverified', async () => {
    const { syncProjectsWithDisk, getAllProjects } = await import('../projectRepository.js');
    const { getProjectsRoot } = await import('../projectPaths.js');
    const root = getProjectsRoot(process.env);

    const testId = `test-manual-${Date.now()}`;
    const testDir = path.join(root, testId);
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'state.json'), JSON.stringify({ title: 'Disk Sync Test Project' }));

    try {
        const syncRes = syncProjectsWithDisk(process.env);
        assert.strictEqual(syncRes.success, true);
        assert.strictEqual(syncRes.syncedCount, 0);
        assert.ok(syncRes.unverified.some(entry => entry.id === testId && entry.verified === false));
        assert.strictEqual(getAllProjects().some(project => project.id === testId), false);
    } finally {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
});

await runAsyncTest('3. syncProjectsWithDisk must NOT prune records when directory is missing from disk', async () => {
    const { syncProjectsWithDisk, getAllProjects } = await import('../projectRepository.js');
    const { getProjectsRoot } = await import('../projectPaths.js');
    const root = getProjectsRoot(process.env);

    const testId = `test-orphan-${Date.now()}`;
    const testDir = path.join(root, testId);
    await fs.mkdir(testDir, { recursive: true });
    db.prepare("INSERT INTO projects (id, title, status, plan, workflow_state) VALUES (?, ?, 'planning', NULL, NULL)").run(testId, testId);

    try {
        await fs.rm(testDir, { recursive: true, force: true });
        const res = syncProjectsWithDisk(process.env);
        assert.strictEqual(res.success, true);
        assert.ok(res.missingOnDisk.includes(testId), 'Missing folder must be reported in missingOnDisk');
        assert.ok(getAllProjects().some(project => project.id === testId), 'DB entry must survive after folder removal');
    } finally {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
        db.prepare('DELETE FROM projects WHERE id = ?').run(testId);
    }
});


await runAsyncTest('4. Custom PROJECTS_ROOT in environment must be strictly respected', async () => {
    const { getProjectsRoot, getProjectDir } = await import('../projectPaths.js');
    const customTemp = path.join(os.tmpdir(), `custom-root-${Date.now()}`);
    const env = { PROJECTS_ROOT: customTemp };

    assert.strictEqual(getProjectsRoot(env), path.resolve(customTemp));
    assert.strictEqual(getProjectDir('p-123', env), path.join(path.resolve(customTemp), 'p-123'));
});
dbModule.closeDatabase();
await fs.rm(isolatedRoot, { recursive: true, force: true }).catch(() => {});

finish();
