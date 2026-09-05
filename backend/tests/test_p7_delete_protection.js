import assert from 'assert';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p7-delete-protection');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const { runAsyncTest, finish } = createTestHarness();

try {
    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { createProject, deleteProject, getProject, getProjectDir } = await import('../projectRepository.js');
    const { createProjectRouter } = await import('../routes/projectRoutes.js');

    const projectRow = (id) => db.prepare('SELECT id, status FROM projects WHERE id = ?').get(id);

    function seedCompletionReceipt(projectId, tag) {
        const contractId = `p7del-contract-${tag}`;
        const runId = `p7del-run-${tag}`;
        const artifactId = `p7del-art-${tag}`;
        const receiptId = `p7del-receipt-${tag}`;
        const now = new Date().toISOString();
        db.prepare(
            "INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at) VALUES (?, ?, 1, 'approved', '{}', ?, ?, ?)"
        ).run(contractId, projectId, `hash-${tag}`, now, now);
        db.prepare(
            "INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'verified', '1.0', ?, ?)"
        ).run(runId, projectId, contractId, now, now);
        db.prepare(
            "INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id) VALUES (?, ?, ?, 'zip', ?, ?, 123, 'verified', ?)"
        ).run(artifactId, projectId, contractId, `artifacts/${tag}.zip`, 'a'.repeat(64), runId);
        db.prepare(
            `INSERT INTO completion_receipts (
                id, project_id, contract_id, contract_hash, artifact_id, artifact_hash,
                run_id, policy_version, mandatory_gate_digests,
                previous_revision, next_revision, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, '1.0', '[]', 0, 1, ?)`
        ).run(receiptId, projectId, contractId, `hash-${tag}`, artifactId, 'b'.repeat(64), runId, now);
        return receiptId;
    }

    function buildDeleteApp() {
        const passThrough = (req, _res, next) => next();
        const app = express();
        app.use(express.json());
        app.use('/api/projects', createProjectRouter({
            requireAuth: passThrough,
            projectAccess: () => passThrough,
            wsHub: { broadcast() {} }
        }));
        // Surface non-RESTRICT errors as JSON so the test fails loudly instead of hanging.
        // eslint-disable-next-line no-unused-vars
        app.use((err, _req, res, _next) => {
            res.status(err.status || 500).json({ error: err.message, code: err.code });
        });
        return app;
    }

    async function deleteViaHttp(projectId) {
        const app = buildDeleteApp();
        const server = http.createServer(app);
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        try {
            const { port } = server.address();
            const response = await fetch(`http://127.0.0.1:${port}/api/projects/${projectId}`, {
                method: 'DELETE'
            });
            const body = await response.json();
            return { status: response.status, body };
        } finally {
            await new Promise((r) => server.close(r));
        }
    }

    await runAsyncTest('1. Draft/planning project deletes cleanly (disk and DB removed)', async () => {
        const project = await createProject({ title: 'P7 Delete Draft' });
        const dir = getProjectDir(project.id);
        assert.ok(fsSync.existsSync(dir), 'project dir must exist before delete');
        const deleted = await deleteProject(project.id);
        assert.strictEqual(deleted, true);
        assert.strictEqual(projectRow(project.id), undefined);
        assert.strictEqual(fsSync.existsSync(dir), false);
    });

    await runAsyncTest('2. Project with completion_receipts throws PROJECT_LOCKED_RECEIPT and keeps disk + DB', async () => {
        const project = await createProject({ title: 'P7 Delete Locked' });
        seedCompletionReceipt(project.id, project.id.slice(-8));
        const dir = getProjectDir(project.id);
        let caught = null;
        try {
            await deleteProject(project.id);
        } catch (err) {
            caught = err;
        }
        assert.ok(caught, 'deleteProject must throw for locked project');
        assert.strictEqual(caught.message, 'RESTRICT: Cannot delete project with verified delivery receipt');
        assert.strictEqual(caught.code, 'PROJECT_LOCKED_RECEIPT');
        assert.ok(projectRow(project.id), 'DB row must survive restricted delete');
        assert.ok(fsSync.existsSync(dir), 'disk directory must survive restricted delete');
        // Cleanup with force so later cases and other suites see no residue.
        const forced = await deleteProject(project.id, { force: true });
        assert.strictEqual(forced, true);
    });

    await runAsyncTest('3. deleteProject(projectId, { force: true }) bypasses the restriction', async () => {
        const project = await createProject({ title: 'P7 Delete Forced' });
        seedCompletionReceipt(project.id, project.id.slice(-8));
        const dir = getProjectDir(project.id);
        const deleted = await deleteProject(project.id, { force: true });
        assert.strictEqual(deleted, true);
        assert.strictEqual(projectRow(project.id), undefined);
        assert.strictEqual(fsSync.existsSync(dir), false);
    });

    await runAsyncTest('4. DELETE /api/projects/:id returns 409 with code PROJECT_LOCKED_RECEIPT', async () => {
        const project = await createProject({ title: 'P7 Delete HTTP' });
        seedCompletionReceipt(project.id, project.id.slice(-8));
        const { status, body } = await deleteViaHttp(project.id);
        assert.strictEqual(status, 409);
        assert.strictEqual(body.code, 'PROJECT_LOCKED_RECEIPT');
        assert.ok(body.error.includes('RESTRICT'));
        assert.ok(projectRow(project.id), 'DB row must survive restricted HTTP delete');
        assert.ok(fsSync.existsSync(getProjectDir(project.id)), 'disk must survive restricted HTTP delete');
        await deleteProject(project.id, { force: true });
    });

    finish();
} finally {
    await isolated.cleanup();
}
