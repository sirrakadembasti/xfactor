import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { runAsyncTest, finish } = createTestHarness();

console.log('==================================================');
console.log('⚡ XFactor Disk Senkronizasyonu & İzolasyon Test Süiti');
console.log('==================================================');

await runAsyncTest('1. getProjectsRoot should point to xfactor-main/projects by default', async () => {
    const { getProjectsRoot } = await import('../projectPaths.js');
    const root = getProjectsRoot({});
    assert.strictEqual(path.isAbsolute(root), true);
    assert.strictEqual(path.basename(root), 'projects');
    const expectedParent = path.resolve(__dirname, '../..');
    assert.strictEqual(path.dirname(root), expectedParent);
});

await runAsyncTest('2. syncProjectsWithDisk should detect manually added project directories and register in DB', async () => {
    const { db, getAllProjects, syncProjectsWithDisk } = await import('../db.js');
    const { getProjectsRoot } = await import('../projectPaths.js');
    const root = getProjectsRoot();

    const testId = `test-manual-${Date.now()}`;
    const testDir = path.join(root, testId);
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'state.json'), JSON.stringify({ title: 'Disk Sync Test Project' }));

    try {
        const syncRes = syncProjectsWithDisk();
        assert.ok(syncRes.syncedOnDisk >= 1, 'At least 1 project should be synced from disk');

        const all = getAllProjects();
        assert.ok(all.some(p => p.id === testId), 'Manually added disk project must be returned by getAllProjects');
    } finally {
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
});

await runAsyncTest('3. syncProjectsWithDisk should prune orphan records when directory is deleted from disk', async () => {
    const { db, getAllProjects, syncProjectsWithDisk } = await import('../db.js');
    const { getProjectsRoot } = await import('../projectPaths.js');
    const root = getProjectsRoot();

    const testId = `test-orphan-${Date.now()}`;
    const testDir = path.join(root, testId);
    await fs.mkdir(testDir, { recursive: true });

    // Sync to create in DB
    syncProjectsWithDisk();
    assert.ok(getAllProjects().some(p => p.id === testId));

    // Delete folder from disk
    await fs.rm(testDir, { recursive: true, force: true });

    // Sync should prune orphan
    syncProjectsWithDisk();
    assert.ok(!getAllProjects().some(p => p.id === testId), 'Orphan DB entry must be deleted after folder removal');
});

await runAsyncTest('4. Custom PROJECTS_ROOT in environment must be strictly respected', async () => {
    const { getProjectsRoot, getProjectDir } = await import('../projectPaths.js');
    const customTemp = path.join(os.tmpdir(), `custom-root-${Date.now()}`);
    const env = { PROJECTS_ROOT: customTemp };

    assert.strictEqual(getProjectsRoot(env), path.resolve(customTemp));
    assert.strictEqual(getProjectDir('p-123', env), path.join(path.resolve(customTemp), 'p-123'));
});

finish();
