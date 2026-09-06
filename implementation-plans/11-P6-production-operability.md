# P6 Production Operability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one reproducible non-root production image that serves the UI, API, authenticated WebSocket, health probes, backend-owned ZIP operations, and verified artifact downloads through one HTTPS reverse-proxy origin.

**Architecture:** The root multi-stage Dockerfile is the only production artifact. Backend-owned `jszip`, stable persistent path helpers, fail-closed static SPA serving, and a real container/TLS-proxy smoke harness make the deployment contract executable rather than documentary. SQLite/artifacts remain under `/app/backend/data`; generated projects remain under `/app/projects`.

**Tech Stack:** Node.js 22.23.2, npm 10.9.8, Express 4, React 18/Vite 6, SQLite, JSZip 3.10.1, Docker, Playwright Chromium.

## Global Constraints

- Implement the approved design at `superpowers/specs/2026-09-05-p6-production-operability-design.md` exactly.
- The root `Dockerfile` is the only production image definition; remove `backend/Dockerfile` and `frontend/Dockerfile` in the canonical cutover.
- Production dependency installation uses `npm ci`; no `npm install` fallback is permitted in Dockerfiles or CI.
- The production runtime is exact `node:22.23.2-alpine`, runs as non-root user `xfactor`, and exposes only application port `8000`.
- TLS terminates at an external loopback reverse proxy. Production requires `NODE_ENV=production`, `TRUST_PROXY=loopback`, and HTTPS-only `ALLOWED_ORIGINS`.
- Persist `/app/backend/data` and `/app/projects`; do not introduce the P7 unified repository/storage redesign.
- Backend ZIP creation and extraction must not import from or inspect `frontend/node_modules`.
- SPA fallback applies only to eligible `GET`/`HEAD` HTML navigation; it never captures API, WebSocket, probe, or filename-like paths.
- `index.html` is `no-cache`; fingerprinted `/assets/*` responses are `public, max-age=31536000, immutable`.
- `/healthz` remains liveness-only. `/readyz` verifies SQLite, projects root, artifacts root, and the production SPA entry.
- Preserve P5 fail-closed sandbox execution, canonical artifact identity, verified-only download authorization, and MFA-before-session behavior.
- Tests use isolated temporary databases, artifact roots, project roots, Docker names, ports, and volumes. Never read or mutate `backend/data/projects.db`.
- Do not implement Windows Job Objects, sandbox limits, MFA enrollment, external databases, object storage, or P7 reconciliation changes.
- Observable behavior changes use TDD: record RED, implement the minimum contract, then record GREEN.
- Do not mark P6 verified unless focused tests, regressions, production image build, real image smoke, independent review, and continuity validation all pass.

---

### Task 1: Move ZIP Ownership and Artifact Paths to Backend

**Files:**
- Create: `backend/artifactPaths.js`
- Create: `backend/tests/test_p6_archive_ownership.js`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `backend/utils/archive.js`
- Modify: `backend/verification/safeExtractor.js`
- Modify: `backend/tests/test_p1_c_archive.js`
- Modify: `backend/tests/test_p1_c_artifact_verifier.js`
- Modify: `backend/tests/test_p1_c_safe_extraction.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `getArtifactsRoot(env = process.env): string` in `backend/artifactPaths.js`.
- Produces: `assertArtifactsRootAvailable(root): Promise<string>` that creates the root when absent, verifies directory/read/write access, and returns the canonical absolute path.
- Changes: `createProjectZip(projectId, contractId, files, artifactsDir = getArtifactsRoot())`.
- Keeps: `safeExtractZip(zipBufferOrPathOrInstance, outputDir, limits = {})` behavior and limits unchanged.
- Dependency owner: backend production dependency `jszip@3.10.1`; frontend has no `jszip` dependency.


**Evidence:** Append Task 1 commands, exit codes, and observed results to `implementation-evidence/P6.md` during Task 5.
- [x] **Step 1: Write the failing backend ownership test**

Create `backend/tests/test_p6_archive_ownership.js`. Call `setupIsolatedTestDb('p6-archive-ownership')` before importing backend modules. Use temporary `ARTIFACTS_ROOT` and `PROJECTS_ROOT` values and restore environment variables in `finally`.

The test must assert observable behavior:

```js
const isolated = await setupIsolatedTestDb('p6-archive-ownership');
process.env.DB_PATH = isolated.dbPath;
process.env.ARTIFACTS_ROOT = path.join(isolated.root, 'artifacts');

