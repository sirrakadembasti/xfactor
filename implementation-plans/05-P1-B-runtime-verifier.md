# P1-B: Runtime, API, Browser, and Smoke Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement one delivery unit at a time. Read `PROJECT-CONTINUITY.md` first. Never execute a later unit before its dependencies are verified.

## Goal
Establish an independent, clean-room runtime verification pipeline that runs the generated codebase within the OS-enforced sandbox (provided by P0-B). The pipeline must validate the service configuration manifest, execute database migrations and connectivity against SQLite Schema Version 8 and Traceability Version 9, manage process startup and readiness via health checks, perform real HTTP API contract checks with direct database assertions, execute headless browser user journeys for critical flows, run test suites, and enforce a distinct mandatory smoke gate. All results must be stored as immutable evidence in the SQLite database and aggregated into a fail-closed quality policy verdict, preventing any agent self-report from authorizing a PASS.

---

## Architecture

The P1-B runtime verifier operates independently of LLM agents, acting as a deterministic gate. It mounts the source directory in the P0-B OS-enforced sandbox and runs checks in a layered DAG sequence:

```
                  [Contract / Source ZIP]
                             │
                             ▼
         [Task P1-B.1: Service Manifest & Env Check]
                             │
                             ▼
         [Task P1-B.4: Database Migration & Schema]
                             │
                             ▼
         [Task P1-B.2: Sandbox Process Spawner]
                             │
                             ▼
         [Task P1-B.3: Health & Liveness Probes]
              /              │              \
             /               │               \
            ▼                ▼                ▼
   [Task P1-B.5: API] [Task P1-B.6: Browser] [Task P1-B.7: Test Infra]
            \                │                /
             \               │               /
              ▼              ▼              ▼
     [Task P1-B.8: Smoke Gate & Service Runner (smokeVerifier)]
                             │
                             ▼
     [Task P1-B.9: Quality Policy & Evidence Aggregator]
```

### Components
1. **`serviceManifestVerifier.js`**: Parses and validates `service-manifest.json` from the generated workspace against the expected JSON schema. Enforces that backend and frontend services occupy unique loopback ports, use secure CORS headers, map environment variables properly, and establish explicit proxy mappings.
2. **`databaseVerifier.js`**: Validates migrations (e.g. Prisma migrations), schema definitions, and connectivity inside the sandbox database.
3. **`processVerifier.js`**: Manages process lifecycles. Launches processes using `sandboxRunner` (from P0-B), configures environment variables, binds ports, monitors stdout/stderr for crashes, handles graceful process-tree termination, and cleans up socket leaks.
4. **`healthProber.js`**: Polls readiness and liveness endpoints (`/health`, `/readyz`, etc.) using exponential backoff, returning clean liveness signals.
5. **`apiVerifier.js`**: Fires real HTTP requests (using `node:http`) against the backend service. Validates status codes, headers, response schemas, and directly checks the sandboxed SQLite database tables (using `node:sqlite`) to assert expected side effects.
6. **`browserVerifier.js`**: Launches a sandboxed browser tab via the CDP relay or Puppeteer, executes the critical user flows (e.g., click, fill, verify state transitions), and verifies persistence by reloading.
7. **`testInfrastructureVerifier.js`**: Validates the presence of test scripts in `package.json`, runs tests in the sandbox, and checks that tests are executed rather than skipped.
8. **`smokeVerifier.js`**: Performs a unified smoke verification test starting services in the sandbox, verifying port mappings, making health checks, executing a minimal browser E2E journey, and closing clean.
9. **`qualityPolicy.js`**: Aggregates all check results, maps them to contract requirement IDs, writes runs/checks/evidence to the SQLite database, and computes the final PASS/FAIL verdict using fail-closed logic.

---

## Tech Stack
- **Runtime:** Node.js ESM (`node:child_process`, `node:http`, `node:net`, `node:sqlite`).
- **Browser Automation:** Puppeteer or Playwright (run in a sandboxed head-less configuration).
- **Security & Sandboxing:** P0-B `sandboxRunner` (restricted token + Job Object on Windows; dedicated unprivileged user + namespaces on Linux).
- **Testing Framework:** Existing test harness (`backend/tests/testHarness.js`) using Mocha/Assert.

---

