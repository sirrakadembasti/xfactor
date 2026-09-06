# P7 Data and Architectural Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish non-destructive project reconciliation, single repository authority, RESTRICT deletion protection for verified deliverables, deterministic SQLite WAL concurrency with busy timeout, a binary-safe global files API, and a stack-aware README generator.

**Architecture:** Extract `reconciliationService.js` to replace duplicate sync methods and eliminate import-time side-effects in `db.js`. Enforce `PRAGMA busy_timeout = 5000;` on all database connections. Align state transitions to return fresh persisted records. Upgrade `/files` to enforce global ceilings and emit an explicit `{ path, content, encoding, size }` payload. Extract `readmeGenerator.js` to derive setup instructions from actual project manifests.

**Tech Stack:** Node.js 22.23.2, Express 4, SQLite (`node:sqlite` / `bun:sqlite`), React 18, Vitest, Playwright.

## Global Constraints

- Implement the approved design at `superpowers/specs/2026-09-05-p7-data-architecture-design.md` exactly.
- Single repository authority: `backend/services/reconciliationService.js` is the sole disk reconciliation authority; remove duplicate `syncProjectsWithDisk` from `backend/db.js` and eliminate its module-load invocation.
- Non-destructive sync: Missing on-disk folders must NEVER cause automatic SQLite deletion. Missing directories are reported in `missingOnDisk: string[]`.
- Deletion protection: Deleting a project with a completion receipt must throw a `RESTRICT` error unless explicitly forced.
- Concurrency: `PRAGMA busy_timeout = 5000;` and `PRAGMA synchronous = NORMAL;` must be set on database initialization and migrations.
- State consistency: `POST /api/projects/:id/approve` must return the persisted state with `status: 'implementing'` and incremented revision.
- Files API: Enforce global `MAX_TOTAL_FILES = 500` and `MAX_TOTAL_BYTES = 20 * 1024 * 1024` across all directories. Return `encoding: 'utf8'` for text files and `encoding: 'base64'` for binary images/icons.
- README generator: Derive project documentation dynamically from dependencies, `.env.example`, and `service_manifest.json`; do not emit hardcoded Prisma or Next.js instructions for unconfigured stacks.
- Preserve P5/P6 guarantees: non-root Docker runtime, capability-proven sandbox, canonical artifact identity, and loopback reverse proxy.
- Tests must use isolated temporary databases, project roots, and artifact roots; never read or mutate `backend/data/projects.db`.
- Observable behavior changes use TDD: record RED, implement the minimal contract, then record GREEN.

---

### Task 1: Non-Destructive Reconciliation Service & Purified DB Module

