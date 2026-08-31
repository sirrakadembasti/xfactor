# Quality Hardening Implementation Plan (P2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement one delivery unit at a time. Read `PROJECT-CONTINUITY.md` first. Never execute a later unit before its dependencies are verified.

**Goal:** Implement the P2 Quality Hardening requirements from `PROJECT-QUALITY-IMPROVEMENT-PLAN.md`, including domain compliance checks, placeholder/stub detection, template contamination filters, security baselines, README validation, core-first planning, repair allowlists, and evidence-derived reports.

**Architecture:** P2 builds on the P1 units (traceability, runtime verifier, and artifact validation) to harden the quality gates against false positives, template/boilerplate leakage, security issues, and out-of-scope modifications. Hardening checks run within the OS sandbox and feed into the aggregate Quality Policy.

**Tech Stack:** Node.js ESM, AST Parsers (`@babel/parser`, `@babel/traverse`), `sandboxRunner` (OS-isolated environment), SQLite (`node:sqlite`).

## Global Constraints

- Do not modify any code in `projects/project-f2226560-c4b5-4147-a7b5-aeb9f7df95fb`.
- Rely strictly on machine evidence; no LLM self-report or manual file modification may override gate decisions.
- Maintain compatibility with the database schema and cross-unit interfaces established in P0 and P1.
- All code modifications require TDD with preceding failing tests.
- Skip formatters, linters, and full builds except when executing the sandboxed test suite of the target artifact.

---

## Shared Interfaces

Conform to the following P1-defined schemas:

```js
// Gate result format
{
  gateName: string, // e.g. 'domain_entity_check', 'placeholder_check', 'security_baseline'
  applicability: 'MANDATORY' | 'OPTIONAL' | 'NOT_APPLICABLE',
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE',
  evidenceIds: string[],
  policyVersion: string
}

// Verification aggregate
{
  runId: string,
  projectId: string,
  contractId: string,
  artifactId: string,
  status: 'queued' | 'running' | 'failed' | 'verified',
  gates: GateResult[],
  policyVersion: string
}
```

---

## Tasks

### Task P2.1: Domain/Entity/Use Verification

- [x] **Step P2.1.1: Verify Entity Schema Presence**
  - **Failing Scenario:** A contract specifies `Todo` and `Category` entities, but `schema.prisma` in `generatedFiles` lacks `model Category`.
  - **Paths/Interfaces:** `backend/contracts/domainPolicy.js` -> `verifyDomainCompliance(contract, files)`
  - **RED command:** `node backend/tests/test_p2_domain_policy.js --test=schema-presence`
  - **Expected RED output:** `AssertionError: Expected failed compliance result for missing Category model`
  - **Minimal Implementation:** Read Prisma schema content from files, parse models using regex `/model\s+([A-Za-z0-9_]+)\s*\{/g`, compare with contract `domainEntities`. Return `{ passed: false, issues: ["Missing database model: Category"] }`.
  - **GREEN command:** `node backend/tests/test_p2_domain_policy.js --test=schema-presence`
  - **Expected GREEN output:** `PASS: verified schema presence compliance check`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.1.1`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/contracts/domainPolicy.js`, `backend/tests/test_p2_domain_policy.js`; message: `test(p2-1): add schema presence TDD step`

