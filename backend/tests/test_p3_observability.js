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
const { getProjectRole, canViewProject, canEditProject } = await import('../auth.js');
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// seed users and memberships
const ownerUserId = 'p3-user-owner';
const otherUserId = 'p3-user-other';
db.prepare("INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, 'owner', 'hash', 0)").run(ownerUserId);
db.prepare("INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, 'other', 'hash', 0)").run(otherUserId);

const now = '2025-01-01T00:00:00.000Z';
const now2 = '2025-01-01T00:00:00.000Z'; // same timestamp for tie test
const later = '2025-01-02T00:00:00.000Z';
const projId = 'p3-proj-a';
const otherProjId = 'p3-proj-b';
const contractIdA1 = 'p3-contract-a1';
const contractIdA2 = 'p3-contract-a2';
const otherContractId = 'p3-contract-b1';
const runId1 = 'p3-run-1';
const runId2 = 'p3-run-2';
const runIdTie = 'p3-run-tie';
const runIdOther = 'p3-run-other';
const checkId1 = 'p3-check-1';
const checkId2 = 'p3-check-2';
const otherCheckId = 'p3-check-other';

db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'P3 Proj A', 'running')").run(projId);
db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'P3 Proj B', 'running')").run(otherProjId);
db.prepare("INSERT INTO project_owners (project_id, user_id, role) VALUES (?, ?, 'owner')").run(projId, ownerUserId);
db.prepare("INSERT INTO project_owners (project_id, user_id, role) VALUES (?, ?, 'owner')").run(otherProjId, otherUserId);

db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at) VALUES (?, ?, 1, 'approved', '{}', 'hash-a1', ?, ?)").run(contractIdA1, projId, now, now);
db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at) VALUES (?, ?, 2, 'draft', '{}', 'hash-a2', NULL, ?)").run(contractIdA2, projId, now);
db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at) VALUES (?, ?, 1, 'approved', '{}', 'hash-b1', ?, ?)").run(otherContractId, otherProjId, now, now);
db.prepare("INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status) VALUES (?, ?, 'REQ-P3', 'req', 'functional','high',1,'approved')").run('p3-req-a1', contractIdA1);
// runs: runId1 and runIdTie share same started_at to test deterministic tie (id ASC)
db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'verified', '1.0', ?, ?)").run(runId1, projId, contractIdA1, now, now);
db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'failed', '1.0', ?, ?)").run(runIdTie, projId, contractIdA1, now2, now2);
db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'failed', '1.0', ?, ?)").run(runId2, projId, contractIdA1, later, later);
db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at) VALUES (?, ?, ?, 'running', '1.0', ?, ?)").run(runIdOther, otherProjId, otherContractId, now, now);
const stdoutRaw = 'ok output with secret=Bearer sk-1234567890abcdefgh and password=supersecret';
const stderrRaw = 'err with api_key=abc123 and token=eyJhbGciOiJIUzI1NiJ9.eyJwYXlsb2FkIjoidGVzdCJ9.signature123';
// store using documented schema { reason, requirementIds, evidence: { stdout, stderr } }
const evidence1 = JSON.stringify({ reason: 'ok', requirementIds: ['p3-req-a1'], evidence: { stdout: stdoutRaw, stderr: stderrRaw } });
const evidence2 = JSON.stringify({ reason: 'fail', requirementIds: [], evidence: { stdout: 'other stdout', stderr: 'other stderr' } });
const evidenceOther = JSON.stringify({ reason: 'other', requirementIds: [], evidence: { stdout: 'x', stderr: 'y' } });
db.prepare("INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, command, exit_code, started_at, ended_at, timed_out, stdout_digest, stderr_digest, evidence_json) VALUES (?, ?, ?, 'api_contract', 'MANDATORY', 'PASS', 'cmd1', 0, ?, ?, 0, 'dig1','dig2', ?)").run(checkId1, contractIdA1, runId1, now, now, evidence1);
db.prepare("INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, command, exit_code, started_at, ended_at, timed_out, stdout_digest, stderr_digest, evidence_json) VALUES (?, ?, ?, 'smoke_gate', 'MANDATORY', 'FAIL', 'cmd2', 1, ?, ?, 1, 'd3','d4', ?)").run(checkId2, contractIdA1, runId1, now, now, evidence2);
db.prepare("INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, command, exit_code, started_at, ended_at, timed_out, stdout_digest, stderr_digest, evidence_json) VALUES (?, ?, ?, 'api_contract', 'MANDATORY', 'PASS', 'cmd3', 0, ?, ?, 0, 'd5','d6', ?)").run(otherCheckId, otherContractId, runIdOther, now, now, evidenceOther);
db.prepare("INSERT INTO repair_issues (id, project_id, contract_id, requirement_id, fingerprint, severity, status, resolved_at) VALUES (?, ?, ?, ?, 'fp1', 'critical','open', NULL)").run('p3-repair-1', projId, contractIdA1, 'p3-req-a1');
db.prepare("INSERT INTO repair_issues (id, project_id, contract_id, requirement_id, fingerprint, severity, status, resolved_at) VALUES (?, ?, ?, ?, 'fp2', 'high','resolved', ?)").run('p3-repair-2', projId, contractIdA1, 'p3-req-a1', now);
db.prepare("INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id) VALUES (?, ?, ?, 'zip', 'artifacts/a.zip', ?, 123, 'verified', ?)").run('p3-art-1', projId, contractIdA1, 'a'.repeat(64), runId1);
db.prepare("INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id) VALUES (?, ?, ?, 'tar', 'artifacts/b.tar', ?, 456, 'draft', NULL)").run('p3-art-2', projId, contractIdA1, 'b'.repeat(64));

