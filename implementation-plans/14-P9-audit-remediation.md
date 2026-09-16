# P9 Isolated Execution and Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Repair R01–R24 from the approved P9 design with real isolated execution and evidence-authorized delivery, preserving the user's source and data.

**Architecture:** Express owns identity, project state, contracts, and durable verification/receipts. A separately authenticated private worker owns isolated generated-code execution and has no access to the platform database or web secrets. Binary-safe content transfer binds results to one job, approved contract and immutable artifact digest; no Docker authority is granted to the web process.

**Tech Stack:** Node.js 22.23.2, npm 10.9.8, Express 4, SQLite, React 18, Vite, Playwright, Linux Docker execution worker.

## Global Constraints

- Approved specification: `superpowers/specs/2026-09-06-p9-audit-remediation-design.md`; user approved written design with “başla”. R01–R24 are all tracked below.
- `completed` requires the latest approved contract, verified artifact, authoritative run and immutable receipt. Do not rewrite historical user records automatically.
- The web backend receives neither Docker socket nor daemon management credentials. Production worker uses a dedicated execution host/VM or equivalently isolated daemon; same-host shared rootful Docker is not represented as production isolation.
- Generated commands never execute on the host. Missing worker/isolation is BLOCKED; no host fallback, cache-count PASS, fake command output or seeded verification evidence.
- Node.js 22.23.2 and npm 10.9.8 remain the toolchain contract.
- Preserve original checkout, user databases, project directories, graphify changes and unrelated work. Six local application files were copied byte-for-byte into baseline commit `f158ca3`; fixes are separate commits.
- Tests must isolate DB_PATH, PROJECTS_ROOT, ARTIFACTS_ROOT and worker job roots; do not load user .env or live databases.
- Keep existing conventions and migrate all affected callers. No legacy bypass APIs, duplicate state authorities or compatibility aliases at final cutover.
- Parent owns execution of RED/GREEN and final validation. Concurrent agents MUST skip validation/build/lint/tests and must not commit; independent file ownership is explicit. Parent commits scoped verified changes and records review ranges. This harness constraint overrides template instructions to run project suites inside agents.
- Every task requires separate spec-compliance and quality review. Full-branch review after all tasks. No merge/push without user choice.
- All named new operations below must have real implementations by task completion; do not return successful placeholders when a dependency is unavailable. Report BLOCKED precisely.

## Shared interfaces and fixed limits

```js
// execution/protocol.js: finite job identity, not arbitrary command transport
const operations = ['prepare_dependencies', 'verify_artifact'];
// POST /v1/jobs -> 202 { jobId, status:'queued' }
// GET /v1/jobs/:jobId -> authenticated status/result for that job's principal
// DELETE /v1/jobs/:jobId -> cancellation acknowledgement after resources stop
// GET /readyz -> authenticated capability/config readiness; no secrets
const job = {
  version: 1, jobId: 'uuid', nonce: 'random-32-byte-hex',
  operation: 'verify_artifact', projectId: 'project-id',
  contractId: 'contract-id', contractHash: '64-hex', revision: 1,
  artifactId: 'artifact-id', inputSha256: '64-hex',
  archiveBase64: 'bounded-byte-content', contract: {},
  deadline: 'UTC ISO timestamp'
};
// Successful worker result echoes all identity fields and includes real checks.
// Worker failures use failed/blocked/cancelled, never success with missing checks.
// prepare_dependencies returns only package-lock.json bytes/digest and execution evidence.
```

Transport: production HTTPS with certificate/hostname validation and a dedicated random 32-byte bearer service token; no user-cookie auth. Token comparison is timing safe after length validation; transport/client configuration rejects empty tokens and insecure non-loopback development URLs. Production never disables TLS verification. Worker listens private/loopback by default. Queue at most 8 jobs, one active job per worker; input ZIP at most 24 MiB, extracted input at most 20 MiB/500 files/2 MiB per file. Job deadline at most 15 minutes; individual command at most 120 seconds. Docker limits 2 CPUs, 1 GiB RAM+swap total, 100 PIDs, 64 MiB /tmp, 1 GiB bounded job workspace. Retain at most 1 MiB per stdout/stderr stream while hashing the entire stream; over-limit output terminates the job as failed with explicit truncation metadata. Results retained for 24 hours in worker-owned storage; startup recovers interrupted jobs as failed and removes their labelled resources. Job IDs/nonces are single-use; same ID with different input is 409; retries cannot start duplicate execution.

