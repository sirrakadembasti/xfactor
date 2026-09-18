import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('==================================================');
console.log('⚡ XFactor P7 Non-Destructive Reconciliation Tests');
console.log('==================================================');

// Isolate SQLite before importing backend modules and explicitly initialize it.
const isolated = await setupIsolatedTestDb('p7-reconciliation');
process.env.DB_PATH = isolated.dbPath;
const { runAsyncTest, finish } = createTestHarness();

try {
    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { reconcileProjectsWithDisk } = await import('../services/reconciliationService.js');
    const repo = await import('../projectRepository.js');
    const dbModule = await import('../db.js');

    const countProjects = () => db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
    const makeRoot = () => fs.mkdtemp(path.join(os.tmpdir(), 'p7-recon-'));
    const rmRoot = (root) => fs.rm(root, { recursive: true, force: true }).catch(() => {});
    const deleteRow = (id) => db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    await runAsyncTest('1. missing on-disk folder leaves project in SQLite and returns missingOnDisk', async () => {
        const root = await makeRoot();
        const id = `p7miss${Date.now()}`;
        db.prepare("INSERT INTO projects (id, title, status, plan, workflow_state) VALUES (?, ?, 'completed', NULL, NULL)").run(id, id);
        try {
            const result = await reconcileProjectsWithDisk({ projectsRoot: root });
            assert.strictEqual(result.success, true);
            assert.ok(result.missingOnDisk.includes(id), 'missing project id must be reported');
            assert.strictEqual(result.cleanedOrphans, 0);
            assert.strictEqual(result.orphansRemoved, 0);
            const row = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(id);
            assert.ok(row, 'project row must survive reconciliation');
        } finally {
            deleteRow(id);
            await rmRoot(root);
        }
    });

    await runAsyncTest('2. missing root fails closed with success:false and zero DB modifications', async () => {
        const missingRoot = path.join(os.tmpdir(), `p7-nonexistent-${Date.now()}`);
        const before = countProjects();
        const result = await reconcileProjectsWithDisk({ projectsRoot: missingRoot });
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.syncedCount, 0);
        assert.ok(typeof result.error === 'string' && result.error.length > 0);
        assert.deepStrictEqual(result.missingOnDisk, []);
        assert.strictEqual(countProjects(), before, 'no rows may be added or removed');

        // Repository wrapper must delegate and fail closed the same way.
        const viaRepo = await repo.syncProjectsWithDisk({ PROJECTS_ROOT: missingRoot });
        assert.strictEqual(viaRepo.success, false);
        assert.strictEqual(countProjects(), before);
    });

    await runAsyncTest('3. valid unimported on-disk folders are reported unverified without DB fabrication', async () => {
        const root = await makeRoot();
        const id = `p7valid${Date.now()}`;
        await fs.mkdir(path.join(root, id), { recursive: true });
        try {
            assert.strictEqual(db.prepare('SELECT id FROM projects WHERE id = ?').get(id), undefined);
            const result = await reconcileProjectsWithDisk({ projectsRoot: root });
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.syncedCount, 0);
            assert.ok(result.unverified.some(entry => entry.id === id && entry.verified === false));
            assert.strictEqual(db.prepare('SELECT id FROM projects WHERE id = ?').get(id), undefined);
        } finally {
            await rmRoot(root);
        }
    });

    await runAsyncTest('4. invalid folder names are quarantined and dotfiles ignored', async () => {
        const root = await makeRoot();
        const invalid = 'invalid!@#_project$id';
        await fs.mkdir(path.join(root, invalid), { recursive: true });
        await fs.mkdir(path.join(root, '.hidden-dir'), { recursive: true });
        await fs.writeFile(path.join(root, 'loose-file.txt'), 'not a directory');
        try {
            const before = countProjects();
            const result = await reconcileProjectsWithDisk({ projectsRoot: root });
            assert.strictEqual(result.success, true);
            assert.ok(result.quarantined.includes(invalid), 'invalid name must be quarantined');
            assert.ok(!result.quarantined.includes('.hidden-dir'), 'dotfiles must be ignored, not quarantined');
            assert.strictEqual(db.prepare('SELECT id FROM projects WHERE id = ?').get(invalid), undefined);
            assert.strictEqual(countProjects(), before, 'quarantined entries must not be imported');
        } finally {
            await rmRoot(root);
        }
    });

    await runAsyncTest('5. importing backend/db.js has no disk sync side-effects', async () => {
        assert.strictEqual(dbModule.syncProjectsWithDisk, undefined, 'db.js must not export syncProjectsWithDisk');

        // Prove module load performs no sync: a child process imports db.js with
        // a projects root containing an unimported folder, plus a missing root.
        const probeContainer = await makeRoot();
        const root = path.join(probeContainer, 'projects');
        const probeDbPath = path.join(probeContainer, 'database', 'projects.db');
        const id = `p7side${Date.now()}`;
        await fs.mkdir(path.join(root, id), { recursive: true });
        const probeFile = path.join(probeContainer, 'probe-import-db.mjs');
        await fs.writeFile(probeFile, [
            `import fsSync from 'node:fs';`,
            `const dbModule = await import(${JSON.stringify(pathToFileURL(path.join(__dirname, '..', 'db.js')).href)});`,
            `console.log(JSON.stringify({ dbIsNull: dbModule.db === null, databaseExists: fsSync.existsSync(${JSON.stringify(probeDbPath)}), rootExists: fsSync.existsSync(${JSON.stringify(root)}) }));`
        ].join('\n'));
        try {
            const child = spawnSync(process.execPath, [probeFile], {
                env: { ...process.env, DB_PATH: probeDbPath, PROJECTS_ROOT: root },
                encoding: 'utf8',
                timeout: 60000
            });
            assert.strictEqual(child.status, 0, `probe process must exit 0, stderr: ${child.stderr}`);
            const observed = JSON.parse(child.stdout.trim().split('\n').pop());
            assert.strictEqual(observed.dbIsNull, true, 'importing db.js must not open a connection');
            assert.strictEqual(observed.databaseExists, false, 'importing db.js must not create the separate database');
            assert.strictEqual(observed.rootExists, true, 'probe root was created by the test, not by import');
        } finally {
            await rmRoot(probeContainer);
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
