# P1-A Contract and Requirement Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement one delivery unit at a time. Read `PROJECT-CONTINUITY.md` first. Never execute a later unit before its dependencies are verified.

**Goal:** Establish a robust requirement traceability matrix, supported-stack capability registry, stable requirement IDs with supersession, contract elements, typed links, core-first coverage policies, and target file allowlist validation in the orchestration workflow. This ensures no generated code is written or verified without being traced back to approved user requirements.

**Architecture:** 
- **Database Schema Migration:** Sole ownership of Migration 9. It creates the `artifacts`, `artifact_files`, `requirement_file_links`, `requirement_check_links`, and `requirement_artifact_links` tables. It consumes P0-B v8 verification tables (`verification_runs`, `verification_checks`) to implement composite foreign key constraints.
- **Capability Registry:** `backend/contracts/projectContract.js` manages tech stack mapping (Nuxt, Vue, Pinia, React, Express, Prisma, SQLite) and rejects unsupported stacks as `contract_blocked`.
- **Traceability Matrix Logic:** `backend/contracts/traceability.js` implements matrix building, cell-level status resolution, and composite foreign key validation.
- **Domain Element Policy:** `backend/contracts/domainPolicy.js` derives expected domain models, endpoints, screens, and flows, defines stub/skeleton detection criteria, and holds brand/template contamination allowlists.
- **Structured Agent Validation:** Update `backend/agents/schemas.js` to require `requirementIds` and target allowlists on manager/director/teamleader plans and coder files.
- **Orchestrator Enforcement:** Integrate allowlists and core-first planning checks into the execution loop inside `backend/engine/workflow.js` and `backend/engine/codeGenerator.js`.

**P1-C Schema/Service Consumption:** The `artifacts` and `artifact_files` SQLite schemas and related database rows created in Migration 9, as well as the traceability policies, will be consumed and validated in P1-C (Artifact validation) to extract delivered ZIP manifests, compute SHA-256 hashes, and match them with trace matrices.

**Tech Stack:** Node.js ESM, Express, SQLite (`node:sqlite` database/migrations), agent schemas/prompts.

## Global Constraints

- Do not repair `projects/project-f2226560-c4b5-4147-a7b5-aeb9f7df95fb`.
- Implement only one delivery unit at a time.
- Use TDD for every observable contract change.
- No direct project `completed` write outside the state projector.
- No mandatory verification gate may treat `SKIPPED`, `BLOCKED`, missing runner, or missing evidence as PASS.
- LLM output is advisory; only machine evidence can satisfy quality policy.
- Generated code never runs with host application authority.
- Every task ends with task-specific verification, independent review, evidence update, continuity validation, and commit.
- Unexpected workspace changes belong to the user; preserve them.

---

## 3. Migration 9 Schema Setup

### 3.1 Database Migration Schema
The following table definitions are added to the migration list in `backend/db.js`:

```sql
-- Migration version: 9
-- Name: '009_contract_traceability_links'

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  manifest_json TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft', 'built', 'verification_pending', 'verified', 'rejected', 'superseded')),
  verification_run_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contract_id, id),
  FOREIGN KEY (project_id, contract_id) REFERENCES project_contracts (project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (contract_id, verification_run_id) REFERENCES verification_runs (contract_id, id)
);

CREATE TABLE IF NOT EXISTS artifact_files (
  contract_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (contract_id, artifact_id, path),
  FOREIGN KEY (contract_id, artifact_id) REFERENCES artifacts (contract_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requirement_file_links (
    contract_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    path TEXT NOT NULL,
    PRIMARY KEY (contract_id, requirement_id, artifact_id, path),
    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id, artifact_id, path) REFERENCES artifact_files (contract_id, artifact_id, path) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requirement_check_links (
    contract_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    verification_check_id TEXT NOT NULL,
    PRIMARY KEY (contract_id, requirement_id, verification_check_id),
    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id, verification_check_id) REFERENCES verification_checks (contract_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS requirement_artifact_links (
    contract_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    PRIMARY KEY (contract_id, requirement_id, artifact_id),
    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id, artifact_id) REFERENCES artifacts (contract_id, id) ON DELETE CASCADE
);
```

