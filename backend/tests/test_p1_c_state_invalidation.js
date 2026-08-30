import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import express from 'express';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-c-state-invalidation');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { createArtifact, getArtifact, supersedeArtifacts } = await import('../repositories/artifactRepository.js');
const { completeVerifiedProject, getProject } = await import('../projectRepository.js');
const { createProjectRouter } = await import('../routes/projectRoutes.js');

const { runAsyncTest, finish } = createTestHarness();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-invalidation-test-'));

function seedFullVerificationFixture(label, overrides = {}) {
    const projectId = `proj-inv-${label}`;
    const contractId = `contract-inv-${label}`;
    const requirementId = `req-inv-${label}`;
    const runId = `run-inv-${label}`;
    const artifactId = `artifact-inv-${label}`;
    const checkId = `check-inv-${label}`;

    const projectStatus = overrides.projectStatus || 'artifact_verified';
    const artifactStatus = overrides.artifactStatus || 'verified';
    const runStatus = overrides.runStatus || 'verified';
    const checkStatus = overrides.checkStatus || 'PASS';
    const withTraceability = overrides.withTraceability !== false;
    const withOpenRepair = Boolean(overrides.withOpenRepair);

    db.prepare('INSERT INTO projects (id, title, status, revision) VALUES (?, ?, ?, 1)')
        .run(projectId, `Project ${label}`, projectStatus);

    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash, approved_at
        ) VALUES (?, ?, 1, 'approved', '{"name":"inv-contract"}', 'hash-1', ?)
    `).run(contractId, projectId, new Date().toISOString());

    db.prepare(`
        INSERT INTO requirements (
            id, contract_id, stable_key, statement, kind, priority, mandatory, status
        ) VALUES (?, ?, ?, 'Mandatory statement', 'functional', 'high', 1, 'approved')
    `).run(requirementId, contractId, `REQ-${label}`);

    db.prepare(`
        INSERT INTO verification_runs (
            id, project_id, contract_id, status, policy_version, started_at, ended_at
        ) VALUES (?, ?, ?, ?, '1.0', ?, ?)
    `).run(runId, projectId, contractId, runStatus, new Date().toISOString(), new Date().toISOString());

    db.prepare(`
        INSERT INTO verification_checks (
            id, contract_id, run_id, gate_name, applicability, status,
            started_at, ended_at, timed_out
        ) VALUES (?, ?, ?, 'smoke_gate', 'MANDATORY', ?, ?, ?, 0)
    `).run(checkId, contractId, runId, checkStatus, new Date().toISOString(), new Date().toISOString());

    if (withTraceability) {
        db.prepare(`
            INSERT INTO requirement_check_links (contract_id, requirement_id, verification_check_id)
            VALUES (?, ?, ?)
        `).run(contractId, requirementId, checkId);
    }

    if (withOpenRepair) {
        db.prepare(`
            INSERT INTO repair_issues (
                id, project_id, contract_id, run_id, fingerprint, severity, status, detail_json
            ) VALUES (?, ?, ?, ?, 'fp-1', 'critical', 'open', '{}')
        `).run(`repair-${label}`, projectId, contractId, runId);
    }

    const artifactPath = path.join(tempDir, `${artifactId}.zip`);
    createArtifact({
        id: artifactId,
        projectId,
        contractId,
        kind: 'zip',
        path: artifactPath,
        sha256: 'a'.repeat(64),
        size: 1024,
        manifestJson: '[]',
        status: artifactStatus
    });

    if (artifactStatus === 'verified') {
        db.prepare('UPDATE artifacts SET verification_run_id = ? WHERE id = ?').run(runId, artifactId);
    }

    return {
        projectId,
        contractId,
        requirementId,
        runId,
        artifactId,
        artifactPath,
        projectRevision: 1
    };
}

try {
    await runAsyncTest('1. completeVerifiedProject rejects negative cases and leaves project non-completed', async () => {
        // Bad contract mismatch
        const f1 = seedFullVerificationFixture('bad-contract');
        await assert.rejects(
            async () => completeVerifiedProject({
                projectId: f1.projectId,
                contractId: 'wrong-contract',
                artifactId: f1.artifactId,
                expectedRevision: 1
            }),
            /latest approved contract/i
        );

        // Stale project status (not artifact_verified)
        const f2 = seedFullVerificationFixture('bad-status', { projectStatus: 'implementing' });
        await assert.rejects(
            async () => completeVerifiedProject({
                projectId: f2.projectId,
                contractId: f2.contractId,
                artifactId: f2.artifactId,
                expectedRevision: 1
            }),
            /artifact_verified/i
        );

        // Artifact not verified
        const f3 = seedFullVerificationFixture('unverified-artifact', { artifactStatus: 'draft' });
        await assert.rejects(
            async () => completeVerifiedProject({
                projectId: f3.projectId,
                contractId: f3.contractId,
                artifactId: f3.artifactId,
                expectedRevision: 1
            }),
            /verified/i
        );

        // Missing mandatory requirement traceability link
        const f4 = seedFullVerificationFixture('no-trace', { withTraceability: false });
        await assert.rejects(
            async () => completeVerifiedProject({
                projectId: f4.projectId,
                contractId: f4.contractId,
                artifactId: f4.artifactId,
                expectedRevision: 1
            }),
            /traceability/i
        );

        // Optional requirement linked while mandatory requirement is unlinked
        const f4b = seedFullVerificationFixture('opt-linked-mand-unlinked', { withTraceability: false });
        const optionalReqId = `opt-req-${f4b.projectId}`;
        db.prepare(`
            INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
            VALUES (?, ?, 'REQ-OPT', 'Optional statement', 'non-functional', 'low', 0, 'approved')
        `).run(optionalReqId, f4b.contractId);
        db.prepare(`
            INSERT INTO requirement_check_links (contract_id, requirement_id, verification_check_id)
            VALUES (?, ?, ?)
        `).run(f4b.contractId, optionalReqId, `check-inv-opt-linked-mand-unlinked`);
        await assert.rejects(
            async () => completeVerifiedProject({
                projectId: f4b.projectId,
                contractId: f4b.contractId,
                artifactId: f4b.artifactId,
                expectedRevision: 1
            }),
            /Mandatory requirement traceability is incomplete/i
        );

        // Open repair issue present
        const f5 = seedFullVerificationFixture('open-repair', { withOpenRepair: true });
        await assert.rejects(
            async () => completeVerifiedProject({
                projectId: f5.projectId,
                contractId: f5.contractId,
                artifactId: f5.artifactId,
                expectedRevision: 1
            }),
            /repair/i
        );
    });

    await runAsyncTest('2. completeVerifiedProject atomically updates state to completed and increments revision', async () => {
        const fixture = seedFullVerificationFixture('valid-complete');
        const completed = completeVerifiedProject({
            projectId: fixture.projectId,
            contractId: fixture.contractId,
            artifactId: fixture.artifactId,
            expectedRevision: 1
        });

        assert.strictEqual(completed.status, 'completed');
        assert.strictEqual(completed.revision, 2);

        const projectInDb = getProject(fixture.projectId);
        assert.strictEqual(projectInDb.status, 'completed');
        assert.strictEqual(projectInDb.revision, 2);
    });

    await runAsyncTest('3. supersedeArtifacts marks existing active artifacts superseded', async () => {
        const fixture = seedFullVerificationFixture('supersede-test');
        createArtifact({
            id: 'artifact-older',
            projectId: fixture.projectId,
            contractId: fixture.contractId,
            kind: 'zip',
            path: 'older.zip',
            sha256: 'b'.repeat(64),
            size: 512,
            manifestJson: '[]',
            status: 'draft'
        });

        supersedeArtifacts({
            projectId: fixture.projectId,
            contractId: fixture.contractId,
            exceptArtifactId: fixture.artifactId
        });

        const older = getArtifact({ projectId: fixture.projectId, contractId: fixture.contractId, artifactId: 'artifact-older' });
        assert.strictEqual(older.status, 'superseded');

        const current = getArtifact({ projectId: fixture.projectId, contractId: fixture.contractId, artifactId: fixture.artifactId });
        assert.strictEqual(current.status, 'verified');
    });

    await runAsyncTest('4. verified download route serves verified artifacts and rejects unverified ones with 409', async () => {
        const validFixture = seedFullVerificationFixture('download-valid');
        await fs.writeFile(validFixture.artifactPath, 'PK mock zip content');

        const unverifiedFixture = seedFullVerificationFixture('download-unverified', { artifactStatus: 'draft' });
        await fs.writeFile(unverifiedFixture.artifactPath, 'PK draft zip content');

        const app = express();
        app.use(express.json());
        app.use('/api/projects', createProjectRouter({
            requireAuth: (req, _res, next) => {
                req.user = { id: 'viewer-1', isAdmin: false };
                next();
            },
            projectAccess: () => (req, _res, next) => next(),
            wsHub: { broadcast() {} }
        }));

        const server = await new Promise(resolve => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });

        try {
            const { port } = server.address();
            const baseUrl = `http://127.0.0.1:${port}/api/projects`;

            // 1. Valid verified artifact download
            const res1 = await fetch(
                `${baseUrl}/${validFixture.projectId}/contracts/${validFixture.contractId}/artifacts/${validFixture.artifactId}/download`
            );
            assert.strictEqual(res1.status, 200);
            const body1 = await res1.text();
            assert.strictEqual(body1, 'PK mock zip content');

            // 2. Unverified artifact download returns 409
            const res2 = await fetch(
                `${baseUrl}/${unverifiedFixture.projectId}/contracts/${unverifiedFixture.contractId}/artifacts/${unverifiedFixture.artifactId}/download`
            );
            assert.strictEqual(res2.status, 409);
            const body2 = await res2.json();
            assert.match(body2.error, /not verified/i);
        } finally {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    });
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    finish();
    await isolated.cleanup();
}