## Global Constraints
1. **OS Sandbox Enforcement:** Under no circumstances may generated code, startup scripts, database migrations, or test suites execute directly on the host application authority. They must run inside the unprivileged OS sandbox environment defined in P0-B.
2. **Fail-Closed Execution:** Any timeout, process crash, network collision, or setup failure resolves the gate to `FAIL` or `BLOCKED`. A skipped or aborted check never results in a `PASS` for a mandatory gate.
3. **Independent Verdicts:** No LLM agent (Coder, Reviewer, or Tester) may set or modify a gate's success status. The final completion state is strictly derived from machine verification evidence in the database.
4. **Clean-Up Isolation:** Every process spawned during verification must be registered in a process tree and terminated via hard-kill (`SIGKILL` or `taskkill /F /T` on Windows) on timeout, abort, or execution completion to prevent zombie processes and port collision.
5. **Database Sandboxing:** All database verification must operate on independent, isolated database files located within the sandbox workspace. No test run may read or write to the primary host database.

---

## Implementation Tasks

### Task P1-B.1: Service Manifest and Configuration Validator
- **Goal:** Build a manifest validator that verifies the generated codebase declares a valid `service-manifest.json` conforming to port, environment, and network requirements.
- **Exact Files:**
  - Create: `backend/verification/serviceManifestVerifier.js`
  - Create: `backend/tests/test_p1_b_manifest.js`
- **Interfaces:**
  - `verifyServiceManifest(projectDir, contract)`
    - Input: `projectDir: string`, `contract: object`
    - Output: `{ passed: boolean, checks: Array<GateResult>, issues: Array<string> }`
- **TDD Steps:**
  - [ ] **Step 1.1: Write the failing test**
    Create `backend/tests/test_p1_b_manifest.js` using `createTestHarness` to import `verifyServiceManifest`. Test an empty directory and a directory with port conflicts:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { verifyServiceManifest } from '../verification/serviceManifestVerifier.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.1: empty path should fail validation', async () => {
        const res = await verifyServiceManifest('./nonexistent-path', {});
        assert.strictEqual(res.passed, false);
    });

    finish();
    ```
  - [ ] **Step 1.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_manifest.js`
    Expected Failure: `Error: Cannot find module '../verification/serviceManifestVerifier.js'`
  - [ ] **Step 1.3: Write minimal implementation**
    Create `backend/verification/serviceManifestVerifier.js`. Parse `service-manifest.json` in the given directory. Validate that all declared services list unique loopback ports, map correct environment keys, and define secure CORS header configurations.
  - [ ] **Step 1.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_manifest.js`
    Expected PASS: Output verifies assertion passes and exits with code 0.
  - [ ] **Step 1.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 1 manifest validation success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 1.6: Commit changes**
    Commit files: `backend/verification/serviceManifestVerifier.js`, `backend/tests/test_p1_b_manifest.js`
    Message: `feat(verification): add service manifest and environment configuration validator`

---

### Task P1-B.2: Sandbox Process Spawner and Lifecycle Manager
- **Goal:** Implement the process manager that starts backend/frontend services inside the P0-B OS-sandbox, verifies port bindings, and guarantees complete cleanup on abort or timeout.
- **Exact Files:**
  - Create: `backend/verification/processVerifier.js`
  - Create: `backend/tests/test_p1_b_process.js`
- **Interfaces:**
  - `spawnService(serviceId, config, env, options)`
    - Input: `serviceId: string`, `config: object`, `env: object`, `options: { signal: AbortSignal }`
    - Output: `Promise<{ pid: number, port: number, processTreeHandle: object }>`
  - `killService(processTreeHandle)`
    - Input: `processTreeHandle: object`
    - Output: `Promise<void>`
- **TDD Steps:**
  - [ ] **Step 2.1: Write the failing test**
    Create `backend/tests/test_p1_b_process.js` trying to import `spawnService` and spawning a mock server that binds to a port:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { spawnService, killService } from '../verification/processVerifier.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.2: spawn mock service and verify lifecycle', async () => {
        const handle = await spawnService('mock-api', { command: 'node', args: ['-e', 'setInterval(() => {}, 1000)'] }, {}, {});
        assert.ok(handle.pid > 0);
        await killService(handle.processTreeHandle);
    });

    finish();
    ```
  - [ ] **Step 2.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_process.js`
    Expected Failure: `Error: Cannot find module '../verification/processVerifier.js'`
  - [ ] **Step 2.3: Write minimal implementation**
    Create `backend/verification/processVerifier.js`. Route command execution through P0-B's `executeInSandbox`. Strip host environment secrets before spawning processes. Manage process handles for cleanup.
  - [ ] **Step 2.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_process.js`
    Expected PASS: Mock process starts and is terminated cleanly, exiting 0.
  - [ ] **Step 2.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 2 process spawner success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 2.6: Commit changes**
    Commit files: `backend/verification/processVerifier.js`, `backend/tests/test_p1_b_process.js`
    Message: `feat(verification): implement sandboxed process manager and lifecycle controller`

