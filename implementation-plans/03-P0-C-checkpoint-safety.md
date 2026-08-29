# P0-C: Checkpoint Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` or `tdd-workflow` to implement code modifications. Read `PROJECT-CONTINUITY.md` and `implementation-plans/00-MASTER-EXECUTION-PLAN.md` first. Never skip verification before completion.

**Goal:** Implement composite checkpoint persistence and uniqueness for project, task, contract, plan, task spec, input dependency, target output, and gate version identities. Enable cryptographic output hashing, Compare-And-Swap (CAS) validation, requirement-linked selective rejection, filesystem cache/TODO reconciliation, quality-policy version invalidation, and safe resume fallback to rebuild. Upgrade P0-A's coarse invalidation without weakening it.

**Architecture:** Consume the database schema version 7 `task_checkpoints` table created by P0-A. Implement cryptographic SHA-256 hashing for task specifications, inputs (dependency outputs), and output files on disk. Validate these hashes before skipping tasks. On quality gate rejection, map failed requirements to checkpoints and selectively invalidate them, recursively propagating invalidation downstream in the DAG. Reconcile the filesystem state (DURUM.md, TODO.md checkboxes) immediately upon checkpoint invalidation. Provide a safe resume fallback that automatically rebuilds invalidated tasks.

**Tech Stack:** Node.js ESM, SQLite (`node:sqlite`), `node:crypto` (SHA-256), project test harness.

## Global Constraints

- Do not repair `projects/project-f2226560-c4b5-4147-a7b5-aeb9f7df95fb`.
- Do not start P0-C source execution until P0-A shows 'verified' status in evidence (`implementation-evidence/P0-A.md`).
- Use TDD for every observable contract change.
- No direct project `completed` write outside the state projector.
- No mandatory verification gate may treat `SKIPPED`, `BLOCKED`, missing runner, or missing evidence as PASS.
- LLM output is advisory; only machine evidence can satisfy quality policy.
- Generated code never runs with host application authority.
- Every task ends with task-specific verification, independent review, evidence update, continuity validation, and commit.
- Unexpected workspace changes belong to the user; preserve them.

---

## TDD Execution Steps

### Task 1: Checkpoint Database Integration and CRUD APIs

- [ ] Task 1: Checkpoint Database Integration and CRUD APIs
  * **Test File:** `backend/tests/test_p0_c_checkpoint_repository.js`
  * **Test Content / Scenario:**
    * Query `PRAGMA table_info(task_checkpoints)` to verify that the table created by P0-A contains columns: `project_id`, `task_id`, `contract_id`, `plan_hash`, `task_spec_hash`, `input_hash`, `output_hash`, `gate_version`, `status`, `requirement_ids`, `created_at`, `invalidated_at`, and `invalidation_reason`.
    * Verify that the primary key is exactly the composite key `(project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version)`.
    * Insert a test checkpoint using `saveCheckpoint()` and select it using `getCheckpoint()`.
    * Attempt to insert a duplicate checkpoint and assert that the database throws a primary key constraint error.
    * Call `deleteCheckpoint()` and verify that the record is removed.
  * **RED Command + Expected Failure:**
    * Command: `node backend/tests/test_p0_c_checkpoint_repository.js`
    * Expected Failure: Throws `Cannot find module '../engine/checkpointRepository.js'` or schema verification fails because functions and files do not exist.
  * **Minimal Implementation:**
    * Create `backend/engine/checkpointRepository.js` with functions `saveCheckpoint`, `getCheckpoint`, and `deleteCheckpoint` that use prepared SQLite statements querying `task_checkpoints`.
  * **GREEN Command + Expected PASS:**
    * Command: `node backend/tests/test_p0_c_checkpoint_repository.js`
    * Expected PASS: Exits with code `0` and outputs `[PASS]` for all schema checks, CRUD operations, and constraint validations.
  * **Evidence Update:** Record test execution log, exit status, and Git commit hash in `implementation-evidence/P0-C.md`.
  * **Commit File Set:**
    * `backend/engine/checkpointRepository.js`
    * `backend/tests/test_p0_c_checkpoint_repository.js`
  * **Commit Message:** `feat(engine): implement task checkpoint database repository APIs`

### Task 2: Cryptographic Hashing and CAS Validation

