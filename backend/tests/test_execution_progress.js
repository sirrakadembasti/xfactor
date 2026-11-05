import assert from 'node:assert/strict';
import express from 'express';
import { db } from '../db.js';
import { createProject, deleteProject } from '../projectRepository.js';
import { acquireWorkflowLease, releaseWorkflowLease } from '../workflowAttempts.js';
import { createProjectRouter } from '../routes/projectRoutes.js';
import { createTestHarness } from './testHarness.js';
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('project-scoped progress is read only advisory metadata and fences an older attempt', async () => {
    let progress;
    try { progress = await import('../verification/executionProgress.js'); } catch {}
    assert.equal(typeof progress?.recordExecutionProgress, 'function', 'live progress registry is required');
    const project = await createProject({ title: 'Execution progress fixture' });
    const contractId = 'progress-contract';
    const contractHash = 'a'.repeat(64);
    db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,1,'approved','{}',?)")
        .run(contractId, project.id, contractHash);
    db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(project.id);
    const owner = 'progress-owner';
    const lease = acquireWorkflowLease(project.id, owner);
    const app = express();
    app.use('/api/projects', createProjectRouter({
        requireAuth: (req, res, next) => req.headers['x-user'] === 'viewer' ? next() : res.sendStatus(401),
        projectAccess: role => (req, res, next) => {
            assert.equal(role, 'viewer');
            return req.params.id === project.id ? next() : res.sendStatus(403);
        }
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/projects`;
    try {
        progress.recordExecutionProgress({ projectId: project.id, attemptId: lease.attempt.id, leaseOwner: owner }, {
            projectId: project.id, contractId, contractHash, jobId: 'job', runId: 'run', operation: 'verify_artifact', status: 'running',
            archiveBase64: 'private-archive', commands: [{ commandId: 1, phase: 'dependency_install', executable: 'npm',
                startedAt: Date.now(), args: ['private-arg'], stdout: 'private-output', env: { TOKEN: 'private-token' } }]
        });
        assert.equal((await fetch(`${base}/${project.id}/execution-progress`)).status, 401);
        assert.equal((await fetch(`${base}/foreign-project/execution-progress`, { headers: { 'x-user': 'viewer' } })).status, 403);
        const response = await fetch(`${base}/${project.id}/execution-progress`, { headers: { 'x-user': 'viewer' } });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.active, true);
        assert.equal(body.available, true);
        assert.equal(body.advisory, true);
        assert.equal(body.commands[0].phase, 'dependency_install');
        assert.ok(!JSON.stringify(body).includes('private-'));
        assert.equal(db.prepare('SELECT count(*) AS n FROM verification_checks WHERE contract_id=?').get(contractId).n, 0);
        releaseWorkflowLease(lease.attempt.id, 'failed', { leaseOwner: owner, error: 'fixture' });
        const replacement = acquireWorkflowLease(project.id, 'replacement-owner');
        const next = await fetch(`${base}/${project.id}/execution-progress`, { headers: { 'x-user': 'viewer' } });
        assert.equal((await next.json()).available, false, 'old job progress cannot become a replacement attempt observation');
        releaseWorkflowLease(replacement.attempt.id, 'failed', { leaseOwner: 'replacement-owner', error: 'fixture' });
    } finally { await new Promise(resolve => server.close(resolve)); await deleteProject(project.id); }
});
finish();
