import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import express from 'express';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { createTestHarness } from './testHarness.js';

// Establish temporary database/project/artifact roots before loading any runtime.
const isolated = await setupIsolatedTestDb('controlled-review-action');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createProject, getProjectDir } = await import('../projectRepository.js');
const { createProjectRouter } = await import('../routes/projectRoutes.js');
const { computePlanHash } = await import('../engine/workflow.js');
const { normalizeManagerPlan } = await import('../agents/schemas.js');
const { controlledRepairSourceHash } = await import('../engine/controlledRepairPlan.js');
const { readWorkerSnapshotSync } = await import('../engine/workerRepairs.js');
const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');
const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
const { runAsyncTest, finish } = createTestHarness();
const sha = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const localFetch = (...args) => fetch(...args).catch(error => { throw new Error(`${error.message}: ${error.cause?.message || 'no transport detail'}`); });

async function fixture(status = 'paused') {
  const project = await createProject({ title: 'Isolated controlled semantic review' });
  const plan = normalizeManagerPlan({ summary: 'Next.js frontend and Express API', talimatname: '# Preserve generated work',
    domains: [{ name: 'frontend', prefix: 'frontend' }], management: { needed: false, reason: 'Isolated route fixture' } });
  const json = JSON.stringify(plan), contract = { id: crypto.randomUUID(), contract_hash: sha(json) };
  db.prepare("INSERT INTO project_contracts(id,project_id,revision,status,contract_json,contract_hash) VALUES(?,?,1,'approved',?,?)").run(contract.id, project.id, json, contract.contract_hash);
  const dir = getProjectDir(project.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), '{"name":"controlled-review-fixture","version":"1.0.0"}');
  await fs.writeFile(path.join(dir, 'keep.txt'), 'Keep all existing source bytes.');
  const sourceHash = controlledRepairSourceHash(readWorkerSnapshotSync(dir, { includeLockfile: true }));
  const runId = crypto.randomUUID(), artifactId = crypto.randomUUID(), artifactHash = sha(artifactId), timestamp = new Date().toISOString();
  db.prepare("INSERT INTO verification_runs(id,project_id,contract_id,status,policy_version,started_at,ended_at) VALUES(?,?,?,'failed','fixture',?,?)").run(runId, project.id, contract.id, timestamp, timestamp);
  db.prepare("INSERT INTO artifacts(id,project_id,contract_id,kind,path,sha256,size,status,verification_run_id) VALUES(?,?,?,'zip',?,?,1,'rejected',?)").run(artifactId, project.id, contract.id, path.join(process.env.ARTIFACTS_ROOT, `${artifactId}.zip`), artifactHash, runId);
  const proposal = { planHash: sha('bounded-repair-' + project.id), contractId: contract.id, baselineRunId: runId, baselineSourceHash: sha('prepatch'), ready: true,
    targets: [{ path: 'keep.txt', create: false, requirementIds: ['R-1'], checkIds: [], instructions: 'private-model-instruction', referencePaths: [] }] };
  const workflow = { planHash: computePlanHash(plan), directorSpecs: { frontend: { preserve: 'director' } }, teamleaderPlans: { frontend: { preserve: 'teamleader' } },
    taskResults: { 'frontend.task-1': { completed: true, output: 'preserved-cache' } }, last_error: 'Worker repair requires Manager revision: independent source meaning evidence required.',
    generationCompletion: { stage: 'generation_finished', contractId: contract.id, contractHash: contract.contract_hash, planHash: computePlanHash(plan) },
    controlledRepair: { phase: 'patched', controlledAcceptancePolicy: 'controlled-acceptance-v1', proposal, outputSourceHash: sourceHash,
      privateToken: 'private-ledger-token', authorizedAttemptId: 'previous-repair-attempt',
      validations: [{ id: 'worker-reservation', stage: 'worker_verification', artifactId, artifactSha256: artifactHash, runId, jobId: 'prior-worker-job', reservationToken: 'private-reservation-token' }],
      semanticReviewHistory: [] } };
  db.prepare('UPDATE projects SET status=?,plan=?,workflow_state=? WHERE id=?').run(status, json, JSON.stringify(workflow), project.id);
  saveCheckpoint({ projectId: project.id, contractId: contract.id, taskId: 'preserved-task', teamleaderId: 'frontend.team', planHash: computePlanHash(plan),
    taskSpecHash: sha('task'), inputHash: sha('input'), outputHash: sha('output'), gateVersion: '1.0.0', status: 'completed', requirementIds: [], revision: 1 });
  const draftId = crypto.randomUUID();
  db.prepare("INSERT INTO project_contracts(id,project_id,revision,status,contract_json,contract_hash) VALUES(?,?,2,'pending_approval',?,?)").run(draftId, project.id, json, sha('unused draft'));
  const state = () => db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
  const checkpoints = () => db.prepare('SELECT * FROM task_checkpoints WHERE project_id=? ORDER BY rowid').all(project.id);
  return { project, contract, dir, proposal, workflow, sourceHash, runId, artifactId, draftId, state, checkpoints };
}

