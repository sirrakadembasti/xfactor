import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const require = createRequire(import.meta.url);
const JSZip = (await import('jszip').catch(() => null))?.default || require('../../frontend/node_modules/jszip');

const isolated = await setupIsolatedTestDb('p1-c-archive');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { createProjectZip } = await import('../utils/archive.js');
const { getArtifact, getArtifactFiles } = await import('../repositories/artifactRepository.js');

const { runAsyncTest, finish } = createTestHarness();
const projectId = 'archive-proj-123';
const contractId = 'archive-contract-456';
const testArtifactsDir = path.join(path.dirname(isolated.dbPath), 'test_artifacts');

db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Archive', 'planning')").run(projectId);
db.prepare(`
    INSERT INTO project_contracts (id, project_id, revision, contract_hash, status, contract_json)
    VALUES (?, ?, 1, 'hash', 'approved', '{}')
`).run(contractId, projectId);

try {
    await runAsyncTest('1. createProjectZip creates valid ZIP file, calculates SHA-256 and persists artifact records', async () => {
        const files = [
            { path: 'package.json', content: '{"name":"test-app","dependencies":{}}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'src/index.js', content: 'console.log("App running");' },
            { path: 'src/components/Button.jsx', content: 'export default function Button() { return <button>Click</button>; }' }
        ];

        const result = await createProjectZip(projectId, contractId, files, testArtifactsDir);

        assert.ok(result.id.startsWith('artifact-'));
        assert.strictEqual(typeof result.sha256, 'string');
        assert.strictEqual(result.sha256.length, 64);
        assert.ok(result.size > 0);
        assert.strictEqual(result.manifest.length, 4);

        const fileExists = await fs.access(result.path).then(() => true).catch(() => false);
        assert.ok(fileExists, 'ZIP file must be created on disk');

        // Verify ZIP contents can be extracted and match original
        const zipData = await fs.readFile(result.path);
        const unzipped = await JSZip.loadAsync(zipData);
        assert.strictEqual(await unzipped.file('src/components/Button.jsx').async('text'), 'export default function Button() { return <button>Click</button>; }');
        assert.strictEqual(await unzipped.file('package.json').async('text'), '{"name":"test-app","dependencies":{}}');

        const artifactRow = getArtifact({ projectId, contractId, artifactId: result.id });
        assert.ok(artifactRow, 'Artifact row must exist in DB');
        assert.strictEqual(artifactRow.sha256, result.sha256);
        assert.strictEqual(artifactRow.kind, 'zip');
        assert.strictEqual(artifactRow.status, 'draft');

        const fileRows = getArtifactFiles({ contractId, artifactId: result.id });
        assert.strictEqual(fileRows.length, 4);
        const paths = fileRows.map(f => f.path);
        assert.ok(paths.includes('package.json'));
        assert.ok(paths.includes('package-lock.json'));
        assert.ok(paths.includes('src/index.js'));
        assert.ok(paths.includes('src/components/Button.jsx'));
    });

    await runAsyncTest('2. createProjectZip creates unique artifact IDs and paths for subsequent runs', async () => {
        const files = [{ path: 'README.md', content: '# Readme' }];
        const res1 = await createProjectZip(projectId, contractId, files, testArtifactsDir);
        const res2 = await createProjectZip(projectId, contractId, files, testArtifactsDir);

        assert.notStrictEqual(res1.id, res2.id);
        assert.notStrictEqual(res1.path, res2.path);
        assert.strictEqual(res1.sha256, res2.sha256); // same content = same ZIP hash
    });
} finally {
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    finish();
    await isolated.cleanup();
}