- [ ] Task 2: Cryptographic Hashing and CAS Validation
  * **Test File:** `backend/tests/test_p0_c_cas_invalidation.js`
  * **Test Content / Scenario:**
    * Call `computeTaskSpecHash(task)` and verify it is a valid 64-character SHA-256 hex string.
    * Set up a temporary mock project directory containing target files from dependency tasks. Run `computeInputHash()` and verify that altering dependency target file contents changes the resulting hash.
    * Set up mock target files on disk. Run `computeOutputHash()` and assert that editing file content, deleting files, or writing empty files shifts the output hash.
    * Persist a checkpoint to the database, then invoke `verifyTaskCheckpoint()`. Verify it returns `true` when spec, input, and output hashes match the database.
    * Assert that `verifyTaskCheckpoint()` returns `false` (CAS invalidation) if:
      * Task specification metadata changes (mismatched `task_spec_hash`).
      * Task dependency files change (mismatched `input_hash`).
      * Target files on disk are edited or missing (mismatched `output_hash`).
      * The active quality policy version shifts (mismatched `gate_version`).
  * **RED Command + Expected Failure:**
    * Command: `node backend/tests/test_p0_c_cas_invalidation.js`
    * Expected Failure: Throws `Cannot find module '../engine/checkpointHelper.js'` or fails assertions because hashing and verification exports are missing.
  * **Minimal Implementation:**
    * Create `backend/engine/checkpointHelper.js` implementing `computeTaskSpecHash`, `computeInputHash`, `computeOutputHash`, and `verifyTaskCheckpoint`. Use `node:crypto` for SHA-256 computations and sort file lists alphabetically to guarantee hash determinism.
  * **GREEN Command + Expected PASS:**
    * Command: `node backend/tests/test_p0_c_cas_invalidation.js`
    * Expected PASS: Exits with code `0` and prints passing assertions showing correct hash generation and CAS-driven invalidation triggers.
  * **Evidence Update:** Record test execution details and commit status in `implementation-evidence/P0-C.md`.
  * **Commit File Set:**
    * `backend/engine/checkpointHelper.js`
    * `backend/tests/test_p0_c_cas_invalidation.js`
  * **Commit Message:** `feat(engine): implement CAS validation and cryptographic hash computation`

### Task 3: Workflow Runner Integration and FS Reconciliation

- [ ] Task 3: Workflow Runner Integration and FS Reconciliation
  * **Test File:** `backend/tests/test_p0_c_workflow_integration.js`
  * **Test Content / Scenario:**
    * Initialize a mock DAG task plan in the database.
    * Run a mock DAG execution. Assert that if a valid checkpoint is verified, the runner skips execution (skipped event is logged) and does not call the Coder agent.
    * Invalidate a task checkpoint. Run execution and assert that the runner detects the invalid checkpoint, re-executes the task, saves the new completed checkpoint, and triggers filesystem reconciliation:
      * The task directory's `DURUM.md` is updated to `YENIDEN_BASLATILDI`.
      * The task's checkbox in `TODO.md` is unchecked (changed from `[x]` to `[ ]`), reversing P0-A's completion indicators.
  * **RED Command + Expected Failure:**
    * Command: `node backend/tests/test_p0_c_workflow_integration.js`
    * Expected Failure: Runner does not skip tasks on valid checkpoints, fails to run tasks on invalid checkpoints, or does not synchronize `DURUM.md` and `TODO.md` file states.
  * **Minimal Implementation:**
    * Add `uncheckTodoItem(todoFilePath, taskIdOrName)` to `backend/engine/fileProtocol.js` using regular expression text replacement.
    * Implement `reconcileTaskCache(projectDir, taskId, taskPlan)` in `backend/engine/fileProtocol.js` to rewrite `DURUM.md` and call `uncheckTodoItem` on `TODO.md`.
    * Update the execution loop in `backend/engine/workflow.js` to call `verifyTaskCheckpoint` to evaluate skip conditions, save checkpoints via `saveCheckpoint` upon successful execution, and invoke `reconcileTaskCache` when checkpoints are invalid.
  * **GREEN Command + Expected PASS:**
    * Command: `node backend/tests/test_p0_c_workflow_integration.js`
    * Expected PASS: Exits with code `0` and verifies that checkpoints control skip decisions and successfully reconcile disk file cache state.
  * **Evidence Update:** Append test logs and commit details to `implementation-evidence/P0-C.md`.
  * **Commit File Set:**
    * `backend/engine/workflow.js`
    * `backend/engine/fileProtocol.js`
    * `backend/tests/test_p0_c_workflow_integration.js`
  * **Commit Message:** `feat(engine): integrate CAS checkpoint checks and todo reconciliation into workflow`

