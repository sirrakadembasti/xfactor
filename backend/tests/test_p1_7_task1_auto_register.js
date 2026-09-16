import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-7-task1-auto-register');
process.env.DB_PATH = isolated.dbPath;

const { runAsyncTest, finish } = createTestHarness();

try {
    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { getProjectsRoot } = await import('../projectPaths.js');
    const { autoRegisterDiscoveredProjects, syncProjectsWithDisk, getAllProjects, createProject } = await import('../projectRepository.js');

    await runAsyncTest('1. autoRegisterDiscoveredProjects parses package.json, TALIMATNAME.md, and state.json for titles', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-reg-test-'));
        const env = { PROJECTS_ROOT: root };

        const pkgId = `proj-pkg-${Date.now()}`;
        const pkgDir = path.join(root, pkgId);
        await fs.mkdir(pkgDir, { recursive: true });
        await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'Package Json Project Title' }));

        const talimatId = `proj-talimat-${Date.now()}`;
        const talimatDir = path.join(root, talimatId);
        await fs.mkdir(talimatDir, { recursive: true });
        await fs.writeFile(path.join(talimatDir, 'TALIMATNAME.md'), '# Talimatname Project Title\nDetails here.');

        const stateId = `proj-state-${Date.now()}`;
        const stateDir = path.join(root, stateId);
        await fs.mkdir(stateDir, { recursive: true });
        await fs.writeFile(path.join(stateDir, 'state.json'), JSON.stringify({ title: 'State Json Project Title' }));

        const fallbackId = `proj-fallback-${Date.now()}`;
        const fallbackDir = path.join(root, fallbackId);
        await fs.mkdir(fallbackDir, { recursive: true });

        try {
            const res = autoRegisterDiscoveredProjects({ env, projectsRoot: root });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.registered.length, 4);

            const dbPkg = db.prepare('SELECT * FROM projects WHERE id = ?').get(pkgId);
            assert.ok(dbPkg);
            assert.strictEqual(dbPkg.title, 'Package Json Project Title');

            const dbTalimat = db.prepare('SELECT * FROM projects WHERE id = ?').get(talimatId);
            assert.ok(dbTalimat);
            assert.strictEqual(dbTalimat.title, 'Talimatname Project Title');

            const dbState = db.prepare('SELECT * FROM projects WHERE id = ?').get(stateId);
            assert.ok(dbState);
            assert.strictEqual(dbState.title, 'State Json Project Title');

            const dbFallback = db.prepare('SELECT * FROM projects WHERE id = ?').get(fallbackId);
            assert.ok(dbFallback);
            assert.strictEqual(dbFallback.title, fallbackId);
        } finally {
            await fs.rm(root, { recursive: true, force: true }).catch(() => {});
        }
    });

    await runAsyncTest('2. syncProjectsWithDisk({ autoRegister: true }) integrates unimported directories into DB', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-auto-reg-'));
        const env = { PROJECTS_ROOT: root };

        const testId = `proj-sync-${Date.now()}`;
        const testDir = path.join(root, testId);
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'Auto Registered Via Sync' }));

        try {
            const res = syncProjectsWithDisk({ autoRegister: true, env, projectsRoot: root });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.syncedCount, 1);
            assert.ok(res.autoRegistered.some(p => p.id === testId));

            const all = getAllProjects();
            assert.ok(all.some(p => p.id === testId && p.title === 'Auto Registered Via Sync'));
        } finally {
            await fs.rm(root, { recursive: true, force: true }).catch(() => {});
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