**Files:**
- Create: `backend/services/reconciliationService.js`
- Create: `backend/tests/test_p7_reconciliation.js`
- Modify: `backend/db.js`
- Modify: `backend/projectRepository.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_disk_sync_and_isolation.js`
- Modify: `backend/tests/test_p1_7_pure_get_and_sync.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `reconcileProjectsWithDisk(options?: { env?: NodeJS.ProcessEnv, projectsRoot?: string }): { success: boolean, syncedCount: number, missingOnDisk: string[], quarantined: string[], error?: string }` in `backend/services/reconciliationService.js`.
- Produces: `syncProjectsWithDisk(env?)` in `backend/projectRepository.js` delegating to `reconcileProjectsWithDisk`.
- Removes: `syncProjectsWithDisk` from `backend/db.js` and removes top-level invocation `syncProjectsWithDisk()` at module load.
- Consumes: `getProjectsRoot` from `backend/projectPaths.js` and `db` from `backend/db.js`.

**Evidence:** Append Task 1 commands, exit codes, and observed results to `implementation-evidence/P7.md` during Task 6.

- [x] **Step 1: Write the failing reconciliation test**

Create `backend/tests/test_p7_reconciliation.js` using `setupIsolatedTestDb('p7-reconciliation')`:
- Test 1: When a project exists in SQLite but its folder is missing on disk, `reconcileProjectsWithDisk` leaves the project in the database and returns its ID in `missingOnDisk`.
- Test 2: When `PROJECTS_ROOT` does not exist or cannot be read, `reconcileProjectsWithDisk` returns `success: false` and makes zero database modifications.
- Test 3: Valid unimported on-disk folders are imported as `completed`.
- Test 4: Folders with invalid project IDs or dotfiles are quarantined and not imported.
- Test 5: Importing `backend/db.js` has no disk sync side-effects (does not create directories or mutate projects).

- [x] **Step 2: Run test to verify it fails (RED)**

Run: `node backend/tests/test_p7_reconciliation.js`
Expected: FAIL with module not found or missing `reconcileProjectsWithDisk` function.

- [x] **Step 3: Implement `backend/services/reconciliationService.js`**

Implement `reconcileProjectsWithDisk`:
- Read `projectsRoot = options?.projectsRoot || getProjectsRoot(options?.env)`.
- If `!fs.existsSync(projectsRoot)`, return `{ success: false, error: '...', syncedCount: 0, missingOnDisk: [], quarantined: [] }`.
- Scan disk for directories matching `isValidProjectId`. Collect valid folders and quarantine invalid ones.
- In `db.exec('BEGIN IMMEDIATE;')`:
  - For each valid on-disk directory not in SQLite: insert project row with `status: 'completed'`.
  - For each SQLite project missing on disk: DO NOT DELETE. Collect in `missingOnDisk`.
- Return `{ success: true, syncedCount, missingOnDisk, quarantined }`.

- [x] **Step 4: Purify `backend/db.js` and update repository callsites**

- In `backend/db.js`: delete `syncProjectsWithDisk` and remove the top-level `syncProjectsWithDisk()` call at lines 862-866.
- In `backend/projectRepository.js`: replace internal sync logic with delegation to `reconciliationService.js`.
- In `backend/routes/projectRoutes.js`: update any import of `syncProjectsWithDisk` from `../db.js` to `../projectRepository.js`.
- Update `test_disk_sync_and_isolation.js` and `test_p1_7_pure_get_and_sync.js` to use the canonical service.
- Register `test_p7_reconciliation.js` in `backend/tests/test_runner.js`.

- [x] **Step 5: Run tests to verify they pass (GREEN)**

Run: `node backend/tests/test_p7_reconciliation.js && node backend/tests/test_disk_sync_and_isolation.js && node backend/tests/test_p1_7_pure_get_and_sync.js`
Expected: PASS with 0 failures across all reconciliation test suites.

- [x] **Step 6: Commit Task 1**

```bash
git add backend/services/reconciliationService.js backend/projectRepository.js backend/db.js backend/routes/projectRoutes.js backend/tests/test_p7_reconciliation.js backend/tests/test_disk_sync_and_isolation.js backend/tests/test_p1_7_pure_get_and_sync.js backend/tests/test_runner.js
git commit -m "feat(p7): extract non-destructive reconciliation service and purify db module"
```

---

### Task 2: RESTRICT Deletion Protection for Audited Deliveries

**Files:**
- Create: `backend/tests/test_p7_delete_protection.js`
- Modify: `backend/projectRepository.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `deleteProject(projectId, { env?: NodeJS.ProcessEnv, force?: boolean } = {}): Promise<boolean>` in `backend/projectRepository.js`.
- Throws: `Error('RESTRICT: Cannot delete project with verified delivery receipt')` when project has `completion_receipts` entry and `force !== true`.
- HTTP: `DELETE /api/projects/:id` returns 409 Conflict with `{ error: 'RESTRICT: ...', code: 'PROJECT_LOCKED_RECEIPT' }` when deletion is restricted.

**Evidence:** Append Task 2 commands, exit codes, and observed results to `implementation-evidence/P7.md` during Task 6.

- [x] **Step 1: Write the failing deletion protection test**

Create `backend/tests/test_p7_delete_protection.js`:
- Test 1: Attempting to delete a regular draft/planning project succeeds as normal.
- Test 2: Attempting to delete a project with a row in `completion_receipts` throws a `RESTRICT` error and deletes neither disk files nor database rows.
- Test 3: `deleteProject(projectId, { force: true })` bypasses the restriction and deletes the project.
- Test 4: `DELETE /api/projects/:id` returns 409 Conflict when the project has a completion receipt.

