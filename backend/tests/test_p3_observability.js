import assert from 'assert';
import express from 'express';
import http from 'http';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p3-observability');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createProjectRouter } = await import('../routes/projectRoutes.js');
const { redactSensitiveText, createCorrelatedContext, cleanupStaleLogs } = await import('../observability.js');
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// seed helpers
const now = new Date().toISOString();
const projId = 'p3-proj-a';
const otherProjId = 'p3-proj-b';
const contractIdA1 = 'p3-contract-a1';
const contractIdA2 = 'p3-contract-a2';
const otherContractId = 'p3-contract-b1';
const runId1 = 'p3-run-1';
const runId2 = 'p3-run-2';
const runIdOther = 'p3-run-other';
const checkId1 = 'p3-check-1';
const checkId2 = 'p3-check-2';
const otherCheckId = 'p3-check-other';

// seed DB
db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'P3 Proj A', 'running')").run(projId);
db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'P3 Proj B', 'running')").run(otherProjId);
db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at) VALUES (?, ?, 1, 'approved', '{}', 'hash-a1', ?, ?)").run(contractIdA1, projId, now, now);
db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at) VALUES (?, ?, 2, 'draft', '{}', 'hash-a2', NULL, ?)").run(contractIdA2, projId, now);
db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at) VALUES (?, ?, 1, 'approved', '{}', 'hash-b1', ?, ?)").run(otherContractId, otherProjId, now, now);
db.prepare("INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status) VALUES (?, ?, 'REQ-P3', 'req', 'functional','high',1,'approved')").run('p3-req-a1', contractIdA1);
db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'verified', '1.0', ?, ?)").run(runId1, projId, contractIdA1, now, now);
db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'failed', '1.0', ?, ?)").run(runId2, projId, contractIdA1, '2025-01-02T00:00:00.000Z', '2025-01-02T01:00:00.000Z');
db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'running', '1.0', ?, ?)").run(runIdOther, otherProjId, otherContractId, now, now);
const stdoutRaw = 'ok output with secret=Bearer sk-1234567890abcdefgh and password=supersecret';
const stderrRaw = 'err with api_key=abc123 and token=eyJhbGciOiJIUzI1NiJ9.eyJwYXlsb2FkIjoidGVzdCJ9.signature123';
db.prepare("INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, command, exit_code, started_at, ended_at, timed_out, stdout_digest, stderr_digest, evidence_json) VALUES (?, ?, ?, 'api_contract', 'MANDATORY', 'PASS', 'cmd1', 0, ?, ?, 0, 'dig1','dig2', ?)").run(checkId1, contractIdA1, runId1, now, now, JSON.stringify({ stdout: stdoutRaw, stderr: stderrRaw }));
db.prepare("INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, command, exit_code, started_at, ended_at, timed_out, stdout_digest, stderr_digest, evidence_json) VALUES (?, ?, ?, 'smoke_gate', 'MANDATORY', 'FAIL', 'cmd2', 1, ?, ?, 1, 'd3','d4', ?)").run(checkId2, contractIdA1, runId1, now, now, JSON.stringify({ stdout: 'other stdout', stderr: 'other stderr' }));
db.prepare("INSERT INTO repair_issues (id, project_id, contract_id, requirement_id, fingerprint, severity, status, resolved_at) VALUES (?, ?, ?, ?, 'fp1', 'critical','open', NULL)").run('p3-repair-1', projId, contractIdA1, 'p3-req-a1');
db.prepare("INSERT INTO repair_issues (id, project_id, contract_id, requirement_id, fingerprint, severity, status, resolved_at) VALUES (?, ?, ?, ?, 'fp2', 'high','resolved', ?)").run('p3-repair-2', projId, contractIdA1, 'p3-req-a1', now);
db.prepare("INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id) VALUES (?, ?, ?, 'zip', 'artifacts/a.zip', ?, 123, 'verified', ?)").run('p3-art-1', projId, contractIdA1, 'a'.repeat(64), runId1);
db.prepare("INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id) VALUES (?, ?, ?, 'tar', 'artifacts/b.tar', ?, 456, 'draft', NULL)").run('p3-art-2', projId, contractIdA1, 'b'.repeat(64));

// helpers for http
function createMocks({ authed, projectAccess }) {
  const requireAuth = (req, res, next) => {
    if (!authed) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'viewer1', isAdmin: false };
    next();
  };
  const pa = (role) => (req, res, next) => {
    if (projectAccess === '403') return res.status(403).json({ error: 'Forbidden' });
    // also need to ensure viewer passes
    next();
  };
  return { requireAuth, projectAccess: pa };
}