## Task 1: Worker job boundary and backend client

**Files:** Create `execution/protocol.js`, `execution/jobStore.js`, `execution/server.js`, `backend/executionClient.js`, `execution/package.json`, `execution/package-lock.json`, `execution/tests/jobBoundary.test.js`. Modify `backend/config.js` only for worker configuration. Do not edit sandbox runtime, frontend or database initialization files.

**Interfaces:** Export `validateJob(input, now)`, `createWorkerServer({config, store, executeJob})`, `createExecutionClient(config)`. Client exposes `prepareDependencies(job,{signal})`, `verifyArtifact(job,{signal})`, `getCapabilities({signal})`, `cancelJob(jobId)`. `executeJob(job,{signal,onResource})` is provided by Task 2; an absent executor rejects startup rather than exposing an operational stub. Server is reusable and does not auto-listen on import; executable startup is wired by Task 2.

- [ ] Write real HTTP/HTTPS boundary tests with isolated store: no token/wrong token denied; malformed identity/oversized payload rejected; principal cannot poll another principal's job; duplicate nonce/job cannot re-execute; expired job rejected; restart marks interrupted jobs terminal; cancellation waits for resource cleanup.
```js
assert.equal((await unauthorizedClient.submit(validJob)).status, 401);
assert.equal((await submit({...validJob, inputSha256:'0'.repeat(64)})).status, 400);
assert.equal((await submit({...validJob, nonce:anotherNonce})).status, 409);
```
- [ ] Parent runs `node --test execution/tests/jobBoundary.test.js` before implementation; preserve command, exit and behavior failure in report (missing-module failure alone is not sufficient behavioral RED).
- [ ] Implement bounded parsing, digest/identity validation, durable atomic store transitions, queue capacity, TTL cleanup, validated TLS client and cancellation. Store only worker-owned files; reject any job-provided host path, image, Docker parameter or arbitrary operation. Never put the service token into job env or logs.
- [ ] Parent reruns the focused test and a throwaway HTTPS client/server smoke. Result identity mismatch and untrusted TLS must fail closed. Independently review task diff/report; commit only task files.

## Task 2: Real isolated worker runtime and network policy

**Files:** Create `execution/runtime.js`, `execution/registryProxy.js`, `execution/entrypoint.js`, `execution/Dockerfile`, `execution/tests/runtime.test.js`, `execution/tests/runtime.integration.test.js`. Modify Task 1 executable package scripts only after Task 1 review. Runtime may import pure backend verifiers after Task 3, but must not import platform DB. Do not grant Docker authority to backend Dockerfile.

**Interfaces:** Export `executeJob(job,{signal,onResource})`. Runtime supplies `adapter.execute()` and `adapter.spawn()` compatible with verifier callsites, but they address only the owned job sandbox. Return actual result/error, never mocked gate PASS. Fixed image/toolchain configuration is operator-owned, not user-controlled.

- [ ] Parent reproduces existing service host-network exposure, output growth and missing abort propagation with safe finite probes, then runs `node --test execution/tests/runtime.test.js` with crafted limit/cancellation cases.
```js
assert.equal(result.status, 'failed'); // output exceeded fixed ceiling
assert.equal(await ownedContainerExists(job.jobId), false); // after cancellation ack
assert.equal(await generatedProbeCanReachWebSecret(), false);
```
- [ ] Implement labelled unique containers/networks with finally cleanup, startup orphan recovery, fixed CPU/RAM/PID/tmpfs/workspace limits and bounded output. Container root is read-only, capabilities dropped, no-new-privileges enabled; worker credentials/socket never mounted in job. All user paths stay under owned workspace; reject symlinks/absolute paths on ingress/egress.
- [ ] Separate install egress from build/service networks. Install uses operator allowlisted HTTPS registry proxy, ignores lifecycle scripts and refuses nonregistry tarball/git/file dependency URLs that escape policy. Proxy validates DNS destinations against loopback/private/link-local/metadata addresses and pins connection resolution. Generated build/service job has no internet or host/LAN egress. Health/browser probes run within the same isolated job network; do not reopen host network for tests.
- [ ] Implement actual readiness probe (not docker version only), fixed deadline cancellation, environment allowlist and portable executable translation inside Linux worker. Docker CLI environment is not the generated process environment; explicitly forward only safe configured variables into the container.
- [ ] Parent runs `node --test execution/tests/runtime.integration.test.js` against real isolated Docker, checks cgroups, network denies, disk/output limits and no remaining resources. Unavailable daemon is BLOCKED, not skipped success. Review and scoped commit.