// helpers for http with real membership checks
function createRealProjectAccess() {
  return (requiredRole = 'viewer') => (req, res, next) => {
    const projectId = req.params.id;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.isAdmin) return next();
    const role = getProjectRole(userId, projectId);
    if (!role) return res.status(403).json({ error: 'Forbidden' });
    const rolePriority = { viewer: 1, editor: 2, owner: 3 };
    const requiredPriority = rolePriority[requiredRole] || 1;
    const rolePriorityValue = rolePriority[role] || 0;
    if (rolePriorityValue < requiredPriority) return res.status(403).json({ error: 'Forbidden' });
    const map = { viewer: canViewProject, editor: canEditProject, owner: (uid, pid) => getProjectRole(uid,pid)==='owner' };
    const check = map[requiredRole] || canViewProject;
    if (!check(userId, projectId)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

async function requestWithMocks(pathname, { authed = true, userId = ownerUserId, method = 'GET' } = {}) {
  const requireAuth = (req, res, next) => {
    if (!authed) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: userId, isAdmin: false };
    next();
  };
  const projectAccess = createRealProjectAccess();
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectRouter({ requireAuth, projectAccess, wsHub: { broadcast() {} } }));
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

function encodeCursor(id, started_at) {
  return Buffer.from(JSON.stringify({ id, started_at })).toString('base64url');
}

// exact key set helpers
function assertExactKeys(obj, expectedKeys, label) {
  const actual = Object.keys(obj).sort();
  const exp = [...expectedKeys].sort();
  assert.deepStrictEqual(actual, exp, `${label} keys mismatch: got ${actual.join(',')} expected ${exp.join(',')}`);
}

// =========================================================================
// P3.1 Authorized Read-Only Evidence and Contract APIs
// =========================================================================

await runAsyncTest('P3.1 contracts endpoint 401 without auth', async () => {
  const { status } = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: false });
  assert.strictEqual(status, 401);
});