- [x] **Step 2: Run test to verify it fails (RED)**

Run: `node backend/tests/test_p7_delete_protection.js`
Expected: FAIL because `deleteProject` currently deletes projects with completion receipts unconditionally.

- [x] **Step 3: Implement RESTRICT guard in `deleteProject` and HTTP route**

In `backend/projectRepository.js` (`deleteProject`):
- Check `completion_receipts`:
  ```js
  const receipt = db.prepare('SELECT id FROM completion_receipts WHERE project_id = ? LIMIT 1').get(projectId);
  if (receipt && !options.force) {
      const err = new Error('RESTRICT: Cannot delete project with verified delivery receipt');
      err.code = 'PROJECT_LOCKED_RECEIPT';
      throw err;
  }
  ```
- If restricted, do not transition to `deleting`, do not move to trash, and do not delete DB rows.

In `backend/routes/projectRoutes.js` (`DELETE /:id`):
- Catch errors with `code === 'PROJECT_LOCKED_RECEIPT'` and return `res.status(409).json({ error: err.message, code: err.code })`.
- Register `test_p7_delete_protection.js` in `backend/tests/test_runner.js`.

- [x] **Step 4: Run tests to verify they pass (GREEN)**

Run: `node backend/tests/test_p7_delete_protection.js && node backend/tests/test_p1_8_create_delete_boundary.js`
Expected: PASS with protected projects rejecting deletion and draft projects deleting cleanly.

- [x] **Step 5: Commit Task 2**

```bash
git add backend/projectRepository.js backend/routes/projectRoutes.js backend/tests/test_p7_delete_protection.js backend/tests/test_runner.js
git commit -m "feat(p7): enforce RESTRICT deletion protection for completed deliverables"
```

---

### Task 3: SQLite Concurrency Hardening & Approve Response Alignment

**Files:**
- Create: `backend/tests/test_p7_sqlite_durability.js`
- Create: `backend/tests/test_p7_approve_state.js`
- Modify: `backend/db.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `PRAGMA busy_timeout = 5000;` on all new database connections and test runners in `backend/db.js`.
- Produces: `setBusyTimeout(timeoutMs: number, targetDb?: Database): void` helper in `backend/db.js`.
- Changes: `POST /api/projects/:id/approve` response body returns `{ ...approvedState, attemptId: lease.attempt.id }` with `status: 'implementing'` and fresh revision.

**Evidence:** Append Task 3 commands, exit codes, and observed results to `implementation-evidence/P7.md` during Task 6.

- [x] **Step 1: Write the failing durability and approve response tests**

1. Create `backend/tests/test_p7_sqlite_durability.js`:
   - Assert `PRAGMA busy_timeout` returns `5000`.
   - Assert `PRAGMA foreign_keys` returns `1`.
   - Assert `PRAGMA journal_mode` returns `wal`.
   - Assert `PRAGMA synchronous` returns `1` (NORMAL).
   - Test concurrent transaction handling where a write transaction waits on another short transaction without throwing `SQLITE_BUSY`.

2. Create `backend/tests/test_p7_approve_state.js`:
   - Seed a project with an approved plan.
   - Call `POST /api/projects/:id/approve`.
   - Assert response status is 200, response body has `status === 'implementing'`, `revision` is incremented, and `workflow` is initialized.

- [x] **Step 2: Run tests to verify they fail (RED)**

Run: `node backend/tests/test_p7_sqlite_durability.js && node backend/tests/test_p7_approve_state.js`
Expected: FAIL because `busy_timeout` is not set and approve response returns stale `planning` / `contract_approved` state.

- [x] **Step 3: Implement SQLite PRAGMA hardening and fix approve response**

In `backend/db.js`:
- Add PRAGMA initialization immediately upon connection creation:
  ```js
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  ```
- Export `setBusyTimeout(timeoutMs, targetDb = db)`.
- Ensure `runMigrations` applies identical PRAGMA settings.

In `backend/routes/projectRoutes.js`:
- Update line 470 in `POST /:id/approve`:
  ```js
  res.json({ ...approvedState, attemptId: lease.attempt.id });
  ```
- Register both test files in `backend/tests/test_runner.js`.

- [x] **Step 4: Run tests to verify they pass (GREEN)**

Run: `node backend/tests/test_p7_sqlite_durability.js && node backend/tests/test_p7_approve_state.js`
Expected: PASS with verified PRAGMAs, concurrent write tolerance, and accurate approve response state.

- [x] **Step 5: Commit Task 3**

```bash
git add backend/db.js backend/routes/projectRoutes.js backend/tests/test_p7_sqlite_durability.js backend/tests/test_p7_approve_state.js backend/tests/test_runner.js
git commit -m "feat(p7): harden SQLite durability and align approve response state"
```

---

### Task 4: Global Files API Limits & Binary Base64 Encoding Contract

**Files:**
- Create: `backend/tests/test_p7_files_api.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Changes: `GET /api/projects/:id/files` response item format: `Array<{ path: string, content: string, encoding: 'utf8' | 'base64', size: number }>`.
- Enforces: Global ceiling across whole directory tree: `MAX_TOTAL_FILES = 500` and `MAX_TOTAL_BYTES = 20 * 1024 * 1024`.
- Enforces: Binary extensions (`.png`, `.jpg`, `.jpeg`, `.webp`, `.ico`, `.gif`) read as binary buffer and encoded as base64. Text extensions read as UTF-8 string.

