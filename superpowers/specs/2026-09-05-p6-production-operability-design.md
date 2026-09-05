# P6 Production Operability Design

## Goal

Make one reproducible production image the canonical deployment artifact for XFactor. The image must serve the React UI, REST API, authenticated WebSocket, health probes, and verified artifact downloads through one HTTPS reverse-proxy origin while keeping SQLite, generated projects, and artifacts durable across container replacement.

## Scope

P6 owns production dependency installation, image construction, static frontend serving, reverse-proxy behavior, persistent path wiring, backend ZIP ownership, and clean-image smoke verification.

P6 does not add Windows Job Objects, sandbox resource limits, MFA enrollment, an external database, object storage, multiple production topologies, or the P7 repository/disk-reconciliation redesign. Generated commands remain subject to P5's capability-proven sandbox boundary.

## Canonical Deployment Contract

The repository root `Dockerfile` is the only production image definition. It uses `node:22.5.0-alpine` stages and npm `10.8.2`, matching the repository package-manager and engine policy.

The build has three stages:

1. A frontend dependency/build stage copies `frontend/package.json` and `frontend/package-lock.json`, runs `npm ci --ignore-scripts`, copies frontend sources, and runs `npm run build`.
2. A backend dependency stage copies `backend/package.json` and `backend/package-lock.json`, then runs `npm ci --omit=dev --ignore-scripts`.
3. A runtime stage copies backend production dependencies and sources, required runtime documentation, and the compiled `frontend/dist`. It runs as the existing non-root `xfactor` user and exposes only port `8000`.

No Dockerfile or CI command may fall back from `npm ci` to `npm install`. A missing, stale, or incompatible lockfile fails the build. The standalone backend and frontend Dockerfiles are removed so they cannot advertise an untested second production topology.

An external reverse proxy terminates TLS. It connects to the application over loopback HTTP, preserves the public `Host`, forwards `X-Forwarded-Proto: https`, and supports WebSocket upgrade forwarding. Production runtime requires:

- `NODE_ENV=production`
- `TRUST_PROXY=loopback`
- `ALLOWED_ORIGINS` containing only the public HTTPS origin or origins
- `DB_PATH=/app/backend/data/projects.db`
- `PROJECTS_ROOT=/app/projects`
- `ARTIFACTS_ROOT=/app/backend/data/artifacts`

The container declares `/app/backend/data` and `/app/projects` as persistent volumes. P6 retains these existing storage domains rather than introducing the unified data-root migration reserved for later architecture work.

## Backend Dependency and Path Ownership

`jszip` becomes a production dependency of `backend/package.json` and `backend/package-lock.json`. It is removed from the frontend manifest and lockfile because browser code no longer creates ZIP files.

`backend/utils/archive.js`, `backend/verification/safeExtractor.js`, and backend tests import `jszip` directly from backend dependency resolution. They do not use `createRequire` fallback chains and never read `frontend/node_modules`.

Artifact paths resolve through one backend path helper. `ARTIFACTS_ROOT` is validated as an absolute production path and defaults to the repository's existing `backend/data/artifacts` location outside production. `createProjectZip` uses that helper unless a test explicitly injects an isolated artifact directory. This removes dependence on process working directory without redesigning artifact persistence.

## Static UI Serving and Request Routing

A focused backend module owns production frontend serving. It accepts an Express app and an explicit distribution root, validates that `index.html` is readable, and mounts the following behavior only when `NODE_ENV=production`:

1. Existing `/healthz`, `/readyz`, HTTPS enforcement, CORS, authentication, `/api`, and `/ws/logs` boundaries retain authority.
2. Existing API and artifact routes run before static middleware.
3. Files under the distribution root are served without directory traversal or implicit HTML fallback.
4. Fingerprinted assets under `/assets/` receive `Cache-Control: public, max-age=31536000, immutable`.
5. `index.html` receives `Cache-Control: no-cache` so deployments are discovered promptly.
6. SPA fallback returns `index.html` only for `GET` or `HEAD` requests that accept HTML and whose path is not `/api`, `/api/*`, `/ws`, `/ws/*`, `/healthz`, `/readyz`, or a filename-like path containing an extension.
7. Unknown API routes remain JSON 404 responses. Missing assets remain 404 responses and never receive the SPA shell.

The production frontend uses its browser origin as the API origin. `buildWebSocketUrl` derives `wss:` from that same HTTPS API origin. Session cookies, CSRF origin checks, CORS, WebSocket origin checks, and verified artifact downloads therefore share one public authority.

## Health, Readiness, and Failure Behavior