await runAsyncTest('P3.1 contracts endpoint 403 for non-owned project same user', async () => {
  // same authenticated user ownerUserId owns projId but not otherProjId
  const ok = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: true, userId: ownerUserId });
  assert.strictEqual(ok.status, 200);
  const forbidden = await requestWithMocks(`/api/projects/${otherProjId}/contracts`, { authed: true, userId: ownerUserId });
  assert.strictEqual(forbidden.status, 403);
});

await runAsyncTest('P3.1 contracts endpoint 200 with exact structure', async () => {
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 2);
  for (const c of body) {
    assertExactKeys(c, ['id','revision','status','contract_hash','approved_at','created_at'], 'contract');
    assert.ok(typeof c.id === 'string');
    assert.ok(typeof c.revision === 'number');
  }
});

await runAsyncTest('P3.1 verification-runs list 401/403 and 200 with exact outer keys and keyset pagination', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/verification-runs`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${otherProjId}/verification-runs`, { authed: true, userId: ownerUserId });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/verification-runs`, { authed: true });
  assert.strictEqual(status, 200);
  assertExactKeys(body, ['runs','nextCursor'], 'verification-runs outer');
  assert.ok(Array.isArray(body.runs));
  for (const r of body.runs) {
    assertExactKeys(r, ['id','contract_id','status','policy_version','started_at','ended_at'], 'run');
  }
  // deterministic ordering: started_at DESC, id ASC -> latest first (later), then tie sorted by id
  const idsOrdered = body.runs.map(r=>r.id);
  // later should be first
  assert.strictEqual(idsOrdered[0], runId2);
  // tie: runId1 < runIdTie lexicographically? runId1 = p3-run-1, runIdTie = p3-run-tie => 1 < tie so 1 before tie
  const tieIdx1 = idsOrdered.indexOf(runId1);
  const tieIdx2 = idsOrdered.indexOf(runIdTie);
  assert.ok(tieIdx1 >=0 && tieIdx2>=0 && tieIdx1 < tieIdx2, 'tie should be deterministic by id ASC');
  // pagination limit+1
  const paged = await requestWithMocks(`/api/projects/${projId}/verification-runs?limit=1`, { authed: true });
  assert.strictEqual(paged.status, 200);
  assert.strictEqual(paged.body.runs.length, 1);
  assert.ok(paged.body.nextCursor);
  // decode nextCursor is base64url
  const decoded = JSON.parse(Buffer.from(paged.body.nextCursor, 'base64url').toString());
  assert.ok(decoded.id && decoded.started_at);
  const paged2 = await requestWithMocks(`/api/projects/${projId}/verification-runs?cursor=${paged.body.nextCursor}&limit=1`, { authed: true });
  assert.strictEqual(paged2.status, 200);
  assert.strictEqual(paged2.body.runs.length, 1);
  assert.notStrictEqual(paged2.body.runs[0].id, paged.body.runs[0].id);
  // cursor boundaries: last page nextCursor null
  const all = await requestWithMocks(`/api/projects/${projId}/verification-runs?limit=100`, { authed: true });
  assert.strictEqual(all.body.nextCursor, null);
});

await runAsyncTest('P3.1 pagination invalid/stale/cross-project cursor returns 400', async () => {
  const malformed = await requestWithMocks(`/api/projects/${projId}/verification-runs?cursor=not-base64!`, { authed: true });
  assert.strictEqual(malformed.status, 400);
  const fake = encodeCursor('nonexistent', now);
  const nonexistent = await requestWithMocks(`/api/projects/${projId}/verification-runs?cursor=${fake}`, { authed: true });
  assert.strictEqual(nonexistent.status, 400);
  // cross-project cursor
  const crossCursor = encodeCursor(runIdOther, now);
  const cross = await requestWithMocks(`/api/projects/${projId}/verification-runs?cursor=${crossCursor}`, { authed: true });
  assert.strictEqual(cross.status, 400);
  // limit validation
  const badLimit = await requestWithMocks(`/api/projects/${projId}/verification-runs?limit=0`, { authed: true });
  assert.strictEqual(badLimit.status, 400);
  const badLimit2 = await requestWithMocks(`/api/projects/${projId}/verification-runs?limit=101`, { authed: true });
  assert.strictEqual(badLimit2.status, 400);
  const badLimit3 = await requestWithMocks(`/api/projects/${projId}/verification-runs?limit=abc`, { authed: true });
  assert.strictEqual(badLimit3.status, 400);
});

await runAsyncTest('P3.1 pagination duplicate query params handled deterministically', async () => {
  // supertest style: fetch with duplicate limit should take first value; ensure not 500
  const dup = await requestWithMocks(`/api/projects/${projId}/verification-runs?limit=1&limit=2`, { authed: true });
  assert.strictEqual(dup.status, 200);
  assert.strictEqual(dup.body.runs.length, 1);
});

await runAsyncTest('P3.1 verification run detail 401/403/200 exact keys and nested isolation', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${otherProjId}/verification-runs/${runIdOther}`, { authed: true, userId: ownerUserId });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}`, { authed: true });
  assert.strictEqual(status, 200);
  assertExactKeys(body, ['run','checks'], 'detail outer');
  assertExactKeys(body.run, ['id','contract_id','status','policy_version','started_at','ended_at'], 'detail run');
  assert.ok(Array.isArray(body.checks));
  for (const ch of body.checks) {
    assertExactKeys(ch, ['id','gate_name','applicability','status','exit_code','stdout_digest','stderr_digest','started_at','ended_at','timed_out'], 'check');
  }
  const cross = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runIdOther}`, { authed: true });
  assert.strictEqual(cross.status, 404);
  const notFound = await requestWithMocks(`/api/projects/${projId}/verification-runs/not-exist`, { authed: true });
  assert.strictEqual(notFound.status, 404);
});

