# P4 Production Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the P4 superseding delivery unit that hardens Windows sandbox execution, persisted verifier evidence, artifact download, and canonical verified completion.

**Architecture:** P4 turns production safety into one evidence-derived path: untrusted execution goes through a capability-proven sandbox or blocks; verifier checks persist as immutable current-run evidence; artifacts and completion consume that evidence through guarded repositories and one completion projector. Continuity changes are a dedicated planning task so P4 becomes canonical before source hardening starts.

**Tech Stack:** Node.js ESM, Express, SQLite `node:sqlite`, existing verifier repositories, Windows process APIs via Node wrappers or helper process, Mocha/assert-style backend tests, existing continuity validator.

## Global Constraints

- Do not repair the audited Todo artifact or generated todo-app output.
- P3 remains verified history; P4 starts as pending until its own evidence is verified.
- Use TDD for every observable contract change.
- No untrusted executable command may run with host authority by default or in production mode.
- `XFACTOR_BUILD_SANDBOX=host` remains development-only opt-in and must never satisfy production mandatory evidence.
- Missing, skipped, timed out, sandbox-unavailable, commandless, or evidence-less mandatory checks are `BLOCKED`, never `PASS`.
- LLM output is advisory only; only persisted machine evidence can authorize verified artifact download or product completion.
- `completeVerifiedProject()` is the only writer allowed to transition a project to `completed`.
- Every database test uses an isolated temporary `DB_PATH`; tests never read or mutate `backend/data/projects.db`.
- Unexpected workspace changes belong to the user; preserve them.
- Every task ends with task-specific verification, independent review, evidence update, continuity validation, and commit.

---

### [x] Task P4.1: Superseding Continuity Ledger

**Files:**
- Modify: `scripts/validate-continuity.mjs`
- Modify: `implementation-plans/00-MASTER-EXECUTION-PLAN.md`
- Modify: `PROJECT-CONTINUITY.md`
- Modify: `yol-haitasi-todo.md`
- Create: `implementation-evidence/P4.md`
- Test: `scripts/validate-continuity.mjs`

**Interfaces:**
- Consumes: P3 verified state from `PROJECT-CONTINUITY.md`, `implementation-evidence/P3.md`, and `implementation-plans/08-P3-observability-metrics.md`.
- Produces: canonical P4 unit metadata: `current_unit: P4`, `current_plan: implementation-plans/09-P4-production-safety.md`, `evidence_file: implementation-evidence/P4.md`, status `pending`, dependency `P3`.

- [x] **Step 1: Write the failing continuity expectation**

Add P4 to the validator's unit arrays in a temporary RED patch only enough for the current ledger to fail because P4 is missing from master/roadmap/evidence. Keep the expected dependency as `P4: ['P3']`.

Expected code shape in `scripts/validate-continuity.mjs`:

```js
const UNIT_IDS = ['P0-A', 'P0-B', 'P0-C', 'P1-A', 'P1-B', 'P1-C', 'P2', 'P3', 'P4'];
const UNIT_PLANS = [
  'implementation-plans/01-P0-A-state-contract-safety.md',
  'implementation-plans/02-P0-B-sandbox-verification.md',
  'implementation-plans/03-P0-C-checkpoint-safety.md',
  'implementation-plans/04-P1-A-contract-traceability.md',
  'implementation-plans/05-P1-B-runtime-verifier.md',
  'implementation-plans/06-P1-C-artifact-validation.md',
  'implementation-plans/07-P2-quality-hardening.md',
  'implementation-plans/08-P3-observability-metrics.md',
  'implementation-plans/09-P4-production-safety.md'
];
const UNIT_DEPENDENCIES = {
  'P0-A': [],
  'P0-B': ['P0-A'],
  'P0-C': ['P0-A'],
  'P1-A': ['P0-A', 'P0-B'],
  'P1-B': ['P0-B', 'P1-A'],
  'P1-C': ['P0-B', 'P0-C', 'P1-B'],
  P2: ['P1-A', 'P1-B', 'P1-C'],
  P3: ['P2'],
  P4: ['P3']
};
```

- [x] **Step 2: Run RED continuity validation**

Run: `node scripts/validate-continuity.mjs`

Expected: FAIL with a P4 parity error such as missing `implementation-evidence/P4.md`, missing P4 roadmap row, or master plan missing `09-P4-production-safety.md`.

- [x] **Step 3: Implement coherent P4 continuity supersession**