`/healthz` remains an unauthenticated internal liveness probe and reports only process liveness.

`/readyz` returns `200` only when all production prerequisites are usable:

- SQLite responds to a probe query.
- `PROJECTS_ROOT` exists and is accessible.
- `ARTIFACTS_ROOT` exists and is accessible.
- In production, the compiled frontend entry exists and is readable.

A missing production frontend entry fails startup before the listener accepts traffic. A missing backend `jszip` dependency fails module loading. Invalid proxy/origin/storage configuration fails runtime validation with a concrete configuration error. Direct production application requests without trusted HTTPS forwarding retain the existing `426 HTTPS_REQUIRED` behavior. Probe endpoints remain available over loopback HTTP for the container runtime and reverse proxy.

API errors retain JSON responses and request IDs. Static-serving errors do not expose filesystem paths.

## Request and Artifact Flow

A browser connects to the public HTTPS reverse proxy. The proxy forwards UI, API, WebSocket, and download requests to port `8000` in one origin. Express serves the SPA for eligible navigation, authenticates API and WebSocket requests with the existing session cookie, and authorizes artifact downloads with P5's canonical contract/artifact/verification evidence.

ZIP creation loads backend-owned `jszip`, writes the archive beneath `ARTIFACTS_ROOT`, persists canonical artifact metadata, and returns its identity. Clean-room extraction loads the same backend dependency, applies existing traversal/symlink/count/size/ratio checks, and writes only beneath an injected isolated extraction root. Neither path depends on frontend packages.

## Verification Strategy

### Focused dependency tests

Backend tests run with frontend dependencies absent and prove:

- `jszip` resolves from backend production dependencies.
- Project ZIP creation writes beneath an isolated injected artifact root and records the expected hash and manifest.
- Safe extraction rejects traversal, symlink, file-count, decompressed-size, and compression-ratio attacks and accepts a valid archive.
- No production or test import contains a `frontend/node_modules` fallback.

Manifest/lock tests prove `jszip` exists in the backend lock graph and is absent from the frontend lock graph.

### Static-serving integration tests

An actual Express HTTP server with a temporary frontend distribution verifies:

- `/`, a nested SPA route, and `HEAD` navigation return the SPA shell.
- `index.html` is `no-cache`.
- a fingerprinted asset is immutable for one year.
- unknown API routes return JSON 404, not HTML.
- missing assets and extension-bearing paths return 404.
- `/healthz` and `/readyz` retain their route semantics.
- production startup/readiness fails when the SPA entry or required persistent root is unavailable.

### Clean production-image smoke

A repository script builds the root Dockerfile from a clean context with no host `node_modules` or `dist`. It starts the image as its declared non-root user with temporary mounts at `/app/backend/data` and `/app/projects`.

The harness injects a test-only TLS reverse proxy in the application's network namespace. This preserves the canonical topology: TLS terminates outside the application process, while the backend observes a loopback trusted proxy and `X-Forwarded-Proto: https`.

The smoke test drives the real HTTPS surface and proves:

- `/healthz` and `/readyz` become healthy.
- the root UI and a deep SPA route render.
- REST requests stay under `/api` and unknown API routes remain JSON.
- an authenticated WebSocket upgrades through the proxy.
- backend ZIP creation and clean-room extraction run inside the image without frontend dependencies.
- an unverified artifact is unavailable and a verified artifact downloads through the server-authorized endpoint.
- the downloaded filename ends in `.zip` and its digest matches canonical evidence.
- image inspection confirms the process is non-root, backend `jszip` resolves, frontend `node_modules` is absent, and only the two declared persistence roots hold mutable durable state.

CI runs focused backend/frontend tests, the production frontend build, the clean root image build, and the production-image smoke. Docker-unavailable local environments may skip only the local smoke command; CI and P6 verification evidence may not mark the unit verified unless the real image smoke passes.

## Acceptance Criteria

- One root production image serves UI, API, WebSocket, probes, and verified downloads through one public HTTPS origin.
- Backend ZIP creation and safe extraction work with frontend dependencies absent.
- All installs use exact lockfiles through `npm ci`; no install fallback remains.
- SPA fallback and cache headers obey the explicit routing rules above.
- The runtime is non-root and persists `/app/backend/data` and `/app/projects`.
- Health/readiness and trusted reverse-proxy behavior pass real process tests.
- A clean production image creates, extracts, authorizes, and downloads artifact ZIPs.
- P5 fail-closed sandbox and canonical artifact evidence rules remain unchanged.
- P6 receives `verified` status only after focused tests, full regressions, production image build, real image smoke, independent review, and immutable evidence all pass.