- [x] **Step P2.1.2: Verify Entity Queries in Source Code**
  - **Failing Scenario:** Both `Todo` and `Category` models are defined in `schema.prisma`, but `Category` is never referenced as a property of `prisma` (e.g. `prisma.category`) in any JS/TS source file.
  - **Paths/Interfaces:** `backend/contracts/domainPolicy.js` -> `verifyDomainCompliance(contract, files)`
  - **RED command:** `node backend/tests/test_p2_domain_policy.js --test=entity-query`
  - **Expected RED output:** `AssertionError: Expected compliance failure for unused entity Category`
  - **Minimal Implementation:** Traverse AST of all script files to find MemberExpressions matching `prisma.<entityName>` where `<entityName>` is the lowercase model name. If not found, return `{ passed: false, issues: ["Entity Category is declared but never queried in source code"] }`.
  - **GREEN command:** `node backend/tests/test_p2_domain_policy.js --test=entity-query`
  - **Expected GREEN output:** `PASS: verified entity query compliance check`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.1.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/contracts/domainPolicy.js`, `backend/tests/test_p2_domain_policy.js`; message: `test(p2-1): add entity query validation TDD step`

- [x] **Step P2.1.3: Verify Endpoint Implementation Routes**
  - **Failing Scenario:** Contract lists required endpoint `GET /api/categories` but no router definition in JS/TS files matches this pattern.
  - **Paths/Interfaces:** `backend/contracts/domainPolicy.js` -> `verifyDomainCompliance(contract, files)`
  - **RED command:** `node backend/tests/test_p2_domain_policy.js --test=endpoint-routes`
  - **Expected RED output:** `AssertionError: Expected compliance failure for missing route GET /api/categories`
  - **Minimal Implementation:** Parse route registration calls (e.g., `router.get('/api/categories', ...)` or `app.get('/api/categories', ...)`) in script files and match them against required endpoints. If an endpoint is missing, return `{ passed: false, issues: ["Required endpoint GET /api/categories has no implementation route"] }`.
  - **GREEN command:** `node backend/tests/test_p2_domain_policy.js --test=endpoint-routes`
  - **Expected GREEN output:** `PASS: verified endpoint route compliance check`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.1.3`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/contracts/domainPolicy.js`, `backend/tests/test_p2_domain_policy.js`; message: `test(p2-1): add endpoint route validation TDD step`

---

### Task P2.2: Placeholder, Stub, and Dead-Flow Detection

- [x] **Step P2.2.1: Detect Static Mock/Dummy Route Handlers**
  - **Failing Scenario:** A route handler matches a contract endpoint but immediately returns a hardcoded mock JSON array or literal value without referencing any database or service variables.
  - **Paths/Interfaces:** `backend/verification/placeholderVerifier.js` -> `verifyPlaceholders(files)`
  - **RED command:** `node backend/tests/test_p2_placeholder.js --test=mock-handlers`
  - **Expected RED output:** `AssertionError: Expected placeholder check to fail on hardcoded array response`
  - **Minimal Implementation:** Locate route handler functions in JS/TS source code using Babel parser. Check if the function body returns an ArrayExpression, ObjectExpression, or Literal directly (e.g. `res.json([{ id: 1 }])`) without reading any identifier that relates to `prisma` or model calls.
  - **GREEN command:** `node backend/tests/test_p2_placeholder.js --test=mock-handlers`
  - **Expected GREEN output:** `PASS: detected static mock handler successfully`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.2.1`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/placeholderVerifier.js`, `backend/tests/test_p2_placeholder.js`; message: `test(p2-2): add mock handler detection TDD step`

- [x] **Step P2.2.2: Detect Dead UI Forms and Form Submit Handlers**
  - **Failing Scenario:** A React component contains a form with an empty `onSubmit` or `onSubmit={e => e.preventDefault()}` with no network/API client calls.
  - **Paths/Interfaces:** `backend/verification/placeholderVerifier.js` -> `verifyPlaceholders(files)`
  - **RED command:** `node backend/tests/test_p2_placeholder.js --test=dead-forms`
  - **Expected RED output:** `AssertionError: Expected placeholder check to fail on dead React form`
  - **Minimal Implementation:** Search React/Vue files for `<form>` components. Evaluate their submit handlers in the AST. If the handler only calls `preventDefault()` or contains no references to API client methods (e.g. `api.post` or `fetch`), flag it.
  - **GREEN command:** `node backend/tests/test_p2_placeholder.js --test=dead-forms`
  - **Expected GREEN output:** `PASS: detected dead UI form successfully`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.2.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/placeholderVerifier.js`, `backend/tests/test_p2_placeholder.js`; message: `test(p2-2): add dead form detection TDD step`