## Task 3: Pure verification pipeline and real dependency evidence

**Files:** Modify `backend/verification/qualityPolicy.js`, `packageVerifier.js`, `buildVerifier.js`, `readmeVerifier.js`, `smokeVerifier.js`, `processVerifier.js`, `databaseVerifier.js`, `browserVerifier.js`, `apiVerifier.js`, `testInfrastructureVerifier.js`; create `backend/verification/runChecks.js`, `execution/jobExecutor.js`, `backend/tests/test_p9_verification_pipeline.js`. Task 2 runtime calls jobExecutor after this cutover.

**Interfaces:** `runVerificationChecks({workspace,contract,requirementIds,adapter,signal})` is DB-independent and returns genuine checks. `qualityPolicy` persists/aggregates those results in web process; worker never imports DB. Dependency preparation returns validated real lockfile, final verification never mutates delivered source to repair a missing lockfile. Use one authoritative runId supplied by caller.

- [ ] Parent records RED for actual existing `computeDigest` error and null README wrapper; test cache-count acceptance, dependency failure preventing build, missing lockfile, denied install network and evidence fields.
```js
assert.equal(result.checks.find(c=>c.name==='clean_install').status,'blocked');
assert.equal(result.passed,false); // cannot infer installation from directory count
```
- [ ] Remove fabricated clean-room cache branch and non-deterministic install fallback from final verifier. Use `npm ci --ignore-scripts` against validated npm lockfile. Non-npm projects require an implemented explicitly supported package manager or fail with unsupported-toolchain, never silently use npm against another lock format.
- [ ] Move DB reads/writes outside pure gate runner. Thread actual adapter, safe env, signal, process identities and execution evidence to all command/service verifiers. README documented build runs only after install and consumes the same valid adapter. Missing mandatory prerequisites remain blocked. Remove unused host bin shim synthesis.
- [ ] Worker prepare mode runs real lockfile preparation in isolated registry-only environment; verify mode extracts exact input bytes and runs all applicable mandatory gates with real service/browser checks. Preserve gate applicability semantics and requirement traceability; do not treat static-only generation checks as final build evidence.
- [ ] Parent runs `node backend/tests/test_p9_verification_pipeline.js` plus existing package/build/readme/smoke tests on isolated roots; then real small project worker verification without seeded checks. Review and scoped commit.

## Task 4: Binary-safe artifacts and execution cutover

**Files:** Modify `backend/utils/archive.js`, `backend/engine/codeGenerator.js`, `backend/engine/workflow.js`, `backend/engine/buildValidator.js`, `backend/verification/artifactVerifier.js`, `backend/projectRepository.js`, `backend/routes/projectRoutes.js`, `backend/repositories/artifactRepository.js`, `backend/server.js`; create `backend/artifactInventory.js`, `backend/tests/test_p9_artifact_pipeline.js`. Frontend files not owned here.

**Interfaces:** `collectArtifactFiles(root,{limits}) -> [{path,content:Buffer}]` is separate from IDE listing. `createProjectZip` accepts byte-preserving buffers, normalizes unique paths and publishes atomically. `verifyArtifact` delegates to backend executionClient and consumes one supplied runId. Worker response identity must match latest contract/revision/active job before persistence and receipt.

