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

- [ ] **Step 1: Write the failing backend ownership test**

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

- [ ] **Step 2: Run the new test and record RED**

Run:

```bash
node backend/tests/test_p6_archive_ownership.js
```

Expected: FAIL because `backend/artifactPaths.js` does not exist, backend does not own `jszip`, frontend still owns it, or archive/extractor resolution falls back to `frontend/node_modules`.

- [ ] **Step 3: Move the dependency with lockfile-safe npm commands**

Run:

```bash
npm --prefix backend install --save-exact jszip@3.10.1
npm --prefix frontend uninstall jszip
```

Confirm `backend/package.json` and `backend/package-lock.json` contain JSZip 3.10.1 and `frontend/package.json`/lock no longer contain the package in their dependency graph. Do not hand-edit lockfile integrity fields.

- [ ] **Step 4: Add canonical artifact-root resolution**

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


- [ ] **Step 5: Remove every frontend dependency fallback**

In `backend/utils/archive.js` and `backend/verification/safeExtractor.js`, replace `createRequire` and fallback resolution with:

```js
import JSZip from 'jszip';
```

Use `new JSZip()` for creation and `JSZip.loadAsync(...)` for extraction. Update the three P1-C tests to import `jszip` directly from the backend package context; no test may require `../../frontend/node_modules/jszip`.

- [ ] **Step 6: Run focused GREEN and regressions**

Run:

```bash
node backend/tests/test_p6_archive_ownership.js
node backend/tests/test_p1_c_archive.js
node backend/tests/test_p1_c_artifact_verifier.js
node backend/tests/test_p1_c_safe_extraction.js
```

Expected: all exit 0; ZIP creation/extraction passes with frontend dependencies unavailable.

- [ ] **Step 7: Commit Task 1**

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
- Produces: API not-found response `{ error: 'API endpoint bulunamadı.', code: 'NOT_FOUND', requestId }` with HTTP 404.

- [ ] **Step 1: Write failing static-serving integration tests**

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

Register the suite after Task 1's P6 suite.

- [ ] **Step 2: Run the static test and record RED**

```bash
node backend/tests/test_p6_static_serving.js
```

Expected: FAIL because `productionStatic.js` and production static routing do not exist.

- [ ] **Step 3: Implement the focused static-serving module**

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

Set headers by resource type. Resolve and verify every served path beneath `distRoot`; never include filesystem paths in HTTP error bodies. `assertProductionFrontendAvailable` checks `index.html` before server startup.

- [ ] **Step 4: Wire production routing in authoritative order**

In `backend/server.js`:

1. Keep probes before HTTPS enforcement.
2. Keep HTTPS/CORS/CSRF/rate limits and all `/api` routers unchanged in authority.
3. Add an `/api` JSON 404 handler after API routers.
4. Mount production static behavior after the API handler.
5. Keep the global JSON error handler last.
6. Await `assertProductionFrontendAvailable` before `server.listen` in production.

Use `getArtifactsRoot`/`assertArtifactsRootAvailable` in readiness. Do not make `/healthz` depend on disk or database state.

- [ ] **Step 5: Extend runtime config validation**

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

Return the normalized values. Preserve the existing `TRUST_PROXY=loopback` and HTTPS-origin checks.

- [ ] **Step 6: Extend lifecycle/readiness coverage**

Update `test_health_and_lifecycle.js` to create temporary frontend/data/projects/artifacts roots and start the real server with production configuration plus `X-Forwarded-Proto: https` where required. Assert readiness reports 200 when all roots exist, 503 when a required root becomes inaccessible, and startup exits nonzero when `index.html` is absent. Keep graceful SIGTERM coverage.

- [ ] **Step 7: Run focused GREEN and regressions**

```bash
node backend/tests/test_p6_static_serving.js
node backend/tests/test_health_and_lifecycle.js
node backend/tests/test_http_integration.js
node backend/tests/test_p2_security_auth.js
node backend/tests/test_p5_mfa_login.js
```

Expected: all exit 0; API/SPA route precedence and production proxy rules remain intact.