### Task 4: Selective Rejection and Cascading Checkpoint Invalidation

- [ ] Task 4: Selective Rejection and Cascading Checkpoint Invalidation
  * **Test File:** `backend/tests/test_p0_c_selective_rejection.js`
  * **Test Content / Scenario:**
    * Create a multi-task DAG: Task A -> Task C, Task B -> Task C. Save `completed` checkpoints for all.
    * Simulate a quality gate failure reporting that Task B's requirement failed.
    * Run the selective rejection handler with failed requirements.
    * Assert that Task B's checkpoint is updated to `status = 'invalidated'` and its file cache is reconciled.
    * Assert that Task C (downstream dependent of B) checkpoint is recursively updated to `status = 'invalidated'` and its file cache reconciled.
    * Assert that Task A's checkpoint remains intact and `status = 'completed'`.
    * **Preserve Coarse Invalidation Fallback:** Assert that if a new project contract is approved (P0-A action), all checkpoints for the project are completely deleted/invalidated, preserving the project-level safety fallback.
  * **RED Command + Expected Failure:**
    * Command: `node backend/tests/test_p0_c_selective_rejection.js`
    * Expected Failure: Downstream tasks are not transitively invalidated, or the project-level contract change fails to trigger coarse invalidation fallback.
  * **Minimal Implementation:**
    * Add `invalidateCheckpointsByRequirements(projectId, requirementIds, reason)` and `invalidateDownstreamCheckpoints(projectId, taskIds, allTasks, reason)` using recursive dependency tree traversal.
    * Modify `backend/engine/workflow.js` in the quality audit block: if the build or static audit fails, extract the failed requirement IDs, invoke database invalidation for those requirements (with cascading downstream invalidation), and trigger filesystem cache reconciliation for all affected tasks.
    * Ensure the coarse contract-level invalidation logic (deleting/invalidating all checkpoints when a new contract revision is approved) remains fully active.
  * **GREEN Command + Expected PASS:**
    * Command: `node backend/tests/test_p0_c_selective_rejection.js`
    * Expected PASS: Exits with code `0` and shows selective invalidation propagating only to downstream dependents, and confirms coarse project-level invalidation clears all checkpoints.
  * **Evidence Update:** Record test command output and exit code in `implementation-evidence/P0-C.md`.
  * **Commit File Set:**
    * `backend/engine/workflow.js`
    * `backend/tests/test_p0_c_selective_rejection.js`
  * **Commit Message:** `feat(engine): implement selective checkpoint rejection and cascading invalidation`

---

## Detailed Test Specifications (TDD)

### 1. Database Schema and Constraints Tests
* **Test Case:** Verification of P0-A schema layout and composite key constraint.
* **Setup:** Open the database containing P0-A's migration.
* **Scenario:**
  * Validate that the `task_checkpoints` columns and types match the expected schema.
  * Insert a checkpoint for `{ project_id: 'p1', task_id: 't1', contract_id: 'c1', plan_hash: 'ph1', task_spec_hash: 'sh1', input_hash: 'ih1', output_hash: 'oh1', gate_version: '1.0' }` with status `'completed'`.
  * Attempt to insert a second checkpoint with the identical key parameters but status `'invalidated'`.
* **Assert:** The database throws a primary key constraint error on the duplicate insert.

### 2. Output Hashing and CAS Invalidation Tests
* **Test Case:** CAS validation detects target file tampering on disk.
* **Setup:** Write mock project directory containing `targetFile1.txt` with content `"foo"`. Save a checkpoint for this task matching current file state.
* **Scenario:**
  * Modify `targetFile1.txt` content to `"bar"`. Verify CAS validation.
  * Revert `targetFile1.txt` content to `"foo"`. Verify CAS validation.
  * Delete `targetFile1.txt`. Verify CAS validation.
* **Assert:**
  * Modifying the file triggers CAS fail (returns `false`).
  * Reverting the file triggers CAS success (returns `true`).
  * Deleting the file triggers CAS fail (returns `false`).

