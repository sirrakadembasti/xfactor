# Production Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make XFactor discover and deliver appropriate management workflows and verify complete, working application artifacts.

**Architecture:** A structured Manager assessment becomes part of the approved project contract. The workflow carries its requirements through delegation; policy gates compare expected and observed evidence from the final artifact. Generator defaults and verifiers are changed independently, with regression tests for each previously observed false positive.

**Tech Stack:** Node.js 22, ESM, existing XFactor agent schemas and verification pipeline, Node `assert` tests, Docker for final artifact checks.

## Global Constraints

- No library-specific entity names or role names in production logic.
- Management need is inferred from domain behavior, not keyword matching alone.
- Every role gets an isolated development/test identity and positive and negative permission journeys; no shared production demo password.
- A missing applicable verification check must block `verified`.
- Preserve approved contract compatibility and user-visible approval before implementation of inferred scope.

---

### Task 1: Structured Manager discovery

**Files:** `x-agents/manager.md`, `backend/agents/manager.js`, `backend/agents/schemas.js`, `backend/tests/test_agent_contract_schemas.js`, new focused Manager test.

**Interfaces:** `normalizeManagerPlan(plan)` preserves `management`; `validateManagerPlan(plan)` checks the assessment and project-specific matrix. The Manager prompt asks for an assessment on every request.

- [ ] Write a failing test: a plan with mutable resources and no management assessment is rejected, and a valid assessment with resources, operations, roles, demo users and journeys passes.
- [ ] Run `node backend/tests/test_agent_contract_schemas.js`; confirm failure is the absent validation.
- [ ] Implement minimal schema validation and Manager prompt contract; remove hardcoded shared demo credentials from orchestration guidance.
- [ ] Run focused tests, then relevant backend suite.

### Task 2: Contract propagation and coverage

**Files:** `backend/engine/workflow.js`, `backend/agents/director.js`, `backend/agents/teamleader.js`, contract traceability verifier, focused tests.

**Interfaces:** Management requirements are linked to requirement IDs and included in Director/Teamleader context. Coverage validation rejects missing UI/API/role task linkage.

- [ ] Write a failing test using a generic inventory domain whose Manager proposal lists two managed resources and two roles; omit one CRUD/role task and assert blocked.
- [ ] Run test and confirm the missing coverage is currently accepted.
- [ ] Pass structured contract through planning and add deterministic coverage checks.
- [ ] Run focused tests and existing workflow tests.

### Task 3: Complete mandatory gates

**Files:** `backend/verification/qualityPolicy.js`, `backend/verification/artifactVerifier.js`, corresponding quality-policy tests.

**Interfaces:** Every applicable `MANDATORY_GATES` item and `RUNTIME_GATE_MEMBERS` member must be present with current evidence; absent members return BLOCKED.

- [ ] Write failing tests for omitted `database_write_capability`, `api_query_check`, and a wholly omitted mandatory gate.
- [ ] Run focused tests and confirm false PASS/verified.
- [ ] Implement exact expected-set evaluation and preserve explicit NOT_APPLICABLE only when contract permits it.
- [ ] Run policy and artifact tests.

### Task 4: Real data, API and role evidence

**Files:** `backend/verification/databaseVerifier.js`, `backend/verification/apiVerifier.js`, `backend/verification/securityVerifier.js`, `backend/verification/smokeVerifier.js`, focused tests.

**Interfaces:** Contract fixtures drive isolated create/readback/update/delete or policy-specific alternatives; database write and reopen are observed, and anonymous/forbidden role requests are denied while permitted role requests pass.

- [ ] Write failing tests for read-only database, POST returning 2xx without persistence, and an unauthorized mutation returning 2xx.
- [ ] Confirm expected failure of each test.
- [ ] Add isolated test-data setup, readback and role assertions with explicit evidence and cleanup.
- [ ] Run focused and integration tests.

### Task 5: Interactive browser journeys and design checks

**Files:** `backend/verification/browserVerifier.js`, browser adapter/runtime code, `backend/verification/smokeVerifier.js`, focused tests.

**Interfaces:** Required journeys support navigation, click, form input, submission and visible outcome under each role. Empty or HTML-only journeys cannot satisfy a required management flow.

- [ ] Write failing tests for a visible button that does nothing and for a denied role that can open the management action.
- [ ] Confirm failure, implement browser-driven checks using the sandboxed browser runtime, then rerun.
- [ ] Include accessible names and keyboard-reachable controls in the journey evidence.

### Task 6: Generator and artifact lifecycle

**Files:** `backend/engine/codeGenerator.js`, package/build/test verifier files, artifact packaging and README/status generation, focused tests.

**Interfaces:** Final manifest and lock agree; generated scripts are runnable and meaningful; Docker projects build from the final ZIP and document/init persistent storage; final status matches exact artifact hash and gate results.

- [ ] Write failing tests for empty test suite accepted, broken lint script, absent Docker public directory, and final ZIP build failure accepted.
- [ ] Confirm each failure reflects a current gap; update generator and artifact checks without overwriting authored valid scripts.
- [ ] Run clean install, test, typecheck, lint, framework build, Docker build/first-run in isolated fixtures.
- [ ] Compare README/status/receipt with final ZIP hash and verification result.

### Task 7: Full acceptance

**Files:** regression fixtures, test documentation, plan checklist.

