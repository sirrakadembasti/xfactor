# P4 Production Safety Design

## Status

Approved scope for a superseding P4 initiative. This document designs the next delivery unit after P3. It does not implement source, tests, continuity changes, or roadmap changes.

## Objective

Add P4 to close production risks left after P0-P3: Windows sandbox execution must be a real OS boundary or fail closed; all executable verification must persist authoritative evidence; artifact download and completion must be derived from immutable, current-run verification facts; legacy skipped-as-pass paths must be retired.

## Primary Evidence

- `PROJECT-CONTINUITY.md` records P3 as `verified` and allows new work only through a superseding plan.
- `scripts/validate-continuity.mjs` hardcodes P0-A through P3 and therefore must evolve before P4 can become canonical.
- `backend/verification/adapters/windowsSandbox.js` treats Windows platform presence as sandbox availability and runs `child_process.spawn()` with scrubbed environment, but no restricted token, low integrity, Job Object quotas, workspace ACL, or network isolation.
- `backend/verification/sandboxRunner.js` selects the Windows adapter solely by platform.
- `backend/verification/processVerifier.js` and smoke verification spawn services outside the sandbox runner.
- `backend/engine/workflow.js` uses legacy deterministic/build verification paths, does not call `runProjectVerification()` or `completeVerifiedProject()`, and still attempts a direct final `completed` write.
- `backend/projectRepository.js` contains `completeVerifiedProject()`, but production flow does not call it. Its checks are not yet strict enough for current-run mandatory gate completeness and policy-version binding.
- Artifact download checks artifact status, latest contract, and `verification_run_id`, but does not require the linked run to be verified, does not bind active policy, and does not re-hash the file before download.
- Verification and artifact repositories allow broad status/evidence mutation without finalized-row immutability, state-machine transitions, CAS, or row-count assertions.
- The `projects.status` column is unconstrained TEXT at the database layer, so status validity and completion safety are currently application-only.
- Stale workflow reconciliation, deletion paths, and any non-enum internal states such as `deleting` contain direct `projects.status` writes without the same CAS/state-machine guarantees as the canonical repository transitions.
- Legacy build validation can still treat missing install/build evidence as non-failure in some paths.

## Goals

1. Make Windows sandbox availability evidence-based, not platform-based.
2. Ensure untrusted build, runtime, smoke, README, and verifier commands run only through the unified sandbox boundary unless an explicit development-only host opt-in is active.
3. Persist all authoritative verification checks through `verification_runs` and `verification_checks` before any artifact verification or completion decision.
4. Make `completeVerifiedProject()` the only product completion writer and wire production flow through it.
5. Protect artifact download with current verified run, active policy, current contract, verified artifact status, fresh file hash, and no open repair issues.
6. Make verification evidence and artifact status transitions state-machine guarded, CAS checked, and immutable after finalization except for the existing P3 retention-compaction contract.
7. Replace legacy skipped/pass behavior with one verifier status contract: missing mandatory evidence is `BLOCKED`, never `PASS`.
8. Supersede continuity, master plan, roadmap, evidence, and validator contracts to include P4 without marking it verified prematurely.

## Non-Goals

- Do not repair the audited Todo artifact or generated todo-app output.
- Do not add P5 or redesign the entire P0-P3 architecture.
- Do not treat LLM reviewer/tester output as authoritative evidence.
- Do not introduce host fallback in production/default verification.
- Do not remove P3 retention compaction; constrain it to its approved redaction-only semantics.

## Design

### 1. Windows Sandbox Capability Contract

`WindowsSandboxAdapter.isAvailable()` must become a capability check. It must prove all required isolation controls are present before returning available:

- process isolation through a restricted token or equivalent low-privilege execution identity;
- Job Object process-tree ownership and guaranteed teardown;
- CPU/time/memory limit support or explicit bounded enforcement;
- workspace-only writable surface;
- host-sensitive paths blocked by ACL or equivalent deny policy;
- network disabled or explicitly denied for untrusted verification;
- ambient secret environment scrubbed before launch;
- adapter policy options for CPU, memory, disk, process count, output limits, network mode, and workspace root are consumed and enforced;
- process termination uses argument-safe APIs, not shell-string `taskkill` construction.

