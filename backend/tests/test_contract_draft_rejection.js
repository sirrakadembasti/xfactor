import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { db } from '../db.js';
import { createProject, deleteProject } from '../projectRepository.js';
import { acquireWorkflowLease, releaseWorkflowLease } from '../workflowAttempts.js';
import { createProjectRouter } from '../routes/projectRoutes.js';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

function insertContract(projectId, revision, status) {
    const json = JSON.stringify({ summary: `revision ${revision}`, talimatname: '# Fixture', domains: [{ name: 'backend', prefix: 'backend' }] });
    const id = `contract-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,?,?,?,?)')
        .run(id, projectId, revision, status, json, crypto.createHash('sha256').update(json).digest('hex'));
    return id;
}

async function fixture({ status, approved = true }) {
    const project = await createProject({ title: 'Contract draft rejection fixture' });
    const approvedId = approved ? insertContract(project.id, 1, 'approved') : null;
    const draftId = insertContract(project.id, 2, 'pending_approval');
    db.prepare('UPDATE projects SET status=? WHERE id=?').run(status, project.id);
    return { project, approvedId, draftId };
}

async function withServer(run) {
    const app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectRouter({
        requireAuth: (req, _res, next) => { req.user = { id: 'draft-owner', isAdmin: true }; next(); },
        projectAccess: () => (_req, _res, next) => next(),
        projectExecutor: async () => { throw new Error('Rejecting a draft must not start generation.'); }
    }));
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/projects`;
    try {
        await run(base);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

const reject = (base, projectId, revision, contractId) => fetch(`${base}/${projectId}/contracts/${revision}/reject`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contractId })
});
const contractStatus = id => db.prepare('SELECT status FROM project_contracts WHERE id=?').get(id).status;
const projectStatus = id => db.prepare('SELECT status FROM projects WHERE id=?').get(id).status;

await runAsyncTest('paused project: draft is rejected, approved contract and status stay, action is recorded', async () => {
    const f = await fixture({ status: 'paused' });
    try {
        await withServer(async base => {
            const before = await (await fetch(`${base}/${f.project.id}`)).json();
            assert.deepEqual(before.pendingContract, { id: f.draftId, revision: 2 });

            const response = await reject(base, f.project.id, 2, f.draftId);
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.pendingContract, null);
            assert.equal(body.status, 'paused');
            assert.equal(contractStatus(f.draftId), 'rejected');
            assert.equal(contractStatus(f.approvedId), 'approved');
            assert.equal(projectStatus(f.project.id), 'paused');
            const messages = db.prepare('SELECT text_content FROM chat_history WHERE project_id=? ORDER BY id').all(f.project.id).map(row => row.text_content);
            assert(messages.some(text => text.includes('Taslak 2 reddedildi') && text.includes('Onaylı sözleşme 1')));

            const again = await reject(base, f.project.id, 2, f.draftId);
            assert.equal(again.status, 409);
            assert.equal((await again.json()).code, 'CONTRACT_DRAFT_STALE');

            const approve = await fetch(`${base}/${f.project.id}/approve`, { method: 'POST' });
            assert.notEqual(approve.status, 200, 'a rejected draft can never be approved');
            assert.equal(contractStatus(f.draftId), 'rejected');
            assert.equal(contractStatus(f.approvedId), 'approved');
        });
    } finally { await deleteProject(f.project.id); }
});

await runAsyncTest('pending_approval project returns to paused on its approved contract, or to planning without one', async () => {
    const withApproved = await fixture({ status: 'pending_approval' });
    const withoutApproved = await fixture({ status: 'pending_approval', approved: false });
    try {
        await withServer(async base => {
            assert.equal((await reject(base, withApproved.project.id, 2, withApproved.draftId)).status, 200);
            assert.equal(projectStatus(withApproved.project.id), 'paused');
            assert.equal((await reject(base, withoutApproved.project.id, 2, withoutApproved.draftId)).status, 200);
            assert.equal(projectStatus(withoutApproved.project.id), 'planning');
            assert.equal(contractStatus(withoutApproved.draftId), 'rejected');
        });
    } finally {
        await deleteProject(withApproved.project.id);
        await deleteProject(withoutApproved.project.id);
    }
});

await runAsyncTest('stale identity, malformed revision and an active execution leave the draft pending', async () => {
    const f = await fixture({ status: 'paused' });
    try {
        await withServer(async base => {
            const stale = await reject(base, f.project.id, 2, 'contract-other');
            assert.equal(stale.status, 409);
            assert.equal((await stale.json()).code, 'CONTRACT_DRAFT_STALE');
            assert.equal((await reject(base, f.project.id, 1, f.approvedId)).status, 409, 'an approved revision cannot be rejected');
            assert.equal((await reject(base, f.project.id, 'two', f.draftId)).status, 400);
            assert.equal((await reject(base, f.project.id, 2, '')).status, 400);

            const lease = acquireWorkflowLease(f.project.id, 'draft-rejection-busy');
            try {
                const busy = await reject(base, f.project.id, 2, f.draftId);
                assert.equal(busy.status, 409);
                assert.equal((await busy.json()).code, 'CONTRACT_DRAFT_BUSY');
            } finally {
                releaseWorkflowLease(lease.attempt.id, 'aborted', { leaseOwner: 'draft-rejection-busy' });
            }
            assert.equal(contractStatus(f.draftId), 'pending_approval');
            assert.equal(contractStatus(f.approvedId), 'approved');
        });
    } finally { await deleteProject(f.project.id); }
});

finish();