- [x] **Step P2.2.3: Detect Placeholder Comments and Bypasses**
  - **Failing Scenario:** A source file contains comments like `// TO-DO: implement later` or `throw new Error("Not implemented")` (note: TO-DO is written as standard test fixture string patterns in mock files, not as a plan TODO).
  - **Paths/Interfaces:** `backend/verification/placeholderVerifier.js` -> `verifyPlaceholders(files)`
  - **RED command:** `node backend/tests/test_p2_placeholder.js --test=comments-bypasses`
  - **Expected RED output:** `AssertionError: Expected placeholder check to fail on comment-based placeholder bypasses`
  - **Minimal Implementation:** Scan files for strings matching `//\s*TO-DO` or `//\s*FIXME` or `throw\s+new\s+Error\(['"]Not implemented['"]\)`. Return `{ passed: false, issues: [...] }`.
  - **GREEN command:** `node backend/tests/test_p2_placeholder.js --test=comments-bypasses`
  - **Expected GREEN output:** `PASS: detected placeholder comments and bypasses successfully`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.2.3`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/placeholderVerifier.js`, `backend/tests/test_p2_placeholder.js`; message: `test(p2-2): add placeholder comments and bypasses detection TDD step`

---

### Task P2.3: Template Contamination Scanner

- [x] **Step P2.3.1: Scan for Template Domain Out-of-Domain Contamination**
  - **Failing Scenario:** A Todo application project contains vocabulary references from other templates such as "car rental", "fleet", or "rent-a-car".
  - **Paths/Interfaces:** `backend/verification/contaminationVerifier.js` -> `verifyContamination(contract, files)`
  - **RED command:** `node backend/tests/test_p2_contamination.js --test=out-of-domain`
  - **Expected RED output:** `AssertionError: Expected contamination scanner to fail on 'rent-a-car'`
  - **Minimal Implementation:** Create a dictionary of template domain keywords. Tokenize source code, HTML, CSS, and README files. Compare tokens against dictionary keywords. If a match is found and is not in the contract allowlist, return `{ passed: false, issues: ["Template contamination: out-of-domain vocabulary 'rent-a-car' detected"] }`.
  - **GREEN command:** `node backend/tests/test_p2_contamination.js --test=out-of-domain`
  - **Expected GREEN output:** `PASS: verified template contamination scan`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.3.1`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/contaminationVerifier.js`, `backend/tests/test_p2_contamination.js`; message: `test(p2-3): add template contamination scanner TDD step`