async function serve(options = {}) {
  const dispatches = [], accessRoles = [], app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectRouter({
    requireAuth: (req, res, next) => { if (req.get('x-fixture-auth') === 'no') return res.status(401).json({ error: 'Unauthorized' }); req.user = { id: 'review-owner', isAdmin: true }; next(); },
    projectAccess: role => (req, res, next) => { accessRoles.push(role); if (req.get('x-fixture-owner') === 'no') return res.status(403).json({ error: 'Forbidden' }); next(); },
    projectExecutor: async (...args) => { dispatches.push(args); }, ...options,
  }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message, code: error.code }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = (f, action = 'repair-review', body = { contractId: f.contract.id, proposalHash: f.proposal.planHash }, headers = {}) => localFetch(`http://127.0.0.1:${server.address().port}/api/projects/${f.project.id}/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { dispatches, accessRoles, request, detail: f => localFetch(`http://127.0.0.1:${server.address().port}/api/projects/${f.project.id}`),
    close: async () => { for (const args of dispatches) releaseWorkflowLease(args[2], 'failed', { leaseOwner: args[3], error: 'fixture complete' }); await new Promise(resolve => server.close(resolve)); } };
}

try {
  await runAsyncTest('public eligibility uses raw ledger but exposes no private review authority', async () => {
    const f = await fixture(), api = await serve();
    try {
      const response = await api.detail(f); assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.repairSemanticReview, { available: true, planHash: f.proposal.planHash, remainingReviews: 3, reason: null });
      assert.equal(body.reverification.available, true);
      for (const privateValue of ['private-ledger-token', 'private-reservation-token', 'private-model-instruction', 'previous-repair-attempt']) assert.equal(JSON.stringify(body).includes(privateValue), false);
    } finally { await api.close(); }
  });

  await runAsyncTest('review action preserves caches, checkpoints, drafts and source while dispatching exact semantic flags once', async () => {
    const f = await fixture('verification_failed'), api = await serve();
    try {
      const checkpointBefore = f.checkpoints(), sourceBefore = controlledRepairSourceHash(readWorkerSnapshotSync(f.dir, { includeLockfile: true }));
      const response = await api.request(f, 'repair-review', { contractId: f.contract.id, proposalHash: f.proposal.planHash, passed: true, reviewed: true, workflow: {} });
      assert.equal(response.status, 200, await response.clone().text());
      const body = await response.json(); assert.equal(body.executionMode, 'controlled_repair_review');
      assert.equal(api.dispatches.length, 1); const args = api.dispatches[0];
      assert.deepEqual(args[4], { controlledRepairHash: f.proposal.planHash, controlledRepairSemanticReview: true });
      assert.equal(args[3], 'http-controlled-review-review-owner'); assert.equal(body.attemptId, args[2]);
      const saved = JSON.parse(f.state().workflow_state);
      assert.deepEqual(saved.directorSpecs, f.workflow.directorSpecs); assert.deepEqual(saved.teamleaderPlans, f.workflow.teamleaderPlans);
      assert.deepEqual(saved.taskResults, f.workflow.taskResults); assert.deepEqual(saved.generationCompletion, f.workflow.generationCompletion);
      assert.equal(saved.controlledRepair.authorizedAttemptId, args[2]);
      assert.deepEqual(saved.controlledRepair.validations, f.workflow.controlledRepair.validations);
      assert.equal(saved.controlledRepair.passed, undefined); assert.equal(saved.controlledRepair.reviewed, undefined);
      assert.deepEqual(f.checkpoints(), checkpointBefore); assert.equal(controlledRepairSourceHash(readWorkerSnapshotSync(f.dir, { includeLockfile: true })), sourceBefore);
      assert.equal(db.prepare('SELECT status FROM project_contracts WHERE id=?').get(f.draftId).status, 'pending_approval');
      assert.equal(f.state().status, 'implementing');
      const again = await api.request(f); assert.equal(again.status, 200); assert.equal((await again.json()).idempotent, true); assert.equal(api.dispatches.length, 1);
      assert.equal(db.prepare('SELECT count(*) AS n FROM chat_history WHERE project_id=? AND action_key IS NOT NULL').get(f.project.id).n, 2);
      assert.equal(api.accessRoles.every(role => role === 'owner'), true);
    } finally { await api.close(); }
  });

  await runAsyncTest('stale contract, proposal, generation marker, current source and latest artifact block without dispatch', async () => {
    for (const mode of ['contract', 'proposal', 'marker', 'source', 'artifact', 'run', 'budget', 'status']) {
      const f = await fixture(), api = await serve();
      try {
        let body = { contractId: f.contract.id, proposalHash: f.proposal.planHash };
        if (mode === 'contract') body.contractId = 'stale';
        if (mode === 'proposal') body.proposalHash = sha('stale');
        if (mode === 'source') await fs.writeFile(path.join(f.dir, 'keep.txt'), 'Unreviewed source mutation.');
        if (mode === 'marker' || mode === 'budget') {
          const workflow = structuredClone(f.workflow);
          if (mode === 'marker') workflow.generationCompletion.contractId = 'other';
          else workflow.controlledRepair.semanticReviewHistory = [{}, {}, {}];
          db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify(workflow), f.project.id);
        }
        if (mode === 'artifact') db.prepare("INSERT INTO artifacts(id,project_id,contract_id,kind,path,sha256,size,status,verification_run_id) VALUES(?,?,?,'zip','fixture-new.zip',?,1,'rejected',?)").run(crypto.randomUUID(), f.project.id, f.contract.id, sha('latest'), f.runId);
        if (mode === 'run') db.prepare("INSERT INTO verification_runs(id,project_id,contract_id,status,policy_version,started_at,ended_at) VALUES(?,?,?,'failed','fixture','2099-01-01','2099-01-01')").run(crypto.randomUUID(), f.project.id, f.contract.id);
        if (mode === 'status') db.prepare("UPDATE projects SET status='pending_approval' WHERE id=?").run(f.project.id);
        const response = await api.request(f, 'repair-review', body); assert.equal(response.status, 409, mode + ': ' + await response.clone().text());
        assert.equal(api.dispatches.length, 0); assert.equal(db.prepare('SELECT count(*) AS n FROM workflow_attempts WHERE project_id=?').get(f.project.id).n, 0);
      } finally { await api.close(); }
    }
  });

  await runAsyncTest('authorization denies unauthenticated requests before any database read and requires owner access', async () => {
    const f = await fixture(), api = await serve();
    try {
      let reads = 0; const original = db.prepare;
      db.prepare = function (...args) { reads++; return original.apply(this, args); };
      let response;
      try { response = await api.request(f, 'repair-review', undefined, { 'x-fixture-auth': 'no' }); }
      finally { db.prepare = original; }
      assert.equal(response.status, 401); assert.equal(reads, 0);
      assert.equal((await api.request(f, 'repair-review', undefined, { 'x-fixture-owner': 'no' })).status, 403);
      assert.equal(api.dispatches.length, 0);
    } finally { await api.close(); }
  });

  await runAsyncTest('lease-bound baseline repeats reject races in contract, revision, source and latest artifacts', async () => {
    for (const mode of ['contract', 'revision', 'source', 'artifact']) {
      const f = await fixture();
      const lifecycle = { assertGenerationAllowed() {}, async afterWorkflowLeaseAcquired() {
        if (mode === 'source') await fs.writeFile(path.join(f.dir, 'keep.txt'), 'Changed after authorization preflight.');
        if (mode === 'revision') db.prepare('UPDATE projects SET revision=revision+1 WHERE id=?').run(f.project.id);
        if (mode === 'contract') db.prepare("INSERT INTO project_contracts(id,project_id,revision,status,contract_json,contract_hash) VALUES(?,?,3,'approved','{}',?)").run(crypto.randomUUID(), f.project.id, sha('new approved'));
        if (mode === 'artifact') db.prepare("INSERT INTO artifacts(id,project_id,contract_id,kind,path,sha256,size,status,verification_run_id) VALUES(?,?,?,'zip','new-latest.zip',?,1,'rejected',?)").run(crypto.randomUUID(), f.project.id, f.contract.id, sha('new'), f.runId);
      }, begin() { throw new Error('must not dispatch stale execution'); } };
      const api = await serve({ lifecycle });
      try {
        const response = await api.request(f); assert.equal(response.status, 409, mode + ': ' + await response.clone().text());
        assert.equal(api.dispatches.length, 0); assert.equal(f.state().status, 'paused');
        assert.equal(db.prepare('SELECT status FROM workflow_attempts WHERE project_id=? ORDER BY rowid DESC LIMIT 1').get(f.project.id).status, 'failed');
      } finally { await api.close(); }
    }
  });

  await runAsyncTest('unrelated active execution cannot be mistaken for an idempotent semantic review', async () => {
    const f = await fixture(), api = await serve(), lease = acquireWorkflowLease(f.project.id, 'http-controlled-review-review-owner');
    try { const response = await api.request(f); assert.equal(response.status, 409); assert.equal(api.dispatches.length, 0); }
    finally { releaseWorkflowLease(lease.attempt.id, 'failed', { leaseOwner: 'http-controlled-review-review-owner', error: 'fixture complete' }); await api.close(); }
  });

  await runAsyncTest('existing reverify action dispatches only verificationOnly without semantic review flags', async () => {
    const f = await fixture(), api = await serve();
    try {
      const response = await api.request(f, 'reverify', { contractId: f.contract.id }); assert.equal(response.status, 200, await response.clone().text());
      assert.deepEqual(api.dispatches[0][4], { verificationOnly: true });
      assert.deepEqual(JSON.parse(f.state().workflow_state).controlledRepair, f.workflow.controlledRepair);
    } finally { await api.close(); }
  });

  await runAsyncTest('simultaneous duplicate clicks share only the durably authorized attempt', async () => {
    const f = await fixture();
    const api = await serve({ lifecycle: { assertGenerationAllowed() {}, async afterWorkflowLeaseAcquired() { await new Promise(resolve => setTimeout(resolve, 30)); }, begin() { return { end() {} }; } } });
    try {
      const responses = await Promise.all([api.request(f), api.request(f)]);
      const bodies = await Promise.all(responses.map(response => response.json()));
      assert.deepEqual(responses.map(response => response.status), [200, 200]);
      assert.equal(bodies[0].attemptId, bodies[1].attemptId); assert.equal(bodies.some(body => body.idempotent), true);
      assert.equal(api.dispatches.length, 1);
    } finally { await api.close(); }
  });

  await runAsyncTest('source changes after the CAS write trigger onTransaction rollback of authorization and audit', async () => {
    const f = await fixture(), api = await serve(), original = db.prepare;
    let changed = false;
    db.prepare = function (sql, ...rest) {
      const statement = original.call(this, sql, ...rest);
      if (/UPDATE projects\s+SET title =/.test(sql)) return { run(...args) {
        const result = statement.run(...args);
        if (!changed) { changed = true; fsSync.writeFileSync(path.join(f.dir, 'keep.txt'), 'Fixture mutation between CAS and its callback.'); }
        return result;
      } };
      return statement;
    };
    try {
      const response = await api.request(f); assert.equal(response.status, 409, await response.clone().text()); assert.equal(changed, true);
      assert.equal(api.dispatches.length, 0); assert.equal(f.state().status, 'paused');
      assert.deepEqual(JSON.parse(f.state().workflow_state), f.workflow);
      assert.equal(original.call(db, 'SELECT count(*) AS n FROM chat_history WHERE project_id=? AND action_key IS NOT NULL').get(f.project.id).n, 0);
    } finally { db.prepare = original; await api.close(); }
  });

  await runAsyncTest('active Manager chat excludes semantic review before a lease or dispatch', async () => {
    const f = await fixture(); let release, entered;
    const pending = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
    const api = await serve({ managerResponder: async () => { entered(); await pending; return 'Görünüm tercihini not ettim.'; } });
    const chat = api.request(f, 'chat', { message: 'Görünüm hakkında konuşalım.' });
    try {
      await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('fixture chat did not reach injected responder')), 5000))]);
      const response = await api.request(f); assert.equal(response.status, 409); assert.equal(api.dispatches.length, 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM workflow_attempts WHERE project_id=?').get(f.project.id).n, 0);
    } finally { release(); await chat; await api.close(); }
  });

  await runAsyncTest('semantic review is lifecycle tracked and unexpected failures keep server error handling', async () => {
    const f = await fixture(); let finishExecution, endCount = 0, operation;
    const pending = new Promise(resolve => { finishExecution = resolve; });
    const lifecycle = { assertGenerationAllowed() {}, begin(kind, options) { operation = { kind, ...options }; return { end() { endCount++; } }; } };
    const api = await serve({ lifecycle, projectExecutor: async () => { await pending; } });
    try {
      const response = await api.request(f); assert.equal(response.status, 200); assert.equal(operation.kind, 'generation'); assert.equal(typeof operation.cancel, 'function'); assert.equal(endCount, 0);
      finishExecution(); await new Promise(resolve => setImmediate(resolve)); assert.equal(endCount, 1);
      const active = db.prepare("SELECT id,lease_owner FROM workflow_attempts WHERE project_id=? AND status='running'").get(f.project.id);
      releaseWorkflowLease(active.id, 'failed', { leaseOwner: active.lease_owner, error: 'fixture complete' });
    } finally { finishExecution(); await api.close(); }
    const failing = await fixture(), other = await serve({ lifecycle: { assertGenerationAllowed() {}, afterWorkflowLeaseAcquired() { throw new Error('unexpected fixture boundary'); } } });
    try { assert.equal((await other.request(failing)).status, 500); assert.equal(other.dispatches.length, 0); }
    finally { await other.close(); }
  });
} finally { finish(); await isolated.cleanup(); }