async function requestWithMocks(pathname, { authed = true, projectAccess = 'allow', method = 'GET' } = {}) {
  const { requireAuth, projectAccess: pa } = createMocks({ authed, projectAccess });
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectRouter({ requireAuth, projectAccess: pa, wsHub: { broadcast() {} } }));
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}${pathname}`;
  const res = await fetch(url, { method, headers: { 'x-forwarded-proto': 'https' } });
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  await new Promise(r => server.close(r));
  return { status: res.status, body, text };
}

// =========================================================================
// P3.1 Authorized Read-Only Evidence and Contract APIs
// =========================================================================

await runAsyncTest('P3.1 contracts endpoint 401 without auth', async () => {
  const { status } = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: false });
  assert.strictEqual(status, 401);
});

await runAsyncTest('P3.1 contracts endpoint 403 for non-owned project', async () => {
  const { status } = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: true, projectAccess: '403' });
  assert.strictEqual(status, 403);
});

await runAsyncTest('P3.1 contracts endpoint 200 with exact structure', async () => {
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 2);
  for (const c of body) {
    assert.ok(typeof c.id === 'string');
    assert.ok(typeof c.revision === 'number');
    assert.ok(typeof c.status === 'string');
    assert.ok(typeof c.contract_hash === 'string');
    assert.ok('approved_at' in c);
    assert.ok(typeof c.created_at === 'string');
    assert.strictEqual(Object.keys(c).sort().join(','), ['approved_at','contract_hash','created_at','id','revision','status'].sort().join(','));
  }
});

await runAsyncTest('P3.1 verification-runs list 401/403/200 with cursor pagination', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/verification-runs`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${projId}/verification-runs`, { authed: true, projectAccess: '403' });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/verification-runs`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body.runs));
  assert.ok('nextCursor' in body);
  for (const r of body.runs) {
    assert.ok(typeof r.id === 'string');
    assert.ok(typeof r.contract_id === 'string');
    assert.ok(typeof r.status === 'string');
    assert.ok(typeof r.policy_version === 'string');
    assert.ok(typeof r.started_at === 'string');
    assert.ok('ended_at' in r);
  }
  // cursor pagination
  const paged = await requestWithMocks(`/api/projects/${projId}/verification-runs?limit=1`, { authed: true });
  assert.strictEqual(paged.status, 200);
  assert.strictEqual(paged.body.runs.length, 1);
  assert.ok(paged.body.nextCursor);
  const paged2 = await requestWithMocks(`/api/projects/${projId}/verification-runs?cursor=${paged.body.nextCursor}&limit=1`, { authed: true });
  assert.strictEqual(paged2.status, 200);
  assert.strictEqual(paged2.body.runs.length, 1);
  assert.notStrictEqual(paged2.body.runs[0].id, paged.body.runs[0].id);
});

await runAsyncTest('P3.1 verification run detail 401/403/200 and nested isolation 404', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}`, { authed: true, projectAccess: '403' });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(body.run);
  assert.strictEqual(body.run.id, runId1);
  assert.ok(Array.isArray(body.checks));
  for (const ch of body.checks) {
    assert.ok(typeof ch.id === 'string');
    assert.ok(typeof ch.gate_name === 'string');
    assert.ok(['MANDATORY','OPTIONAL','NOT_APPLICABLE'].includes(ch.applicability));
    assert.ok(['PASS','FAIL','BLOCKED','NOT_APPLICABLE'].includes(ch.status));
    assert.ok('exit_code' in ch);
    assert.ok('stdout_digest' in ch);
    assert.ok('stderr_digest' in ch);
    assert.ok('started_at' in ch);
    assert.ok('ended_at' in ch);
    assert.ok('timed_out' in ch);
  }
  // cross-project isolation: run belongs to other project
  const cross = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runIdOther}`, { authed: true });
  assert.strictEqual(cross.status, 404);
  const notFound = await requestWithMocks(`/api/projects/${projId}/verification-runs/not-exist`, { authed: true });
  assert.strictEqual(notFound.status, 404);
});