Update all canonical state in one coherent change:

- `implementation-plans/00-MASTER-EXECUTION-PLAN.md`: append P4 after P3 in the delivery graph and unit table; status `pending`; evidence path `../implementation-evidence/P4.md`; dependency `P3`.
- `PROJECT-CONTINUITY.md`: frontmatter `current_unit: P4`, `current_plan: implementation-plans/09-P4-production-safety.md`, `current_task: P4 Task P4.1 - Superseding Continuity Ledger`, `status: pending`, `evidence_file: implementation-evidence/P4.md`, `next_action: Run P4 Task P4.1 RED continuity validation, then update canonical P4 ledger metadata without touching the audited Todo artifact.` Keep completed P0-P3 history intact and keep Dirty Worktree user entries intact.
- `yol-haitasi-todo.md`: markers `current_unit=P4`, `status=pending`; add P4 row under a new P4 section with unchecked status; leave P0-P3 checked.
- `implementation-evidence/P4.md`: create pending receipt skeleton:

```markdown
---
unit: P4
status: pending
plan: implementation-plans/09-P4-production-safety.md
verified_commit: null
updated_at: 2026-09-02T00:00:00Z
---

# P4 Evidence — Production Safety

P4 is planned and not yet verified.

## Required Receipt

- Windows sandbox capability and fail-closed results
- Unified executable boundary results
- Persisted verification evidence and policy results
- Artifact download/current-run hash results
- Canonical completion projector results
- Independent reviewer and tester decisions
- Continuity validator result
```

- [x] **Step 4: Run GREEN continuity validation**

Run: `node scripts/validate-continuity.mjs`

Expected: PASS with `CONTINUITY PASS: 9 units` and current `P4/pending`.

- [x] **Step 5: Update evidence for planning checkpoint**

Append to `implementation-evidence/P4.md`:

```markdown
## Task P4.1 Receipt — Superseding Continuity Ledger

- RED: `node scripts/validate-continuity.mjs` — exit `1`; P4 validator extension failed because canonical master/roadmap/evidence did not yet include P4.
- GREEN: `node scripts/validate-continuity.mjs` — exit `0`; `CONTINUITY PASS: 9 units, plan hash b6ca15499900, current P4/pending`.
- Implemented P4 continuity supersession without marking P4 verified and without editing the audited Todo artifact.
```

- [x] **Step 6: Commit**

```bash
git add scripts/validate-continuity.mjs implementation-plans/00-MASTER-EXECUTION-PLAN.md PROJECT-CONTINUITY.md yol-haitasi-todo.md implementation-evidence/P4.md implementation-plans/09-P4-production-safety.md
git commit -m "plan(P4): add production safety continuity unit"
```

---

### [x] Task P4.2: Windows Sandbox Capability Contract

**Files:**
- Modify: `backend/verification/adapters/windowsSandbox.js`
- Modify: `backend/verification/sandboxRunner.js`
- Modify: `backend/engine/buildValidator.js`
- Test: `backend/tests/test_p4_production_safety.js`

**Interfaces:**
- Consumes: `executeInSandbox(command, args, options)` from `backend/verification/sandboxRunner.js`.
- Produces: capability-proven Windows sandbox contract:
  - `adapter.getCapabilities(): { available, adapterId, isolation, jobObject, resourceLimits, workspaceAcl, networkDenied, envScrubbed, reason }`
  - `executeInSandbox()` throws `SANDBOX_UNAVAILABLE` or returns `{ status: 'PASS'|'FAIL'|'BLOCKED', passed, exitCode, stdout, stderr, timedOut, aborted, adapterId, capabilities }`.

- [x] **Step 1: Write RED sandbox capability tests**

Create `backend/tests/test_p4_production_safety.js` with isolated tests that inject a fake Windows adapter and assert platform-only availability is insufficient:

```js
import assert from 'assert';
import { executeInSandbox } from '../verification/sandboxRunner.js';

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    throw error;
  }
}

await runAsyncTest('P4.2 blocks Windows adapter without proven OS isolation capabilities', async () => {
  const fakeAdapter = {
    id: 'windows',
    getCapabilities() {
      return {
        available: false,
        adapterId: 'windows',
        isolation: false,
        jobObject: false,
        resourceLimits: false,
        workspaceAcl: false,
        networkDenied: false,
        envScrubbed: true,
        reason: 'restricted token unavailable'
      };
    },
    isAvailable() { return true; },
    async execute() { throw new Error('must not execute without capabilities'); }
  };

  await assert.rejects(
    executeInSandbox('node', ['-e', 'console.log(1)'], { adapter: fakeAdapter, workspace: process.cwd() }),
    /SANDBOX_UNAVAILABLE|restricted token unavailable/
  );
});
```

