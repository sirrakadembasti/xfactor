# P7 Data and Architectural Hardening Design

## Goal

Harden data integrity, disk reconciliation, concurrency, file access, and documentation generation across the XFactor backend. Eliminate destructive uncoordinated disk synchronization, establish a single canonical project repository and reconciliation service, configure deterministic SQLite concurrency and durability, enforce global quota and binary-safe encoding contracts for project files, and dynamically generate stack-accurate project documentation.

## Scope

P7 owns:
1. Extraction of a dedicated, non-destructive `reconciliationService.js` and removal of duplicate disk synchronization from `db.js`.
2. Removal of import-time side-effects in `db.js`.
3. RESTRICT protection on deleting projects that hold verified delivery receipts or contracts.
4. SQLite `PRAGMA busy_timeout = 5000;`, `foreign_keys = ON;`, `journal_mode = WAL;`, and `synchronous = NORMAL;`.
5. Fixing the recursive `/files` scanner to enforce global count (500) and byte (20MB) limits across all subdirectories.
6. Introducing an explicit binary encoding contract (`utf8` vs `base64`) for project file representations.
7. Aligning `POST /api/projects/:id/approve` to return the current persisted state (`approvedState`).
8. Extracting a stack-aware `readmeGenerator.js` that derives setup and run instructions from actual dependencies, `.env.example`, and `service_manifest.json`.

P7 does not implement:
- Windows Job Objects or sandbox CPU/memory resource limits (reserved for P8).
- Object storage or external remote databases.
- Full UI redesign or frontend framework rewrites.

---

## 1. Non-Destructive Reconciliation Service & Single Repository Authority

### 1.1 Service Extraction
- Create `backend/services/reconciliationService.js`.
- Move the disk-scanning and synchronization logic out of `backend/projectRepository.js` and `backend/db.js` into this service.
- Delete `syncProjectsWithDisk` from `backend/db.js` and remove the top-level auto-invocation `syncProjectsWithDisk()` at module load time (`db.js:863`).
- `backend/projectRepository.js` exports `reconcileProjectsWithDisk(options)` which delegates to the service, maintaining backward compatibility for existing callers while establishing a single implementation.

### 1.2 Non-Destructive Reconciliation & Quarantine Contract
- **Missing or Inaccessible Root:**
  If `PROJECTS_ROOT` does not exist, cannot be read, or is an empty unmounted directory, `reconcileProjectsWithDisk` returns `{ success: false, error: '...' }` and mutates zero SQLite rows.
- **Valid On-Disk Directory:**
  Directories matching `isValidProjectId(name)` that do not exist in SQLite are imported as projects in `completed` status with title equal to their directory name.
- **Invalid Directory (Quarantine):**
  Directories on disk that do not match `isValidProjectId` (or start with `.trash`, `.git`, etc.) are placed in a `quarantined` list and are never imported into SQLite.
- **Missing On-Disk Project (Quarantine / Missing):**
  If a project exists in SQLite but its folder is missing on disk:
  - **The record is NEVER automatically deleted from the database.**
  - Instead, the reconciliation service records the project ID in `missingOnDisk: string[]`.
  - Destructive deletion is restricted exclusively to explicit calls to `deleteProject(projectId)`.

### 1.3 Deletion Protection (RESTRICT) for Audited Deliveries
- In `deleteProject(projectId)`:
  - If the project has an existing `completion_receipts` record, deletion is blocked (`throw new Error('RESTRICT: Cannot delete project with verified delivery receipt')`) unless an explicit force/override flag is passed.
  - This guarantees that verified audit evidence cannot be deleted by mistake during maintenance.

---

## 2. SQLite Durability, Busy Timeout, and Transactional Safety

### 2.1 Connection and Migration PRAGMAs
In `backend/db.js`:
- Upon establishing the database connection (`new DatabaseCtor(DB_PATH, ...)`), execute immediately:
  ```sql
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  ```
- In `runMigrations(targetDb)`:
  Enforce the same PRAGMA statements so test databases created in memory or temporary files share the exact same durability and timeout settings.
- Export `setBusyTimeout(timeoutMs, targetDb = db)` to allow tests to verify concurrency behavior under controlled timeouts.

### 2.2 Transaction Safety
- Any state-transition mutation or multi-table write continues to use `BEGIN IMMEDIATE` to prevent deadlock and `SQLITE_BUSY` contention between concurrent workers.

### 2.3 Approve Response State Alignment
- In `backend/routes/projectRoutes.js` (`POST /:id/approve`):
  - When approval transitions the project to `implementing`, line 470 currently returns `{ ...state, attemptId: lease.attempt.id }` referencing the stale pre-transition `state`.
  - Fix to return `{ ...approvedState, attemptId: lease.attempt.id }`.
  - The returned payload reflects `status: 'implementing'`, `workflow: normalizeWorkflowState(null)`, and the updated CAS `revision`.

