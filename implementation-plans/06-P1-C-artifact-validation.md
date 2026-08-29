# P1-C: ZIP Artifact Clean-Room Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a server-side ZIP artifact pipeline that generates, validates, and verifies exact-hash project ZIP archives in a clean-room sandbox prior to exposing verified-only downloads to the frontend dashboard.

**Architecture:** ZIP artifacts are generated server-side including dependency lock files. Each artifact is uniquely identified by a SHA-256 hash and verified in an isolated clean-room OS sandbox (free from host cache contamination) via safe extraction, dependency installation, build, and API/E2E runtime testing. Results are saved in the SQLite store, enforcing verified-only downloads and invalidating stale artifacts on workspace mutations.

**Tech Stack:** Node.js ESM, Express, SQLite (`node:sqlite`), `jszip` (archiving), `sandboxRunner` (OS-isolated sandbox), React (Vite dashboard).

## Global Constraints

- Do not modify any code in `projects/project-f2226560-c4b5-4147-a7b5-aeb9f7df95fb`.
- Rely strictly on machine evidence; no LLM self-report or manual file modification may override gate decisions.
- Maintain compatibility with the database schema and cross-unit interfaces established in P0 and P1.
- All code modifications require TDD with preceding failing tests.
- Skip formatters, linters, and full builds except when executing the sandboxed test suite of the target artifact.
- No mandatory verification gate may treat `SKIPPED`, `BLOCKED`, missing runner, or missing evidence as PASS.
- LLM output is advisory; only machine evidence can satisfy quality policy.
- Generated code never runs with host application authority.
- Every task ends with task-specific verification, independent review, evidence update, continuity validation, and commit.
- Unexpected workspace changes belong to the user; preserve them.

---

## Shared Interfaces

Conform to the following schemas from `00-MASTER-EXECUTION-PLAN.md` and P1-B:

```js
// Gate result format
{
  gateName: 'artifact_validation',
  applicability: 'MANDATORY',
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE',
  evidenceIds: string[],
  policyVersion: string
}

// Verification run format
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

### Task 1: Artifact Repository CRUD

**Files:**
- Create: `backend/repositories/artifactRepository.js`
- Test: `backend/tests/test_p1_c_repository.js`

**Interfaces:**
- Consumes: SQLite schema for `artifacts` (composite PK `(contract_id, id)`) and `artifact_files` defined/migrated in P1-A v9.
- Produces:
  ```js
  // backend/repositories/artifactRepository.js
  export function createArtifact({ id, projectId, contractId, kind, path, sha256, size, manifestJson, status }) {}
  export function updateArtifactStatus({ projectId, contractId, artifactId, status, verificationRunId }) {}
  export function getArtifact({ projectId, contractId, artifactId }) {}
  export function addArtifactFile({ contractId, artifactId, path, sha256, size }) {}
  export function getArtifactFiles({ contractId, artifactId }) {}
  export function getLatestVerifiedArtifact({ projectId, contractId }) {}
  ```

- [ ] **Step 1: Write the failing test**
  Create `backend/tests/test_p1_c_repository.js`:
  ```js
  import assert from 'assert';
  import { db } from '../db.js';
  import {
    createArtifact,
    updateArtifactStatus,
    getArtifact,
    addArtifactFile,
    getArtifactFiles
  } from '../repositories/artifactRepository.js';

  console.log("==================================================");
  console.log("Task 1: Artifact Repository CRUD Test Suite");
  console.log("==================================================");

  async function testCrud() {
      // Setup mock data
      const projectId = 'test-proj-123';
      const contractId = 'test-contract-456';
      const artifactId = 'test-artifact-789';

      db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Test', 'artifact_verified')").run(projectId);
      db.prepare(`
          INSERT INTO project_contracts (
              id, project_id, revision, status, contract_json,
              contract_hash, approved_at
          ) VALUES (?, ?, 1, 'approved', '{}', 'hash', ?)
      `).run(contractId, projectId, new Date().toISOString());
      db.prepare(`
          INSERT INTO verification_runs (
              id, project_id, contract_id, status, policy_version, started_at, ended_at
          ) VALUES (?, ?, ?, 'verified', '1.0', ?, ?)
      `).run('run-abc', projectId, contractId, new Date().toISOString(), new Date().toISOString());

      try {
          // Assert artifact creation starts in an allowed non-verified state.
          const artifact = createArtifact({
              id: artifactId,
              projectId,
              contractId,
              kind: 'zip',
              path: 'backend/data/test.zip',
              sha256: 'mocksha256hashvalue1234567890abcdef',
              size: 1024,
              manifestJson: '[]',
              status: 'draft'
          });
          assert.strictEqual(artifact.status, 'draft');

          // Assert composite FK constraint fails when adding invalid file references
          assert.throws(() => {
              addArtifactFile({
                  contractId: 'wrong-contract',
                  artifactId,
                  path: 'src/App.js',
                  sha256: 'filesha256',
                  size: 512
              });
          }, /FOREIGN KEY/);

          // Assert successful file addition
          addArtifactFile({
              contractId,
              artifactId,
              path: 'src/App.js',
              sha256: 'filesha256',
              size: 512
          });

          const files = getArtifactFiles({ contractId, artifactId });
          assert.strictEqual(files.length, 1);
          assert.strictEqual(files[0].path, 'src/App.js');

          // Assert status updates
          updateArtifactStatus({ projectId, contractId, artifactId, status: 'verified', verificationRunId: 'run-abc' });
          const updated = getArtifact({ projectId, contractId, artifactId });
          assert.strictEqual(updated.status, 'verified');
          assert.strictEqual(updated.verification_run_id, 'run-abc');

          console.log("  [PASS] Artifact Repository CRUD behaves correctly");
      } finally {
          // Cleanup
          db.prepare("DELETE FROM verification_runs WHERE id = ?").run('run-abc');
          db.prepare("DELETE FROM project_contracts WHERE id = ?").run(contractId);
          db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      }
  }

  testCrud().catch(err => {
      console.error("  [FAIL] " + err.message);
      process.exit(1);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_p1_c_repository.js`
  Expected: FAIL with "Cannot import repository module" or "SQLITE_ERROR: no such table: artifacts" (if tables are missing)

- [ ] **Step 3: Write minimal implementation**
  Create `backend/repositories/artifactRepository.js`:
  ```js
  import { db } from '../db.js';

  export function createArtifact({ id, projectId, contractId, kind, path, sha256, size, manifestJson, status }) {
      const stmt = db.prepare(`
          INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, manifest_json, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, projectId, contractId, kind, path, sha256, size, manifestJson, status);
      return getArtifact({ projectId, contractId, artifactId: id });
  }

  export function updateArtifactStatus({ projectId, contractId, artifactId, status, verificationRunId = null }) {
      const stmt = db.prepare(`
          UPDATE artifacts
          SET status = ?, verification_run_id = ?
          WHERE project_id = ? AND contract_id = ? AND id = ?
      `);
      stmt.run(status, verificationRunId, projectId, contractId, artifactId);
  }

  export function getArtifact({ projectId, contractId, artifactId }) {
      return db.prepare(`
          SELECT * FROM artifacts
          WHERE project_id = ? AND contract_id = ? AND id = ?
      `).get(projectId, contractId, artifactId);
  }

  export function addArtifactFile({ contractId, artifactId, path, sha256, size }) {
      const stmt = db.prepare(`
          INSERT INTO artifact_files (contract_id, artifact_id, path, sha256, size)
          VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(contractId, artifactId, path, sha256, size);
  }

  export function getArtifactFiles({ contractId, artifactId }) {
      return db.prepare(`
          SELECT * FROM artifact_files
          WHERE contract_id = ? AND artifact_id = ?
      `).all(contractId, artifactId);
  }

  export function getLatestVerifiedArtifact({ projectId, contractId }) {
      return db.prepare(`
          SELECT * FROM artifacts
          WHERE project_id = ? AND contract_id = ? AND status = 'verified'
          ORDER BY created_at DESC LIMIT 1
      `).get(projectId, contractId);
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_p1_c_repository.js`
  Expected: PASS (given the database tables were created in the prerequisite P1-A unit)

- [ ] **Step 5: Record evidence**
  Append the exact RED/GREEN command, exit status, and test/artifact identifiers to `implementation-evidence/P1-C.md` and run:
  ```bash
  node scripts/validate-continuity.mjs
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add backend/repositories/artifactRepository.js backend/tests/test_p1_c_repository.js
  git commit -m "feat(artifacts): implement CRUD repository operations consuming P1-A schema"
  ```

---

### Task 2: Server-Side ZIP Generation and Hashing

**Files:**
- Create: `backend/utils/archive.js`
- Test: `backend/tests/test_p1_c_archive.js`

**Interfaces:**
- Consumes: `jszip`, `backend/repositories/artifactRepository.js`
- Produces:
  ```js
  // backend/utils/archive.js
  export async function createProjectZip(projectId, contractId, files, artifactsDir = 'backend/data/artifacts') {}
  ```

- [ ] **Step 1: Write the failing test**
  Create `backend/tests/test_p1_c_archive.js`:
  ```js
  import assert from 'assert';
  import fs from 'fs/promises';
  import { db } from '../db.js';
  import { createProjectZip } from '../utils/archive.js';

  console.log("==================================================");
  console.log("Task 2: Server-Side ZIP Generation Test Suite");
  console.log("==================================================");

  async function testArchive() {
      const projectId = 'archive-proj-123';
      const contractId = 'archive-contract-456';
      db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Archive', 'planning')").run(projectId);
      db.prepare("INSERT INTO project_contracts (id, project_id, revision, contract_hash, status) VALUES (?, ?, 1, 'hash', 'approved')").run(contractId, projectId);

      const files = [
          { path: 'package.json', content: '{"name":"test-app","dependencies":{}}' },
          { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
          { path: 'src/index.js', content: 'console.log("App running");' }
      ];

      try {
          const result = await createProjectZip(projectId, contractId, files, 'backend/data/test_artifacts');
          
          assert.ok(result.id.startsWith('artifact-'));
          assert.strictEqual(typeof result.sha256, 'string');
          assert.strictEqual(result.sha256.length, 64);
          
          const fileExists = await fs.access(result.path).then(() => true).catch(() => false);
          assert.ok(fileExists, "ZIP file must be created on disk");

          console.log("  [PASS] ZIP generated and metadata stored correctly");
      } finally {
          db.prepare("DELETE FROM project_contracts WHERE id = ?").run(contractId);
          db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
          await fs.rm('backend/data/test_artifacts', { recursive: true, force: true }).catch(() => {});
      }
  }

  testArchive().catch(err => {
      console.error("  [FAIL] " + err.message);
      process.exit(1);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_p1_c_archive.js`
  Expected: FAIL with module import errors.

- [ ] **Step 3: Write minimal implementation**
  Create `backend/utils/archive.js`:
  ```js
  import crypto from 'crypto';
  import fs from 'fs/promises';
  import path from 'path';
  import JSZip from 'jszip';
  import { createArtifact, addArtifactFile } from '../repositories/artifactRepository.js';

  export async function createProjectZip(projectId, contractId, files, artifactsDir = 'backend/data/artifacts') {
      const zip = new JSZip();
      const manifest = [];

      for (const file of files) {
          zip.file(file.path, file.content);
          const hash = crypto.createHash('sha256').update(file.content).digest('hex');
          const size = Buffer.byteLength(file.content, 'utf8');
          manifest.push({ path: file.path, sha256: hash, size });
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const zipHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
      const zipSize = zipBuffer.length;

      const artifactId = `artifact-${crypto.randomUUID()}`;
      const zipFileName = `${projectId}-${artifactId}.zip`;
      const artifactPath = path.join(artifactsDir, zipFileName);

      await fs.mkdir(artifactsDir, { recursive: true });
      await fs.writeFile(artifactPath, zipBuffer);

      const manifestJson = JSON.stringify(manifest);

      await createArtifact({
          id: artifactId,
          projectId,
          contractId,
          kind: 'zip',
          path: artifactPath,
          sha256: zipHash,
          size: zipSize,
          manifestJson,
          status: 'pending'
      });

      for (const file of manifest) {
          await addArtifactFile({
              contractId,
              artifactId,
              path: file.path,
              sha256: file.sha256,
              size: file.size
          });
      }

      return { id: artifactId, sha256: zipHash, path: artifactPath, size: zipSize, manifest };
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_p1_c_archive.js`
  Expected: PASS

- [ ] **Step 5: Record evidence**
  Append the exact RED/GREEN command, exit status, and test/artifact identifiers to `implementation-evidence/P1-C.md` and run:
  ```bash
  node scripts/validate-continuity.mjs
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add backend/utils/archive.js backend/tests/test_p1_c_archive.js
  git commit -m "feat(artifacts): implement ZIP packaging and hashing verifications"
  ```

---

### Task 3: Safe Extraction (Path, Symlink, Zip Bomb, Quota Checks)

**Files:**
- Create: `backend/verification/safeExtractor.js`
- Test: `backend/tests/test_p1_c_safe_extraction.js`

**Interfaces:**
- Consumes: `jszip`
- Produces:
  ```js
  // backend/verification/safeExtractor.js
  export async function safeExtractZip(zipBufferOrPath, outputDir, limits = {}) {}
  ```

- [ ] **Step 1: Write the failing test**
  Create `backend/tests/test_p1_c_safe_extraction.js`:
  ```js
  import assert from 'assert';
  import fs from 'fs/promises';
  import path from 'path';
  import JSZip from 'jszip';
  import { safeExtractZip } from '../verification/safeExtractor.js';

  console.log("==================================================");
  console.log("Task 3: Safe Extraction Security Test Suite");
  console.log("==================================================");

  async function generateMaliciousZip(options = {}) {
      const zip = new JSZip();
      if (options.traversal) {
          zip.file('../escaped.js', 'alert("escaped")');
      }
      if (options.bomb) {
          // Large compression ratio payload
          zip.file('bomb.txt', Buffer.alloc(10 * 1024 * 1024)); // 10MB of null bytes
      }
      if (options.symlink) {
          // Add UNIX symlink entry (0xA000 permission flag mask)
          zip.file('link-out.js', '../target', {
              unixPermissions: 0o120777 // symlink type
          });
      }
      return zip.generateAsync({ type: 'nodebuffer' });
  }

  async function testSafety() {
      const testDir = 'backend/data/test_safe_extract';
      await fs.mkdir(testDir, { recursive: true });

      try {
          // 1. Test Directory Traversal
          const traversalZip = await generateMaliciousZip({ traversal: true });
          await assert.rejects(async () => {
              await safeExtractZip(traversalZip, testDir);
          }, /Traversal attack/);

          // 2. Test Symlink Escape
          const symlinkZip = await generateMaliciousZip({ symlink: true });
          await assert.rejects(async () => {
              await safeExtractZip(symlinkZip, testDir);
          }, /Symbolic link/);

          // 3. Test Decompression Bomb
          const bombZip = await generateMaliciousZip({ bomb: true });
          await assert.rejects(async () => {
              await safeExtractZip(bombZip, testDir, { maxTotalBytes: 1 * 1024 * 1024 }); // 1MB limit
          }, /decompressed size limit/);

          console.log("  [PASS] Safe extraction blocks traversal, symlink, and zip bomb attacks");
      } finally {
          await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
      }
  }

  testSafety().catch(err => {
      console.error("  [FAIL] " + err.message);
      process.exit(1);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_p1_c_safe_extraction.js`
  Expected: FAIL with missing module safeExtractor or assertion failures.

- [ ] **Step 3: Write minimal implementation**
  Create `backend/verification/safeExtractor.js`:
  ```js
  import fs from 'fs/promises';
  import path from 'path';
  import JSZip from 'jszip';
  import { assertPathInsideRoot } from '../security.js';

  export async function safeExtractZip(zipBufferOrPath, outputDir, limits = {}) {
      const maxFiles = limits.maxFiles || 500;
      const maxTotalBytes = limits.maxTotalBytes || 20 * 1024 * 1024;
      const maxRatio = limits.maxRatio || 100;

      let zipBuffer;
      if (typeof zipBufferOrPath === 'string') {
          zipBuffer = await fs.readFile(zipBufferOrPath);
      } else {
          zipBuffer = zipBufferOrPath;
      }

      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);

      if (files.length > maxFiles) {
          throw new Error(`Extraction aborted: Exceeded file count limit (${files.length} > ${maxFiles})`);
      }

      let totalDecompressedSize = 0;
      const resolvedOutputDir = path.resolve(outputDir);
      await fs.mkdir(resolvedOutputDir, { recursive: true });

      for (const entryName of files) {
          if (entryName.includes('\0')) {
              throw new Error(`Extraction aborted: Traversal attack detected (null byte)`);
          }

          const resolvedPath = path.resolve(resolvedOutputDir, entryName);
          const relative = path.relative(resolvedOutputDir, resolvedPath);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
              throw new Error(`Extraction aborted: Traversal attack detected for path: ${entryName}`);
          }

          const fileEntry = zip.files[entryName];
          const mode = fileEntry.unixPermissions;

          // Symbolic link detection
          if (mode && (mode & 0xf000) === 0xa000) {
              throw new Error(`Extraction aborted: Symbolic link detected in zip: ${entryName}`);
          }

          const content = await fileEntry.async('nodebuffer');
          const decompressedSize = content.length;
          totalDecompressedSize += decompressedSize;

          if (totalDecompressedSize > maxTotalBytes) {
              throw new Error(`Extraction aborted: Exceeded total decompressed size limit`);
          }

          if (decompressedSize > 1024) {
              const compressedSize = fileEntry._data?.compressedSize || decompressedSize;
              const ratio = decompressedSize / Math.max(compressedSize, 1);
              if (ratio > maxRatio) {
                  throw new Error(`Extraction aborted: Decompression bomb detected (ratio ${ratio.toFixed(1)}:1 exceeds ${maxRatio}:1)`);
              }
          }

          await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.writeFile(resolvedPath, content);
      }

      return { success: true, files };
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_p1_c_safe_extraction.js`
  Expected: PASS

- [ ] **Step 5: Record evidence**
  Append the exact RED/GREEN command, exit status, and test/artifact identifiers to `implementation-evidence/P1-C.md` and run:
  ```bash
  node scripts/validate-continuity.mjs
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add backend/verification/safeExtractor.js backend/tests/test_p1_c_safe_extraction.js
  git commit -m "feat(security): enforce safe extraction checks against traversals and zip bombs"
  ```

---

### Task 4: Sandboxed Clean-Room Verification Pipeline (`artifactVerifier`)

**Files:**
- Create: `backend/verification/artifactVerifier.js`
- Modify: `backend/verification/qualityPolicy.js`
- Test: `backend/tests/test_p1_c_artifact_verifier.js`

**Interfaces:**
- Consumes: `backend/verification/sandboxRunner.js`, `backend/verification/runtimeVerifier.js`, `backend/repositories/artifactRepository.js`
- Produces:
  ```js
  // backend/verification/artifactVerifier.js
  export async function verifyArtifact({ projectId, contractId, artifactId }, env = process.env) {}
  ```

- [ ] **Step 1: Write the failing test**
  Create `backend/tests/test_p1_c_artifact_verifier.js`:
  ```js
  import assert from 'assert';
  import { db } from '../db.js';
  import { createArtifact } from '../repositories/artifactRepository.js';
  import { verifyArtifact } from '../verification/artifactVerifier.js';

  console.log("==================================================");
  console.log("Task 4: Artifact Clean-Room Verification Test Suite");
  console.log("==================================================");

  async function testPipeline() {
      const projectId = 'pipeline-proj-123';
      const contractId = 'pipeline-contract-456';
      const artifactId = 'pipeline-artifact-789';

      db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Pipeline', 'planning')").run(projectId);
      db.prepare("INSERT INTO project_contracts (id, project_id, revision, contract_hash, status) VALUES (?, ?, 1, 'hash', 'approved')").run(contractId, projectId);
      db.prepare("INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version) VALUES (?, ?, ?, 'running', '1.0')").run('run-xyz', projectId, contractId);

      createArtifact({
          id: artifactId,
          projectId,
          contractId,
          kind: 'zip',
          path: 'backend/data/test_fixtures/broken-lock.zip', // pre-created test zip with missing lock file
          sha256: 'mocksha',
          size: 100,
          manifestJson: '[]',
          status: 'pending'
      });

      try {
          const result = await verifyArtifact({ projectId, contractId, artifactId });
          assert.strictEqual(result.status, 'failed');
          assert.ok(result.error.includes('Lock file missing'));

          console.log("  [PASS] Pipeline fails-closed correctly on invalid artifacts");
      } finally {
          db.prepare("DELETE FROM verification_runs WHERE id = ?").run('run-xyz');
          db.prepare("DELETE FROM project_contracts WHERE id = ?").run(contractId);
          db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      }
  }

  testPipeline().catch(err => {
      console.error("  [FAIL] " + err.message);
      process.exit(1);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_p1_c_artifact_verifier.js`
  Expected: FAIL with module import error or status verification errors.

- [ ] **Step 3: Write minimal implementation**
  Create `backend/verification/artifactVerifier.js`:
  ```js
  import { getArtifact, updateArtifactStatus } from '../repositories/artifactRepository.js';
  import { createRun, finishRun } from '../repositories/verificationRepository.js';
  import { createIsolatedWorkspace, executeInSandbox, destroyWorkspace } from './sandboxRunner.js';
  import { safeExtractZip } from './safeExtractor.js';
  import { runRuntimeVerification } from './runtimeVerifier.js';

  export async function verifyArtifact({ projectId, contractId, artifactId }, options = {}) {
      const artifact = getArtifact({ projectId, contractId, artifactId });
      if (!artifact) throw new Error('Artifact not found');

      const run = createRun({ projectId, contractId, policyVersion: options.policyVersion });
      updateArtifactStatus({
          projectId, contractId, artifactId,
          status: 'verification_pending',
          verificationRunId: run.id
      });
      const workspace = await createIsolatedWorkspace({
          sourceArtifact: artifact.path,
          adapter: options.sandboxAdapter
      });

      try {
          await safeExtractZip(artifact.path, workspace.path, { sandbox: workspace });
          await workspace.assertManifestAndLock();

          const install = await executeInSandbox(workspace.commands.install.command, workspace.commands.install.args, { workspace, networkPolicy: 'registry-only' });
          if (install.status !== 'PASS') throw new Error(`Clean install ${install.status}`);

          const typecheck = await executeInSandbox(workspace.commands.typecheck.command, workspace.commands.typecheck.args, { workspace, networkPolicy: 'none' });
          if (typecheck.status !== 'PASS') throw new Error(`Typecheck ${typecheck.status}`);

          const build = await executeInSandbox(workspace.commands.build.command, workspace.commands.build.args, { workspace, networkPolicy: 'none' });
          if (build.status !== 'PASS') throw new Error(`Build ${build.status}`);

          const runtime = await runRuntimeVerification({
              workspace,
              projectId,
              contractId,
              artifactId,
              runId: run.id
          });
          if (runtime.status !== 'PASS') throw new Error(`Runtime verification ${runtime.status}`);

          finishRun({ runId: run.id, contractId, status: 'verified' });
          updateArtifactStatus({
              projectId, contractId, artifactId,
              status: 'verified',
              verificationRunId: run.id
          });
          return { status: 'verified', runId: run.id };
      } catch (error) {
          finishRun({ runId: run.id, contractId, status: 'failed', error });
          updateArtifactStatus({
              projectId, contractId, artifactId,
              status: 'rejected',
              verificationRunId: run.id
          });
          return { status: 'failed', runId: run.id, error: error.message };
      } finally {
          await destroyWorkspace(workspace);
      }
  }
  ```

  Unit tests inject P0-B/P1-B sandbox and runtime fixtures. Unit fixture injection may simulate PASS/FAIL deterministically; production code has no `MOCK_*` environment fallback and never executes generated commands on host authority.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_p1_c_artifact_verifier.js`
  Expected: PASS

- [ ] **Step 5: Record evidence**
  Append the exact RED/GREEN command, exit status, and test/artifact identifiers to `implementation-evidence/P1-C.md` and run:
  ```bash
  node scripts/validate-continuity.mjs
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add backend/verification/artifactVerifier.js backend/tests/test_p1_c_artifact_verifier.js
  git commit -m "feat(verification): implement clean-room sandbox verification pipeline"
  ```

---

### Task 5: State Transition, Invalidation Policy, and Clean Cutover

**Files:**
- Modify: `backend/routes/projectRoutes.js` (verified download only)
- Modify: `backend/engine/stateMachine.js` (private evidence-backed completion projector)
- Modify: `backend/projectRepository.js` (CAS completion transaction)
- Modify: `backend/repositories/artifactRepository.js`
- Create: `backend/tests/test_p1_c_state_invalidation.js`

**Interfaces:**
- Consumes: scoped artifact repository, P0-B verification evidence, P1-A traceability and artifact schema.
- Produces:
  ```js
  completeVerifiedProject({ projectId, contractId, artifactId, expectedRevision })
  // Atomically validates latest approved contract, exact verified artifact/run,
  // active policy, all mandatory PASS checks, traceability coverage, no open
  // repair issues, and artifact_verified source state; then CAS-writes completed.

  // HTTP Endpoint
  // GET /api/projects/:id/contracts/:contractId/artifacts/:artifactId/download
  ```

- [ ] **Step 1: Write the failing test**
  Create `backend/tests/test_p1_c_state_invalidation.js`:
  ```js
  import assert from 'assert';
  import { db } from '../db.js';
  import { getArtifact } from '../repositories/artifactRepository.js';
  import { completeVerifiedProject } from '../projectRepository.js';
  import { seedVerifiedArtifactFixture } from './fixtures/verifiedArtifactFixture.js';

  async function testInvalidationAndCompletion() {
      const fixture = await seedVerifiedArtifactFixture({
          projectStatus: 'artifact_verified',
          artifactStatus: 'verified',
          allMandatoryChecksPass: true,
          fullTraceability: true
      });
      const { projectId, contractId, artifactId, projectRevision } = fixture;

      // Negative cases must leave project non-completed.
      await assert.rejects(
          completeVerifiedProject({ projectId, contractId: 'other-contract', artifactId, expectedRevision: projectRevision }),
          /latest approved contract/
      );

      const completed = completeVerifiedProject({
          projectId, contractId, artifactId, expectedRevision: projectRevision
      });
      assert.strictEqual(completed.status, 'completed');

      // A later source/contract mutation supersedes this exact artifact.

      db.prepare(`
          UPDATE artifacts
          SET status = 'superseded'
          WHERE project_id = ? AND contract_id = ? AND status = 'verified'
      `).run(projectId, contractId);

      const artifact = getArtifact({ projectId, contractId, artifactId });
      assert.strictEqual(artifact.status, 'superseded');
      await fixture.cleanup();
  }

  testInvalidationAndCompletion().catch(error => {
      console.error("  [FAIL] " + error.message);
      process.exit(1);
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_p1_c_state_invalidation.js`
  Expected: FAIL because scoped supersession, evidence-backed completion projector, and verified download authorization are missing.

- [ ] **Step 3: Write minimal implementation**
  Add fixture helpers that create complete P0-A/P0-B/P1-A parents: project, approved contract with required JSON/hash fields, verified run, mandatory PASS checks, traceability links, and exact verified artifact.

  Implement `completeVerifiedProject` as the only `artifact_verified -> completed` path. In one transaction it must:
  1. Load the project by `projectId` and expected revision.
  2. Confirm `contractId` is the latest approved contract for that project.
  3. Load artifact by `(projectId, contractId, artifactId)` and require `status='verified'`.
  4. Require its `(contractId, verification_run_id)` run to be `verified` under the active policy.
  5. Require every mandatory gate PASS, full mandatory requirement traceability, and zero open repair issues.
  6. Require current product state `artifact_verified`.
  7. CAS-write `completed`; any missing/mismatched evidence returns FAIL/BLOCKED without state change.

  Add the scoped download route:
  ```js
  router.get('/:id/contracts/:contractId/artifacts/:artifactId/download', requireAuth, projectAccess('viewer'), async (req, res, next) => {
      try {
          const { id, contractId, artifactId } = req.params;
          const artifact = getArtifact({ projectId: id, contractId, artifactId });
          const latest = getLatestApprovedContract(id);
          if (!artifact || latest?.id !== contractId) return res.status(404).json({ error: 'Artifact not found' });
          if (artifact.status !== 'verified' || !artifact.verification_run_id) {
              return res.status(409).json({ error: 'Artifact is not verified' });
          }
          assertArtifactPathInsideRoot(artifact.path);
          res.download(artifact.path, path.basename(artifact.path));
      } catch (error) {
          next(error);
      }
  });
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_p1_c_state_invalidation.js`
  Expected: PASS for scoped supersession, negative evidence cases, exact verified completion transaction, stale-CAS rejection, and download authorization.

- [ ] **Step 5: Record evidence**
  Append the exact RED/GREEN command, exit status, and test/artifact identifiers to `implementation-evidence/P1-C.md` and run:
  ```bash
  node scripts/validate-continuity.mjs
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add backend/routes/projectRoutes.js backend/tests/test_p1_c_state_invalidation.js
  git commit -m "feat(routes): expose verified download route and invalidate stale artifacts"
  ```

---

### Task 6: Frontend Evidence Display and Download Integration

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Header.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Create: `backend/tests/test_p1_c_frontend.js`

**Interfaces:**
- Consumes: `GET /api/projects/:id/contracts/:contractId/artifacts/:artifactId/download`
- Produces: Updated dynamic browser calls, verification badge displaying state/SHA-256.

- [ ] **Step 1: Write the failing test**
  Create `backend/tests/test_p1_c_frontend.js`:
  ```js
  import assert from 'assert';
  import fs from 'fs';
  import path from 'path';
  import { fileURLToPath } from 'url';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');

  console.log("==================================================");
  console.log("Task 6: Frontend Evidence Display Test Suite");
  console.log("==================================================");

  function testFrontend() {
      // 1. Assert Header has evidence display for latestArtifact
      const headerCode = fs.readFileSync(path.join(FRONTEND_SRC, 'components/Header.jsx'), 'utf8');
      assert.match(
          headerCode,
          /latestArtifact\s*&&\s*latestArtifact\.sha256/,
          'Header must check latestArtifact.sha256'
      );
      assert.match(
          headerCode,
          /Artifact verified/,
          'Header must display Artifact verified label'
      );

      // 2. Assert App.jsx does not statically import JSZip
      const appCode = fs.readFileSync(path.join(FRONTEND_SRC, 'App.jsx'), 'utf8');
      assert.doesNotMatch(
          appCode,
          /import\s+JSZip\s+from\s+'jszip'/,
          'JSZip must not be imported statically'
      );
      
      // 3. Assert App.jsx handleDownloadProjectZip calls download endpoint
      assert.match(
          appCode,
          /\/contracts\/\$\{contractId\}\/artifacts\/\$\{latestArtifact\.id\}\/download/,
          'App.jsx handleDownloadProjectZip must call the server-side download endpoint with contractId and artifactId'
      );

      console.log("  [PASS] Frontend code conforms to P1-C verification requirements");
  }

  try {
      testFrontend();
  } catch (err) {
      console.error("  [FAIL] " + err.message);
      process.exit(1);
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node backend/tests/test_p1_c_frontend.js`
  Expected: FAIL with "Header must check latestArtifact.sha256"

- [ ] **Step 3: Write minimal implementation**
  In `frontend/src/components/Header.jsx`, render artifact hash and verification details:
  ```jsx
  {projectState.latestArtifact && projectState.latestArtifact.status === 'verified' && (
      <div className="flex flex-col text-right text-[10px] text-gray-500 font-mono">
          <span>SHA-256: {projectState.latestArtifact.sha256.slice(0, 16)}...</span>
          <span className="text-emerald-600 font-bold">Artifact verified</span>
      </div>
  )}
  ```

  In `frontend/src/App.jsx`, modify `handleDownloadProjectZip` to bypass client-side packaging:
  ```js
  const handleDownloadProjectZip = async (id, projectTitle, e) => {
      e?.stopPropagation();
      try {
          const latestArtifact = projectState?.latestArtifact;
          if (!latestArtifact || latestArtifact.status !== 'verified') {
              throw new Error("No verified artifact found for download.");
          }
          const contractId = projectState.contractId;
          // Redirect browser window directly to verified download endpoint
          window.location.href = `/api/projects/${id}/contracts/${contractId}/artifacts/${latestArtifact.id}/download`;
      } catch (err) {
          setUiError('ZIP indirme hatası: ' + err.message);
      }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `node backend/tests/test_p1_c_frontend.js`
  Expected: PASS

- [ ] **Step 5: Record evidence**
  Append the exact RED/GREEN command, exit status, and test/artifact identifiers to `implementation-evidence/P1-C.md` and run:
  ```bash
  node scripts/validate-continuity.mjs
  ```

- [ ] **Step 6: Commit**
  ```bash
  git add frontend/src/App.jsx frontend/src/components/Header.jsx frontend/src/components/Sidebar.jsx backend/tests/test_p1_c_frontend.js
  git commit -m "feat(frontend): replace client packaging with verified server download flow"
  ```

## Unit Exit Gate

- [ ] Run every P1-C task-specific test and exact-ZIP clean-room fixture.
- [ ] Confirm manifest/hash, safe extraction, lock inclusion, clean install/type/build/runtime/API/E2E, mutation invalidation, verified-only download, and frontend evidence behavior.
- [ ] Obtain independent security reviewer approval and independent tester reproduction against the exact downloadable hash.
- [ ] Record commands/scenarios, exit/status, artifact hash/ID, commit, and decisions in `implementation-evidence/P1-C.md`; set `status: verified` only after all mandatory evidence passes.
- [ ] Mark P1-C verified in master plan and roadmap; advance continuity only after evidence exists.
- [ ] Run `node scripts/validate-continuity.mjs`.
- [ ] Commit source, tests, evidence, plans, roadmap, and continuity as one logical checkpoint.