Add second RED test proving `executeInSandbox()` includes adapter/capability metadata for a passing capable adapter and scrubs secret env keys.

- [x] **Step 2: Run RED sandbox tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: FAIL because `executeInSandbox()` does not consult `getCapabilities()` and capable result metadata is missing.

- [x] **Step 3: Implement capability gate**

Update `backend/verification/sandboxRunner.js`:

```js
function requireSandboxCapabilities(adapter) {
  if (typeof adapter.getCapabilities !== 'function') {
    if (typeof adapter.isAvailable === 'function' && adapter.isAvailable()) return null;
    throw new SandboxInitializationError(`Sandbox adapter "${adapter.id || 'unknown'}" is unavailable.`);
  }
  const capabilities = adapter.getCapabilities();
  if (!capabilities?.available) {
    throw new SandboxInitializationError(capabilities?.reason || `Sandbox adapter "${adapter.id || 'unknown'}" is unavailable.`);
  }
  return capabilities;
}
```

Call it before `adapter.execute()`, pass `capabilities` into `execute`, and merge `adapterId`/`capabilities` into the returned result.

Update `backend/verification/adapters/windowsSandbox.js` so `isAvailable()` delegates to `getCapabilities().available`. Until a real restricted-token/Job Object implementation exists, `getCapabilities()` must return unavailable with a precise reason instead of treating plain `spawn()` as sandboxed. Replace shell-string `execSync('taskkill ...')` with argument-safe `spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], ...)`.

- [x] **Step 4: Run GREEN sandbox tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: PASS for P4.2 tests.

- [x] **Step 5: Run existing sandbox regression tests**

Run: `node backend/tests/test_build_sandbox_gate.js`

Expected: PASS; default unavailable sandbox remains fail-closed and host marker is not created.

- [x] **Step 6: Update evidence and commit**

Append command output and verdict to `implementation-evidence/P4.md` under `## Task P4.2 Receipt — Windows Sandbox Capability Contract`.

```bash
git add backend/verification/adapters/windowsSandbox.js backend/verification/sandboxRunner.js backend/engine/buildValidator.js backend/tests/test_p4_production_safety.js implementation-evidence/P4.md
git commit -m "fix(sandbox): require proven Windows isolation capability"
```

---

### [x] Task P4.3: Unified Executable Verification Boundary

**Files:**
- Modify: `backend/verification/processVerifier.js`
- Modify: `backend/verification/smokeVerifier.js`
- Modify: `backend/verification/readmeVerifier.js`
- Modify: `backend/verification/buildVerifier.js`
- Modify: `backend/engine/buildValidator.js`
- Test: `backend/tests/test_p4_production_safety.js`

**Interfaces:**
- Consumes: `executeInSandbox()` capability result from Task P4.2.
- Produces: one mandatory verifier status contract: mandatory executable checks are `BLOCKED` when sandbox is unavailable, command is missing, install/build evidence is missing, or execution is skipped.

- [x] **Step 1: Write RED unified-boundary tests**

Extend `backend/tests/test_p4_production_safety.js`:

```js
await runAsyncTest('P4.3 service spawn uses sandbox boundary and blocks when sandbox unavailable', async () => {
  const { spawnService } = await import('../verification/processVerifier.js');
  const unavailableAdapter = {
    id: 'fake-unavailable',
    getCapabilities: () => ({ available: false, reason: 'no job object' }),
    async execute() { throw new Error('must not execute service on host'); }
  };

  await assert.rejects(
    spawnService({ command: 'node', args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd(), adapter: unavailableAdapter }),
    /SANDBOX_UNAVAILABLE|no job object/
  );
});

await runAsyncTest('P4.3 missing build script is BLOCKED not PASS for mandatory framework_build', async () => {
  const { validateProjectBuild } = await import('../engine/buildValidator.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'p4-no-build-'));
  await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ scripts: {} }));
  const result = await validateProjectBuild(tmp, { title: 'No Build Script' }, {});
  assert.strictEqual(result.passed, false);
  assert(result.checks.some(check => check.name === 'framework_build' && check.status !== 'passed'));
});
```

