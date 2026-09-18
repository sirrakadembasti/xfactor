import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p6-archive-ownership');
const isolatedRoot = path.dirname(isolated.dbPath);
const previousEnv = {
    ARTIFACTS_ROOT: process.env.ARTIFACTS_ROOT,
    DB_PATH: process.env.DB_PATH,
    NODE_ENV: process.env.NODE_ENV,
    PROJECTS_ROOT: process.env.PROJECTS_ROOT
};
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { runAsyncTest, finish } = createTestHarness();

function restoreEnv(name, value) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

function runChild(script) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
            cwd: repoRoot,
            stdio: 'inherit'
        });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Child process exited ${code}`)));
    });
}

function assertNoJsZipInDependencyMap(dependencies, label) {
    assert.strictEqual(dependencies?.jszip, undefined, `${label} must not declare JSZip`);
}

function assertNoJsZipInPackageLock(lock, label) {
    assertNoJsZipInDependencyMap(lock.packages?.['']?.dependencies, label);
    assertNoJsZipInDependencyMap(lock.packages?.['']?.devDependencies, label);
    assertNoJsZipInDependencyMap(lock.packages?.['']?.optionalDependencies, label);
    assertNoJsZipInDependencyMap(lock.packages?.['']?.peerDependencies, label);

    for (const [packagePath, packageMetadata] of Object.entries(lock.packages ?? {})) {
        assert.notStrictEqual(packagePath.split('/').at(-1), 'jszip', `${label} must not resolve JSZip`);
        assert.notStrictEqual(packageMetadata.name, 'jszip', `${label} must not resolve JSZip`);
    }

    assertNoJsZipInDependencyMap(lock.dependencies, label);
}

function assertNoJsZipInBunLock(lock, label) {
    const workspace = lock.workspaces?.[''];
    assertNoJsZipInDependencyMap(workspace?.dependencies, label);
    assertNoJsZipInDependencyMap(workspace?.devDependencies, label);

    for (const [packageName, packageMetadata] of Object.entries(lock.packages ?? {})) {
        assert.notStrictEqual(packageName, 'jszip', `${label} must not resolve JSZip`);
        assert.notStrictEqual(Array.isArray(packageMetadata) ? packageMetadata[0]?.split('@')[0] : packageMetadata?.name, 'jszip', `${label} must not resolve JSZip`);
    }
}

try {
    process.env.DB_PATH = isolated.dbPath;
    process.env.ARTIFACTS_ROOT = path.join(isolatedRoot, 'artifacts');
    process.env.PROJECTS_ROOT = path.join(isolatedRoot, 'projects');

    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { getArtifactsRoot, assertArtifactsRootAvailable } = await import('../artifactPaths.js');
    const { createProjectZip } = await import('../utils/archive.js');

    const projectId = 'p6-archive-ownership-project';
    const contractId = 'p6-archive-ownership-contract';
    db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'P6 archive ownership', 'planning')").run(projectId);
    db.prepare(`
        INSERT INTO project_contracts (id, project_id, revision, contract_hash, status, contract_json)
        VALUES (?, ?, 1, 'hash', 'approved', '{}')
    `).run(contractId, projectId);

    await runAsyncTest('backend resolves, creates, and writes artifacts at the configured canonical root', async () => {
        assert.strictEqual(getArtifactsRoot(), path.resolve(process.env.ARTIFACTS_ROOT));
        assert.strictEqual(await assertArtifactsRootAvailable(), path.resolve(process.env.ARTIFACTS_ROOT));

        const artifact = await createProjectZip(projectId, contractId, [
            { path: 'src/index.js', content: 'export default 1;\n' }
        ]);
        assert.strictEqual(path.dirname(artifact.path), path.resolve(process.env.ARTIFACTS_ROOT));
        assert.strictEqual((await fs.stat(artifact.path)).isFile(), true);
    });

    await runAsyncTest('production artifact roots require an absolute explicit configuration', async () => {
        assert.throws(() => getArtifactsRoot({ NODE_ENV: 'production' }), /ARTIFACTS_ROOT is required/);
        assert.throws(() => getArtifactsRoot({ NODE_ENV: 'production', ARTIFACTS_ROOT: 'relative' }), /ARTIFACTS_ROOT must be absolute/);
    });

    await runAsyncTest('frontend dependency inventory excludes JSZip from every recognized manifest and lockfile', async () => {
        const frontendRoot = path.join(repoRoot, 'frontend');
        const dependencyFiles = ['package.json', 'package-lock.json', 'bun.lock', 'bun.lockb'];

        assert.throws(
            () => assertNoJsZipInPackageLock({ packages: { 'node_modules/jszip': { version: '3.10.1' } } }, 'package-lock fixture'),
            /JSZip/
        );

        const manifest = JSON.parse(await fs.readFile(path.join(frontendRoot, 'package.json'), 'utf8'));
        assertNoJsZipInDependencyMap(manifest.dependencies, 'package.json');
        assertNoJsZipInDependencyMap(manifest.devDependencies, 'package.json');

        const npmLock = JSON.parse(await fs.readFile(path.join(frontendRoot, 'package-lock.json'), 'utf8'));
        assertNoJsZipInPackageLock(npmLock, 'package-lock.json');

        const bunLock = await fs.readFile(path.join(frontendRoot, 'bun.lock'), 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        if (bunLock !== null) assertNoJsZipInBunLock(JSON.parse(bunLock), 'bun.lock');

        const bunBinaryLock = await fs.readFile(path.join(frontendRoot, 'bun.lockb')).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        assert.strictEqual(bunBinaryLock, null, 'bun.lockb is obsolete under the canonical npm lock policy');
    });

    await runAsyncTest('ZIP creation and extraction use backend JSZip without frontend dependencies', async () => {
        const backendManifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'backend', 'package.json'), 'utf8'));
        const frontendManifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'frontend', 'package.json'), 'utf8'));
        assert.strictEqual(backendManifest.dependencies.jszip, '3.10.1');
        assert.strictEqual(frontendManifest.dependencies.jszip, undefined);

        try {
            await runChild(`
                import assert from 'node:assert';
                import fs from 'node:fs/promises';
                import os from 'node:os';
                import path from 'node:path';
                import { createRequire } from 'node:module';
                import './backend/utils/archive.js';
                import { safeExtractZip } from './backend/verification/safeExtractor.js';
                const require = createRequire(path.join(process.cwd(), 'backend', 'package.json'));
                const JSZip = require('jszip');
                const zip = new JSZip();
                zip.file('src/index.js', 'export default 1;\\n');
                const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-p6-zip-child-'));
                try {
                    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
                    const result = await safeExtractZip(buffer, outputDir);
                    assert.deepStrictEqual(result.files, ['src/index.js']);
                    assert.strictEqual(await fs.readFile(path.join(outputDir, 'src/index.js'), 'utf8'), 'export default 1;\\n');
                } finally {
                    await fs.rm(outputDir, { recursive: true, force: true });
                }
            `);
        } finally {}
    });
} finally {
    restoreEnv('ARTIFACTS_ROOT', previousEnv.ARTIFACTS_ROOT);
    restoreEnv('DB_PATH', previousEnv.DB_PATH);
    restoreEnv('NODE_ENV', previousEnv.NODE_ENV);
    restoreEnv('PROJECTS_ROOT', previousEnv.PROJECTS_ROOT);
    finish();
    await isolated.cleanup();
}