### 3.2 Forward Recovery

Migration 9 is additive and irreversible after artifact/traceability rows exist. Disposable test databases may be deleted, but production recovery must preserve `artifacts`, `artifact_files`, and all requirement link tables. A code rollback leaves these tables inert and switches dependent gates to `BLOCKED`; it never drops or rewrites evidence. Corrective schema changes use the next approved migration version (10+) after master-plan supersession.

---

## 4. Implementation Tasks

### Task 1: Migration 9 Schema Setup
- **Modify Path:** `backend/db.js`
- **Test Path:** `backend/tests/test_database_migrations.js`
- **Interfaces:**
  - Database schema: `artifacts`, `artifact_files`, `requirement_file_links`, `requirement_check_links`, and `requirement_artifact_links` tables.
  - Enforceable foreign key constraints on `contract_id`.
- **TDD Steps:**
  - [ ] **RED Step:** Run `node backend/tests/test_database_migrations.js` after adding a check to assert that table `artifacts` exists.
    - Expected Failure: `AssertionError [ERR_ASSERTION]: Table artifacts should exist`
  - [ ] **Minimal Implementation:** Add Migration 9 object containing the SQL table setup to `MIGRATIONS` array in `backend/db.js` and run migrations.
  - [ ] **GREEN Step:** Run `node backend/tests/test_database_migrations.js` and expect it to PASS.
- **Evidence:** 
  - Update `implementation-evidence/P1-A.md` to record the test results and database schema verification.
  - Run `node scripts/validate-continuity.mjs` to ensure the workspace remains compliant.
- **Commit Files:** `backend/db.js`, `backend/tests/test_database_migrations.js`
- **Commit Message:** `feat(db): implement Migration 9 for artifacts and traceability links`

### Task 2: Extend P0-A Capability Registry (No Duplicate Registry)
- **Modify Path:** `backend/contracts/projectContract.js` (extend `SUPPORTED_STACKS` in place; do not create a second registry or a `STACK_CAPABILITY_REGISTRY`)
- **Test Path:** `backend/tests/test_traceability.js`
- **Interfaces:**
  ```javascript
  // P1-A extends the single registry owned by P0-A. An entry may be added ONLY
  // together with a matching generator adapter; otherwise the framework stays
  // unsupported and contracts are rejected as capability-blocked (never silently
  // defaulted to react/next).
  import { SUPPORTED_STACKS, validateContractCapabilities } from '../contracts/projectContract.js';

  export function extendSupportedStacks({ frontend, backend, database }) {
      // merges validated adapters into SUPPORTED_STACKS and returns the new registry
  }
  ```
- **TDD Steps:**
  - [ ] **RED Step:** Run `node backend/tests/test_traceability.js` with a test case passing a framework like `angular` to `validateContractCapabilities`.
    - Expected Failure: `AssertionError: angular must remain unsupported without an adapter`
  - [ ] **Minimal Implementation:** Extend `SUPPORTED_STACKS` in `backend/contracts/projectContract.js` only with frameworks that have a registered generator adapter. Keep `nuxt` unsupported until a Nuxt adapter is actually implemented; unsupported frameworks must produce a capability-blocked rejection, never a silent substitution.
  - [ ] **GREEN Step:** Run `node backend/tests/test_traceability.js` and expect registry extension and rejection tests to PASS.
- **Evidence:**
  - Update `implementation-evidence/P1-A.md` to record registry extension and no-silent-substitution checks.
  - Run `node scripts/validate-continuity.mjs` to ensure continuity remains intact.
- **Commit Files:** `backend/contracts/projectContract.js`, `backend/tests/test_traceability.js`
- **Commit Message:** `feat(contracts): extend single capability registry with adapter-gated frameworks`

### Task 3: Traceability Graph & Matrix Builder
- **Create Path:** `backend/contracts/traceability.js`
- **Modify Path:** `backend/repositories/projectContractRepository.js`
- **Test Path:** `backend/tests/test_traceability.js`
- **Interfaces:**
  ```javascript
  export class TraceabilityMatrix {
      constructor(contractId) {}
      async buildMatrix() {} 
      // returns rows of: { requirementId, codeCell: boolean, apiCell: boolean, uiCell: boolean, testCell: boolean, runtimeCell: boolean, artifactCell: boolean }
      
      async verifyCoveragePolicy() {}
      // fails if any mandatory requirement cell has status BLOCKED or NOT_RUN
  }
  ```
