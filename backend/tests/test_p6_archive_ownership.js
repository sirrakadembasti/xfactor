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
const frontendNodeModules = path.join(repoRoot, 'frontend', 'node_modules');
const hiddenFrontendNodeModules = `${frontendNodeModules}.p6-archive-ownership-hidden`;
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

        for (const file of dependencyFiles) {
            const dependencyFile = path.join(frontendRoot, file);
            const contents = await fs.readFile(dependencyFile, 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
            if (contents !== null) assert.doesNotMatch(contents, /["']?jszip["']?\s*(?::|@)/i, `${file} must not declare or resolve frontend JSZip`);
        }
    });

    await runAsyncTest('ZIP creation and extraction use backend JSZip without frontend dependencies', async () => {
        const backendManifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'backend', 'package.json'), 'utf8'));
        const frontendManifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'frontend', 'package.json'), 'utf8'));
        assert.strictEqual(backendManifest.dependencies.jszip, '3.10.1');
        assert.strictEqual(frontendManifest.dependencies.jszip, undefined);

        const frontendExists = await fs.stat(frontendNodeModules).then(() => true).catch(() => false);
        if (frontendExists) await fs.rename(frontendNodeModules, hiddenFrontendNodeModules);
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
        } finally {
            if (frontendExists) await fs.rename(hiddenFrontendNodeModules, frontendNodeModules);
        }
    });
} finally {
    restoreEnv('ARTIFACTS_ROOT', previousEnv.ARTIFACTS_ROOT);
    restoreEnv('DB_PATH', previousEnv.DB_PATH);
    restoreEnv('NODE_ENV', previousEnv.NODE_ENV);
    restoreEnv('PROJECTS_ROOT', previousEnv.PROJECTS_ROOT);
    finish();
    await isolated.cleanup();
}