---

### Task P1-B.3: Liveness & Readiness Prober
- **Goal:** Implement the HTTP prober that verifies that processes spawned inside the sandbox have completed startup and are listening and responsive.
- **Exact Files:**
  - Create: `backend/verification/healthProber.js`
  - Modify: `backend/tests/test_p1_b_process.js` (append prober tests)
- **Interfaces:**
  - `probeServiceHealth(healthUrl, startupTimeoutMs)`
    - Input: `healthUrl: string`, `startupTimeoutMs: number`
    - Output: `Promise<{ responsive: boolean, statusCode: number, error?: string }>`
- **TDD Steps:**
  - [ ] **Step 3.1: Write the failing test**
    Append a test to `backend/tests/test_p1_b_process.js` checking health probes:
    ```javascript
    import { probeServiceHealth } from '../verification/healthProber.js';

    await runAsyncTest('P1-B.3: probe non-existent service should return unresponsive', async () => {
        const res = await probeServiceHealth('http://127.0.0.1:9999/health', 100);
        assert.strictEqual(res.responsive, false);
    });
    ```
  - [ ] **Step 3.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_process.js`
    Expected Failure: `Error: Cannot find module '../verification/healthProber.js'`
  - [ ] **Step 3.3: Write minimal implementation**
    Create `backend/verification/healthProber.js`. Perform HTTP GET calls using `node:http`. Retry with exponential backoff until the server responds with HTTP 2xx or timeouts expire.
  - [ ] **Step 3.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_process.js`
    Expected PASS: Health checks complete successfully and exit 0.
  - [ ] **Step 3.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 3 liveness prober success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 3.6: Commit changes**
    Commit files: `backend/verification/healthProber.js`, `backend/tests/test_p1_b_process.js`
    Message: `feat(verification): add liveness and readiness health prober`

---

### Task P1-B.4: Database Lifecycle & Schema Verifier
- **Goal:** Build the database verifier that executes migration scripts, verifies schemas/tables in the sandbox database, and checks SQLite write capability.
- **Exact Files:**
  - Create: `backend/verification/databaseVerifier.js`
  - Create: `backend/tests/test_p1_b_database.js`
- **Interfaces:**
  - `verifyDatabase(projectDir, contract, env)`
    - Input: `projectDir: string`, `contract: object`, `env: object`
    - Output: `Promise<{ passed: boolean, checks: Array<GateResult>, issues: Array<string> }>`