If any capability is missing, the adapter reports unavailable and the calling mandatory gate returns `BLOCKED`. Plain `spawn()` on Windows is not a sandbox.

### 2. Unified Executable Boundary

Every untrusted command path must consume `executeInSandbox()` or a stricter wrapper:

- dependency install;
- typecheck/build;
- runtime service spawn;
- API smoke checks;
- browser journey support services;
- README command verification;
- artifact clean-room validation.

`XFACTOR_BUILD_SANDBOX=host` may remain for local development tests only. Default and production behavior is fail-closed. Tests must assert host execution does not occur when sandbox capability is unavailable.

### 3. Canonical Verification Persistence

Workflow must stop using disconnected local verification summaries for completion decisions. It must call the canonical project verifier path, which creates a `verification_runs` row, persists each normalized check, finalizes the run, and returns the policy decision.

Mandatory gate semantics:

- every gate in `MANDATORY_GATES` must have a current-run row;
- every mandatory row must be `PASS`;
- `SKIPPED`, missing, timeout, sandbox unavailable, missing command, missing dependency install, or missing build script all become `BLOCKED` for mandatory gates;
- run `policy_version` must match the active policy version used by completion and artifact download;
- LLM approval remains advisory metadata only.

`backend/verification/verificationCli.js` or an equivalent single service entrypoint must exist as the canonical orchestration surface for smoke, test-infrastructure, artifact verification, and completion receipts. Routes may call the same service directly, but CLI and HTTP paths must produce the same persisted run/check/receipt records.

### 4. Immutable Evidence and Artifact State

Verification repository writes must be transition-guarded:

- run status moves only through allowed states;
- finalized runs/checks cannot be edited by normal update paths;
- updates require expected status/revision where applicable;
- update/delete operations assert affected row counts;
- stdout/stderr digests bind to the exact captured evidence;
- `PASS` for executable mandatory checks requires verifiable evidence fields: runner or adapter ID, command, cwd/workspace, exit code or structured blocked reason, started/ended timestamps, stdout/stderr digests, policy version, and requirement IDs where applicable;
- P3 compaction may redact only approved stale root `evidence.stdout`/`evidence.stderr` JSON string tokens and must preserve digests, rows, relationships, and non-excerpt bytes.

Artifact status transitions must be state-machine guarded. Arbitrary `status`/`verification_run_id` writes are not allowed. A verified artifact must bind to a verified current-run receipt and immutable manifest/hash.

### 5. Artifact Download Gate

Download authorization must validate at request time:

- requester has project access;
- artifact belongs to the latest approved contract;
- artifact status is `verified`;
- linked `verification_runs.status` is `verified`;
- run `policy_version` equals active policy;
- all current-run mandatory gates are present and `PASS`;
- mandatory requirements are linked to checks in that same run;
- no open repair issues exist for the contract;
- file hash on disk still equals artifact manifest/hash before streaming.

A stale, missing, tampered, or policy-mismatched artifact returns a fail-closed error and does not stream bytes.

### 6. Canonical Completion Projector

`completeVerifiedProject()` becomes the sole product completion writer. Workflow, routes, stale-attempt reconciliation, deletion flows, disk sync, and maintenance jobs must not set `projects.status='completed'` directly. Any internal lifecycle state such as `deleting` must be formalized in the project state machine or eliminated.

Completion requires:

- project status is `artifact_verified`;
- latest approved contract ID and hash match the artifact/run;
- artifact is verified and hash-bound;
- linked run is verified under the active policy version;
- exact mandatory gate set equals active `MANDATORY_GATES`;
- all mandatory gates are `PASS` in the same run;
- every mandatory requirement has current-run check evidence;
- no open repair issue remains;
- CAS revision matches persisted project state.
- database-level status constraints, guarded triggers, or an equivalent additive migration prevent direct SQL/admin bypass of canonical completion rules;

The projector emits a completion receipt containing project ID, contract ID/hash, artifact ID/hash, run ID, policy version, mandatory gate digest list, previous revision, next revision, and timestamp.