- [ ] RED: archive retains package-lock and binary image byte digest; missing/oversized/symlink/duplicate input fails before publication; cancelled/stale job cannot complete; returned lockfile cannot write any other path.
```js
assert.equal(sha256(extractedPng),sha256(originalPng));
assert.ok(extractedPaths.includes('package-lock.json'));
assert.equal(await canDownload(staleResultArtifact),false);
```
- [ ] Split artifact inventory from UI filters; strict complete enumeration fails instead of silently truncating. Preserve binary bytes, file count and total bytes before allocation/read where possible. SafeExtractor enforces limits before oversized expansion using validated entry metadata and bounded decompression.
- [ ] Prepare real lockfile before final ZIP; artifact database record and file manifest creation share a transaction with temp-to-final file publication and compensating cleanup. Validate archive manifest identity against persisted file digests. Eliminate duplicate checks-free verification run and implicit completed shortcuts.
- [ ] Migrate every generated subprocess caller out of web process. Intermediate static checks may remain local; dynamic commands go to worker. Ready API distinguishes web readiness from required execution capacity without creating jobs. Workflow error handling persists legal failure states and never pauses an already completed project on logging error.
- [ ] Parent runs focused artifact/receipt/security tests and real worker roundtrip: generate package, prepare lock, package, verify, create receipt, download identical SHA-256. Include failure/tamper and deadline paths. Review and scoped commit.

## Task 5: DAG dependency identity and checkpoint correctness

**Files:** Modify `backend/engine/dag.js`, `checkpointHelper.js`, `workflow.js`, `fileProtocol.js`, `checkpointRepository.js` only as needed; create `backend/tests/test_p9_checkpoint_dependencies.js`.

**Interfaces:** Task dependencies are iterable and canonicalized once for task spec hashing and dependency-target collection. Existing task/checkpoint public APIs remain consistent without separate Array-only paths. Resume validates both dependency identities and upstream bytes.

- [ ] Parent RED executes current Set dependency collision and upstream byte change checkpoint reuse.
```js
const first=computeTaskSpecHash({...task,dependencies:new Set(['a'])});
assert.notEqual(first,computeTaskSpecHash({...task,dependencies:new Set(['b'])}));
```
- [ ] Normalize valid dependency identities, sort deterministically, carry dependent target paths through workflow input hashes and checkpoint saves. Unknown dependency IDs fail explicitly; don't silently remap requirement/task attribution. A task with zero or incomplete accepted target writes cannot mark completed; preserve write path protections rather than weakening them.
- [ ] Cover unchanged graph reuse, changed dependency set, changed upstream file, unrelated file, invalidated checkpoint and missing target output. Parent runs new test and existing DAG/CAS/workflow integration suites on isolated roots. Review and scoped commit.

## Task 6: Lease timestamps, atomic recovery and fencing

**Files:** Modify `backend/workflowAttempts.js`, `backend/engine/workflow.js`, `backend/routes/projectRoutes.js`, `backend/projectRepository.js`, migrations in `backend/db.js`; create `backend/tests/test_p9_lease_fencing.js`.

**Interfaces:** Every mutation from an active workflow carries attemptId/leaseOwner fencing. Heartbeat and release update only matching running attempt. Lease TTL remains 30 seconds, existing heartbeat cadence retained. UTC timestamp representation is consistent; legacy SQLite timestamps interpreted as UTC rather than local time.

- [ ] Parent RED: fresh SQL-form timestamp misclassified against ISO cutoff; stale running row prevents new lease; late worker finishes a newer attempt.
```js
assert.equal(acquireWorkflowLease(projectId,newOwner).acquired,true); // stale row recovered atomically
assert.equal(releaseWorkflowLease(oldAttempt,'completed',{leaseOwner:oldOwner}),false);
```
- [ ] Within BEGIN IMMEDIATE read current lease, terminalize only expired matching row, acquire new row atomically; on contention return genuine active attempt or conflict. Heartbeats/recovery compare numeric epochs or uniform UTC expressions. Do not use unguarded SELECT then UPDATE for stale recovery.
- [ ] Fence project writes/receipt against attempt identity; failing heartbeat cancels obsolete worker rather than continuing mutation. Startup orphan recovery uses current state names and legal transitions. Preserve historical user statuses unless actually recovering an owned interrupted execution.
- [ ] Parent tests two independent SQLite connections/processes, fresh heartbeat race, TTL edges, restart and delayed completion. Run `node backend/tests/test_p9_lease_fencing.js` and existing attempts/pause/CAS tests. Review and scoped commit.

