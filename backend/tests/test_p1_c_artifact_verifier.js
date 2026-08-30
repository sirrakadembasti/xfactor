import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const require = createRequire(import.meta.url);
const JSZip = (await import('jszip').catch(() => null))?.default || require('../../frontend/node_modules/jszip');

const isolated = await setupIsolatedTestDb('p1-c-artifact-verifier');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { createArtifact, getArtifact, getLatestVerifiedArtifact } = await import('../repositories/artifactRepository.js');
const { verifyArtifact } = await import('../verification/artifactVerifier.js');

const { runAsyncTest, finish } = createTestHarness();
const projectId = 'pipeline-proj-123';
const contractId = 'pipeline-contract-456';
const requirementId = 'req-pipeline-1';
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-artifact-verifier-test-'));

db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Pipeline', 'implementation_finished')").run(projectId);
db.prepare(`
    INSERT INTO project_contracts (id, project_id, revision, contract_hash, status, contract_json)
    VALUES (?, ?, 1, 'hash', 'approved', '{"name":"test-contract"}')
`).run(contractId, projectId);
db.prepare(`
    INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
    VALUES (?, ?, 'REQ-PIPE-1', 'Core requirement', 'functional', 'high', 1, 'approved')
`).run(requirementId, contractId);
db.prepare(`
    INSERT INTO task_checkpoints (
        project_id, task_id, contract_id, plan_hash, task_spec_hash,
        input_hash, output_hash, gate_version, status
    ) VALUES (?, 'task-1', ?, 'plan', 'spec', 'input', 'output', 'v1', 'completed')
`).run(projectId, contractId);

async function createTestZip(fileName, files, options = {}) {
    const zip = new JSZip();
    for (const f of files) {
        zip.file(f.path, f.content, f.options);
    }
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: options.platform || 'UNIX' });
    const zipPath = path.join(tempDir, fileName);
    await fs.writeFile(zipPath, zipBuf);
    return zipPath;
}

try {
    await runAsyncTest('1. verifyArtifact fails closed and rejects artifact when package lockfile is missing', async () => {
        const zipPath = await createTestZip('broken-lock.zip', [
            { path: 'package.json', content: '{"name":"broken-app"}' },
            { path: 'src/index.js', content: 'console.log("no lock");' }
        ]);

        const artifactId = 'artifact-broken-lock';
        createArtifact({
            id: artifactId,
            projectId,
            contractId,
            kind: 'zip',
            path: zipPath,
            sha256: 'mocksha1',
            size: 100,
            manifestJson: '[]',
            status: 'draft'
        });

        const result = await verifyArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(result.status, 'failed');
        assert.strictEqual(result.passed, false);
        assert.ok(result.runId);
        assert.ok(result.error);

        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'rejected');
        assert.strictEqual(artifact.verification_run_id, result.runId);

        const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(result.runId);
        assert.ok(run);
        assert.strictEqual(run.status, 'failed');
    });

    await runAsyncTest('2. verifyArtifact marks artifact verified when all clean-room gates pass', async () => {
        const zipPath = await createTestZip('valid-app.zip', [
            { path: 'package.json', content: '{"name":"valid-app","dependencies":{}}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'service-manifest.json', content: '{"version":"1.0","services":{}}' },
            { path: 'src/index.js', content: 'console.log("valid");' }
        ]);

        const artifactId = 'artifact-valid';
        createArtifact({
            id: artifactId,
            projectId,
            contractId,
            kind: 'zip',
            path: zipPath,
            sha256: 'mocksha2',
            size: 200,
            manifestJson: '[]',
            status: 'draft'
        });

        // Reset project status for clean verification run
        db.prepare("UPDATE projects SET status = 'implementation_finished' WHERE id = ?").run(projectId);

        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            verifiers: {
                dependencies: async () => ({
                    passed: true,
                    checks: [
                        { name: 'package_json', status: 'passed' },
                        { name: 'lockfile', status: 'passed' },
                        { name: 'ast_import_inventory', status: 'passed' },
                        { name: 'clean_install', status: 'passed' }
                    ]
                }),
                build: async () => ({
                    passed: true,
                    checks: [
                        { name: 'typecheck', status: 'passed' },
                        { name: 'framework_build', status: 'passed' }
                    ]
                }),
                smoke: async () => ({
                    passed: true,
                    checks: [
                        { name: 'manifest_presence', status: 'passed' },
                        { name: 'database_connectivity', status: 'passed' },
                        { name: 'api_status_check', status: 'passed' },
                        { name: 'browser_page_load', status: 'passed' },
                        { name: 'smoke_gate', status: 'passed' },
                        { name: 'test_script_presence', status: 'passed' }
                    ]
                })
            }
        });

        assert.strictEqual(result.status, 'verified');
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.error, null);
        assert.ok(result.runId);

        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'verified');
        assert.strictEqual(artifact.verification_run_id, result.runId);

        const latest = getLatestVerifiedArtifact({ projectId, contractId });
        assert.strictEqual(latest.id, artifactId);

        const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(result.runId);
        assert.ok(run);
        assert.strictEqual(run.status, 'verified');
    });

    await runAsyncTest('3. verifyArtifact rejects malicious symlink artifact and sets artifact status rejected with linked run', async () => {
        const zipPath = await createTestZip('symlink.zip', [
            { path: 'safe.txt', content: 'hello' },
            { path: 'link-out.js', content: '../target', options: { unixPermissions: 0o120777 } }
        ], { platform: 'UNIX' });

        const artifactId = 'artifact-symlink';
        createArtifact({
            id: artifactId,
            projectId,
            contractId,
            kind: 'zip',
            path: zipPath,
            sha256: 'mocksha3',
            size: 150,
            manifestJson: '[]',
            status: 'draft'
        });

        const result = await verifyArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(result.status, 'failed');
        assert.strictEqual(result.passed, false);
        assert.ok(result.runId);
        assert.ok(result.error);
        assert.match(result.error, /Symbolic link/i);

        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'rejected');
        assert.strictEqual(artifact.verification_run_id, result.runId);

        const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(result.runId);
        assert.ok(run);
        assert.strictEqual(run.status, 'failed');
    });

    await runAsyncTest('4. verifyArtifact throws meaningful error when artifact is missing from DB', async () => {
        await assert.rejects(
            async () => verifyArtifact({ projectId, contractId, artifactId: 'non-existent-artifact' }),
            /not found/i
        );
    });
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    finish();
    await isolated.cleanup();
}
