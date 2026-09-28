import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-c-artifact-verifier');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { createArtifact, getArtifact, getLatestVerifiedArtifact } = await import('../repositories/artifactRepository.js');
const { verifyArtifact, hasMandatoryGateCoverage } = await import('../verification/artifactVerifier.js');
const { RUNTIME_GATE_MEMBERS } = await import('../verification/qualityPolicy.js');

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

async function registerArtifact(artifactId, zipPath) {
    const archiveBytes = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(archiveBytes);
    const manifest = [];
    for (const [entryPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const content = await entry.async('nodebuffer');
        const row = {
            path: entryPath.replace(/\\/g, '/'),
            sha256: crypto.createHash('sha256').update(content).digest('hex'),
            size: content.length
        };
        manifest.push(row);
    }
    const archiveHash = crypto.createHash('sha256').update(archiveBytes).digest('hex');
    createArtifact({
        id: artifactId, projectId, contractId, kind: 'zip', path: zipPath,
        sha256: archiveHash, size: archiveBytes.length,
        manifestJson: JSON.stringify(manifest), status: 'draft'
    });
    for (const row of manifest) {
        db.prepare('INSERT INTO artifact_files (contract_id, artifact_id, path, sha256, size) VALUES (?, ?, ?, ?, ?)')
            .run(contractId, artifactId, row.path, row.sha256, row.size);
    }
    return { archiveBytes, archiveHash };
}

function passingCheck(name) {
    const timestamp = new Date().toISOString();
    return {
        name,
        status: 'PASS',
        command: `verify ${name}`,
        exitCode: 0,
        startedAt: timestamp,
        endedAt: timestamp,
        stdoutDigest: `stdout-${name}`,
        stderrDigest: `stderr-${name}`,
        policyVersion: '2.0'
    };
}

function artifactIdentity(artifactId, runId, artifactHash) {
    return {
        version: 1,
        jobId: `job-${runId}`,
        operation: 'verify_artifact',
        projectId,
        contractId,
        contractHash: 'hash',
        revision: 1,
        artifactId,
        nonce: `nonce-${runId}`,
        inputSha256: artifactHash,
        runId
    };
}

function workerResponse(identity, checks = [], status = 'failed', error = 'worker rejection') {
    return {
        ...identity,
        status,
        error: status === 'completed' ? null : error,
        result: { ...identity, status, checks }
    };
}

const allGates = [
    'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
    'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
    'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
    'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
];

assert.equal(typeof hasMandatoryGateCoverage, 'function');
assert.equal(hasMandatoryGateCoverage(allGates.map(passingCheck)), true);
assert.equal(hasMandatoryGateCoverage(allGates.filter(name => name !== 'framework_build').map(passingCheck)), false,
    'a worker cannot verify an artifact while omitting a mandatory gate');

try {
    await runAsyncTest('1. verifyArtifact fails closed and rejects artifact when package lockfile is missing', async () => {
        const zipPath = await createTestZip('broken-lock.zip', [
            { path: 'package.json', content: '{"name":"broken-app"}' },
            { path: 'src/index.js', content: 'console.log("no lock");' }
        ]);

        const artifactId = 'artifact-broken-lock';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const runId = 'run-broken-lock';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId,
            activeJob: identity,
            archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, [], 'failed', 'package-lock.json missing') }
        });
        assert.strictEqual(result.status, 'failed');
        assert.strictEqual(result.passed, false);
        assert.ok(result.runId);
        assert.ok(result.error);

        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'rejected');
        assert.strictEqual(artifact.verificationRunId, result.runId);

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
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        db.prepare("UPDATE projects SET status = 'implementation_finished' WHERE id = ?").run(projectId);
        const runId = 'run-valid';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const checks = allGates.map(name => ({
            ...passingCheck(name),
            evidenceJson: name === 'domain_entity_check'
                ? { evidence: { kind: 'derived_gate', producer: 'quality-policy', sourceGateNames: ['domain_entity_check'], policyVersion: '2.0', computedAt: new Date().toISOString() } }
                : { evidence: { producer: 'quality-policy', policyVersion: '2.0' } }
        }));
        checks.push(...[...new Set(Object.values(RUNTIME_GATE_MEMBERS).flatMap(members => [...members]))].map(passingCheck));
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId,
            activeJob: identity,
            archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, checks, 'completed') }
        });

        assert.strictEqual(result.status, 'verified');
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.error, null);
        assert.ok(result.runId);

        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'verified');
        assert.strictEqual(artifact.verificationRunId, result.runId);

        const latest = getLatestVerifiedArtifact({ projectId, contractId });
        assert.strictEqual(latest.id, artifactId);

        const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(result.runId);
        assert.ok(run);
        assert.strictEqual(run.status, 'verified');
        const hardeningEvidence = db.prepare(`
            SELECT evidence_json FROM verification_checks
            WHERE run_id = ? AND gate_name = 'domain_entity_check'
        `).get(result.runId);
        const evidence = JSON.parse(hardeningEvidence.evidence_json).evidence;
        assert.deepStrictEqual(
            {
                kind: evidence.kind,
                producer: evidence.producer,
                sourceGateNames: evidence.sourceGateNames,
                policyVersion: evidence.policyVersion
            },
            {
                kind: 'derived_gate',
                producer: 'quality-policy',
                sourceGateNames: ['domain_entity_check'],
                policyVersion: '2.0'
            }
        );
        assert.ok(evidence.computedAt);
    });

    await runAsyncTest('2b. worker aggregate PASS cannot replace missing runtime member evidence', async () => {
        const zipPath = await createTestZip('aggregate-only.zip', [
            { path: 'package.json', content: '{"name":"aggregate-only"}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'service-manifest.json', content: '{"version":"1.0","services":{}}' }
        ]);
        const artifactId = 'artifact-aggregate-only';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const runId = 'run-aggregate-only';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId, activeJob: identity, archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, allGates.map(passingCheck), 'completed') }
        });
        assert.equal(result.passed, false);
        assert.equal(getArtifact({ projectId, contractId, artifactId }).status, 'rejected');
    });

    await runAsyncTest('3. verifyArtifact rejects malicious symlink before persistence', async () => {
        const zipPath = await createTestZip('symlink.zip', [
            { path: 'safe.txt', content: 'hello' },
            { path: 'link-out.js', content: '../target', options: { unixPermissions: 0o120777 } }
        ], { platform: 'UNIX' });

        const artifactId = 'artifact-symlink';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const runId = 'run-symlink';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        await assert.rejects(
            verifyArtifact({ projectId, contractId, artifactId }, {
                runId,
                activeJob: identity,
                archiveBase64: archiveBytes.toString('base64'),
                executionClient: { verifyArtifact: async () => { throw new Error('must not execute'); } }
            }),
            /Symbolic link detected/i
        );
        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'draft');
        assert.strictEqual(artifact.verificationRunId, null);
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM verification_runs WHERE id = ?').get(runId).count,
            0
        );
    });
    await runAsyncTest('4. verifyArtifact throws meaningful error when artifact is missing from DB', async () => {
        const runId = 'run-missing-artifact';
        const identity = artifactIdentity('non-existent-artifact', runId, '0'.repeat(64));
        await assert.rejects(
            async () => verifyArtifact({ projectId, contractId, artifactId: 'non-existent-artifact' }, {
                runId, activeJob: identity,
                executionClient: { verifyArtifact: async () => { throw new Error('must not execute'); } }
            }),
            /not found/i
        );
    });
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    finish();
    await isolated.cleanup();
}
