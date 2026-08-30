import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-c-artifact-repository');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const {
    addArtifactFile,
    createArtifact,
    getArtifact,
    getArtifactFiles,
    getLatestVerifiedArtifact,
    updateArtifactStatus
} = await import('../repositories/artifactRepository.js');

const { runAsyncTest, finish } = createTestHarness();
const projectId = 'p1-c-repository-project';
const contractId = 'p1-c-repository-contract';
const verificationRunId = 'p1-c-repository-run';

db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Artifact Repository Test', 'runtime_verified')")
    .run(projectId);
db.prepare(`
    INSERT INTO project_contracts (
        id, project_id, revision, status, contract_json, contract_hash, approved_at
    ) VALUES (?, ?, 1, 'approved', '{}', 'artifact-contract-hash', ?)
`).run(contractId, projectId, new Date().toISOString());
db.prepare(`
    INSERT INTO verification_runs (
        id, project_id, contract_id, status, policy_version, started_at, ended_at
    ) VALUES (?, ?, ?, 'verified', '1.0', ?, ?)
`).run(
    verificationRunId,
    projectId,
    contractId,
    new Date().toISOString(),
    new Date().toISOString()
);

try {
    await runAsyncTest('1. artifact CRUD is scoped by project and contract identity', async () => {
        const artifact = createArtifact({
            id: 'artifact-crud',
            projectId,
            contractId,
            kind: 'zip',
            path: 'artifacts/project.zip',
            sha256: 'a'.repeat(64),
            size: 1024,
            manifestJson: JSON.stringify([{ path: 'src/App.js' }]),
            status: 'draft'
        });

        assert.strictEqual(artifact.id, 'artifact-crud');
        assert.strictEqual(artifact.status, 'draft');
        assert.strictEqual(
            getArtifact({ projectId, contractId, artifactId: artifact.id }).sha256,
            'a'.repeat(64)
        );
        assert.strictEqual(
            getArtifact({ projectId: 'wrong-project', contractId, artifactId: artifact.id }),
            undefined
        );
    });

    await runAsyncTest('2. artifact files enforce composite ownership and remain queryable', async () => {
        createArtifact({
            id: 'artifact-files',
            projectId,
            contractId,
            kind: 'zip',
            path: 'artifacts/files.zip',
            sha256: 'b'.repeat(64),
            size: 2048,
            manifestJson: '[]',
            status: 'built'
        });

        assert.throws(() => addArtifactFile({
            contractId: 'wrong-contract',
            artifactId: 'artifact-files',
            path: 'src/App.js',
            sha256: 'c'.repeat(64),
            size: 512
        }), /FOREIGN KEY/);

        addArtifactFile({
            contractId,
            artifactId: 'artifact-files',
            path: 'src/App.js',
            sha256: 'c'.repeat(64),
            size: 512
        });
        const files = getArtifactFiles({ contractId, artifactId: 'artifact-files' });
        assert.strictEqual(files.length, 1);
        assert.strictEqual(files[0].path, 'src/App.js');
    });

    await runAsyncTest('3. verified status references machine evidence and is discoverable', async () => {
        createArtifact({
            id: 'artifact-verified',
            projectId,
            contractId,
            kind: 'zip',
            path: 'artifacts/verified.zip',
            sha256: 'd'.repeat(64),
            size: 4096,
            manifestJson: '[]',
            status: 'verification_pending'
        });

        updateArtifactStatus({
            projectId,
            contractId,
            artifactId: 'artifact-verified',
            status: 'verified',
            verificationRunId
        });

        const artifact = getArtifact({
            projectId,
            contractId,
            artifactId: 'artifact-verified'
        });
        assert.strictEqual(artifact.status, 'verified');
        assert.strictEqual(artifact.verification_run_id, verificationRunId);
        assert.strictEqual(
            getLatestVerifiedArtifact({ projectId, contractId }).id,
            'artifact-verified'
        );
    });
} finally {
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    finish();
    await isolated.cleanup();
}