- [x] **Step 2: Run RED unified-boundary tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: FAIL because service spawn bypasses sandbox and legacy build validation can treat missing evidence as non-failure.

- [x] **Step 3: Route service and command execution through sandbox**

Update `backend/verification/processVerifier.js` so `spawnService()` accepts an `adapter` option and calls `executeInSandbox()` or a sandbox-managed long-running process wrapper. It must not call plain `spawn()` for untrusted services unless explicit development host mode is passed.

Update `smokeVerifier.js`, `readmeVerifier.js`, `buildVerifier.js`, and `buildValidator.js` so skipped mandatory executable evidence becomes `BLOCKED` with a deterministic reason:

```js
{
  name: 'framework_build',
  gateName: 'framework_build',
  status: 'BLOCKED',
  applicability: 'MANDATORY',
  reason: 'Missing build script or sandbox capability; mandatory framework build evidence was not produced.',
  passed: false
}
```

- [x] **Step 4: Run GREEN unified-boundary tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: PASS for P4.2 and P4.3 tests.

- [x] **Step 5: Run existing verifier regression tests**

Run: `node backend/tests/test_runner.js test_build_sandbox_gate.js test_p1_b_process.js test_p1_b_smoke_gate.js test_p2_readme_verifier.js`

Expected: PASS with updated fail-closed expectations; no test expects mandatory skipped evidence to pass.

- [x] **Step 6: Update evidence and commit**

Append command output and verdict to `implementation-evidence/P4.md` under `## Task P4.3 Receipt — Unified Executable Verification Boundary`.

```bash
git add backend/verification/processVerifier.js backend/verification/smokeVerifier.js backend/verification/readmeVerifier.js backend/verification/buildVerifier.js backend/engine/buildValidator.js backend/tests/test_p4_production_safety.js implementation-evidence/P4.md
git commit -m "fix(verifier): route executable checks through sandbox boundary"
```

---

### [x] Task P4.4: Immutable Verification Evidence and Artifact State

**Files:**
- Modify: `backend/repositories/verificationRepository.js`
- Modify: `backend/repositories/artifactRepository.js`
- Modify: `backend/db.js`
- Modify: `backend/verification/qualityPolicy.js`
- Test: `backend/tests/test_p4_production_safety.js`

**Interfaces:**
- Consumes: `MANDATORY_GATES` from `backend/verification/qualityPolicy.js`.
- Produces:
  - active policy version constant, e.g. `ACTIVE_POLICY_VERSION = '2.0'`;
  - guarded run/check finalization helpers;
  - guarded artifact transition helper;
  - PASS evidence requirements for executable mandatory checks.

- [x] **Step 1: Write RED immutability and evidence tests**

Extend `backend/tests/test_p4_production_safety.js` with isolated DB setup and tests:

```js
await runAsyncTest('P4.4 finalized verification check cannot be mutated', async () => {
  const repo = await import('../repositories/verificationRepository.js');
  const runId = `run-${Date.now()}`;
  repo.createRun({ id: runId, projectId, contractId, status: 'running', policyVersion: '2.0' });
  repo.createCheck({ id: `${runId}-check`, runId, projectId, contractId, gateName: 'framework_build', applicability: 'MANDATORY', status: 'PASS', evidenceJson: { command: 'npm run build' } });
  repo.updateRunStatus(runId, 'verified');
  await assert.rejects(
    async () => repo.updateCheck(`${runId}-check`, { status: 'FAIL' }),
    /finalized|immutable/i
  );
});

await runAsyncTest('P4.4 status-only mandatory PASS is BLOCKED without evidence fields', async () => {
  const { evaluateVerificationRun } = await import('../verification/qualityPolicy.js');
  const result = evaluateVerificationRun({ checks: [{ gateName: 'framework_build', status: 'PASS', applicability: 'MANDATORY' }], requiredGates: ['framework_build'] });
  assert.strictEqual(result.status, 'BLOCKED');
  assert(result.blockedGates.includes('framework_build'));
});
```

Use real isolated `DB_PATH` helpers already established in `backend/tests/isolatedDb.js` before importing DB-backed repositories.

- [x] **Step 2: Run RED immutability tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: FAIL because finalized rows can be mutated and status-only PASS is accepted.

- [x] **Step 3: Implement guarded repositories and PASS evidence validation**