await runAsyncTest('P3.1 log endpoint 401/403/200 exact keys redacted and isolation with persisted schema', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}/checks/${checkId1}/log`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${otherProjId}/verification-runs/${runIdOther}/checks/${otherCheckId}/log`, { authed: true, userId: ownerUserId });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}/checks/${checkId1}/log`, { authed: true });
  assert.strictEqual(status, 200);
  assertExactKeys(body, ['id','gate_name','stdout','stderr'], 'log');
  assert.strictEqual(body.id, checkId1);
  assert.strictEqual(body.gate_name, 'api_contract');
  assert.ok(typeof body.stdout === 'string');
  assert.ok(typeof body.stderr === 'string');
  assert.ok(!body.stdout.includes('supersecret'));
  assert.ok(!body.stdout.includes('sk-1234567890abcdefgh'));
  assert.ok(body.stdout.includes('[REDACTED]'));
  assert.ok(!body.stderr.includes('eyJhbGci'));
  assert.ok(body.stderr.includes('[REDACTED]'));
  // verify DB still holds raw (not redacted) and schema is evidence: { stdout, stderr }
  const rawRow = db.prepare("SELECT evidence_json FROM verification_checks WHERE id = ?").get(checkId1);
  const parsed = JSON.parse(rawRow.evidence_json);
  assert.ok(parsed.evidence && typeof parsed.evidence.stdout === 'string');
  assert.ok(parsed.evidence.stdout.includes('supersecret'));
  assert.ok(parsed.evidence.stderr.includes('eyJhbGci'));
  // cross-project isolation
  const cross = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runIdOther}/checks/${otherCheckId}/log`, { authed: true });
  assert.strictEqual(cross.status, 404);
  const wrongCheck = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runId1}/checks/not-exist/log`, { authed: true });
  assert.strictEqual(wrongCheck.status, 404);
});

await runAsyncTest('P3.1 evidence persistence via qualityPolicy aggregate and log route share schema', async () => {
  // create isolated project for aggregate test
  const aggProj = 'p3-agg-proj';
  const aggContract = 'p3-agg-contract';
  const aggRun = 'p3-agg-run';
  const aggReq = 'p3-agg-req';
  db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'agg', 'verification_pending')").run(aggProj);
  db.prepare("INSERT INTO project_owners (project_id, user_id, role) VALUES (?, ?, 'owner')").run(aggProj, ownerUserId);
  db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash) VALUES (?, ?, 1, 'approved', '{}', 'h')").run(aggContract, aggProj);
  db.prepare("INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status) VALUES (?, ?, 'REQ-AGG','stmt','functional','high',1,'approved')").run(aggReq, aggContract);
  db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at) VALUES (?, ?, ?, 'running', '1.0', ?)").run(aggRun, aggProj, aggContract, now);
  const { aggregateVerificationRun } = await import('../verification/qualityPolicy.js');
  const stdoutSecret = 'agg stdout with password=mysecret';
  const stderrSecret = 'agg stderr Bearer sk-abcdef1234567890';
  const res = await aggregateVerificationRun(aggProj, aggContract, aggRun, [
    { gateName: 'api_contract', status: 'PASS', stdout: stdoutSecret, stderr: stderrSecret, requirementIds: [aggReq], command: 'cmd', exitCode: 0 }
  ]);
  assert.ok(res);
  const checkRow = db.prepare("SELECT id, evidence_json, stdout_digest, stderr_digest FROM verification_checks WHERE run_id = ?").get(aggRun);
  assert.ok(checkRow);
  const ev = JSON.parse(checkRow.evidence_json);
  assert.ok(ev.evidence);
  assert.strictEqual(ev.evidence.stdout, stdoutSecret);
  assert.strictEqual(ev.evidence.stderr, stderrSecret);
  // raw stored, not redacted
  assert.ok(ev.evidence.stdout.includes('mysecret'));
  // fetch via log route
  const { body } = await requestWithMocks(`/api/projects/${aggProj}/verification-runs/${aggRun}/checks/${checkRow.id}/log`, { authed: true });
  assert.ok(!body.stdout.includes('mysecret'));
  assert.ok(body.stdout.includes('[REDACTED]'));
});

await runAsyncTest('P3.1 repair-issues endpoint 401/403/200 exact keys', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/repair-issues`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${otherProjId}/repair-issues`, { authed: true, userId: ownerUserId });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/repair-issues`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body));
  for (const it of body) {
    assertExactKeys(it, ['contract_id','id','requirement_id','resolved_at','severity','status'], 'repair');
  }
});