- **TDD Steps:**
  - [ ] **Step 4.1: Write the failing test**
    Create `backend/tests/test_p1_b_database.js` attempting to verify database structure:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { verifyDatabase } from '../verification/databaseVerifier.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.4: missing schema project should fail database verification', async () => {
        const res = await verifyDatabase('./mock-empty', { database: { engine: 'sqlite' } }, {});
        assert.strictEqual(res.passed, false);
    });

    finish();
    ```
  - [ ] **Step 4.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_database.js`
    Expected Failure: `Error: Cannot find module '../verification/databaseVerifier.js'`
  - [ ] **Step 4.3: Write minimal implementation**
    Create `backend/verification/databaseVerifier.js`. Invoke Prisma migrations in the sandbox via `executeInSandbox`. Connect to the generated database file using `node:sqlite` to verify schemas, tables, and write checks.
  - [ ] **Step 4.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_database.js`
    Expected PASS: Database validation completes successfully and exits 0.
  - [ ] **Step 4.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 4 database validation success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 4.6: Commit changes**
    Commit files: `backend/verification/databaseVerifier.js`, `backend/tests/test_p1_b_database.js`
    Message: `feat(verification): implement database migration and schema verifier`

---

### Task P1-B.5: API Contract and Database State Verifier
- **Goal:** Implement HTTP verification that fires real requests against the sandbox API server, validates payload formats against schemas, and verifies physical DB state mutations (side-effects).
- **Exact Files:**
  - Create: `backend/verification/apiVerifier.js`
  - Create: `backend/tests/test_p1_b_api.js`
- **Interfaces:**
  - `verifyAPIContract(apiBaseUrl, dbPath, contract)`
    - Input: `apiBaseUrl: string`, `dbPath: string`, `contract: object`
    - Output: `Promise<{ passed: boolean, checks: Array<GateResult>, issues: Array<string> }>`
- **TDD Steps:**
  - [ ] **Step 5.1: Write the failing test**
    Create `backend/tests/test_p1_b_api.js` to mock backend endpoints and verify state assertions:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { verifyAPIContract } from '../verification/apiVerifier.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.5: invalid API port endpoint fails contract check', async () => {
        const res = await verifyAPIContract('http://127.0.0.1:1111', './test.db', { requiredEndpoints: ['GET /api/todos'] });
        assert.strictEqual(res.passed, false);
    });

    finish();
    ```
  - [ ] **Step 5.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_api.js`
    Expected Failure: `Error: Cannot find module '../verification/apiVerifier.js'`
  - [ ] **Step 5.3: Write minimal implementation**
    Create `backend/verification/apiVerifier.js`. Use `node:http` client to dispatch REST requests. Inspect table structures and records inside the sandboxed SQLite database file using `node:sqlite` to verify DB updates after POST/PUT/DELETE requests.
  - [ ] **Step 5.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_api.js`
    Expected PASS: API test execution succeeds and exits 0.
  - [ ] **Step 5.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 5 API contract checks success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 5.6: Commit changes**
    Commit files: `backend/verification/apiVerifier.js`, `backend/tests/test_p1_b_api.js`
    Message: `feat(verification): implement API contract and database state verifier`

---

### Task P1-B.6: Headless Browser Journey Verifier
- **Goal:** Create a browser journey verifier that executes the critical user flows (e.g., CRUD actions) via a headless browser tab and asserts visible UI state and persistence.
- **Exact Files:**
  - Create: `backend/verification/browserVerifier.js`
  - Create: `backend/tests/test_p1_b_browser.js`
- **Interfaces:**
  - `verifyBrowserJourneys(appUrl, contract)`
    - Input: `appUrl: string`, `contract: object`
    - Output: `Promise<{ passed: boolean, checks: Array<GateResult>, issues: Array<string> }>`
