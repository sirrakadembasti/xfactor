# Verification and Operations Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed verification bypasses, secure global disk synchronization, make readiness reflect worker capacity, and correct Graphify HTTP coverage.

**Architecture:** Keep the execution worker as the only authority that can complete the normal verification workflow. Treat disk recovery as reconstruction of files and historical state, enforce the global sync boundary in the HTTP router, and make readiness aggregate every required dependency. Extend the existing AST graph extractor with narrow patterns for query boundaries and Node HTTP route conditions.

**Tech Stack:** Node.js 22, Express 4, SQLite, built-in `node:test` style assertions/custom harness, Babel AST, React/Vite.

## Global Constraints

- Do not change `ensureDefaultAdminUser`, the `admin / xfactor` credential behavior, or login fallback behavior.
- Apply tasks in order and complete a red-green test cycle before starting the next task.
- The normal workflow must never call `verifyArtifactDevFallback`; that function may remain directly callable by its dedicated development tests and scripts.
- `DURUM.md` and `state.json` are historical state inputs, not verification evidence.
- Only administrators may invoke global project-root synchronization.
- `/healthz` remains liveness; `/readyz` requires database, storage, frontend when required, and worker execution capacity.
- Preserve current Graphify JSON consumers and source provenance.
- Stage and commit only files named by the current task.

---

### Task 1: Make Worker Verification Fail Closed

**Files:**
- Modify: `backend/tests/test_workflow_dev_fallback.js`
- Modify: `backend/verification/verificationCli.js:40-70`
- Modify: `backend/engine/workflow.js:1402-1422`

**Interfaces:**
- Consumes: `verifyArtifactAndProject({ projectId, contractId, artifactId, verificationRunner, options })`
- Produces: worker exceptions propagate without creating verification evidence or completing the project.

- [ ] **Step 1: Replace the fallback-success case with a failing regression assertion**

Change Case 1 so it calls `verifyArtifactAndProject` with the throwing runner and asserts rejection even when a caller supplies the obsolete option:

```js
await assert.rejects(
    verifyArtifactAndProject({
        projectId: project.id,
        contractId,
        artifactId,
        expectedRevision: 1,
        complete: true,
        verificationRunner: failingVerificationRunner,
        options: { runId, allowDevFallback: true, files: [], contract: {} }
    }),
    /Docker daemon is not running/
);
assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM verification_runs WHERE project_id = ?').get(project.id).count, 0);
assert.strictEqual(db.prepare('SELECT status FROM artifacts WHERE id = ?').get(artifactId).status, 'built');
assert.notStrictEqual(getProject(project.id).status, PROJECT_STATUS.COMPLETED);
```

Keep Case 2 proving an explicit failed worker result is not converted to success. Remove assertions that require a `fallbackUsed` response field.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_workflow_dev_fallback.js'; node backend/tests/test_runner.js
```

Expected: FAIL because the thrown worker error is caught and converted into a successful fallback verification.

- [ ] **Step 3: Remove fallback dispatch from the canonical verifier**

In `verifyArtifactAndProject`, await `verificationRunner` directly. Remove the catch that imports/calls `verifyArtifactDevFallback`, remove `fallbackUsed` from the receipt, and leave exceptions to the workflow error path.

In `runProjectVerification`, stop passing `allowDevFallback: true` and remove the `completion.fallbackUsed` warning branch. Do not delete `devVerificationRunner.js` or its direct tests.

- [ ] **Step 4: Run focused and neighboring tests GREEN**

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_workflow_dev_fallback.js,test_dev_verification_fallback.js,test_p0_c_workflow_integration.js'; node backend/tests/test_runner.js
```

