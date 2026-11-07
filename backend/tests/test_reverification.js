import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { db } from '../db.js';
import { createProject, deleteProject, getProjectDir } from '../projectRepository.js';
import { executeProjectTasks, computePlanHash } from '../engine/workflow.js';
import { normalizeManagerPlan } from '../agents/schemas.js';
import { acquireWorkflowLease, releaseWorkflowLease } from '../workflowAttempts.js';
import { createProjectRouter } from '../routes/projectRoutes.js';
import { createTestHarness } from './testHarness.js';
import { createProjectZip } from '../utils/archive.js';
import { collectArtifactFiles } from '../artifactInventory.js';
const { runAsyncTest, finish } = createTestHarness();
async function fixture(status) {
    const project = await createProject({ title: 'Read only reverification fixture' });
    const plan = normalizeManagerPlan({ summary: 'Next.js frontend and Express API', talimatname: '# Keep approved source',
        domains: [{ name: 'frontend', prefix: 'frontend' }], management: { needed: false, reason: 'Isolated fixture' } });
    const json = JSON.stringify(plan);
    const contract = { id: crypto.randomUUID(), contract_hash: crypto.createHash('sha256').update(json).digest('hex') };
    db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,1,'approved',?,?)")
        .run(contract.id, project.id, json, contract.contract_hash);
    const workflow = { planHash: computePlanHash(plan), directorSpecs: { frontend: { preserved: true } }, teamleaderPlans: {},
        generationCompletion: { stage: 'generation_finished', contractId: contract.id, contractHash: contract.contract_hash, planHash: computePlanHash(plan) } };
    db.prepare('UPDATE projects SET status=?,plan=?,workflow_state=? WHERE id=?').run(status, json, JSON.stringify(workflow), project.id);
    const dir = getProjectDir(project.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), '{"name":"reverify-fixture","version":"1.0.0"}');
    await fs.writeFile(path.join(dir, 'keep.txt'), 'Keep this implementation.');
    return { project, plan, contract, workflow, dir };
}
await runAsyncTest('verification-only reaches a fresh worker without generation, source writes or clearing old blockers', async () => {
    const f = await fixture('implementing');
    try {
        db.prepare("INSERT INTO repair_issues (id,project_id,contract_id,fingerprint,severity,status,detail_json,origin) VALUES (?,?,?,?,'high','open',?,'verification_blocker')")
            .run('repair-worker-reverify', f.project.id, f.contract.id, 'old-blocker', JSON.stringify({ kind: 'worker_verification_blocker', reason: 'old platform failure' }));
        const before = await fs.readdir(f.dir);
        let agentCalls = 0, preparations = 0;
        const lease = acquireWorkflowLease(f.project.id, 'reverify-fixture');
        await executeProjectTasks(f.project.id, null, lease.attempt.id, 'reverify-fixture', {
            verificationOnly: true,
            callAgent: async () => { agentCalls++; throw new Error('Model dispatch forbidden.'); },
            createExecutionClient: () => ({ prepareDependencies: async () => { preparations++; throw new Error('fixture dependency boundary'); } })
        });
        assert.equal(preparations, 1, 'must reach a fresh worker despite the historical blocker');
        assert.equal(agentCalls, 0);
        assert.deepEqual(await fs.readdir(f.dir), before);
        assert.equal(await fs.readFile(path.join(f.dir, 'keep.txt'), 'utf8'), 'Keep this implementation.');
        const saved = JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state);
        assert.deepEqual(saved.generationCompletion, f.workflow.generationCompletion);
        assert.deepEqual(saved.directorSpecs, f.workflow.directorSpecs);
        assert.equal(db.prepare("SELECT status FROM repair_issues WHERE id='repair-worker-reverify'").get().status, 'open');
    } finally { await deleteProject(f.project.id); }
});
await runAsyncTest('reverify keeps approved identity and pending draft; stale requests acquire no lease', async () => {
    const f = await fixture('pending_approval');
    const draftId = crypto.randomUUID();
    db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,2,'pending_approval',?,?)")
        .run(draftId, f.project.id, JSON.stringify({ ...f.plan, summary: 'Unused draft' }), 'b'.repeat(64));
    db.prepare("INSERT INTO repair_issues (id,project_id,contract_id,fingerprint,severity,status,detail_json,origin) VALUES (?,?,?,?,'high','open',?,'verification_blocker')")
        .run('repair-worker-route-veto', f.project.id, f.contract.id, 'route-blocker', JSON.stringify({ kind: 'worker_verification_blocker', reason: 'historical blocker' }));
    let dispatch = null;
    const app = express();
    app.use(express.json());
    app.use('/api/projects', createProjectRouter({
        requireAuth: (req, _res, next) => { req.user = { id: 'reverify-owner', isAdmin: true }; next(); },
        projectAccess: () => (_req, _res, next) => next(), projectExecutor: async (...args) => { dispatch = args; }
    }));
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/projects/${f.project.id}/reverify`;
    try {
        const request = body => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const resume = await fetch(url.replace('/reverify', '/resume'), { method: 'POST' });
        assert.equal(resume.status, 409, 'open worker blockers must veto Resume even when a diagnostic error replaced the original error text');
        assert.equal((await resume.json()).code, 'MANAGER_REVISION_REQUIRED');
        assert.equal((await request({ contractId: 'stale' })).status, 409);
        assert.equal(db.prepare('SELECT count(*) AS n FROM workflow_attempts WHERE project_id=?').get(f.project.id).n, 0);
        const result = await request({ contractId: f.contract.id });
        assert.equal(result.status, 200, await result.clone().text());
        assert.equal((await result.json()).executionMode, 'verification_only');
        assert.equal(dispatch?.[4]?.verificationOnly, true);
        assert.equal(db.prepare('SELECT status FROM project_contracts WHERE id=?').get(f.contract.id).status, 'approved');
        assert.equal(db.prepare('SELECT status FROM project_contracts WHERE id=?').get(draftId).status, 'pending_approval');
        const { last_error, remediation, ...cache } = JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state);
        assert.equal(last_error, null);
        assert.equal(remediation, null);
        assert.deepEqual(cache, f.workflow);
        const second = await request({ contractId: f.contract.id });
        assert.equal(second.status, 200);
        assert.equal((await second.json()).idempotent, true);
        releaseWorkflowLease(dispatch[2], 'failed', { leaseOwner: dispatch[3], error: 'fixture finished' });
    } finally { await new Promise(resolve => server.close(resolve)); await deleteProject(f.project.id); }
});
await runAsyncTest('fresh verification result is diagnostic only and never marks complete or clears repair history', async () => {
    for (const passed of [false, true]) {
        const f = await fixture('implementing');
        try {
            db.prepare("INSERT INTO repair_issues (id,project_id,contract_id,fingerprint,severity,status,detail_json,origin) VALUES (?,?,?,?,'high','open',?,'verification_blocker')")
                .run(`repair-worker-result-${passed}`, f.project.id, f.contract.id, 'prior-blocker', JSON.stringify({ kind: 'worker_verification_blocker', reason: 'prior unresolved failure' }));
            const lease = acquireWorkflowLease(f.project.id, 'diagnostic-result');
            const packageBefore = await fs.readFile(path.join(f.dir, 'package.json'), 'utf8');
            let invocation;
            await executeProjectTasks(f.project.id, null, lease.attempt.id, 'diagnostic-result', {
                verificationOnly: true, callAgent: async () => { throw new Error('Model dispatch forbidden'); },
                createExecutionClient: () => ({ prepareDependencies: async () => ({ status: 'completed', result: {
                    packageLockBase64: Buffer.from('{"lockfileVersion":3,"packages":{}}').toString('base64')
                } }) }),
                verifyArtifactAndProject: async options => { invocation = options; return { passed, completed: false, error: passed ? null : 'fixture product gate failed' }; }
            });
            assert.ok(invocation?.options?.runId);
            assert.equal(invocation.contractId, f.contract.id);
            assert.equal(invocation.complete, false);
            assert.equal(invocation.options.preserveGenerationRecords, true);
            assert.equal(db.prepare('SELECT status FROM projects WHERE id=?').get(f.project.id).status, 'paused');
            assert.match(JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state).last_error,
                /Worker repair requires Manager revision:/, 'diagnostic completion cannot silently unlock normal Resume while repair blockers remain');
            assert.equal(await fs.readFile(path.join(f.dir, 'package.json'), 'utf8'), packageBefore);
            await assert.rejects(fs.access(path.join(f.dir, 'package-lock.json')));
            assert.deepEqual(JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state).generationCompletion,
                f.workflow.generationCompletion);
        } finally { await deleteProject(f.project.id); }
    }
});
await runAsyncTest('missing or stale generation marker cannot fall through to generation in verification-only mode', async () => {
    const f = await fixture('implementing');
    try {
        db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify({ ...f.workflow,
            generationCompletion: { ...f.workflow.generationCompletion, contractId: 'wrong-contract' } }), f.project.id);
        const lease = acquireWorkflowLease(f.project.id, 'invalid-marker');
        let dispatches = 0;
        await executeProjectTasks(f.project.id, null, lease.attempt.id, 'invalid-marker', {
            verificationOnly: true, callAgent: async () => { dispatches++; },
            createExecutionClient: () => { dispatches++; return {}; }
        });
        assert.equal(dispatches, 0);
        assert.deepEqual((await fs.readdir(f.dir)).sort(), ['keep.txt', 'package.json']);
    } finally { await deleteProject(f.project.id); }
});
await runAsyncTest('recorded lock bytes bypass redundant resolution but every artifact still receives a fresh worker verification', async () => {
    const f = await fixture('implementing');
    try {
        const oldRun = crypto.randomUUID();
        db.prepare("INSERT INTO verification_runs(id,project_id,contract_id,status,policy_version,started_at,ended_at) VALUES(?,?,?,'failed','fixture',?,?)")
            .run(oldRun, f.project.id, f.contract.id, new Date().toISOString(), new Date().toISOString());
        const lock = Buffer.from('{"lockfileVersion":3,"packages":{"":{"name":"reverify-fixture","version":"1.0.0"}}}');
        const oldArtifact = await createProjectZip(f.project.id, f.contract.id, [...await collectArtifactFiles(f.dir), { path: 'package-lock.json', content: lock }]);
        db.prepare("UPDATE artifacts SET status='rejected',verification_run_id=? WHERE id=?").run(oldRun, oldArtifact.id);
        const lease = acquireWorkflowLease(f.project.id, 'recorded-lock');
        let preparations = 0, invocation;
        await executeProjectTasks(f.project.id, null, lease.attempt.id, 'recorded-lock', {
            verificationOnly: true, callAgent: async () => { throw new Error('No generation'); },
            createExecutionClient: () => ({ prepareDependencies: async () => { preparations++; throw new Error('Redundant dependency resolution forbidden'); } }),
            verifyArtifactAndProject: async options => { invocation = options; return { passed: false, completed: false, error: 'Fresh verification still required' }; }
        });
        assert.equal(preparations, 0); assert.ok(invocation); assert.notEqual(invocation.artifactId, oldArtifact.id);
        assert.notEqual(invocation.options.runId, oldRun); assert.equal(invocation.complete, false);
        assert.deepEqual(invocation.options.files.find(file => file.path === 'package-lock.json').content, lock);
        await assert.rejects(fs.access(path.join(f.dir, 'package-lock.json')));
        const state = db.prepare('SELECT status,workflow_state FROM projects WHERE id=?').get(f.project.id);
        assert.equal(state.status, 'paused');assert.deepEqual(JSON.parse(state.workflow_state).generationCompletion, f.workflow.generationCompletion);
        const input = JSON.parse(state.workflow_state).dependencyInputs.at(-1);
        assert.equal(input.mode, 'recorded_input');assert.equal(input.sourceArtifactId, oldArtifact.id);assert.equal(input.sourceRunId, oldRun);
        assert.equal(input.runId, invocation.options.runId);assert.equal(input.lockSha256, crypto.createHash('sha256').update(lock).digest('hex'));
    } finally { await deleteProject(f.project.id); }
});
finish();