- [ ] Run focused suites followed by the complete backend suite.
- [ ] Generate at least one generic management-system fixture and one app with no management need; check proactive proposal and justified exclusion.
- [ ] Run final ZIP/Docker and role journeys in isolated environment; record actual successes and limitations.
- [ ] Review diff, check for secrets and placeholders, and update plan checkboxes.

## Current implementation state (2026-09-28)

- Manager assessment, role/resource requirements, task linkage, authorization helper and isolated demo seed contracts are implemented and covered by focused tests.
- Mandatory evidence, SQLite write/reopen, API create/readback and anonymous/forbidden create probes, interactive journey fail-closed checks, lint/test script checks and generated Docker/README defaults are implemented.
- The authenticated API probe has an explicit `requestAsRole` adapter contract. The production Docker worker does not yet provide that method, so managed artifacts remain blocked pending a trusted role session adapter.
- The worker also lacks an interactive browser adapter. Final ZIP Docker build and first-run verification, update/delete fixtures, restart persistence and final receipt/README comparison remain open acceptance work. These are not counted as passed checks.
- Focused tests pass; the backend suite completed with 127 suites passed and 0 failed. The latest Manager validation and API role probe edits were rerun with their focused tests afterward.
- The execution runtime's host npm fallback was removed after a failing regression test demonstrated that Docker failure invoked host npm. The execution unit suite now passes (14 tests).
- Isolated per-role demo credentials, test setup, cookie/bearer login requests, authorized create/readback and forbidden create checks are now wired into the smoke runner. Credentials travel via worker stdin; the generated management scaffold exposes `xfactor:test:setup`. Contract browser role journeys now reach the interaction adapter.
- At the initial attempt, Docker Desktop's Linux engine returned HTTP 500. It became available on the later retry documented below. Browser interaction still lacks a production adapter, and an automatic final ZIP Docker gate remains open.
- A regression test demonstrated that create/read evidence alone previously passed a resource whose contract also required update/delete. The API gate now blocks operations without executable fixtures.
- Explicit CRUD fixtures now drive authenticated and anonymous update/delete probes, denial readback and authorized persistence checks. Resource-specific identity fields and request-body nonce templates avoid hardcoded `name`/`title` assumptions. New Manager plans must declare item fixtures for update/delete; absent fixtures still block.
- New managed Manager plans now require structured positive and negative browser journeys for every role. The browser gate requires matching action evidence, the expected visible outcome, the right authenticated or explicitly anonymous session, accessible names, keyboard reachability and a measured narrow viewport without horizontal overflow. Boolean-only adapter claims fail. Inferred browser URLs retain these role journeys.
- The backend suite passed 128/128 after the browser contract, Manager fixture and anonymous denial changes.
- Managed resources now declare public or authenticated read access, and the API gate checks anonymous and forbidden-role reads. New delete plans also declare a related-record policy. For preserve/cascade policies, the API gate creates a linked record, verifies its parent reference, executes any declared completion transition, and reads it again after parent deletion. The focused API suite passes 19/19; the complete backend suite passes 128/128 after these changes.
- A preserved or cascaded history policy now also needs a concrete `retentionRule` in the Manager proposal and downstream requirement. Focused Manager and chat approval tests pass after this final contract change; the 128-suite run above preceded it.
- Docker work was initially deferred at the user's request, then resumed. The production sandbox still has no interactive browser adapter, so a real generated management application cannot claim a passing browser interaction gate yet.
- Independent review found and prompted four further protections: no-op or zero-test scripts fail the test gate, denied API mutations compare the full record before and after, Manager approval text shows role and browser journeys, and Teamleader plans must link every managed operation to separate UI/API files plus role journeys. Focused regressions pass.
- Final backend rerun after these changes: 128 suites passed, 0 failed. The frontend unit run passed 65 tests and its production build succeeded. Docker-free Worker tests passed 31 tests with one skipped; the full Worker command remains blocked by the intentionally deferred Docker integration test.
- Follow-up review hardened the test gate against silent runs, shell-composed forged summaries and custom scripts that only print a success count. Management coverage now validates target code surfaces and gives Coder and Reviewer the approved requirement, authentication, browser journey and role/resource details. Focused smoke, test infrastructure and management contract tests pass. The final backend rerun passed 128 suites with 0 failures; Graphify was regenerated (2091 nodes, 5476 links) and its source extraction test passed.
- Docker Desktop later became available. The full Execution Worker integration suite passed 44 tests, failed 0 and skipped 1 under real Docker. An additional opt-in ZIP round-trip test now builds and starts representative Express and Next artifacts from extracted ZIP bytes; both returned their first HTTP health response. It exposed and fixed an empty-dependency Next image failure by creating `node_modules` before the runner COPY. This is a representative acceptance fixture, not an automatic Docker gate for every user artifact; that production integration and a real managed app browser run remain open. Graphify was regenerated after this change (2094 nodes, 5490 links).
- Quality-panel follow-up: role login now has its own per-role worker check, and the panel names management seed, role permissions and denials, CRUD persistence/retention, and browser management interactions. Managed-project detail checks are recorded as mandatory. These remain detail rows under the existing 18 top-level gates. The real Docker Worker integration passed 13/13, the backend passed 128/128 suites, frontend unit tests passed 66/66 and the frontend build passed. Graphify was regenerated (2096 nodes, 5493 links).