Update `verificationRepository.js`:

- add allowed run/check transition maps;
- add finalized-state guard for `verified`, `failed`, and `blocked` runs;
- require expected status/revision where repository patterns support it;
- assert `changes === 1` for updates;
- reject check mutation after parent run finalization.

Update `artifactRepository.js`:

- add artifact transition map such as `created -> packaged -> verifying -> verified|rejected|invalidated`;
- require `verification_run_id` only on verified transition;
- reject arbitrary status changes.

Update `qualityPolicy.js`:

- export `ACTIVE_POLICY_VERSION`;
- for executable mandatory gates, require evidence fields before normalizing `PASS`: `command`, `exitCode`, `startedAt`, `endedAt`, `stdoutDigest` or explicit empty digest, `stderrDigest` or explicit empty digest, and `policyVersion` matching active policy;
- convert missing evidence to `BLOCKED` with reason.

Add additive SQLite constraints/triggers in `backend/db.js` if compatible with existing migration style; otherwise add repository-level writer confinement and tests proving direct repository bypass fails.

- [x] **Step 4: Run GREEN immutability tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: PASS through P4.4 tests.

- [x] **Step 5: Run existing policy/artifact regression tests**

Run: `node backend/tests/test_runner.js test_quality_policy_integration.js test_p1_c_artifact_repository.js test_p3_observability.js`

Expected: PASS with updated evidence-required expectations; P3 compaction remains byte-preserving and allowed only for approved stale stdout/stderr tokens.

- [x] **Step 6: Update evidence and commit**

Append command output and verdict to `implementation-evidence/P4.md` under `## Task P4.4 Receipt — Immutable Verification Evidence and Artifact State`.

```bash
git add backend/repositories/verificationRepository.js backend/repositories/artifactRepository.js backend/db.js backend/verification/qualityPolicy.js backend/tests/test_p4_production_safety.js implementation-evidence/P4.md
git commit -m "fix(evidence): guard verifier and artifact state transitions"
```

---

### [x] Task P4.5: Artifact Download Gate and Canonical Completion Projector

**Files:**
- Modify: `backend/projectRepository.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/engine/workflow.js`
- Modify: `backend/workflowAttempts.js`
- Modify: `backend/auth.js`
- Modify: `backend/engine/stateMachine.js`
- Create or Modify: `backend/verification/verificationCli.js`
- Test: `backend/tests/test_p4_production_safety.js`

**Interfaces:**
- Consumes: `ACTIVE_POLICY_VERSION`, guarded verification/artifact repositories, latest approved contract, and artifact manifest/hash.
- Produces:
  - one canonical verification service/CLI entrypoint returning `{ runId, artifactId?, completionReceiptId? }`;
  - stricter `completeVerifiedProject({ projectId, contractId, artifactId, expectedRevision })`;
  - artifact download authorization that revalidates current-run evidence and file hash.

- [x] **Step 1: Write RED completion and download tests**

Extend `backend/tests/test_p4_production_safety.js` with isolated DB tests:

```js
await runAsyncTest('P4.5 completeVerifiedProject rejects missing mandatory gate rows even when existing rows are PASS', async () => {
  await assert.rejects(
    completeVerifiedProject({ projectId, contractId, artifactId, expectedRevision }),
    /missing mandatory gate|mandatory gate set/i
  );
});

await runAsyncTest('P4.5 artifact download rejects verified artifact linked to non-verified run', async () => {
  const response = await request(app).get(`/api/projects/${projectId}/artifacts/${artifactId}/download`).set('Cookie', ownerCookie);
  assert.strictEqual(response.status, 409);
  assert.match(response.body.error, /verification run/i);
});

await runAsyncTest('P4.5 workflow cannot write completed directly', async () => {
  const workflowSource = await fs.readFile(new URL('../engine/workflow.js', import.meta.url), 'utf8');
  assert(!workflowSource.includes("finalState.status = 'completed'"));
  assert(workflowSource.includes('completeVerifiedProject'));
});
```

Use existing test HTTP helpers if available; otherwise keep route-level test in project route test conventions.

- [x] **Step 2: Run RED completion/download tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: FAIL because completion does not require exact gate set/current-run links, download does not check linked run status/policy/hash, and workflow still has direct completed write.

- [x] **Step 3: Strengthen completion projector**

Update `completeVerifiedProject()` to require:

