import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { createTestHarness } from './testHarness.js';

const keys = ['DB_PATH', 'PROJECTS_ROOT', 'ARTIFACTS_ROOT', 'TRASH_ROOT'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-storage-control-'));
const { runAsyncTest, finish } = createTestHarness();
function restore(values) {
    for (const key of keys) {
        if (values[key] === undefined) delete process.env[key];
        else process.env[key] = values[key];
    }
}
try {
    await runAsyncTest('direct test helpers isolate ZIPs, source and trash with their database', async () => {
        const prior = Object.fromEntries(keys.map(key => [key, path.join(controlRoot, key)]));
        restore(prior);
        const isolated = await setupIsolatedTestDb('all-storage-roots');
        const ownedRoot = path.dirname(isolated.dbPath);
        let artifactPath;
        try {
            for (const key of keys) {
                assert.equal(path.dirname(process.env[key]), ownedRoot, `${key} must be owned by the helper`);
            }
            const db = await isolated.initializeDatabase();
            const { createProjectZip } = await import('../utils/archive.js');
            db.prepare("INSERT INTO projects (id,title,status) VALUES ('isolated-zip-project','Test','planning')").run();
            db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES ('isolated-zip-contract','isolated-zip-project',1,'approved','{}','hash')").run();
            const artifact = await createProjectZip('isolated-zip-project', 'isolated-zip-contract', [
                { path: 'index.js', content: 'console.log(1);' }
            ]);
            artifactPath = artifact.path;
            assert.equal(path.dirname(artifactPath), process.env.ARTIFACTS_ROOT);
            assert.equal((await fs.stat(artifactPath)).isFile(), true);
            for (const key of ['PROJECTS_ROOT', 'TRASH_ROOT']) {
                await fs.writeFile(path.join(process.env[key], 'owned.txt'), key);
            }
        } finally {
            await isolated.cleanup();
        }
        assert.deepEqual(Object.fromEntries(keys.map(key => [key, process.env[key]])), prior);
        await assert.rejects(fs.stat(ownedRoot), { code: 'ENOENT' });
        if (artifactPath) await assert.rejects(fs.stat(artifactPath), { code: 'ENOENT' });
    });
    await runAsyncTest('cleanup restores unset values and never removes a test override outside its owned root', async () => {
        for (const key of keys) delete process.env[key];
        const isolated = await setupIsolatedTestDb('override-storage-roots');
        const override = path.join(controlRoot, 'override');
        await fs.mkdir(override);
        await fs.writeFile(path.join(override, 'keep.txt'), 'keep');
        process.env.ARTIFACTS_ROOT = override;
        await isolated.cleanup();
        await isolated.cleanup();
        for (const key of keys) assert.equal(process.env[key], undefined, `${key} must be unset again`);
        assert.equal(await fs.readFile(path.join(override, 'keep.txt'), 'utf8'), 'keep');
    });
} finally {
    restore(original);
    await fs.rm(controlRoot, { recursive: true, force: true });
    finish();
}