const { getArtifactsRoot } = await import('../artifactPaths.js');
assert.strictEqual(getArtifactsRoot(), path.resolve(process.env.ARTIFACTS_ROOT));

const { createProjectZip } = await import('../utils/archive.js');
const artifact = await createProjectZip(projectId, contractId, [
  { path: 'src/index.js', content: 'export default 1;\n' }
]);
assert.strictEqual(path.dirname(artifact.path), path.resolve(process.env.ARTIFACTS_ROOT));
assert.strictEqual((await fs.stat(artifact.path)).isFile(), true);
```

Spawn a child process from repository root after temporarily renaming or excluding `frontend/node_modules`; in that child import `backend/utils/archive.js`, `backend/verification/safeExtractor.js`, and `jszip` from the backend package context. Assert ZIP creation and extraction succeed without frontend dependencies. Read both package manifests and assert backend owns `jszip` while frontend does not.

Register the suite in `backend/tests/test_runner.js` immediately after the P5 artifact test.

- [x] **Step 2: Run the new test and record RED**

Run:

```bash
node backend/tests/test_p6_archive_ownership.js
```

Expected: FAIL because `backend/artifactPaths.js` does not exist, backend does not own `jszip`, frontend still owns it, or archive/extractor resolution falls back to `frontend/node_modules`.

- [x] **Step 3: Move the dependency with lockfile-safe npm commands**

Run:

```bash
npm --prefix backend install --save-exact jszip@3.10.1
npm --prefix frontend uninstall jszip
```

Confirm `backend/package.json` and `backend/package-lock.json` contain JSZip 3.10.1 and `frontend/package.json`/lock no longer contain the package in their dependency graph. Do not hand-edit lockfile integrity fields.

- [x] **Step 4: Add canonical artifact-root resolution**

Create `backend/artifactPaths.js` with module-relative development defaults and strict production validation:

```js
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultArtifactsRoot = path.join(backendRoot, 'data', 'artifacts');

export function getArtifactsRoot(env = process.env) {
  const configured = String(env.ARTIFACTS_ROOT || '').trim();
  const resolved = path.resolve(configured || defaultArtifactsRoot);
  if (String(env.NODE_ENV || '').toLowerCase() === 'production' && !configured) {
    throw new Error('ARTIFACTS_ROOT is required in production');
  }
  if (String(env.NODE_ENV || '').toLowerCase() === 'production' && !path.isAbsolute(configured)) {
    throw new Error('ARTIFACTS_ROOT must be absolute in production');
  }
  return resolved;
}

export async function assertArtifactsRootAvailable(root = getArtifactsRoot()) {
  await fs.mkdir(root, { recursive: true });
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('ARTIFACTS_ROOT must be a directory');
  await fs.access(root, constants.R_OK | constants.W_OK);
  return root;
}
```

- [x] **Step 5: Remove every frontend dependency fallback**

In `backend/utils/archive.js` and `backend/verification/safeExtractor.js`, replace `createRequire` and fallback resolution with:

```js
import JSZip from 'jszip';
```

Use `new JSZip()` for creation and `JSZip.loadAsync(...)` for extraction. Update the three P1-C tests to import `jszip` directly from the backend package context; no test may require `../../frontend/node_modules/jszip`.
- [x] **Step 6: Run focused GREEN and regressions**

Run:

```bash
node backend/tests/test_p6_archive_ownership.js
node backend/tests/test_p1_c_archive.js
node backend/tests/test_p1_c_artifact_verifier.js
node backend/tests/test_p1_c_safe_extraction.js
```

- [x] **Step 7: Commit Task 1**

```bash
git add backend/artifactPaths.js backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json backend/utils/archive.js backend/verification/safeExtractor.js backend/tests/test_p6_archive_ownership.js backend/tests/test_p1_c_archive.js backend/tests/test_p1_c_artifact_verifier.js backend/tests/test_p1_c_safe_extraction.js backend/tests/test_runner.js
git commit -m "fix(packaging): move ZIP ownership to backend"
```

---

### Task 2: Serve the Production SPA Fail-Closed

**Files:**
- Create: `backend/productionStatic.js`
- Create: `backend/tests/test_p6_static_serving.js`
- Modify: `backend/config.js`
- Modify: `backend/server.js`
- Modify: `backend/tests/test_health_and_lifecycle.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `getFrontendDistRoot(): string`, resolved relative to backend module layout.
- Produces: `assertProductionFrontendAvailable({ production, distRoot }): Promise<void>`.
- Produces: `mountProductionFrontend(app, { production, distRoot }): void`.
- Changes: `validateRuntimeConfig(env)` returns `ARTIFACTS_ROOT` and rejects missing/non-absolute production storage paths.
- Changes: `/readyz` validates database, `PROJECTS_ROOT`, `ARTIFACTS_ROOT`, and production `index.html`.