- **TDD Steps:**
  - [ ] **RED Step:** Run `node backend/tests/test_traceability.js` with a test case trying to add a link where `contract_id` mismatch exists, expecting a constraint violation.
    - Expected Failure: `AssertionError: contractId mismatch should throw`
  - [ ] **Minimal Implementation:** Implement `TraceabilityMatrix` using composite joins. Validate that all requirement links have matching `contract_id` attributes.
  - [ ] **GREEN Step:** Run `node backend/tests/test_traceability.js` and expect the composite FK checking to PASS.
- **Evidence:** 
  - Update `implementation-evidence/P1-A.md` to document matrix resolution and composite link validation.
  - Run `node scripts/validate-continuity.mjs` to ensure the session continuity passes.
- **Commit Files:** `backend/contracts/traceability.js`, `backend/repositories/projectContractRepository.js`, `backend/tests/test_traceability.js`
- **Commit Message:** `feat(contracts): add traceability matrix builder and requirement coverage policy`

### Task 4: Domain Element Policy (Extraction, Contamination & Stubs)
- **Create Path:** `backend/contracts/domainPolicy.js`
- **Test Path:** `backend/tests/test_traceability.js`
- **Interfaces:**
  ```javascript
  export function extractDomainElements(contract) {}
  export function checkTemplateContamination(filePath, content, contractAllowedVocabulary) {}
  export function isStubOrSkeleton(content, extension) {}
  ```
- **TDD Steps:**
  - [ ] **RED Step:** Run `node backend/tests/test_traceability.js` with a test case passing a template file containing `Rent-a-Car` keywords and mock stub controllers.
    - Expected Failure: `AssertionError: template brand names should be detected`
  - [ ] **Minimal Implementation:** Write `backend/contracts/domainPolicy.js` parsing keywords against allowed terms. Scan source strings for stubs.
  - [ ] **GREEN Step:** Run `node backend/tests/test_traceability.js` and expect the checks to PASS.
- **Evidence:** 
  - Update `implementation-evidence/P1-A.md` to log vocabulary scan outputs and skeleton flags.
  - Run `node scripts/validate-continuity.mjs` to ensure workspace files are clean and consistent.
- **Commit Files:** `backend/contracts/domainPolicy.js`, `backend/tests/test_traceability.js`
- **Commit Message:** `feat(contracts): implement domain element checks, stub detection, and brand contamination filters`

### Task 5: Requirement-Aware Agent Schemas & Normalizers
- **Modify Path:** `backend/agents/schemas.js`
- **Test Path:** `backend/tests/test_agent_contract_schemas.js`
- **Interfaces:**
  - Update `validateManagerPlan` and `normalizeManagerPlan` to include `requirementIds` and capability checks.
  - Update `validateTeamleaderTasks` to check task-to-requirement links (`requirementIds` array on tasks) and core-first planning rules.
  - Update `validateCoderFiles` to reject files outside task's allowed target files list.
- **TDD Steps:**
  - [ ] **RED Step:** Run `node backend/tests/test_agent_contract_schemas.js` where coder output contains files outside the allowlist, expecting `validateCoderFiles` to throw.
    - Expected Failure: Validation passes despite writing to out-of-scope paths.
  - [ ] **Minimal Implementation:** Modify `backend/agents/schemas.js` to assert file paths matching task boundaries.
  - [ ] **GREEN Step:** Run `node backend/tests/test_agent_contract_schemas.js` and expect validation checks to PASS.
- **Evidence:** 
  - Update `implementation-evidence/P1-A.md` to detail updated agent plan validation results.
  - Run `node scripts/validate-continuity.mjs` to ensure metadata integrity is verified.
- **Commit Files:** `backend/agents/schemas.js`, `backend/tests/test_agent_contract_schemas.js`
- **Commit Message:** `refactor(agents): enforce requirementIds and target allowlists in schemas`

