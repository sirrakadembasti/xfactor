# Task 3 Report — Deterministic Production Image

## Changed files

- `Dockerfile` — sole three-stage Node `22.5.0-alpine` production image with lockfile-only installs, non-root `xfactor` runtime, canonical storage environment, volumes, port, and healthcheck.
- `.dockerignore` — excludes backend tests, local data, logs, coverage, databases, logs, dependencies, and frontend build output from the context while retaining runtime source.
- `.github/workflows/ci.yml` — replaces both install fallbacks with `npm ci` and adds the production-image contract job.
- `scripts/test-p6-image-contract.mjs` — real Docker contract test using clean Git-tracked contexts, UUID-scoped resources, and `try/finally` cleanup.
- `backend/Dockerfile` — removed.
- `frontend/Dockerfile` — removed.

## RED evidence

Command:

```text
node scripts/test-p6-image-contract.mjs
```

Exit code: `1`

Exact relevant output:

```text
AssertionError [ERR_ASSERTION]: clean production image build failed with exit 1
ERROR: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.

1 !== 0
```

## GREEN image-contract evidence

Command:

```text
node scripts/test-p6-image-contract.mjs
```

Exit code: `1` (BLOCKED before Docker can start the clean build)

Exact relevant output:

```text
AssertionError [ERR_ASSERTION]: clean production image build failed with exit 1
ERROR: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.

1 !== 0
```

Docker is unavailable, so no source-text substitute was used and real clean-image, runtime, or lock-mismatch Docker behavior could not be observed. The contract script removes both UUID-tagged images and both temporary clean contexts in `finally`, including on this failure path.

## Focused package/build regressions

| Command | Exit | Exact output |
| --- | --- | --- |
| `npm --prefix backend ci --ignore-scripts` | `0` | `added 94 packages in 41s` |
| `npm --prefix frontend ci --ignore-scripts` | `0` | `npm warn deprecated whatwg-encoding@3.1.1: Use @exodus/bytes instead for a more spec-conformant and faster implementation` followed by `added 305 packages in 4m` |
| `npm --prefix frontend run build` | `0` | `✓ 1710 modules transformed.`; `✓ built in 14.30s` |
| `node backend/tests/test_p6_archive_ownership.js` | `0` | `[PASS] backend resolves, creates, and writes artifacts at the configured canonical root`; `[PASS] production artifact roots require an absolute explicit configuration`; `[PASS] ZIP creation and extraction use backend JSZip without frontend dependencies`; `🎉 Testler Tamamlandı: 3 BAŞARILI, 0 HATALI` |
| `node backend/tests/test_p6_static_serving.js` | `0` | `P6 static serving tests passed` |

The archive regression also emitted Node's experimental SQLite warning; it exited `0`.

## Self-review

- Root Dockerfile is the only remaining Dockerfile and uses the exact frontend and backend lockfiles with `npm ci` only.
- The runtime has `/app/backend`, backend production `node_modules`, `/app/frontend/dist`, `/app/docs`, and `/app/projects`; it initializes `/app/backend/data/artifacts` and runs as non-root `xfactor`.
- Runtime defaults are `PORT=8000`, `HOST=0.0.0.0`, `DB_PATH=/app/backend/data/projects.db`, `PROJECTS_ROOT=/app/projects`, and `ARTIFACTS_ROOT=/app/backend/data/artifacts`.
- The contract performs behavior-based inspect/run/build assertions for identity, port, healthcheck, volumes, environment, backend JSZip, SPA layout without frontend dependencies, and an intentionally stale backend lockfile.
- CI contains no `npm ci || npm install` fallback and invokes the Docker contract in its dedicated job.

## Docker-enabled contract evidence

After Docker Desktop Linux engine became available, `node scripts/test-p6-image-contract.mjs` was rerun.

Exit code: `1`

Exact failure:

```text
#10 [frontend-builder 4/6] RUN npm ci --ignore-scripts
#10 39.11 npm error Exit handler never called!
#10 DONE 66.9s

#17 [frontend-builder 6/6] RUN npm run build
#17 0.686 sh: vite: not found
#17 ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 127
```

This is a reproducible defect in the exact required `node:22.5.0-alpine` image, not an install fallback or image-contract assertion defect. The preserved npm debug log reports `node v22.5.0`, `npm v10.8.2`, `verbose exit 0`, then `error Exit handler never called!` before dependency reification completes. npm/cli issue [#7666](https://github.com/npm/cli/issues/7666) documents this exact Node 22.5.0/npm 10.8.2 Docker `npm ci` failure; its documented workaround is a Node downgrade, which would violate this task's exact `Node 22.5.0 Alpine` requirement.

Independent Docker reproductions using npm `10.7.0`, `10.8.2`, `10.8.3`, and `10.9.2`, plus `npm_config_maxsockets=1`, all produced the same failure. The disposable `p6-npm-debug` diagnostic container was removed with exit `0`; the image-contract script's UUID-tagged images and temporary contexts are cleaned in `finally`.

## Remaining concern

The real Docker build cannot progress to runtime, JSZip, layout, healthcheck, or lock-mismatch assertions while the pinned Node `22.5.0` defect remains. No version change was made because that would conflict with the required image contract.