- [ ] **Step 8: Commit Task 2**

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
- Produces `node scripts/test-p6-image-contract.mjs` with optional `P6_IMAGE_TAG` and deterministic cleanup.

- [ ] **Step 1: Write the failing image-contract smoke script**

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
```

- [ ] **Step 2: Run image contract and record RED**

```bash
node scripts/test-p6-image-contract.mjs
```

Expected: FAIL because the current image has fallback installs, lacks backend-owned JSZip/runtime storage declarations, or does not satisfy the canonical layout.

If Docker is unavailable, report BLOCKED. Do not replace the real image test with source inspection.

- [ ] **Step 3: Rewrite the root Dockerfile as the sole production artifact**

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

Copy only runtime-required files; if broad `COPY backend/ ./` is retained, `.dockerignore` must exclude backend tests, local databases, logs, and transient outputs without excluding runtime modules.

- [ ] **Step 4: Remove alternate production Dockerfiles and fallback CI installs**

Delete `backend/Dockerfile` and `frontend/Dockerfile`. In CI, both frontend and backend installs use `npm ci` only. Add a production image-contract job or step that invokes `node scripts/test-p6-image-contract.mjs`; install Playwright only in the later browser-smoke task.

- [ ] **Step 5: Run image-contract GREEN**

```bash
node scripts/test-p6-image-contract.mjs
```

Expected: exit 0; clean image builds, runtime is non-root, backend JSZip resolves, SPA output exists, frontend dependencies are absent, volumes/healthcheck are declared, and lock mismatch fails.

- [ ] **Step 6: Run package/build regressions**

```bash
npm --prefix backend ci --ignore-scripts
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
node backend/tests/test_p6_archive_ownership.js
node backend/tests/test_p6_static_serving.js
```

Expected: all exit 0 from exact lockfiles.

- [ ] **Step 7: Commit Task 3**

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
- Uses a test-only TLS reverse proxy sharing the application container network namespace; application runtime remains one process and one image.

- [ ] **Step 1: Write the failing production browser journey**

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

Log in through the real UI, assert the application establishes an authenticated WebSocket through `wss:`, and verify the downloaded SHA-256 equals the fixture receipt. Assert an unverified project has no download control.

- [ ] **Step 2: Create the in-container seed and ZIP proof**

Create `scripts/p6-container-seed.mjs`. It runs inside the application container with isolated mounted storage. Import backend modules by absolute file URL, create a normal user, an unverified project, and a completed project with:

- latest approved contract,
- verified artifact created by `createProjectZip`,
- all mandatory P5 PASS checks,
- matching artifact file/hash,
- completion receipt tied to the same run/artifact.

Call `safeExtractZip` into a clean-room directory under a temporary non-durable path and assert extracted bytes match the source. Print exactly one JSON object containing the fixture interface; never print password hashes, session tokens, or TOTP secrets.

- [ ] **Step 3: Write the production-image orchestrator**

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

The proxy is test infrastructure only; do not copy it or certificates into the application image.

- [ ] **Step 4: Run browser smoke and record RED**

```bash
npm run test:production-image
```

Expected before the complete harness/runtime wiring: FAIL because the current production image cannot satisfy same-origin HTTPS SPA/API/WebSocket/download and persistent ZIP operations.

If Docker or Chromium is unavailable, report BLOCKED. P6 cannot be verified from mocked networking.

- [ ] **Step 5: Complete the minimal harness and run GREEN**

Run:

```bash
npx playwright install chromium
npm run test:production-image
```

Expected: exit 0 with explicit observations for health/readiness, SPA deep route, JSON API 404, authenticated WebSocket, backend ZIP create/extract, unverified denial, verified download/digest, non-root runtime, and persistence across container replacement.

- [ ] **Step 6: Add the real smoke to CI**

Add a CI step after the deterministic image contract. It installs Chromium, runs `npm run test:production-image`, and uploads Playwright traces only on failure. Do not allow the step to continue on error.

- [ ] **Step 7: Run focused regressions**

```bash
npx playwright test e2e/trust-chain.spec.js --project=chromium
node backend/tests/test_p5_artifact_completion.js
node backend/tests/test_p5_mfa_login.js
node backend/tests/test_http_integration.js
```

Expected: all exit 0; P5 verified-only downloads and MFA remain intact.

- [ ] **Step 8: Commit Task 4**

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
- Produces: immutable P6 evidence receipt and continuity pointer to P7; no new source behavior.

- [ ] **Step 1: Register P6 in a deliberate validator RED state**

Add `P6` to `UNIT_IDS`, `UNIT_PLANS`, and `UNIT_DEPENDENCIES` with dependency `['P5']`. Add an unchecked P6 row to the roadmap/master ledgers. Do not create `implementation-evidence/P6.md` yet.

Run:

```bash
node scripts/validate-continuity.mjs
```

Expected: FAIL specifically because the registered P6 evidence file is absent or P6 is not verified.

- [ ] **Step 2: Run all P6 focused checks**

```bash
node backend/tests/test_p6_archive_ownership.js
node backend/tests/test_p6_static_serving.js
node scripts/test-p6-image-contract.mjs
npm run test:production-image
```

Expected: every command exits 0 with explicit behavior observations.

- [ ] **Step 3: Run related security and trust-chain regressions**

```bash
node backend/tests/test_p1_c_archive.js
node backend/tests/test_p1_c_safe_extraction.js
node backend/tests/test_p5_execution_boundary.js
node backend/tests/test_p5_artifact_completion.js
node backend/tests/test_p5_mfa_login.js
node backend/tests/test_http_integration.js
npx playwright test e2e/trust-chain.spec.js --project=chromium
```

Expected: every command exits 0.

- [ ] **Step 4: Run complete project verification**

```bash
npm --prefix backend test
npm --prefix frontend run test:unit
npm --prefix frontend run build
npx playwright test --project=chromium
```

Expected: all backend suites, frontend unit tests/build, and browser tests exit 0.

- [ ] **Step 5: Perform the security/operability review**

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

A blocking match must be fixed and all affected checks rerun before evidence is written.

- [ ] **Step 6: Write immutable evidence and update continuity**

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
- Mark this plan's task and exit-gate checkboxes complete only after their evidence exists.

- [ ] **Step 7: Verify continuity GREEN**

```bash
node scripts/validate-continuity.mjs
```

Expected: PASS with P6 current/verified, plan/evidence hashes consistent, dependency P5 verified, and P7 planning as the exact next action.

- [ ] **Step 8: Commit Task 5**

```bash
git add implementation-evidence/P6.md guncel-todo.md PROJECT-CONTINUITY.md yol-haitasi-todo.md implementation-plans/00-MASTER-EXECUTION-PLAN.md implementation-plans/11-P6-production-operability.md scripts/validate-continuity.mjs
git commit -m "docs: record verified P6 production operability"
```

- [ ] **Step 9: Stop at the delivery boundary**

Do not implement P7 source changes. The exact next action is to brainstorm and write the P7 canonical repository/disk-reconciliation design and implementation plan.

## P6 Exit Gate

- [ ] Backend owns JSZip and no backend/test path resolves frontend dependencies.
- [ ] Exact backend/frontend `npm ci` installs and frontend build pass.
- [ ] One non-root root image builds from a clean context; lock mismatch fails closed.
- [ ] UI, API, authenticated WebSocket, probes, and verified download work through one HTTPS origin.
- [ ] SPA fallback and cache headers match the approved routing contract.
- [ ] `/readyz` verifies database, both persistence roots, and production SPA entry.
- [ ] ZIP creation and safe clean-room extraction work inside the production image.
- [ ] Data and verified artifacts survive container replacement with the two mounted roots.
- [ ] P5 execution, artifact identity, download authorization, and MFA regressions pass.
- [ ] Full backend, frontend unit/build, and Playwright suites pass.
- [ ] Independent reviewer returns no blocking finding.
- [ ] `implementation-evidence/P6.md` records exact commands, exits, image identity, and observations.
- [ ] `node scripts/validate-continuity.mjs` passes with P6 current/verified.