### Task 6: Requirement-Aware System Prompts
- **Modify Paths:** `docs/manager.md`, `docs/director.md`, `docs/teamleader.md`, `docs/coder.md`, `docs/reviewer.md`, `docs/tester.md`
- **Test Path:** `backend/tests/test_docs_agent_sync.js`
- **Interfaces:**
  - System prompts must require requirement mapping, 1-2 file targets on teamleader tasks, and strictly scoped coder output.
- **TDD Steps:**
  - [ ] **RED Step:** Run `node backend/tests/test_docs_agent_sync.js` checking that prompt text files contain instructions for `requirementIds` and target files limit.
    - Expected Failure: `AssertionError: prompt should contain requirement-aware instructions`
  - [ ] **Minimal Implementation:** Add requirement mappings and target constraints to system prompts and synchronizers in `backend/agents/*.js`.
  - [ ] **GREEN Step:** Run `node backend/tests/test_docs_agent_sync.js` and expect documentation sync checks to PASS.
- **Evidence:** 
  - Update `implementation-evidence/P1-A.md` to log synced prompt integrity indicators.
  - Run `node scripts/validate-continuity.mjs` to verify ledger matches the newly synced docs.
- **Commit Files:** `docs/*.md`, `backend/agents/*.js`, `backend/tests/test_docs_agent_sync.js`
- **Commit Message:** `docs(agents): update system prompts to be requirement-aware`

### Task 7: Orchestrator Pipeline & writeGeneratedFiles Enforcement
- **Modify Paths:** `backend/engine/workflow.js`, `backend/engine/codeGenerator.js`
- **Test Path:** `backend/tests/test_e2e_simulation.js`
- **Interfaces:**
  - `workflow.js` must validate Manager plans and establish core-first execution queue ordering.
  - `writeGeneratedFiles` must accept a `targetFiles` parameter. Reject writes if any file in Coder output falls outside the allowlist.
- **TDD Steps:**
  - [ ] **RED Step:** Run `node backend/tests/test_e2e_simulation.js` where Coder output writes outside task target allowlist, asserting write fails.
    - Expected Failure: Orchestrator writes the file anyway since path allowlist is not enforced in the pipeline.
  - [ ] **Minimal Implementation:** Modify `writeGeneratedFiles` in `backend/engine/codeGenerator.js` to check target list. Update `workflow.js` to execute core requirements first.
  - [ ] **GREEN Step:** Run `node backend/tests/test_e2e_simulation.js` and expect pipeline validations to PASS.
- **Evidence:** 
  - Update `implementation-evidence/P1-A.md` to register the end-to-end integration and allowlist verification evidence.
  - Run `node scripts/validate-continuity.mjs` to ensure the final roadmap validator succeeds.
- **Commit Files:** `backend/engine/workflow.js`, `backend/engine/codeGenerator.js`, `backend/tests/test_e2e_simulation.js`
- **Commit Message:** `feat(workflow): enforce core-first task ordering and target allowlists in code gen`

---

## 5. Unit Exit Gate

Before this unit is marked as `verified` in `PROJECT-CONTINUITY.md` and `yol-haitasi-todo.md`:
1. **Plan Checklist Completion:** All tasks must be completed and marked checked in this document.
2. **Task-Specific and Unit-Level Tests Pass:** All TDD tests across the 7 tasks must pass.
3. **Independent Reviewer Verdict:** Run the `code-reviewer` agent to verify that the implementation matches this plan and quality standards with no blocking findings.
4. **Independent Tester Verdict:** Run the `tester` agent to verify and reproduce unit acceptance.
5. **Verified Evidence Update:** `implementation-evidence/P1-A.md` must be updated to change `status` to `verified` and record all execution commands, exit codes, commit SHA, and test findings.
6. **Continuity & Roadmap Alignment:** Update `PROJECT-CONTINUITY.md` and `yol-haitasi-todo.md` to reflect `P1-A` completion.
7. **Validator Pass:** Running `node scripts/validate-continuity.mjs` must succeed (exit code 0).
8. **Coherent Commit:** Commit all changes, tests, and evidence files in a single coherent git commit.