- [x] **Step P2.3.2: Allow Explicit Out-of-Domain Vocabulary**
  - **Failing Scenario:** A project requires a domain-overlap word (e.g. `car` in a todo category for car maintenance), but it gets flagged by the contamination scanner because the contract allowlist parser is missing.
  - **Paths/Interfaces:** `backend/verification/contaminationVerifier.js` -> `verifyContamination(contract, files)`
  - **RED command:** `node backend/tests/test_p2_contamination.js --test=allowed-vocabulary`
  - **Expected RED output:** `AssertionError: Expected contamination scanner to accept allowed word 'car'`
  - **Minimal Implementation:** Retrieve the contract's `allowedVocabulary` array. Exclude any keywords in this array from being flagged by the contamination check.
  - **GREEN command:** `node backend/tests/test_p2_contamination.js --test=allowed-vocabulary`
  - **Expected GREEN output:** `PASS: template contamination respects allowed vocabulary`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.3.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/contaminationVerifier.js`, `backend/tests/test_p2_contamination.js`; message: `test(p2-3): add allowed vocabulary bypass TDD step`

---

### Task P2.4: Contract-Aware Security Baseline Gate

- [x] **Step P2.4.1: Audit Permissive CORS Settings**
  - **Failing Scenario:** An API endpoint contains `app.use(cors())` or wildcard response headers (`Access-Control-Allow-Origin: *`).
  - **Paths/Interfaces:** `backend/verification/securityVerifier.js` -> `verifySecurityBaseline(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_security_baseline.js --test=cors-wildcard`
  - **Expected RED output:** `AssertionError: Expected security baseline check to fail on wildcard CORS`
  - **Minimal Implementation:** Search JS/TS files for `cors()` with no origin restriction, or headers matching `Access-Control-Allow-Origin` set to `*`. Flag as security vulnerability.
  - **GREEN command:** `node backend/tests/test_p2_security_baseline.js --test=cors-wildcard`
  - **Expected GREEN output:** `PASS: successfully detected unrestricted CORS configuration`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.4.1`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/securityVerifier.js`, `backend/tests/test_p2_security_baseline.js`; message: `test(p2-4): add permissive CORS audit TDD step`

- [x] **Step P2.4.2: Detect Committed Credentials and API Secrets**
  - **Failing Scenario:** A source code file has a hardcoded API key or private key string, or a `.env` file is present in the files array.
  - **Paths/Interfaces:** `backend/verification/securityVerifier.js` -> `verifySecurityBaseline(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_security_baseline.js --test=secret-keys`
  - **Expected RED output:** `AssertionError: Expected security baseline check to fail on hardcoded secret key`
  - **Minimal Implementation:** Scan files matching `.env` or check scripts for variable names like `JWT_SECRET`, `API_KEY` assigned to high-entropy strings.
  - **GREEN command:** `node backend/tests/test_p2_security_baseline.js --test=secret-keys`
  - **Expected GREEN output:** `PASS: successfully detected committed secret key`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.4.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/securityVerifier.js`, `backend/tests/test_p2_security_baseline.js`; message: `test(p2-4): add committed secrets audit TDD step`

- [x] **Step P2.4.3: Validate Mandatory Endpoint Authentication**
  - **Failing Scenario:** `authentication.required` is set to `true` in the contract, but API routes handling database mutations (POST/PUT/DELETE) lack authentication middleware in their definition.
  - **Paths/Interfaces:** `backend/verification/securityVerifier.js` -> `verifySecurityBaseline(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_security_baseline.js --test=missing-auth`
  - **Expected RED output:** `AssertionError: Expected security check to fail on unprotected mutate endpoint`
  - **Minimal Implementation:** Map the route definitions. If the contract requires authentication, check that route handler AST chains contain an identifier matching authentication middleware (e.g., `authenticateJWT` or `requireUser`).
  - **GREEN command:** `node backend/tests/test_p2_security_baseline.js --test=missing-auth`
  - **Expected GREEN output:** `PASS: successfully verified endpoint authentication requirements`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.4.3`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/securityVerifier.js`, `backend/tests/test_p2_security_baseline.js`; message: `test(p2-4): add auth middleware validator TDD step`

- [x] **Step P2.4.4: Detect Unsolicited Authentication Modules**
  - **Failing Scenario:** `authentication.required` is `false` in the contract, but login routes, forms, or JWT validation helper files are generated.
  - **Paths/Interfaces:** `backend/verification/securityVerifier.js` -> `verifySecurityBaseline(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_security_baseline.js --test=unsolicited-auth`
  - **Expected RED output:** `AssertionError: Expected security check to fail on unsolicited auth module`
  - **Minimal Implementation:** Verify that if the contract disables auth, no files named `*auth*` or containing login forms/logic are present in the files array.
  - **GREEN command:** `node backend/tests/test_p2_security_baseline.js --test=unsolicited-auth`
  - **Expected GREEN output:** `PASS: successfully detected unsolicited auth modules`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.4.4`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/securityVerifier.js`, `backend/tests/test_p2_security_baseline.js`; message: `test(p2-4): add unsolicited auth auditor TDD step`

- [x] **Step P2.4.5: Audit SQL Injection Vulnerabilities**
  - **Failing Scenario:** Source code performs query string concatenations within raw Prisma query execution calls: `prisma.$queryRaw("... " + input)`.
  - **Paths/Interfaces:** `backend/verification/securityVerifier.js` -> `verifySecurityBaseline(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_security_baseline.js --test=sql-injection`
  - **Expected RED output:** `AssertionError: Expected security check to fail on SQL string concatenation`
  - **Minimal Implementation:** Trace AST of scripts to identify `prisma.$queryRaw` or `$executeRaw` calls. If the argument passed is a BinaryExpression with `+` operations involving variable names, flag it as a SQL injection vulnerability.
  - **GREEN command:** `node backend/tests/test_p2_security_baseline.js --test=sql-injection`
  - **Expected GREEN output:** `PASS: successfully identified SQL injection vulnerability`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.4.5`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/securityVerifier.js`, `backend/tests/test_p2_security_baseline.js`; message: `test(p2-4): add SQL injection audit TDD step`

---

### Task P2.5: README Command Parser and Sandboxed Runner

- [x] **Step P2.5.1: Verify README Scripts exist in package.json**
  - **Failing Scenario:** A README contains a markdown shell block `npm run db:setup`, but `package.json` has no `db:setup` script.
  - **Paths/Interfaces:** `backend/verification/readmeVerifier.js` -> `verifyReadmeCommands(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_readme.js --test=readme-scripts`
  - **Expected RED output:** `AssertionError: Expected README validation to fail on missing package script`
  - **Minimal Implementation:** Extract all code blocks matching `npm run (\S+)` from `README.md` using regex. Match the script names against the keys under `scripts` in `package.json`. Return `{ passed: false, issues: ["Documented command 'npm run db:setup' is missing from package.json"] }`.
  - **GREEN command:** `node backend/tests/test_p2_readme.js --test=readme-scripts`
  - **Expected GREEN output:** `PASS: successfully verified README script existence`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.5.1`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/readmeVerifier.js`, `backend/tests/test_p2_readme.js`; message: `test(p2-5): add README script existence TDD step`

- [x] **Step P2.5.2: Verify README Port Declarations Match Code**
  - **Failing Scenario:** README documents that the frontend/backend runs on port `8080`, but the source code configures `process.env.PORT || 3000` as the fallback port.
  - **Paths/Interfaces:** `backend/verification/readmeVerifier.js` -> `verifyReadmeCommands(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_readme.js --test=readme-ports`
  - **Expected RED output:** `AssertionError: Expected README validation to fail on port mismatch`
  - **Minimal Implementation:** Parse any documented port numbers from README (e.g. `localhost:8080` or `port 8080`). Search the source code for hardcoded port fallback declarations. If they conflict, return `{ passed: false, issues: ["Documented port 8080 does not match application port 3000"] }`.
  - **GREEN command:** `node backend/tests/test_p2_readme.js --test=readme-ports`
  - **Expected GREEN output:** `PASS: successfully verified README port matching`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.5.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/readmeVerifier.js`, `backend/tests/test_p2_readme.js`; message: `test(p2-5): add README port consistency TDD step`

- [x] **Step P2.5.3: Run README Setup/Build commands in Sandbox**
  - **Failing Scenario:** README specifies `npm run build` as a step, but executing it in the unprivileged sandbox fails (e.g. syntax error or missing files).
  - **Paths/Interfaces:** `backend/verification/readmeVerifier.js` -> `verifyReadmeCommands(contract, files, sandbox)`
  - **RED command:** `node backend/tests/test_p2_readme.js --test=readme-sandboxed-commands`
  - **Expected RED output:** `AssertionError: Expected README validation to fail on sandboxed build command exit code`
  - **Minimal Implementation:** Invoke the documented `npm run build` using the sandbox runner. If the command exits with non-zero status or times out, return `{ passed: false, issues: ["Documented build command failed to execute"] }`.
  - **GREEN command:** `node backend/tests/test_p2_readme.js --test=readme-sandboxed-commands`
  - **Expected GREEN output:** `PASS: successfully verified sandboxed README execution`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.5.3`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/readmeVerifier.js`, `backend/tests/test_p2_readme.js`; message: `test(p2-5): add README command sandboxed execution TDD step`

---

### Task P2.6: Core-over-Optional Scope Planner and DAG Policy

- [x] **Step P2.6.1: Enforce Core Requirement Priority in DAG**
  - **Failing Scenario:** A task graph in `dag.js` places an optional or supporting task (like `theme-toggle`) as running concurrently with or before a core task (like `prisma-migration` or `todo-crud-routes`).
  - **Paths/Interfaces:** `backend/engine/dag.js` -> `validatePlanDAG(planTasks)`
  - **RED command:** `node backend/tests/test_p2_scope_priority.js --test=dag-priority`
  - **Expected RED output:** `AssertionError: Expected DAG validation to fail on early optional task`
  - **Minimal Implementation:** Parse the requirement links for each task. If any task mapped to a supporting/optional requirement is scheduled in the DAG before a task linked to a core requirement is fully completed (all core tasks must form an initial subgraph), return `passed: false` and reject the DAG layout.
  - **GREEN command:** `node backend/tests/test_p2_scope_priority.js --test=dag-priority`
  - **Expected GREEN output:** `PASS: successfully enforced core requirement priority in DAG`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.6.1`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/engine/dag.js`, `backend/tests/test_p2_scope_priority.js`; message: `test(p2-6): add core DAG priority validation TDD step`

- [x] **Step P2.6.2: Reject Unsolicited Features from Planner**
  - **Failing Scenario:** The director planner suggests a task that does not carry any valid `requirementId` corresponding to the contract requirements.
  - **Paths/Interfaces:** `backend/agents/director.js` -> `validatePlanTasks(planTasks, contract)`
  - **RED command:** `node backend/tests/test_p2_scope_priority.js --test=unsolicited-features`
  - **Expected RED output:** `AssertionError: Expected plan validation to reject unsolicited billing task`
  - **Minimal Implementation:** Validate that every task suggested by director/teamleader has a non-empty `requirementIds` array, and every ID in that array exists in the approved project contract. If not, reject with `UNSOLICITED_FEATURE`.
  - **GREEN command:** `node backend/tests/test_p2_scope_priority.js --test=unsolicited-features`
  - **Expected GREEN output:** `PASS: successfully rejected unsolicited task features`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.6.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/agents/director.js`, `backend/tests/test_p2_scope_priority.js`; message: `test(p2-6): add unsolicited feature rejection TDD step`

---

### Task P2.7: Repair Target Allowlist Policy

- [x] **Step P2.7.1: Enforce Task Repair Allowlist**
  - **Failing Scenario:** A repair agent is active to fix a failed test for a task allowlisted to edit only `src/components/TodoList.jsx`. The agent returns a file write to `src/index.html`.
  - **Paths/Interfaces:** `backend/engine/fileProtocol.js` -> `writeGeneratedFiles(taskContext, files)`
  - **RED command:** `node backend/tests/test_p2_repair_allowlist.js --test=repair-write`
  - **Expected RED output:** `AssertionError: Expected file protocol to block out-of-scope write`
  - **Minimal Implementation:** Check the active task's allowed files array. If the target file path is not present in that array, reject the write with error `OUT_OF_SCOPE_MUTATION`.
  - **GREEN command:** `node backend/tests/test_p2_repair_allowlist.js --test=repair-write`
  - **Expected GREEN output:** `PASS: successfully enforced repair write allowlist`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.7.1`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/engine/fileProtocol.js`, `backend/tests/test_p2_repair_allowlist.js`; message: `test(p2-7): add repair write allowlist TDD step`

- [x] **Step P2.7.2: Prevent Unapproved Config Mutations**
  - **Failing Scenario:** A repair agent tries to modify config files like `package.json` or `schema.prisma` without initiating a new contract revision.
  - **Paths/Interfaces:** `backend/engine/fileProtocol.js` -> `writeGeneratedFiles(taskContext, files)`
  - **RED command:** `node backend/tests/test_p2_repair_allowlist.js --test=config-mutation`
  - **Expected RED output:** `AssertionError: Expected configuration mutation block to fail on package.json write`
  - **Minimal Implementation:** Check if the file path is `package.json` or matches `*.prisma` or config files. Unless the task specifies an allowed configuration override flag (which can only be enabled by the contract planner), block the write.
  - **GREEN command:** `node backend/tests/test_p2_repair_allowlist.js --test=config-mutation`
  - **Expected GREEN output:** `PASS: successfully blocked unapproved configuration mutations`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.7.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/engine/fileProtocol.js`, `backend/tests/test_p2_repair_allowlist.js`; message: `test(p2-7): add config mutation block TDD step`

---

### Task P2.8: Evidence-Derived Definition of Done and Completion Report

- [x] **Step P2.8.1: Render Evidence Without Completion Authority**
  - **Failing Scenario:** A verification summary is requested while one mandatory check is not `PASS`; the report must render FAIL/BLOCKED and must not change project status. A direct `POST /api/projects/:id/complete` route must not exist.
  - **Paths/Interfaces:** `backend/verification/reportGenerator.js` -> `generateCompletionReport({ projectId, contractId, runId })`; read-only `GET /api/projects/:id/verification-summary`.
  - **RED command:** `node backend/tests/test_p2_completion_report.js --test=evidence-query`
  - **Expected RED output:** `AssertionError: Expected report to show missing evidence without changing project status`
  - **Minimal Implementation:** Query `verification_checks`, `verification_runs`, requirements, and artifact evidence to render the summary. Return a read-only report with every missing mandatory gate marked FAIL/BLOCKED. Assert project status before/after is identical. Delegate the sole evidence-backed completed transition to P1-C `completeVerifiedProject`; do not add a completion mutation endpoint.
  - **GREEN command:** `node backend/tests/test_p2_completion_report.js --test=evidence-query`
  - **Expected GREEN output:** `PASS: report is evidence-derived, read-only, and completion-authority-free`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with step ID `P2.8.1`, command, exit code, status immutability assertion, and output digest.
  - **Commit:** files: `backend/verification/reportGenerator.js`, `backend/routes/projectRoutes.js`, `backend/tests/test_p2_completion_report.js`; message: `test(p2-8): add read-only evidence completion report`

- [x] **Step P2.8.2: Overwrite Manual DoD Markdown Edits**
  - **Failing Scenario:** A user manually edits `DEFINITION_OF_DONE.md` in the project directory to mark everything checked. The verification runs, and the report generator re-renders the file from the database, overwriting the manual edits.
  - **Paths/Interfaces:** `backend/verification/reportGenerator.js` -> `generateCompletionReport(runId)`
  - **RED command:** `node backend/tests/test_p2_completion_report.js --test=overwrite-dod`
  - **Expected RED output:** `AssertionError: Expected manually edited DoD markers to be overwritten by database evidence`
  - **Minimal Implementation:** On completion/report request, re-generate `DEFINITION_OF_DONE.md` dynamically from database evidence and write it back to the project files, erasing any manual edits to checkboxes.
  - **GREEN command:** `node backend/tests/test_p2_completion_report.js --test=overwrite-dod`
  - **Expected GREEN output:** `PASS: successfully overwrote manual DoD modifications`
  - **Evidence Update:** Append to `implementation-evidence/P2.md` with: step ID `P2.8.2`, test command, exit code 0, and verify output digest.
  - **Commit:** files: `backend/verification/reportGenerator.js`, `backend/tests/test_p2_completion_report.js`; message: `test(p2-8): add DoD markdown generator TDD step`

---

## Verification Regression Fixtures

The following regression test fixtures must be created under `backend/tests/fixtures/p2-hardening/` to support the TDD tests above. Note that these are static files stored inside the repository to feed test inputs, not runtime plan stubs or plan TODOs:

1. **`broken-imports/`:** JavaScript application with broken local imports to test typecheck and local import resolution.
2. **`unrestricted-cors/`:** API application containing `app.use(cors())` to test the CORS security check.
3. **`template-contaminated/`:** A Todo project containing files referencing `Car ID` and `rental-fleet` to test the contamination verifier.
4. **`mocked-endpoints/`:** A backend app containing hardcoded mock JSON arrays inside route controllers to test the placeholder verifier.
5. **`invalid-readme/`:** A project containing a README documenting non-existent commands and incorrect ports to test the README validation gate.

---

## Exit Gate for P2 Quality Hardening

- [x] All mandatory plan tasks are checked.
- [x] Task-specific and unit-level tests pass.
- [x] Independent reviewer returns no blocking finding.
- [x] Independent tester reproduces unit acceptance.
- [x] Evidence receipt in `implementation-evidence/P2.md` records step IDs, commands, exit codes, and output verification digests.
- [x] Master plan, roadmap (`yol-haitasi-todo.md`), and continuity ledger (`PROJECT-CONTINUITY.md`) agree.
- [x] Project validator (`node scripts/validate-continuity.mjs`) passes successfully.
- [x] Unit status is updated to `verified` and committed in a coherent checkpoint.