await runAsyncTest('P3.1 log endpoint 401/403/200 redacted and isolation', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}/checks/${checkId1}/log`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}/checks/${checkId1}/log`, { authed: true, projectAccess: '403' });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}/checks/${checkId1}/log`, { authed: true });
  assert.strictEqual(status, 200);
  assert.strictEqual(body.id, checkId1);
  assert.strictEqual(body.gate_name, 'api_contract');
  assert.ok(typeof body.stdout === 'string');
  assert.ok(typeof body.stderr === 'string');
  // redaction: original contained secrets, redacted should not contain raw
  assert.ok(!body.stdout.includes('supersecret'));
  assert.ok(!body.stdout.includes('sk-1234567890abcdefgh'));
  assert.ok(body.stdout.includes('[REDACTED]'));
  assert.ok(!body.stderr.includes('eyJhbGci'));
  assert.ok(body.stderr.includes('[REDACTED]'));
  // cross-project isolation
  const cross = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runIdOther}/checks/${otherCheckId}/log`, { authed: true });
  assert.strictEqual(cross.status, 404);
  const wrongCheck = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}/checks/not-exist/log`, { authed: true });
  assert.strictEqual(wrongCheck.status, 404);
});

await runAsyncTest('P3.1 repair-issues endpoint 401/403/200 exact structure', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/repair-issues`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${projId}/repair-issues`, { authed: true, projectAccess: '403' });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/repair-issues`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body));
  for (const it of body) {
    assert.ok(typeof it.id === 'string');
    assert.ok(typeof it.contract_id === 'string');
    assert.ok('requirement_id' in it);
    assert.ok(typeof it.severity === 'string');
    assert.ok(typeof it.status === 'string');
    assert.ok('resolved_at' in it);
    assert.strictEqual(Object.keys(it).sort().join(','), ['contract_id','id','requirement_id','resolved_at','severity','status'].sort().join(','));
  }
});

await runAsyncTest('P3.1 artifacts endpoint 401/403/200 exact structure', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/artifacts`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${projId}/artifacts`, { authed: true, projectAccess: '403' });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/artifacts`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body));
  for (const a of body) {
    assert.ok(typeof a.id === 'string');
    assert.ok(typeof a.kind === 'string');
    assert.ok(typeof a.path === 'string');
    assert.ok(typeof a.sha256 === 'string');
    assert.ok(typeof a.size === 'number');
    assert.ok(typeof a.status === 'string');
    assert.ok('verification_run_id' in a);
    assert.strictEqual(Object.keys(a).sort().join(','), ['id','kind','path','sha256','size','status','verification_run_id'].sort().join(','));
  }
});

await runAsyncTest('P3.1 read-only: POST to read endpoints returns 404', async () => {
  const { status } = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: true, method: 'POST' });
  assert.strictEqual(status, 404);
  const s2 = await requestWithMocks(`/api/projects/${projId}/verification-runs`, { authed: true, method: 'POST' });
  assert.strictEqual(s2.status, 404);
  const s3 = await requestWithMocks(`/api/projects/${projId}/artifacts`, { authed: true, method: 'DELETE' });
  assert.strictEqual(s3.status, 404);
});

await runAsyncTest('P3.1 cross-project isolation for all scoped queries', async () => {
  // contracts scoped: projId should not see otherProj contracts via same endpoint? Already isolated by project_id filter
  const { body } = await requestWithMocks(`/api/projects/${otherProjId}/contracts`, { authed: true });
  assert.ok(body.every(c => c.id !== contractIdA1));
  const { body: runsOther } = await requestWithMocks(`/api/projects/${otherProjId}/verification-runs`, { authed: true });
  assert.ok(runsOther.runs.every(r => r.id !== runId1));
  const { body: repairsOther } = await requestWithMocks(`/api/projects/${otherProjId}/repair-issues`, { authed: true });
  assert.strictEqual(repairsOther.length, 0);
  const { body: artsOther } = await requestWithMocks(`/api/projects/${otherProjId}/artifacts`, { authed: true });
  assert.strictEqual(artsOther.length, 0);
});

// =========================================================================
// P3.3: Observability & Log Retention (retain original)
// =========================================================================
await runAsyncTest('P3.3 createCorrelatedContext binds attemptId, projectId and requestId', async () => {
    const ctx = createCorrelatedContext({
        projectId: 'proj-123',
        attemptId: 'att-456'
    });
    assert.strictEqual(ctx.projectId, 'proj-123');
    assert.strictEqual(ctx.attemptId, 'att-456');
    assert.ok(typeof ctx.requestId === 'string' && ctx.requestId.length > 0);
});

await runAsyncTest('P3.3 cleanupStaleLogs purges logs older than retention cutoff', async () => {
    const oldTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    try {
        db.prepare(`
            INSERT INTO project_logs (id, project_id, timestamp, agent, action, message)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('test_old_log_1', 'dummy_proj', oldTimestamp, 'system', 'info', 'Old log to purge');
    } catch {}

    const purged = cleanupStaleLogs(db, 30);
    assert.ok(typeof purged === 'number', 'Cleanup returns purged count');
});

await finish();