**Evidence:** Append Task 4 commands, exit codes, and observed results to `implementation-evidence/P7.md` during Task 6.

- [x] **Step 1: Write the failing files API test**

Create `backend/tests/test_p7_files_api.js`:
- Test 1: Deeply nested directory with >500 files stops returning files at exactly 500 total files globally.
- Test 2: Directory with files exceeding 20MB stops at the byte ceiling without crashing.
- Test 3: Text file (e.g. `src/App.jsx`, `README.md`) returns `encoding: 'utf8'` and matching text content.
- Test 4: Binary file (e.g. `public/favicon.ico`, `assets/logo.png`) returns `encoding: 'base64'` and content decodable to the original binary bytes.

- [x] **Step 2: Run test to verify it fails (RED)**

Run: `node backend/tests/test_p7_files_api.js`
Expected: FAIL because `/files` returns no `encoding` field, mangles binary files, and resets file count per directory.

- [x] **Step 3: Implement global file limits and binary encoding**

In `backend/routes/projectRoutes.js` (`GET /:id/files`):
- Define sets:
  ```js
  const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif']);
  ```
- Hoist `results = []` and `totalBytes = 0` to the outer route scope.
- In directory loop:
  ```js
  const isBinary = BINARY_EXTENSIONS.has(ext);
  const rawContent = await fs.readFile(resPath);
  totalBytes += stat.size;
  results.push({
      path: relPath,
      content: isBinary ? rawContent.toString('base64') : rawContent.toString('utf8'),
      encoding: isBinary ? 'base64' : 'utf8',
      size: stat.size
  });
  ```
- Halt recursion immediately if `results.length >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES`.
- Register `test_p7_files_api.js` in `backend/tests/test_runner.js`.

- [x] **Step 4: Run tests to verify they pass (GREEN)**

Run: `node backend/tests/test_p7_files_api.js`
Expected: PASS with exact global ceilings and clean base64/utf8 discrimination.

- [x] **Step 5: Commit Task 4**

```bash
git add backend/routes/projectRoutes.js backend/tests/test_p7_files_api.js backend/tests/test_runner.js
git commit -m "feat(p7): enforce global files API limits and binary base64 encoding"
```

---

### Task 5: Stack-Aware Dynamic README Generator