- **TDD Steps:**
  - [ ] **Step 6.1: Write the failing test**
    Create `backend/tests/test_p1_b_browser.js` testing DOM element queries and E2E journeys:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { verifyBrowserJourneys } from '../verification/browserVerifier.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.6: headless browser fails if app is offline', async () => {
        const res = await verifyBrowserJourneys('http://127.0.0.1:2222', { requiredScreens: ['todo.dashboard'] });
        assert.strictEqual(res.passed, false);
    });

    finish();
    ```
  - [ ] **Step 6.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_browser.js`
    Expected Failure: `Error: Cannot find module '../verification/browserVerifier.js'`
  - [ ] **Step 6.3: Write minimal implementation**
    Create `backend/verification/browserVerifier.js`. Launch sandboxed Chrome (using Puppeteer or Playwright). Navigate pages, click buttons, fill input fields, and reload the browser to ensure state persists. Catch and fail on console error logs.
  - [ ] **Step 6.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_browser.js`
    Expected PASS: Browser E2E automation succeeds and exits with code 0.
  - [ ] **Step 6.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 6 browser verifier success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 6.6: Commit changes**
    Commit files: `backend/verification/browserVerifier.js`, `backend/tests/test_p1_b_browser.js`
    Message: `feat(verification): implement headless browser journey verifier`

---

### Task P1-B.7: Test Infrastructure Gate
- **Goal:** Create a gate that verifies the generated codebase contains actual tests (unit/integration/E2E), executes them in the sandbox, and validates that they ran and passed.
- **Exact Files:**
  - Create: `backend/verification/testInfrastructureVerifier.js`
  - Create: `backend/tests/test_p1_b_test_infra.js`
- **Interfaces:**
  - `verifyTestInfrastructure(projectDir, contract)`
    - Input: `projectDir: string`, `contract: object`
    - Output: `Promise<{ passed: boolean, checks: Array<GateResult>, issues: Array<string> }>`
- **TDD Steps:**
  - [ ] **Step 7.1: Write the failing test**
    Create `backend/tests/test_p1_b_test_infra.js` to verify test script checks:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { verifyTestInfrastructure } from '../verification/testInfrastructureVerifier.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.7: empty project should fail test infrastructure check', async () => {
        const res = await verifyTestInfrastructure('./mock-empty', {});
        assert.strictEqual(res.passed, false);
    });

    finish();
    ```
  - [ ] **Step 7.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_test_infra.js`
    Expected Failure: `Error: Cannot find module '../verification/testInfrastructureVerifier.js'`
  - [ ] **Step 7.3: Write minimal implementation**
    Create `backend/verification/testInfrastructureVerifier.js`. Validate package scripts. Run `npm test` inside the OS sandbox using `executeInSandbox`. Verify from output streams that test executions were non-zero and completed successfully.
  - [ ] **Step 7.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_test_infra.js`
    Expected PASS: Test runner validator succeeds and exits 0.
  - [ ] **Step 7.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 7 test infra gate success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 7.6: Commit changes**
    Commit files: `backend/verification/testInfrastructureVerifier.js`, `backend/tests/test_p1_b_test_infra.js`
    Message: `feat(verification): implement test infrastructure verification gate`

---

### Task P1-B.8: Mandatory Smoke Gate & Service Runner (smokeVerifier)
- **Goal:** Build the unified smoke verifier (`smokeVerifier.js`) that runs a complete service startup cycle inside the sandbox, checks port mappings, performs health checks, executes E2E journeys, and handles graceful teardown.
- **Exact Files:**
  - Create: `backend/verification/smokeVerifier.js`
  - Create: `backend/tests/test_p1_b_smoke_verifier.js`
- **Interfaces:**
  - `runSmokeVerification(projectDir, contract)`
    - Input: `projectDir: string`, `contract: object`
    - Output: `Promise<{ passed: boolean, checks: Array<GateResult>, issues: Array<string> }>`