### 3. Requirement-Linked Selective Rejection and Cascading Invalidation Tests
* **Test Case:** Invalidation of a requirement recursively invalidates downstream tasks.
* **Setup:** Construct a task plan with 3 tasks:
  * Task A (covers `["REQ-1"]`, no dependencies)
  * Task B (covers `["REQ-2"]`, no dependencies)
  * Task C (covers `["REQ-3"]`, depends on A and B)
  * Save `completed` checkpoints for all three.
* **Scenario:**
  * Fail quality gate with `failedRequirementIds = ["REQ-2"]`.
  * Trigger selective rejection.
* **Assert:**
  * Checkpoint for Task B is updated to `status = 'invalidated'`.
  * Checkpoint for Task C is updated to `status = 'invalidated'` (transitive dependency).
  * Checkpoint for Task A remains `status = 'completed'` (unrelated).

### 4. Cache/TODO Reconciliation Tests
* **Test Case:** Filesystem state is synchronized immediately on checkpoint invalidation.
* **Setup:** Generate mock filesystem files for Task B and Task C:
  * `DURUM.md` with content `DURUM: TAMAMLANDI` in Task B and Task C directories.
  * `TODO.md` at root containing `- [x] Task B` and `- [x] Task C`.
* **Scenario:**
  * Invalidate Task B and Task C checkpoints.
  * Execute `reconcileTaskCache` on both tasks.
* **Assert:**
  * `DURUM.md` in Task B directory contains `DURUM: YENIDEN_BASLATILDI` (or similar reset state).
  * `DURUM.md` in Task C directory contains `DURUM: YENIDEN_BASLATILDI`.
  * `TODO.md` at root contains `- [ ] Task B` and `- [ ] Task C` (checkboxes are unchecked).

### 5. Quality-Policy Version Invalidation Tests
* **Test Case:** Checkpoints are dynamically invalidated when the global quality-policy version shifts.
* **Setup:** Save a checkpoint with `gate_version = '1.0.0'`.
* **Scenario:**
  * Set `QUALITY_POLICY_VERSION = '1.0.0'` and verify checkpoint.
  * Set `QUALITY_POLICY_VERSION = '1.1.0'` and verify checkpoint.
* **Assert:**
  * First verification returns `true`.
  * Second verification returns `false` (dynamic policy invalidation).

### 6. Concurrency / Restart Race Condition Tests
* **Test Case:** Multiple runners attempting to write/invalidate the same checkpoint concurrently.
* **Setup:** Spawn multiple asynchronous promises representing concurrent worker threads executing the same task update.
* **Scenario:** Execute all promises using `Promise.all` in parallel.
* **Assert:** The database-level serialization (`BEGIN IMMEDIATE;` transaction and unique constraints) ensures only one update succeeds, preventing corrupt state and duplicate writes.

### 7. Safe Resume Fallback to Rebuild Tests
* **Test Case:** workflow resume restarts execution exactly at the point of invalidation.
* **Setup:** Set up the 3-task DAG from Test 3. Mark all checkpoints as completed except Task B which is invalidated.
* **Scenario:** Invoke `executeProjectTasks` in resume mode.
* **Assert:**
  * Task A execution is skipped (skipped log event recorded).
  * Task B is executed (Coder mock is called).
  * Task C is executed (since its dependency Task B was re-run).

---

## Continuity Validation

* **Validation Script Check:** Running `node scripts/validate-continuity.mjs` must succeed and prove that `PROJECT-CONTINUITY.md` and `yol-haitasi-todo.md` have matching current step/status metadata.
* **Alignment with P0-A Coarse Invalidation:** P0-C upgrades P0-A coarse invalidation. If a project-level contract revision is updated (coarse trigger), P0-A's mechanism of dropping or invalidating all checkpoints for that project is executed. P0-C layers fine-grained selective rejection on top of this without weakening the project-level contract safety boundaries.

---

## P0-C Unit Exit Gate

- [ ] All P0-C implementation tasks are checked.
- [ ] Task-specific tests and workflow integration tests pass.
- [ ] Independent reviewer returns no blocking findings.
- [ ] Independent tester reproduces P0-C verification results.
- [ ] Evidence receipt (`implementation-evidence/P0-C.md`) records commands, exit codes, and findings.
- [ ] Continuity (`PROJECT-CONTINUITY.md`) and roadmap (`yol-haitasi-todo.md`) statuses are reconciled to reflect P0-C as completed/verified.
- [ ] Continuity validator (`node scripts/validate-continuity.mjs`) passes successfully.
- [ ] P0-C implementation is committed to repository.