---

## 3. Files API Global Limits & Binary Encoding Contract

### 3.1 Global File Limits and Traversal Fix
In `backend/routes/projectRoutes.js` (`GET /:id/files`):
- Hoist `results = []` and `totalBytes = 0` outside the recursive traversal function `getFiles`.
- Enforce global ceilings:
  - `MAX_TOTAL_FILES = 500`
  - `MAX_TOTAL_BYTES = 20 * 1024 * 1024` (20 MB)
  - `MAX_FILE_SIZE = 2 * 1024 * 1024` (2 MB per file)
- Traversal halts across all nested subdirectories as soon as `results.length >= MAX_TOTAL_FILES` or `totalBytes >= MAX_TOTAL_BYTES`.

### 3.2 Binary Encoding Contract
- Define extension sets:
  - Text: `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.md`, `.css`, `.html`, `.prisma`, `.sql`, `.svg`, `.txt`, `.yaml`, `.yml`, `.graphql`, `.gql`, `.env.example`, `.gitignore`.
  - Binary: `.png`, `.jpg`, `.jpeg`, `.webp`, `.ico`, `.gif`.
- File reading strategy:
  - If text: read with `await fs.readFile(path, 'utf8')`. Return `{ path, content, encoding: 'utf8', size }`.
  - If binary: read as `Buffer` with `await fs.readFile(path)`. Return `{ path, content: buffer.toString('base64'), encoding: 'base64', size }`.
- Guarantees binary assets are never mangled by UTF-8 decoding and can be rendered by clients using standard data URIs (`data:image/png;base64,...`).

---

## 4. Stack-Aware Dynamic README Generator

### 4.1 Module Extraction
- Create `backend/engine/readmeGenerator.js`.
- Export `generateProjectReadme({ projectTitle, summary, talimatname, projectDir, manifest, detectedStack })`.
- Remove hardcoded Next.js/Prisma template generation from `backend/engine/workflow.js`.

### 4.2 Dynamic Setup and Run Instructions
The generator detects the actual project structure and manifests:
1. **Package Manager & Install:**
   - Detects `package-lock.json` -> `npm install`, `pnpm-lock.yaml` -> `pnpm install`, `yarn.lock` -> `yarn install`. Default `npm install`.
2. **Database & ORM:**
   - Only includes Prisma setup steps (`npx prisma generate`, `npx prisma db push`) if `prisma` dependency or `prisma/schema.prisma` is present.
   - If no database is configured, skips database setup instructions entirely.
3. **Environment Setup:**
   - Reads `.env.example` if it exists and lists the actual required environment variable names instead of hardcoding `NEXTAUTH_SECRET`.
4. **Development Server & Port:**
   - Detects dev script from `package.json` (e.g., `npm run dev` or `npm start`).
   - Reads port from `service_manifest.json` or stack defaults (e.g., 5173 for Vite, 3000 for Next.js, 8000 for Express).
5. **Architecture Summary:**
   - Sanitizes `TALIMATNAME.md` by stripping internal orchestration tags, agent names (`*.director`, `*.teamleader`), and plan completion tokens.

---

## 5. Verification & Testing Strategy

1. **Reconciliation Tests (`backend/tests/test_p7_reconciliation.js`):**
   - Verify `syncProjectsWithDisk` is non-destructive: missing directory creates no deletions and reports `missingOnDisk`.
   - Verify missing/unmounted root fails closed with 0 database modifications.
   - Verify invalid folder names are quarantined.
   - Verify deleting a project with a completion receipt is rejected by default.
2. **SQLite Concurrency Tests (`backend/tests/test_p7_sqlite_durability.js`):**
   - Verify `PRAGMA busy_timeout` is 5000ms.
   - Run concurrent write workers and verify busy timeout prevents premature lock errors.
3. **Files API Tests (`backend/tests/test_p7_files_api.js`):**
   - Verify global 500-file ceiling across a deeply nested directory tree.
   - Verify text files return `encoding: 'utf8'` and matching content.
   - Verify binary image files (PNG/ICO) return `encoding: 'base64'` and valid base64 decodable content.
4. **Approve Response State Tests (`backend/tests/test_p7_approve_state.js`):**
   - Verify `POST /:id/approve` returns `status: 'implementing'` and incremented revision.
5. **README Generator Tests (`backend/tests/test_p7_readme_generator.js`):**
   - Verify Vite project generates Vite run command and port 5173 without Prisma commands.
   - Verify Prisma project generates Prisma commands.
6. **Full Regression Suite:**
   - All existing backend, frontend, build, and browser tests pass cleanly.