- **TDD Steps:**
  - [ ] **Step 8.1: Write the failing test**
    Create `backend/tests/test_p1_b_smoke_verifier.js` to load the smoke verifier and test startup sequences:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { runSmokeVerification } from '../verification/smokeVerifier.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.8: smoke gate fails if directory is empty', async () => {
        const res = await runSmokeVerification('./mock-empty-path', {});
        assert.strictEqual(res.passed, false);
    });

    finish();
    ```
  - [ ] **Step 8.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_smoke_verifier.js`
    Expected Failure: `Error: Cannot find module '../verification/smokeVerifier.js'`
  - [ ] **Step 8.3: Write minimal implementation**
    Create `backend/verification/smokeVerifier.js`. It must:
    1. Parse the service manifest.
    2. Start frontend and backend services inside the OS sandbox using platform-specific startup commands (e.g. backend launch command `node server.js` or `npm run dev` and frontend start `vite` or `npm run start`).
    3. Perform HTTP liveness checks on configured loopback ports using `healthProber.js`.
    4. Start Puppeteer/Playwright to verify E2E journeys.
    5. Clean up process trees using `processVerifier.js` upon completion, timeout, or abort signals.
  - [ ] **Step 8.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_smoke_verifier.js`
    Expected PASS: Sandbox smoke validation cycle passes and exits 0.
  - [ ] **Step 8.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 8 smoke verifier success. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 8.6: Commit changes**
    Commit files: `backend/verification/smokeVerifier.js`, `backend/tests/test_p1_b_smoke_verifier.js`
    Message: `feat(verification): implement distinct sandboxed smoke verifier gate`

---

### Task P1-B.9: Quality Policy and Evidence Aggregator
- **Goal:** Collect check results, enforce fail-closed aggregation policies, map results to contract requirement IDs (Traceability Schema v9), write records to SQLite (Schema Version 8), and update project state.
- **Exact Files:**
  - Create: `backend/verification/qualityPolicy.js`
  - Create: `backend/tests/test_p1_b_smoke_gate.js`
  - Modify: `backend/routes/projectRoutes.js` (integrate verifier trigger)
- **Interfaces:**
  - `aggregateVerificationRun(projectId, contractId, runId, checks)`
    - Input: `projectId: string`, `contractId: string`, `runId: string`, `checks: Array<GateResult>`
    - Output: `Promise<{ passed: boolean, runStatus: 'verified' | 'failed' }>`
- **TDD Steps:**
  - [ ] **Step 9.1: Write the failing test**
    Create `backend/tests/test_p1_b_smoke_gate.js` to import `aggregateVerificationRun` and assert gate constraints:
    ```javascript
    import assert from 'assert';
    import { createTestHarness } from './testHarness.js';
    import { aggregateVerificationRun } from '../verification/qualityPolicy.js';

    const { runAsyncTest, finish } = createTestHarness();

    await runAsyncTest('P1-B.9: failed sub-gate checks should result in failed run status', async () => {
        const mockChecks = [{ gateName: 'api_smoke', status: 'FAIL', applicability: 'MANDATORY' }];
        const res = await aggregateVerificationRun('proj-1', 'contract-1', 'run-1', mockChecks);
        assert.strictEqual(res.passed, false);
        assert.strictEqual(res.runStatus, 'failed');
    });

    finish();
    ```
  - [ ] **Step 9.2: Run test to verify it fails (RED state)**
    Command: `node backend/tests/test_p1_b_smoke_gate.js`
    Expected Failure: `Error: Cannot find module '../verification/qualityPolicy.js'`
  - [ ] **Step 9.3: Write minimal implementation**
    Create `backend/verification/qualityPolicy.js`. Enforce that:
    1. If any check status equals `FAIL` or `BLOCKED`, the aggregate run status resolves to `failed`.
    2. Write details transactionally to SQLite tables `verification_runs` and `verification_checks` (Schema Version 8).
    3. Link checks to stable requirement links (Traceability Version 9 tables: `requirement_check_links`, `requirement_file_links`, `requirement_artifact_links`).
    4. Prevent LLM Tester self-reports from overriding the final state verdict.
    5. Trigger `checkpoints.invalidateAllCheckpoints(projectId, contractRevision)` and set project state to `verification_failed` if checks fail.
  - [ ] **Step 9.4: Run test to verify it passes (GREEN state)**
    Command: `node backend/tests/test_p1_b_smoke_gate.js`
    Expected PASS: Aggregator returns correct run verdicts and writes evidence to database, exiting 0.
  - [ ] **Step 9.5: Record evidence and validate continuity**
    Update `implementation-evidence/P1-B.md` to note Task 9 policy aggregator success. Mark `P1-B` status as `verified` in `implementation-evidence/P1-B.md` and `yol-haitasi-todo.md` only after all checks pass. Run `node scripts/validate-continuity.mjs`.
  - [ ] **Step 9.6: Commit changes**
    Commit files: `backend/verification/qualityPolicy.js`, `backend/tests/test_p1_b_smoke_gate.js`, `backend/routes/projectRoutes.js`
    Message: `feat(verification): add quality policy aggregator and schema version 8 persistence`

---

## Unit Exit Gate

- [ ] Run all runtime, API, browser, smoke, and test-infra tests.
- [ ] Confirm that services start, execute health checks, and execute E2E interactive journeys inside the sandbox.
- [ ] Obtain independent reviewer approval and independent tester reproduction of the verification run.
- [ ] Record exact commands, exit codes, commit, and decisions in `implementation-evidence/P1-B.md`; set `status: verified` only after all mandatory evidence passes.
- [ ] Mark P1-B verified in master plan (`implementation-plans/00-MASTER-EXECUTION-PLAN.md`) and roadmap (`yol-haitasi-todo.md`); advance continuity (`PROJECT-CONTINUITY.md`) only after evidence exists.
- [ ] Run `node scripts/validate-continuity.mjs`.
- [ ] Commit source, tests, evidence, plans, roadmap, and continuity as one logical checkpoint.