### 7. Continuity Supersession

P4 is added through a coherent planning checkpoint, not ad-hoc edits:

- `implementation-plans/00-MASTER-EXECUTION-PLAN.md` delivery graph and unit table gain P4 after P3.
- New plan path: `implementation-plans/09-P4-production-safety.md`.
- New evidence path: `implementation-evidence/P4.md`.
- `PROJECT-CONTINUITY.md` current unit becomes P4 with pending/planned status and Exact Next Action pointing to P4 Task 1 after plan approval.
- `yol-haitasi-todo.md` mirrors P4 without marking it verified.
- `scripts/validate-continuity.mjs` includes P4 unit dependencies and validates the new plan/evidence contract.

## Data and Interface Changes

- Add an explicit active verification policy version constant shared by verifier, artifact download, report generation, and completion projector.
- Add repository helpers for guarded verification run/check finalization and artifact status transitions.
- Add completion receipt persistence or an immutable receipt field associated with the verified transition.
- Keep existing public observability APIs read-only; expose receipt data only through existing authorized read routes or a new read-only endpoint if the implementation plan requires it.
- Add additive database constraints/triggers or a proven writer-confinement mechanism for project status and finalized verification/artifact rows.
- Enumerate every project status writer and migrate it behind repository state-machine/CAS helpers, including stale workflow recovery, deletion transitions, and non-enum internal states.
- Add a canonical verification CLI/service entrypoint that returns receipt IDs, not only in-memory verdict objects.

## Error Handling

- Sandbox capability failure: mandatory executable gates return `BLOCKED` with `SANDBOX_UNAVAILABLE`; no host fallback.
- Missing mandatory evidence: verification status `BLOCKED`; artifact verification and completion rejected.
- Stale policy version: artifact download and completion rejected with deterministic policy mismatch reason.
- Tampered artifact file: download rejected before streaming; repair issue or audit event recorded by implementation plan if existing patterns support it.
- Finalized evidence mutation attempt: repository throws and leaves row unchanged.
- Completion CAS conflict: projector aborts without partial status change.

## Testing Strategy

P4 implementation must use TDD per task:

- RED tests first for Windows sandbox capability failure, host escape attempts, network denial, timeout/tree teardown, and workspace ACL behavior.
- RED tests proving service spawn/smoke/build/README paths do not execute on host when sandbox is unavailable.
- RED tests proving legacy skipped/pass build behavior is rejected as `BLOCKED`.
- RED tests proving workflow persists `verification_runs/checks` and does not call direct completed writes.
- RED tests proving artifact download rejects stale/tampered/policy-mismatched artifacts.
- RED tests proving verification/artifact repositories reject finalized-row mutation and illegal transitions.
- RED tests proving `completeVerifiedProject()` requires exact current-run mandatory gate set, active policy, run-scoped requirement links, and CAS.
- RED tests proving direct SQL or repository bypass cannot persist arbitrary project status or `completed` without the canonical projector.
- RED tests proving stale workflow recovery cannot overwrite newer project state and cannot bypass state-machine/CAS transitions.
- Continuity validation tests or validator execution proving P4 supersession is coherent.

## Acceptance Criteria

- On Windows, sandboxed verification never means plain host-authority `spawn()`.
- Without proven sandbox capability, mandatory executable gates block completion.
- Workflow cannot mark a project completed except through `completeVerifiedProject()`.
- Downloadable verified artifacts are tied to current verified run evidence and fresh hash checks.
- Finalized verification evidence is immutable except approved P3 redaction compaction.
- Missing install/build evidence cannot produce PASS.
- P4 appears in continuity/master/roadmap/validator/evidence as pending until its own evidence is verified.

## Open Decisions Resolved

- P4 combines Windows sandbox and canonical completion in one unit because both are production-safety blockers and share verifier evidence semantics.
- P4 does not split sandbox and completion into P5 because artifact-backed completion is unsafe while executable evidence remains host-authority, and sandbox hardening is incomplete if completion ignores persisted evidence.
- P4 starts as unverified superseding work; P3 remains verified history.