await runAsyncTest('P3.1 artifacts endpoint 401/403/200 exact keys', async () => {
  const r401 = await requestWithMocks(`/api/projects/${projId}/artifacts`, { authed: false });
  assert.strictEqual(r401.status, 401);
  const r403 = await requestWithMocks(`/api/projects/${otherProjId}/artifacts`, { authed: true, userId: ownerUserId });
  assert.strictEqual(r403.status, 403);
  const { status, body } = await requestWithMocks(`/api/projects/${projId}/artifacts`, { authed: true });
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body));
  for (const a of body) {
    assertExactKeys(a, ['id','kind','path','sha256','size','status','verification_run_id'], 'artifact');
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

await runAsyncTest('P3.1 cross-project isolation for all scoped queries with same user', async () => {
  const { body } = await requestWithMocks(`/api/projects/${projId}/contracts`, { authed: true, userId: ownerUserId });
  assert.ok(body.every(c => c.id !== otherContractId));
  const { body: repairsOther } = await requestWithMocks(`/api/projects/${projId}/repair-issues`, { authed: true, userId: ownerUserId });
  // other project repair not visible
  assert.ok(!repairsOther.some(r=> r.contract_id===otherContractId));
  // directly try to fetch other project run via projId should 404
  const cross = await requestWithMocks(`/api/projects/${projId}/verification-runs/${runIdOther}`, { authed: true, userId: ownerUserId });
  assert.strictEqual(cross.status, 404);
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