Expected: three suites pass, zero fail.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/test_workflow_dev_fallback.js backend/verification/verificationCli.js backend/engine/workflow.js
git commit -m "fix: fail closed when verification worker errors"
```

---

### Task 2: Stop Recovery from Forging Verification Evidence

**Files:**
- Modify: `backend/tests/test_project_state_rehydration.js:279-318`
- Modify: `backend/services/reconciliationService.js:441-502`

**Interfaces:**
- Consumes: `rehydrateProjectStateFromDisk(projectDir, { projectId, database })`
- Produces: a completed disk project may receive a `built` ZIP, but no verified run, PASS checks, or `latestArtifact`.

- [ ] **Step 1: Rewrite recovery Case 6 as an unverified-artifact regression test**

After rehydrating the completed fixture, assert:

```js
const artifactRow = database.prepare('SELECT * FROM artifacts WHERE project_id = ?').get(completedId);
assert.ok(artifactRow);
assert.strictEqual(artifactRow.status, 'built');
assert.strictEqual(artifactRow.verification_run_id, null);
assert.strictEqual(database.prepare('SELECT COUNT(*) AS count FROM verification_runs WHERE project_id = ?').get(completedId).count, 0);
assert.strictEqual(database.prepare(`SELECT COUNT(*) AS count FROM verification_checks vc JOIN verification_runs vr ON vr.id = vc.run_id WHERE vr.project_id = ?`).get(completedId).count, 0);
assert.strictEqual(fsSync.existsSync(artifactRow.path), true);
process.env.PROJECTS_ROOT = tmpDir;
assert.strictEqual(getProject(completedId).latestArtifact, null);
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_project_state_rehydration.js'; node backend/tests/test_runner.js
```

Expected: FAIL because recovery currently inserts a verified run and synthetic PASS checks.

- [ ] **Step 3: Keep ZIP creation and remove synthetic verification**

In the completed-project recovery block, retain `collectArtifactFiles` and `createProjectZip`. Remove creation of `verification_runs`, all `auto_verify` checks, and the artifact update to `verified`. Let `createProjectZip` leave the artifact in its normal `built` state with no verification run.

- [ ] **Step 4: Run recovery and download-policy tests GREEN**

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_project_state_rehydration.js,test_p4_production_safety.js,test_p5_download_policy.js'; node backend/tests/test_runner.js
```

Expected: three suites pass, zero fail.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/test_project_state_rehydration.js backend/services/reconciliationService.js
git commit -m "fix: keep recovered artifacts unverified"
```

---

### Task 3: Restrict Global Disk Synchronization to Administrators

**Files:**
- Modify: `backend/tests/test_p1_7_task1_routes.js`
- Modify: `backend/routes/projectRoutes.js:329-356`

**Interfaces:**
- Consumes: `req.user.isAdmin` populated by `requireAuth`.
- Produces: `POST /api/projects/sync` returns 403 for authenticated non-admin users before calling reconciliation.

- [ ] **Step 1: Add a non-admin route regression test**

Make the test authentication stub choose admin status from an `x-test-admin` header, and send that header in existing admin requests. Add a case that creates a discoverable directory, calls sync without the admin header, and asserts both HTTP 403 and absence of the project row:

```js
const res = await fetch(`${baseUrl}/api/projects/sync`, { method: 'POST' });
assert.strictEqual(res.status, 403);
assert.match((await res.json()).error, /yönetici/i);
assert.strictEqual(db.prepare('SELECT id FROM projects WHERE id = ?').get(discoveredId), undefined);
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_p1_7_task1_routes.js'; node backend/tests/test_runner.js
```

Expected: FAIL because every authenticated user can currently run reconciliation.

- [ ] **Step 3: Add the administrator guard**

Immediately after `requireAuth` and before `syncProjectsWithDisk`, return:

```js
if (req.user?.isAdmin !== true) {
    return res.status(403).json({ error: 'Bu işlem yalnızca yöneticiler tarafından yapılabilir.' });
}
```

- [ ] **Step 4: Run route and isolation tests GREEN**

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_p1_7_task1_routes.js,test_disk_sync_and_isolation.js,test_project_action_chat_audit.js'; node backend/tests/test_runner.js
```

Expected: three suites pass, zero fail.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/test_p1_7_task1_routes.js backend/routes/projectRoutes.js
git commit -m "fix: restrict project sync to administrators"
```

---

### Task 4: Make Readiness Depend on Worker Capacity

**Files:**
- Modify: `backend/tests/test_health_and_lifecycle.js`
- Modify: `backend/server.js:77-126`
- Modify: `docs/OPERATIONS.md:90-97`

**Interfaces:**
- Consumes: `createExecutionClient(runtimeConfig).getCapabilities()` returning `supportedTypes` and `executionCapacity`.
- Produces: HTTP 200 only for full readiness; HTTP 503 with `{ status: 'not_ready', executionCapacity: 'unavailable' }` otherwise.

- [ ] **Step 1: Add worker-ready and worker-unavailable integration coverage**

Start a local fake worker before the backend. It must return the following JSON for `/readyz`:

```js
{ supportedTypes: ['prepare_dependencies', 'verify_artifact'], executionCapacity: true }
```

Set `EXECUTION_WORKER_URL` to that server. Assert initial `/readyz` is 200. Close the fake worker, request `/readyz` again, and assert:

```js
assert.equal(ready.status, 503);
const readyBody = await ready.json();
assert.equal(readyBody.status, 'not_ready');
assert.equal(readyBody.executionCapacity, 'unavailable');
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_health_and_lifecycle.js'; node backend/tests/test_runner.js
```

Expected: FAIL because worker unavailability still returns HTTP 200 and `status: ready`.

- [ ] **Step 3: Return 503 for missing execution capacity**

After capability lookup, if capacity is false or either required type is missing, return HTTP 503 with `status: 'not_ready'`, the existing dependency fields, and `executionCapacity: 'unavailable'`. Treat lookup exceptions the same way. Keep the outer 503 handling for database/filesystem/frontend failures.

Update the operations document to state that `/readyz` includes execution-worker capacity and returns 503 when unavailable.

- [ ] **Step 4: Run health and worker-boundary tests GREEN**

```powershell
$env:XFACTOR_TEST_RUNNER_FILES='test_health_and_lifecycle.js'; node backend/tests/test_runner.js
node --test execution/tests/jobBoundary.test.js execution/tests/jobRoundtrip.integration.test.js
```

Expected: backend suite and Node worker tests pass with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/test_health_and_lifecycle.js backend/server.js docs/OPERATIONS.md
git commit -m "fix: include worker capacity in readiness"
```