**Evidence:** Append Task 2 commands, exit codes, and observed results to `implementation-evidence/P6.md` during Task 5.
- [x] **Step 1: Write failing static-serving integration tests**

Create `backend/tests/test_p6_static_serving.js` around a real ephemeral Express server and a temporary distribution tree containing:

```text
index.html
assets/app-abc123.js
assets/app-abc123.css
```

Use `mountProductionFrontend` and assert:

```js
assert.strictEqual((await request('/')).status, 200);
assert.strictEqual((await request('/projects/example')).status, 200);
assert.match(response.headers.get('cache-control'), /no-cache/);
assert.strictEqual((await request('/assets/app-abc123.js')).headers.get('cache-control'),
  'public, max-age=31536000, immutable');
assert.strictEqual((await request('/missing.js')).status, 404);
assert.strictEqual((await request('/api/does-not-exist')).status, 404);
assert.match((await request('/api/does-not-exist')).headers.get('content-type'), /json/);
```

Also assert `POST /projects/example`, non-HTML `Accept: application/json`, `/ws/logs`, `/healthz`, and `/readyz` never receive the SPA shell. Assert startup validation rejects a missing `index.html` in production and is a no-op in development.

- [x] **Step 2: Run the static test and record RED**

```bash
node backend/tests/test_p6_static_serving.js
```

Run: `node backend/tests/test_p6_static_serving.js`
Expected: FAIL with module not found before static module is created.

- [x] **Step 3: Implement the focused static-serving module**

Create `backend/productionStatic.js`. Use module-relative paths, `express.static`, and a strict navigation predicate:

```js
export function isSpaNavigation(req) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  if (!req.accepts('html')) return false;
  if (/^\/(api|ws)(\/|$)/.test(req.path)) return false;
  if (req.path === '/healthz' || req.path === '/readyz') return false;
  return !path.posix.basename(req.path).includes('.');
}
```

- [x] **Step 4: Wire production routing in authoritative order**

In `backend/server.js`:

1. Keep probes before HTTPS enforcement.
2. Keep HTTPS/CORS/CSRF/rate limits and all `/api` routers unchanged in authority.
3. Add an `/api` JSON 404 handler after API routers.
4. Mount production static behavior after the API handler.
5. Keep the global JSON error handler last.
6. Await `assertProductionFrontendAvailable` before `server.listen` in production.

- [x] **Step 5: Extend runtime config validation**

Require exact production storage values to be present and absolute:

```js
if (production && !path.isAbsolute(artifactsRoot)) {
  issues.push('ARTIFACTS_ROOT must be an absolute path in production');
}
if (production && !path.isAbsolute(projectsRoot)) {
  issues.push('PROJECTS_ROOT must be an absolute path in production');
}
if (production && !path.isAbsolute(dbPath)) {
  issues.push('DB_PATH must be an absolute path in production');
}
```

- [x] **Step 6: Extend lifecycle/readiness coverage**

- [x] **Step 7: Run focused GREEN and regressions**

```bash
node backend/tests/test_p6_static_serving.js
node backend/tests/test_health_and_lifecycle.js
node backend/tests/test_http_integration.js
node backend/tests/test_p2_security_auth.js
node backend/tests/test_p5_mfa_login.js
```

Run: `node backend/tests/test_p6_static_serving.js`
Expected: PASS with all static serving and lifecycle tests passing.

- [x] **Step 8: Commit Task 2**

```bash
git add backend/productionStatic.js backend/config.js backend/server.js backend/tests/test_p6_static_serving.js backend/tests/test_health_and_lifecycle.js backend/tests/test_runner.js
git commit -m "feat(production): serve SPA through backend"
```

---

### Task 3: Build One Deterministic Production Image

**Files:**
- Create: `scripts/test-p6-image-contract.mjs`
- Modify: `Dockerfile`
- Modify: `.dockerignore`
- Modify: `.github/workflows/ci.yml`
- Delete: `backend/Dockerfile`
- Delete: `frontend/Dockerfile`