## Task 7: Session revocation, TOTP replay and proxy limits

**Files:** Modify `backend/auth.js`, `backend/routes/authRoutes.js`, `backend/sessionAuth.js`, `backend/websocketHub.js`, `backend/server.js`, `backend/scripts/create_admin.js`, `backend/db.js`; create `backend/tests/test_p9_session_revocation.js`. Coordinate after Task 6 schema changes.

**Interfaces:** Password change/reset atomically update hash and revoke all sessions; existing CLI modes remain. Persist last accepted TOTP counter per user in migration; consume matching step with CAS before session creation. Pure token verification remains side-effect-free. No enrollment/recovery UI feature is added.

- [ ] Parent RED: valid old cookie remains accepted after reset; concurrent TOTP reuse creates more than one session; loopback bypass lacks production distinction.
```js
assert.equal(await requestWithOldCookie('/api/session'),401);
assert.equal(successfulConcurrentMfaLogins,1);
assert.equal(await foreignOriginMutation(),403);
```
- [ ] Transactional password/session changes; wrong current password changes nothing. Reject new password outside existing login limits 12..256 so CLI cannot create unusable credentials. Close local matching sockets immediately and ensure cross-process CLI reset invalidates subsequent websocket messages/publications by DB revocation.
- [ ] Consume TOTP counter atomically on successful login only, including concurrent requests and key rotation. Remove unconditional loopback rate-limit exemptions; exercise trusted proxy forwarded address handling and ensure expected local tests use isolated limits/config without weakening production.
- [ ] Parent runs focused route/CLI/MFA/WS tests with isolated roots and actual login-reset-rejected-session flow. Review and scoped commit.

## Task 8: Local Monaco and strict browser origins