- artifact belongs to latest approved contract and has verified status;
- linked run belongs to same project/contract and has status `verified`;
- run policy equals `ACTIVE_POLICY_VERSION`;
- set of current-run mandatory check `gate_name` values exactly equals `MANDATORY_GATES`;
- each mandatory check has `PASS`, evidence fields, digests, timestamps, and current-run requirement links where applicable;
- every mandatory requirement has at least one check link for that same run;
- no open repair issues;
- artifact hash on disk or manifest hash matches persisted `sha256` before completion receipt.

Persist completion receipt with project ID, contract ID/hash, artifact ID/hash, run ID, policy version, mandatory gate digest list, previous revision, next revision, and timestamp.

- [x] **Step 4: Wire workflow and route completion through projector**

Update `backend/engine/workflow.js`:

- remove direct `finalState.status = 'completed'` path;
- remove `TAMAMLANDI` as product-completion authority;
- call canonical verification service/CLI path after artifact verification;
- call `completeVerifiedProject()` only when artifact/run verification returns authoritative receipt input;
- keep LLM reports advisory.

Update `backend/workflowAttempts.js`, deletion flow, disk sync, and auth/state validation so all status writers either use repository CAS/state-machine helpers or formalize internal states such as `deleting` in `PROJECT_STATUS`.

Create or update `backend/verification/verificationCli.js` so CLI and HTTP verification use the same orchestration service and return receipt IDs, not only in-memory booleans.

- [x] **Step 5: Harden artifact download route**

Update `backend/routes/projectRoutes.js` download route to reject unless the current request proves:

- project access;
- latest approved contract;
- artifact verified;
- linked run verified;
- active policy match;
- all current-run mandatory gates present and PASS with evidence;
- current-run mandatory requirement links complete;
- no open repairs;
- fresh file hash equals persisted `sha256`.

- [x] **Step 6: Run GREEN completion/download tests**

Run: `node backend/tests/test_p4_production_safety.js`

Expected: PASS through P4.5 tests.

- [x] **Step 7: Run exact backend regression gate**

Run: `node backend/tests/test_runner.js test_p4_production_safety.js test_p0_a_state_transitions.js test_p1_b_quality_policy_evidence.js test_p1_c_artifact_repository.js test_p3_observability.js`

Expected: PASS; no direct completed write path remains; artifact download and completion are current-run evidence-derived.

- [x] **Step 8: Update evidence and commit**

Append command output and verdict to `implementation-evidence/P4.md` under `## Task P4.5 Receipt — Artifact Download Gate and Canonical Completion Projector`.

```bash
git add backend/projectRepository.js backend/routes/projectRoutes.js backend/engine/workflow.js backend/workflowAttempts.js backend/auth.js backend/engine/stateMachine.js backend/verification/verificationCli.js backend/tests/test_p4_production_safety.js implementation-evidence/P4.md
git commit -m "fix(completion): derive artifact download and completion from verified evidence"
```

---

## Unit Exit Gate

- [x] All 5 P4 planning tasks are checked.
- [x] All P4 backend safety tests pass:
  - Exact Command: `node backend/tests/test_p4_production_safety.js`
- [x] P4 regression gate passes:
  - Exact Command: `node backend/tests/test_runner.js test_p4_production_safety.js test_build_sandbox_gate.js test_p1_b_process.js test_p1_b_smoke_gate.js test_quality_policy_integration.js test_p1_c_artifact_repository.js test_p3_observability.js`
- [x] Independent reviewer returns no blocking finding.
- [x] Independent tester reproduces Windows sandbox fail-closed, persisted evidence, artifact download, and canonical completion acceptance.
- [x] Evidence receipt `implementation-evidence/P4.md` records commands, exit codes, commit, and findings.
- [x] Continuity (`PROJECT-CONTINUITY.md`) and roadmap (`yol-haitasi-todo.md`) agree on P4.
- [x] Validator passes:
  - Exact Command: `node scripts/validate-continuity.mjs`
- [x] Unit status changes to `verified` in one coherent checkpoint commit:
  - File Set: `PROJECT-CONTINUITY.md`, `yol-haitasi-todo.md`, `implementation-plans/00-MASTER-EXECUTION-PLAN.md`, `implementation-plans/09-P4-production-safety.md`, `implementation-evidence/P4.md`, `scripts/validate-continuity.mjs`
  - Commit Message: `verif(P4): verify production safety unit exit gate`