**Interfaces:**
- Produces image layout: `/app/backend`, `/app/backend/node_modules`, `/app/frontend/dist`, `/app/docs`, `/app/projects`.
- Produces runtime environment defaults: `PORT=8000`, `HOST=0.0.0.0`, `DB_PATH=/app/backend/data/projects.db`, `PROJECTS_ROOT=/app/projects`, `ARTIFACTS_ROOT=/app/backend/data/artifacts`.
- Produces declared volumes: `/app/backend/data`, `/app/projects`.

**Evidence:** Append Task 3 commands, exit codes, and observed results to `implementation-evidence/P6.md` during Task 5.
- [x] **Step 1: Write the failing image-contract smoke script**

Create `scripts/test-p6-image-contract.mjs`. Use `spawnSync`/`execFileSync` argument arrays, unique names from `crypto.randomUUID()`, and `try/finally` cleanup. It must:

1. Build the current root image from a clean Git-tracked context.
2. Inspect `.Config.User`, exposed ports, healthcheck, environment, and declared volumes.
3. Run `node --input-type=module -e "await import('jszip')"` from `/app/backend`.
4. Run a container assertion that `/app/frontend/dist/index.html` exists and `/app/frontend/node_modules` does not.
5. Build a temporary deliberately lock-mismatched context and assert the Docker build fails rather than falling back to `npm install`.

Use behavior/result assertions, not Dockerfile source-text matching:

```js
assert.notStrictEqual(inspect.Config.User, '');
assert.notStrictEqual(inspect.Config.User, '0');
assert.ok(inspect.Config.ExposedPorts['8000/tcp']);
assert.ok(inspect.Config.Volumes['/app/backend/data']);
assert.ok(inspect.Config.Volumes['/app/projects']);
assert.notStrictEqual(lockMismatch.status, 0);
- [x] **Step 2: Run image contract and record RED**

```bash
node scripts/test-p6-image-contract.mjs
```

Expected: FAIL because the current image has fallback installs, lacks backend-owned JSZip/runtime storage declarations, or does not satisfy the canonical layout.

- [x] **Step 3: Rewrite the root Dockerfile as the sole production artifact**

Use exact lockfiles and no fallback:

```dockerfile
FROM node:22.23.2-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM node:22.23.2-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22.23.2-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000 \
    DB_PATH=/app/backend/data/projects.db \
    PROJECTS_ROOT=/app/projects \
    ARTIFACTS_ROOT=/app/backend/data/artifacts
RUN addgroup -S xfactor && adduser -S xfactor -G xfactor
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY docs/ /app/docs/
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/data/artifacts /app/projects \
    && chown -R xfactor:xfactor /app
VOLUME ["/app/backend/data", "/app/projects"]
USER xfactor
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8000/healthz || exit 1
CMD ["node", "server.js"]
```

- [x] **Step 4: Remove alternate production Dockerfiles and fallback CI installs**

- [x] **Step 5: Run image-contract GREEN**

```bash
node scripts/test-p6-image-contract.mjs
```

- [x] **Step 6: Run package/build regressions**

```bash
npm --prefix backend ci --ignore-scripts
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
node backend/tests/test_p6_archive_ownership.js
node backend/tests/test_p6_static_serving.js
```

- [x] **Step 7: Commit Task 3**

```bash
git add Dockerfile .dockerignore .github/workflows/ci.yml scripts/test-p6-image-contract.mjs backend/Dockerfile frontend/Dockerfile
git commit -m "build(production): enforce deterministic single image"
```

---

### Task 4: Prove the Real HTTPS Container Surface

**Files:**
- Create: `scripts/p6-container-seed.mjs`
- Create: `scripts/test-p6-production-image.mjs`
- Create: `e2e/production-operability.spec.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `npm run test:production-image` invoking `node scripts/test-p6-production-image.mjs`.
- Consumes: image contract and tag from Task 3.
- Produces fixture JSON `{ username, password, projectId, contractId, artifactId, sha256 }` from `p6-container-seed.mjs`.

**Evidence:** Append Task 4 commands, exit codes, and observed results to `implementation-evidence/P6.md` during Task 5.
- [x] **Step 1: Write the failing production browser journey**

Create `e2e/production-operability.spec.js` as reusable Playwright assertions against `P6_BASE_URL` and fixture values supplied through environment variables. It must use `ignoreHTTPSErrors: true` and prove:

```js
const deepLink = await page.goto(`${baseUrl}/projects/${projectId}`);
expect(deepLink.status()).toBe(200);
await expect(page.locator('#root')).not.toBeEmpty();

const api404 = await page.request.get(`${baseUrl}/api/does-not-exist`);
expect(api404.status()).toBe(404);
expect(api404.headers()['content-type']).toContain('application/json');

const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: 'Projeyi (ZIP) İndir' }).click();
const download = await downloadPromise;
expect(download.suggestedFilename()).toMatch(/\.zip$/);
```

- [x] **Step 2: Create the in-container seed and ZIP proof**

Create `scripts/p6-container-seed.mjs`. It runs inside the application container with isolated mounted storage. Import backend modules by absolute file URL, create a normal user, an unverified project, and a completed project with:

- latest approved contract,
- verified artifact created by `createProjectZip`,
- all mandatory P5 PASS checks,
- matching artifact file/hash,
- completion receipt tied to the same run/artifact.

- [x] **Step 3: Write the production-image orchestrator**

Create `scripts/test-p6-production-image.mjs` with deterministic `try/finally` cleanup. It must:

1. Build/reuse the Task 3 application image.
2. Create isolated host temporary directories for the two persistent mounts.
3. Start the application container as its declared user with production env and a unique published HTTPS port reserved before launch.
4. Start exact proxy image `caddy:2.8.4-alpine` as a TLS reverse-proxy sidecar sharing `--network container:<app>` so it connects to `127.0.0.1:8000` and binds the published HTTPS port. Generate the proxy configuration in the isolated temp directory and define `const PROXY_IMAGE = 'caddy:2.8.4-alpine'`.
5. Wait on Docker health, run `p6-container-seed.mjs` via an explicit read-only bind mount, and parse its single JSON output.
6. Run Playwright assertions from `production-operability.spec.js` against the HTTPS origin.
7. Stop/recreate the application container with the same two mounts and verify login, readiness, and artifact download still work.
8. Inspect writable paths and assert durable state resides only under the mounted data/projects roots.
9. Remove containers, temporary networks/configuration, and smoke images even after failure.

- [x] **Step 4: Run browser smoke and record RED**

```bash
npm run test:production-image
```

Run: `npm run test:production-image`
Expected: FAIL before complete production image wiring.

Expected before the complete harness/runtime wiring: FAIL because the current production image cannot satisfy same-origin HTTPS SPA/API/WebSocket/download and persistent ZIP operations.

- [x] **Step 5: Complete the minimal harness and run GREEN**

Run:

```bash
npx playwright install chromium
npm run test:production-image
```

Expected: PASS with real HTTPS production smoke exiting 0.

- [x] **Step 6: Add the real smoke to CI**

- [x] **Step 7: Run focused regressions**

```bash
npx playwright test e2e/trust-chain.spec.js --project=chromium
node backend/tests/test_p5_artifact_completion.js
node backend/tests/test_p5_mfa_login.js
node backend/tests/test_http_integration.js
```

- [x] **Step 8: Commit Task 4**

```bash
git add scripts/p6-container-seed.mjs scripts/test-p6-production-image.mjs e2e/production-operability.spec.js .github/workflows/ci.yml package.json package-lock.json
git commit -m "test(production): prove HTTPS container surface"
```

---

### Task 5: Verify and Record P6

**Files:**
- Create: `implementation-evidence/P6.md`
- Modify: `guncel-todo.md`
- Modify: `PROJECT-CONTINUITY.md`
- Modify: `yol-haitasi-todo.md`
- Modify: `implementation-plans/00-MASTER-EXECUTION-PLAN.md`
- Modify: `implementation-plans/11-P6-production-operability.md`
- Modify: `scripts/validate-continuity.mjs`

**Interfaces:**
- Consumes: reviewed Task 1–4 commits and exact command output.
- [x] **Step 1: Register P6 in a deliberate validator RED state**

Add `P6` to `UNIT_IDS`, `UNIT_PLANS`, and `UNIT_DEPENDENCIES` with dependency `['P5']`. Add an unchecked P6 row to the roadmap/master ledgers. Do not create `implementation-evidence/P6.md` yet.

Run:

```bash
node scripts/validate-continuity.mjs
```

- [x] **Step 2: Run all P6 focused checks**

```bash
node backend/tests/test_p6_archive_ownership.js
node backend/tests/test_p6_static_serving.js
node scripts/test-p6-image-contract.mjs
npm run test:production-image
```