**Files:** Modify `frontend/src/components/IDEView.jsx`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.js`, `backend/security.js`, `backend/config.js`, `.env.example` only if existing config examples need worker/origin keys; create `frontend/src/monacoSetup.js`, `e2e/p9-editor.spec.js`.

**Interfaces:** Monaco loader configured with locally bundled editor and ESM workers; no CDN. Production connect-src includes self and normalized explicitly configured HTTPS/WSS origins, never unrestricted wss:. API file object remains {path,content,encoding,size}; UTF-8 displayed as text, supported raster images as safe data previews, other binary content explicitly labelled.

- [ ] Parent records current loader CSP violation, then browser acceptance that Monaco textarea/editor model exists under actual production response policy without outbound CDN requests.
```js
await expect(page.locator('.monaco-editor')).toBeVisible();
expect(externalMonacoRequests).toEqual([]);
```
- [ ] Bundle Monaco worker assets through Vite, configure before Editor mount and select workers per language. Keep restrictive script-src; add only necessary same-origin/blob worker policy if required by actual worker implementation, justify it. Avoid introducing general eval/CDN permission.
- [ ] Render binary according to encoding; source text never interpreted as HTML. Preserve accessible file selection and errors. Exact trusted origins are parsed/normalized at startup and invalid origins fail config.
- [ ] Parent runs frontend build/unit and actual production-mode browser editor/file preview; API/WS same-origin and allowed separate origin function, unknown origin blocked. Review and scoped commit.

## Task 9: Project-scoped frontend requests and cancellation

**Files:** Modify `frontend/src/App.jsx`, `frontend/src/services/api.js`; create `frontend/src/components/__tests__/P9ProjectIsolation.test.jsx`, `frontend/src/services/api.test.js`. Do not edit IDEView/security/config owned by Task 8.

**Interfaces:** Every state-writing async response is fenced by current authentication epoch, projectId and request sequence. Browser client pre-abort rejects without calling fetch, forwarded abort listeners removed in finally, timeout includes body consumption. Existing api methods and URL base behavior remain; encode path segment identities.

- [ ] Parent RED with deterministic deferred responses: select A, request A/chat A, switch B, resolve A; B state/files/logs unchanged. Logout followed by delayed response cannot restore state. Pre-aborted request never fetches.
```js
controller.abort();
await assert.rejects(client.getProject('p',{signal:controller.signal}));
assert.equal(fetchCalls,0);
```
- [ ] Add identity checks to project/list/chat/action/file/log updates and errors; clear project-specific files, activeFile and pending WS batches on switch/logout. Batch flush validates project/auth epoch, not only message receive. Do not force users back to an old project on delayed create/rename response.
- [ ] Dispose controllers/timers/listeners and handle already-aborted signals. Preserve MFA/login semantics and no stale isThinking lock after switch. Avoid new state-management framework.
- [ ] Parent runs `npm --prefix frontend run test:unit -- P9ProjectIsolation api.test` and real rapid switch/logout browser scenario. Review and scoped commit.

## Task 10: Canonical database initialization and recoverable deletion

**Files:** Modify `backend/db.js`, `backend/projectRepository.js`, `backend/services/reconciliationService.js`, `backend/maintenance.js`, `backend/observability.js`, `backend/server.js`, CLI/seed/test callers of DB APIs; create `backend/tests/test_p9_data_recovery.js`. No users' persisted DB migration is executed during development.

**Interfaces:** Explicit `initializeDatabase({path})`/`closeDatabase()` lifecycle, one exported current connection binding; import alone does not open/migrate/reconcile. Canonical repository owns state CRUD; remove legacy bypass functions and migrate references. Durable deletion intent table tracks original status, source/trash path and phase. Reconciliation reports unknown dirs rather than claiming completed; existing result fields preserved with explicit unverified discovery metadata.

- [ ] Parent RED import in child leaves no DB/data dirs; injected rename/transaction error preserves project and data; receipt racing with delete protects archive/project; old logs actually removed, recent remain.
```js
assert.equal(fs.existsSync(isolatedDbPath),false); // after import-only child
assert.equal(await projectFilesRecoverable(projectId),true); // each deletion failure point
assert.equal(database.prepare('SELECT count(*) n FROM project_logs').get().n,1);
```
- [ ] Extract side-effectful initialization from module import; handle circular imports through explicit startup sequencing. All entrypoints/tests initialize before DB use. Remove legacy save/delete state bypasses with complete caller migration.
- [ ] Durable delete intent, fencing/abort and rename, receipt recheck, transaction commit, idempotent owned-trash cleanup. Failure before commit compensates or retains a recoverable intent; startup recovery never deletes receipt-protected project. Do not drop global immutable receipt trigger for ordinary deletion.
- [ ] Unknown disk directories remain unverified discovery; missing dirs never delete DB rows. Read errors return explicit failure with zero partial mutations. Retention uses actual created_at UTC schema, logs failure and runs through maintenance. Preserve immutable evidence digests during compaction.
- [ ] Parent runs focused data recovery plus all migrated DB/repository/CLI suites; two-connection delete race and restart recovery smoke. Review and scoped commit.

## Task 11: Dependency, DNS, test inventory and operations

**Files:** Modify backend manifest/lock, `backend/networkResolver.js`, callers `server.js`/`llm.js`, `backend/tests/test_runner.js`, `.github/workflows/ci.yml`, production/worker config and docs as behavior requires; create `backend/tests/test_p9_runner_inventory.js`, backup/restore CLI under `backend/scripts/`, targeted restore tests.

**Interfaces:** No global dns.lookup override; default OS resolver. Tests enumerate real test suites with explicit classification for integration prerequisites; top-level runner error exits nonzero. Backup produces a consistent SQLite+projects+artifacts snapshot while new mutations are paused/drained; restore targets a new empty root and validates all receipt-linked file hashes before activation. No destructive overwrite of live data.

- [ ] Parent RED runner startup failure exits nonzero, missing test file is not silently ignored, retention test asserts row removal rather than typeof. Restore damaged artifact snapshot rejected.
```js
assert.notEqual(failedRunner.exitCode,0);
assert.deepEqual(unclassifiedTestFiles,[]);
await assert.rejects(restoreBackup(tamperedSnapshot,emptyTarget));
```
- [ ] Update vulnerable locked dependencies to compatible patched versions and run fresh audits at root/backend/frontend. Do not claim advisory equals exploit. Remove implicit hard-coded DNS fallback; explicit networking config only if demonstrated need, not new abstractions.
- [ ] Inventory all test files; repair invalid implementation-pinning tests rather than masking failures. Isolate artifacts as well as DB/projects. Real Docker tests fail explicitly when required capability missing. Test runner catches rejected main and sets exitCode=1.
- [ ] Implement bounded shutdown: refuse new generation, cancel/drain owned jobs, terminate WS/server, checkpoint/close DB; timeout non-success is observable. Backup and restore CLI use filesystem ownership checks, fresh target and manifests; prove restored receipt download without running user code.
- [ ] Parent executes audits, classified full suite once, actual backup/restore and shutdown smoke on isolated roots. Review and scoped commit.

## Task 12: Real production pipeline proof and whole-branch integration

**Files:** Modify `scripts/test-p6-production-image.mjs`, preserve `scripts/p6-container-seed.mjs` as named surface-only fixture; create `scripts/test-p9-production-pipeline.mjs`, actual generated-project fixture under test fixtures, matching browser journey, worker deployment examples, `implementation-evidence/P9.md`; update README/user guide/OPERATIONS/roadmap only to verified claims.

**Interfaces:** Existing surface smoke remains, new pipeline harness calls real worker from web API and never inserts verification PASS rows. Deterministic generated input exercises contract approval/packaging/gates/receipt/download; actual LLM generation is separate evidence requiring provider credentials/authorized request. Development Docker Desktop layout is labelled local; production worker dedicated-host trust boundary is explicit.

- [ ] Parent RED runs a minimal real verification journey against baseline behavior where practical (existing confirmed failures count only for exercised paths). New complete smoke uses real install/build/service/browser gates and input identity, not a fake adapter echo.
```js
assert.equal(receipt.runId,artifact.verificationRunId);
assert.equal(downloadSha256,submittedArtifactSha256);
assert.equal(await downloadUnverifiedArtifact(),409);
```
- [ ] Wire production web/worker images, private authenticated TLS connection, registry policy and readiness. Do not mount daemon socket into web. Test replacement/restart, expired token, canceled/stale result, binary bytes and network deny.
- [ ] Run actual provider-backed isolated example if credentials and spending authorization available; never read/print secret values. If prerequisite unavailable, finish deterministic proof and report exact remaining LLM acceptance blocker, not a fabricated success.
- [ ] Review full branch once with spec/ledger and complete diff package. One coordinated fix wave and scoped re-review for findings; unresolved load-bearing findings block completion. Update docs/evidence after real smoke, remove owned throwaway scripts, retain necessary regression tests. Do not delete recovery ledger until final acceptance/commit record exists. Offer merge/PR/leave-branch options without automatically merging or pushing.

## Plan self-check and coverage

R01/R13 -> Tasks 1–4; R02/R03/R04 -> Tasks 3–4; R05 -> Task 5; R06 -> Task 6; R07/R18/CSP -> Task 8 and data endpoint in Task 10; R08/R09 -> Task 9; R10/R11 replay/R12 -> Task 7; R14/R15/R16/R17 -> Task 10; R19/R20/R21/R24 -> Task 11; R22/R23 -> Task 12. MFA enrollment/recovery remains an explicitly documented separate product scope per approved design, not a claimed completed feature.

Tasks 1 and 9 have independent ownership and can be prepared concurrently under harness policy; no shared-file mutation, tests or commits during flight. Tasks 2–4 form a strict integration chain. All db.js changes are serialized (6, 7, 10). Task 8 security/config changes follow Task 1/7. Task 12 is last. Commit baselines and per-task scopes are recorded in the plan-owned ledger; reviewers receive task-specific diff files, not guessed HEAD~1 ranges.