---

### Task 5: Correct Graphify HTTP Request and Worker Route Coverage

**Files:**
- Modify: `backend/tests/test_graphify.js`
- Modify: `backend/scripts/graphSource.js`
- Regenerate: `graphify-out/graph.json`
- Regenerate: `graphify-out/graph.html`
- Regenerate: `graphify-out/GRAPH_TREE.html`
- Regenerate: `graphify-out/GRAPH_REPORT.md`

**Interfaces:**
- Consumes: Babel AST nodes for template literals and binary route conditions.
- Produces: normalized frontend request paths and `HttpRoute` nodes for literal Node HTTP server conditions.

- [ ] **Step 1: Add failing extractor fixtures**

Extend the fixture client with:

```js
export const listRuns = (id, query) => request(`/projects/${encodeURIComponent(id)}/verification-runs${query ? `?${query}` : ''}`);
```

Add a raw HTTP fixture containing `/readyz`, `/v1/jobs`, and `/v1/jobs/:jobId` method/path conditions matching the forms used in `execution/server.js`. Assert the graph contains:

```text
GET /projects/:id/verification-runs
GET /readyz
POST /v1/jobs
GET /v1/jobs/:jobId
DELETE /v1/jobs/:jobId
```

Assert no request label contains `verification-runs:value`.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
node backend/tests/test_graphify.js
```

Expected: FAIL on dynamic query normalization and missing raw Node HTTP routes.

- [ ] **Step 3: Implement narrow AST extraction**

Update `endpointPath` to stop before a query marker that begins inside either a template quasi or a conditional/template expression. Do not append a `:value` placeholder after the path has ended.

Add a helper that recognizes conjunctions of literal `req.method === 'METHOD'` and `url.pathname === '/literal'`. Also recognize the existing `url.pathname.match(/^\/v1\/jobs\/([^/]+)$/)` block and its nested GET/DELETE method checks as `/v1/jobs/:jobId`. Emit route nodes once per method/path/source location, with `registers_route` and AST provenance. Do not infer routes from unrelated conditionals.

- [ ] **Step 4: Run extractor tests, regenerate, and verify invariants**

```powershell
node backend/tests/test_graphify.js
npm run graph
node backend/tests/test_graphify.js
git diff --check
```

Expected: both test runs pass, graph generation exits zero, and diff check is clean.

- [ ] **Step 5: Commit**

```powershell
git add backend/tests/test_graphify.js backend/scripts/graphSource.js graphify-out/graph.json graphify-out/graph.html graphify-out/GRAPH_TREE.html graphify-out/GRAPH_REPORT.md
git commit -m "fix: map dynamic requests and worker routes"
```

---

### Task 6: Full Regression Verification

**Files:**
- Modify only if a regression directly caused by Tasks 1-5 is found.

**Interfaces:**
- Consumes: all preceding task commits.
- Produces: fresh repository-level evidence that backend, frontend, execution worker, and generated Graphify outputs agree.

- [ ] **Step 1: Run the complete backend suite**

```powershell
Push-Location backend; npm test; Pop-Location
```

Expected: all inventoried backend suites pass.

- [ ] **Step 2: Run frontend unit tests and production build**

```powershell
Push-Location frontend; npm run test:unit; npm run build; Pop-Location
```

Expected: unit tests pass and Vite build exits zero.

- [ ] **Step 3: Run execution-worker tests and final Graphify checks**

```powershell
Push-Location execution; npm test; Pop-Location
npm run graph
node backend/tests/test_graphify.js
git diff --check
git status --short
```

Expected: worker tests and Graphify test pass; graph generation and diff check exit zero. Generated artifacts either remain unchanged or are included in Task 5.

- [ ] **Step 4: Commit only regression fixes, if any**

If no files changed, record verification without an empty commit. If a directly caused regression required a fix, follow a new red-green cycle and commit only that fix with its test.
