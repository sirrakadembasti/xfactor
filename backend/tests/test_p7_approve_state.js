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
    const { createContractRevision, approveContractRevision } = await import('../contracts/projectContract.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    const { createProjectRouter } = await import('../routes/projectRoutes.js');
    const { abortProjectExecution } = await import('../engine/cancellation.js');

    function buildApproveApp(onEvent = event => {
        if (event.action === 'start') throw new Error('HTTP fixture stops before provider dispatch');
    }) {
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
            wsHub: { broadcast() {}, publish: onEvent }
        }));
        // eslint-disable-next-line no-unused-vars
        app.use((err, _req, res, _next) => {
            res.status(err.status || 500).json({ error: err.message });
        });
        return app;
    }

    async function approveViaHttp(projectId, action = 'approve', onEvent) {
        const app = buildApproveApp(onEvent);
        const server = http.createServer(app);
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        try {
            const { port } = server.address();
            const response = await fetch(`http://127.0.0.1:${port}/api/projects/${projectId}/${action}`, {
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

    await runAsyncTest('immediate HTTP resume after remote pause reaches fresh approved dispatch', async () => {
        const project = await createProject({ title: 'Immediate approved HTTP resume' });
        const plan = { summary: 'React frontend', talimatname: '# React frontend', domains: [{ name: 'frontend', prefix: 'frontend' }],
            management: { needed: false, reason: 'Static HTTP fixture' } };
        approveContractRevision(project.id, createContractRevision(project.id, plan, 'approved-http-resume'));
        db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(project.id);
        const oldLease = acquireWorkflowLease(project.id, 'old-http-worker');
        abortProjectExecution(project.id, 'PAUSED'); // Pause arrived where no local controller was registered.
        db.prepare("UPDATE projects SET status='paused' WHERE id=?").run(project.id);
        let dispatched;
        const dispatch = new Promise(resolve => { dispatched = resolve; });
        const timeout = setTimeout(() => dispatched(false), 15000);
        try {
            const response = await approveViaHttp(project.id, 'resume', event => {
                if (event.action === 'start' && /director/i.test(event.agent || '')) {
                    abortProjectExecution(project.id, 'PAUSED');
                    dispatched(true); // Stop at the real dispatch boundary before any provider request.
                }
            });
            assert.equal(response.status, 200, JSON.stringify(response.body));
            assert.notEqual(response.body.attemptId, oldLease.attempt.id);
            assert.equal(await dispatch, true, 'the fresh HTTP attempt must reach approved generation dispatch');
        } finally { clearTimeout(timeout); abortProjectExecution(project.id, 'PAUSED'); }
    });

    for (const draft of ['legacy plan', 'pending contract', 'missing plan']) {
        await runAsyncTest(`HTTP resume refuses ${draft} before lease acquisition or state publication`, async () => {
            const project = await createProject({ title: `Unapproved HTTP resume ${draft}` });
            const plan = { summary: 'Unapproved React frontend', domains: [{ name: 'frontend', prefix: 'frontend' }],
                management: { needed: false, reason: 'Static HTTP fixture' } };
            if (draft === 'pending contract') createContractRevision(project.id, plan, 'pending-http-draft');
            db.prepare("UPDATE projects SET status='paused',plan=? WHERE id=?").run(
                draft === 'legacy plan' ? JSON.stringify(plan) : null, project.id);
            const before = db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
            const response = await approveViaHttp(project.id, 'resume');
            assert.equal(response.status, 409, JSON.stringify(response.body));
            assert.equal(response.body.code, 'WORKFLOW_APPROVAL_REQUIRED');
            assert.deepEqual(db.prepare('SELECT * FROM projects WHERE id=?').get(project.id), before);
            assert.equal(db.prepare('SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id=?').get(project.id).count, 0);
            assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_contracts WHERE project_id=? AND status='approved'").get(project.id).count, 0);
        });
    }
    finish();
} finally {
    await isolated.cleanup();
}
