import assert from 'assert';
import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p7-approve-state');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const { runAsyncTest, finish } = createTestHarness();

try {
    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { createProject } = await import('../projectRepository.js');
    const { readProjectState, writeProjectState } = await import('../engine/index.js');
    const { createContractRevision } = await import('../contracts/projectContract.js');
    const { createProjectRouter } = await import('../routes/projectRoutes.js');
    const { abortProjectExecution } = await import('../engine/cancellation.js');

    function buildApproveApp() {
        const requireAuth = (req, _res, next) => {
            req.user = { id: 'test-user-approve' };
            next();
        };
        const passThrough = (_req, _res, next) => next();
        const app = express();
        app.use(express.json());
        app.use('/api/projects', createProjectRouter({
            requireAuth,
            projectAccess: () => passThrough,
            wsHub: { broadcast() {}, publish() {} }
        }));
        // eslint-disable-next-line no-unused-vars
        app.use((err, _req, res, _next) => {
            res.status(err.status || 500).json({ error: err.message });
        });
        return app;
    }

    async function approveViaHttp(projectId) {
        const app = buildApproveApp();
        const server = http.createServer(app);
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        try {
            const { port } = server.address();
            const response = await fetch(`http://127.0.0.1:${port}/api/projects/${projectId}/approve`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}'
            });
            const body = await response.json();
            return { status: response.status, body };
        } finally {
            await new Promise((r) => server.close(r));
        }
    }

    await runAsyncTest('1. POST /:id/approve returns implementing state with fresh revision and workflow', async () => {
        const project = await createProject({ title: 'P7 Approve State' });
        const validPlan = {
            summary: 'P7 approve response test',
            frontend: { framework: 'react' },
            backend: { framework: 'express' },
            database: { engine: 'sqlite' }
        };
        createContractRevision(project.id, validPlan, 'msg-approve-1');

        const pending = await readProjectState(project.id);
        pending.status = 'pending_approval';
        await writeProjectState(pending);
        const revisionBefore = (await readProjectState(project.id)).revision;

        const { status, body } = await approveViaHttp(project.id);
        try {
            assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);
            assert.strictEqual(body.status, 'implementing', 'response must carry the approved implementing state');
            assert.ok(body.revision > revisionBefore, `revision must advance past ${revisionBefore} (got ${body.revision})`);
            assert.ok(body.workflow && typeof body.workflow === 'object', 'workflow must be initialized');
            assert.ok('directorSpecs' in body.workflow, 'workflow must include directorSpecs');
            assert.ok('teamleaderPlans' in body.workflow, 'workflow must include teamleaderPlans');
            assert.ok(typeof body.attemptId === 'string' && body.attemptId.length > 0, 'attemptId must be present');
            // NOTE: persisted state is intentionally not re-read here: the fire-and-forget
            // background execution may already have advanced it (e.g. paused on failure).
            // The contract under test is the approve RESPONSE carrying approvedState.
        } finally {
            try {
                abortProjectExecution(project.id);
            } catch {}
        }
    });

    finish();
} finally {
    await isolated.cleanup();
}