Run: `npm run test:production-image`
Expected: PASS with all focused checks exiting 0.

- [x] **Step 3: Run related security and trust-chain regressions**

```bash
node backend/tests/test_p1_c_archive.js
node backend/tests/test_p1_c_safe_extraction.js
node backend/tests/test_p5_execution_boundary.js
node backend/tests/test_p5_artifact_completion.js
node backend/tests/test_p5_mfa_login.js
node backend/tests/test_http_integration.js
npx playwright test e2e/trust-chain.spec.js --project=chromium
```

- [x] **Step 4: Run complete project verification**

```bash
npm --prefix backend test
npm --prefix frontend run test:unit
npm --prefix frontend run build
npx playwright test --project=chromium
```

- [x] **Step 5: Perform the security/operability review**

Review the final diff for these blocking conditions:

- any Docker/CI `npm install` or `npm ci ||` fallback,
- any production Dockerfile outside repository root,
- any `frontend/node_modules` lookup from backend/tests,
- any production process running as root,
- any SPA fallback swallowing `/api`, `/ws`, probes, or missing assets,
- any unbounded cache on `index.html` or non-immutable cache on fingerprinted assets,
- any production path outside the two declared persistence roots,
- any plaintext public production URL or untrusted proxy header acceptance,
- any client-side ZIP creation,
- any bypass of P5 sandbox, artifact evidence, download, or MFA authority.

- [x] **Step 6: Write immutable evidence and update continuity**

Create `implementation-evidence/P6.md` containing:

- P6 goal and approved design/plan paths,
- Task commit IDs and reviewer verdicts,
- every command from Steps 1–4 with exact exit code and observed counts,
- image digest/tag, non-root identity, lock-mismatch rejection, volume/layout assertions,
- HTTPS proxy, SPA/cache, API, WebSocket, ZIP clean-room, verified download, digest, and restart-persistence observations,
- security review results and fixed findings,
- final status `verified` only when every required gate passed.

Then:

- Mark P6 and its tasks complete in `guncel-todo.md`.
- Preserve P0–P5 history and point superseding status to the P6 plan/evidence.
- Add P6 as the verified unit in `00-MASTER-EXECUTION-PLAN.md`.
- Update `PROJECT-CONTINUITY.md` to `current_unit: P6`, `current_plan: implementation-plans/11-P6-production-operability.md`, `status: verified`, `evidence_file: implementation-evidence/P6.md`, and exact next action `Plan P7 canonical repository and disk reconciliation from guncel-todo.md; do not implement P7 source changes before its design/plan is approved.`
- [x] **Step 7: Verify continuity GREEN**

```bash
node scripts/validate-continuity.mjs
```

- [x] **Step 8: Commit Task 5**

```bash
git add implementation-evidence/P6.md guncel-todo.md PROJECT-CONTINUITY.md yol-haitasi-todo.md implementation-plans/00-MASTER-EXECUTION-PLAN.md implementation-plans/11-P6-production-operability.md scripts/validate-continuity.mjs
git commit -m "docs: record verified P6 production operability"
- [x] **Step 9: Stop at the delivery boundary**

Do not implement P7 source changes. The exact next action is to brainstorm and write the P7 canonical repository/disk-reconciliation design and implementation plan.

## P6 Exit Gate

- [x] Backend owns JSZip and no backend/test path resolves frontend dependencies.
- [x] Exact backend/frontend `npm ci` installs and frontend build pass.
- [x] One non-root root image builds from a clean context; lock mismatch fails closed.
- [x] UI, API, authenticated WebSocket, probes, and verified download work through one HTTPS origin.
- [x] SPA fallback and cache headers match the approved routing contract.
- [x] `/readyz` verifies database, both persistence roots, and production SPA entry.
- [x] ZIP creation and safe clean-room extraction work inside the production image.
- [x] Data and verified artifacts survive container replacement with the two mounted roots.
- [x] P5 execution, artifact identity, download authorization, and MFA regressions pass.
- [x] Full backend, frontend unit/build, and Playwright suites pass.
- [x] Independent reviewer returns no blocking finding.
- [x] `implementation-evidence/P6.md` records exact commands, exits, image identity, and observations.
- [x] `node scripts/validate-continuity.mjs` passes with P6 current/verified.
- [x] `implementation-evidence/P6.md` records exact commands, exits, image identity, and observations.
- [x] `node scripts/validate-continuity.mjs` passes with P6 current/verified.