**Files:**
- Create: `backend/engine/readmeGenerator.js`
- Create: `backend/tests/test_p7_readme_generator.js`
- Modify: `backend/engine/workflow.js`
- Modify: `backend/verification/readmeVerifier.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `generateProjectReadme(options: { projectTitle: string, summary?: string, talimatname?: string, projectDir: string, manifest?: object, detectedStack?: string }): Promise<string>` in `backend/engine/readmeGenerator.js`.
- Changes: `backend/engine/workflow.js` uses `generateProjectReadme` instead of hardcoded Next.js/Prisma template.

**Evidence:** Append Task 5 commands, exit codes, and observed results to `implementation-evidence/P7.md` during Task 6.

- [x] **Step 1: Write the failing README generator test**

Create `backend/tests/test_p7_readme_generator.js`:
- Test 1: Pure Vite/React project generates `npm run dev` and port `5173`; contains NO `prisma` or `NEXTAUTH_SECRET` instructions.
- Test 2: Project with `prisma` dependency generates Prisma schema preparation steps (`npx prisma generate`, `npx prisma db push`).
- Test 3: Project with `.env.example` lists actual environment variable keys defined in the example file.
- Test 4: Internal orchestration tags and agent names (`*.director`, `[PLAN_HAZIR]`) are cleanly stripped from the architecture section.

- [x] **Step 2: Run test to verify it fails (RED)**

Run: `node backend/tests/test_p7_readme_generator.js`
Expected: FAIL because `readmeGenerator.js` does not exist.

- [x] **Step 3: Implement `backend/engine/readmeGenerator.js` and wire to workflow**

- Implement `generateProjectReadme`:
  - Inspect `package.json` in `projectDir` to detect dependencies and scripts.
  - Inspect `.env.example` to extract variable names.
  - Check for `prisma` in dependencies or `schema.prisma` file.
  - Determine run command (dev script) and default port from `service_manifest.json` or stack defaults.
  - Assemble formatted README with title, summary, dynamic setup steps, and sanitized architecture notes.
- In `backend/engine/workflow.js`: import `generateProjectReadme` and replace the hardcoded template generation at lines 870-932.
- Register `test_p7_readme_generator.js` in `backend/tests/test_runner.js`.

- [x] **Step 4: Run tests to verify they pass (GREEN)**

Run: `node backend/tests/test_p7_readme_generator.js && node backend/tests/test_p2_readme.js`
Expected: PASS with dynamically generated stack-accurate READMEs and clean verification.

- [x] **Step 5: Commit Task 5**

```bash
git add backend/engine/readmeGenerator.js backend/engine/workflow.js backend/verification/readmeVerifier.js backend/tests/test_p7_readme_generator.js backend/tests/test_runner.js
git commit -m "feat(p7): implement stack-aware dynamic README generator"
```

---

### Task 6: Verify and Record P7

**Files:**
- Create: `implementation-evidence/P7.md`
- Modify: `guncel-todo.md`
- Modify: `PROJECT-CONTINUITY.md`
- Modify: `yol-haitasi-todo.md`
- Modify: `implementation-plans/00-MASTER-EXECUTION-PLAN.md`
- Modify: `implementation-plans/12-P7-data-architecture.md`
- Modify: `scripts/validate-continuity.mjs`

**Interfaces:**
- Consumes: reviewed Task 1–5 commits and exact verification command outputs.
- Produces: immutable `implementation-evidence/P7.md` receipt and continuity pointer to P8.

**Evidence:** This task creates and finalizes `implementation-evidence/P7.md`; no P7 status becomes verified before all preceding evidence is present.

- [x] **Step 1: Register P7 in a deliberate validator RED state**

Add `P7` to `UNIT_IDS`, `UNIT_PLANS`, and `UNIT_DEPENDENCIES` (with dependency `['P6']`) in `scripts/validate-continuity.mjs`. Add an unchecked P7 row to roadmap/master ledgers. Do not create `implementation-evidence/P7.md` yet.

Run: `node scripts/validate-continuity.mjs`
Expected: FAIL specifically because `implementation-evidence/P7.md` is absent.

- [x] **Step 2: Run all P7 focused test suites**

Run: `node backend/tests/test_p7_reconciliation.js`
Expected: PASS with non-destructive sync verified.

Run: `node backend/tests/test_p7_delete_protection.js`
Expected: PASS with RESTRICT deletion protection verified.

Run: `node backend/tests/test_p7_sqlite_durability.js && node backend/tests/test_p7_approve_state.js`
Expected: PASS with SQLite durability and approve response state verified.

Run: `node backend/tests/test_p7_files_api.js`
Expected: PASS with global ceilings and binary base64 encoding verified.

Run: `node backend/tests/test_p7_readme_generator.js`
Expected: PASS with dynamic stack-aware README verified.

- [x] **Step 3: Run related regression suites**

Run: `node backend/tests/test_disk_sync_and_isolation.js && node backend/tests/test_p1_7_pure_get_and_sync.js && node backend/tests/test_p1_8_create_delete_boundary.js && node backend/tests/test_p2_readme.js && node backend/tests/test_p6_archive_ownership.js && node backend/tests/test_p6_static_serving.js`
Expected: PASS with all existing repository, sync, archive, and static serving regressions passing cleanly.

- [x] **Step 4: Run complete project verification**

Run: `npm --prefix backend test`
Expected: PASS with all backend suites exiting 0.

Run: `npm --prefix frontend run test:unit`
Expected: PASS with all frontend unit tests exiting 0.

Run: `npm --prefix frontend run build`
Expected: PASS with clean production Vite build.

Run: `npx playwright test --project=chromium`
Expected: PASS with browser suites passing cleanly.

- [x] **Step 5: Perform the security and data integrity audit**

Review final diff against blocking conditions:
- any unhandled auto-delete of SQLite projects on disk discrepancy,
- any missing `busy_timeout` or foreign key configuration,
- any binary files read as raw UTF-8 text strings,
- any local variable resetting global file count or byte limits in `/files`,
- any hardcoded stack commands in generated READMEs,
- any bypass of RESTRICT deletion protection for completed deliverables.

- [x] **Step 6: Write immutable evidence and update continuity**

Create `implementation-evidence/P7.md` with:
- Frontmatter (`unit: P7`, `plan: implementation-plans/12-P7-data-architecture.md`, `status: verified`).
- Task commit list and review records.
- Exact command outputs and exit codes from Steps 1–4.
- Security and data integrity audit conclusions.

Update `guncel-todo.md`, `yol-haitasi-todo.md`, `00-MASTER-EXECUTION-PLAN.md`, and `PROJECT-CONTINUITY.md` to mark P7 verified and set the exact next action to P8 planning. Mark all plan checkboxes complete.

- [x] **Step 7: Verify continuity GREEN**

Run: `node scripts/validate-continuity.mjs`
Expected: PASS with 12 units, P7 verified, and P8 planning as next action.

- [x] **Step 8: Commit Task 6**

```bash
git add implementation-evidence/P7.md guncel-todo.md PROJECT-CONTINUITY.md yol-haitasi-todo.md implementation-plans/00-MASTER-EXECUTION-PLAN.md implementation-plans/12-P7-data-architecture.md scripts/validate-continuity.mjs
git commit -m "docs: record verified P7 data and architectural hardening"
```

- [x] **Step 9: Stop at the delivery boundary**

Do not implement P8 source changes. The exact next action is to brainstorm and write the P8 CI, security hardening, and operational limits design and implementation plan.

---

## P7 Exit Gate

- [x] Startup/reconciliation is non-destructive and never deletes DB records on missing disk directories.
- [x] Single canonical reconciliation service used across all callsites; duplicate sync logic removed.
- [x] Deletion of projects with completion receipts is strictly RESTRICT-protected.
- [x] SQLite `PRAGMA busy_timeout = 5000;` and WAL durability enforced.
- [x] `POST /api/projects/:id/approve` returns fresh persisted `implementing` state.
- [x] `/files` API enforces global ceilings (500 files, 20MB) and encodes binary files as base64.
- [x] Generated README reflects actual project stack, dependencies, and manifest configuration.
- [x] All focused unit, regression, backend full, frontend unit/build, and Playwright tests pass.
- [x] Independent reviewer returns no blocking finding.
- [x] `implementation-evidence/P7.md` records exact commands, exit codes, and observations.
- [x] `node scripts/validate-continuity.mjs` passes with P7 verified.
