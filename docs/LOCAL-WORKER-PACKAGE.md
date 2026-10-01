# Local worker package

The worker supports the explicitly selected **local-trusted** profile. **OS isolation=false**: generated project code executes with the operator's account privileges. Use a dedicated account/machine for trusted code. This profile is not a sandbox and never automatically falls back to Docker.

## Prepare the reviewed repository

Use Node **22.23.2**, npm **10.9.8**, Playwright Core **1.62.1**, and the Chromium revision supplied by that Playwright release. No Python installation is required. Select operator-owned tools with absolute paths:

| Variable | Default |
| --- | --- |
| `XFACTOR_LOCAL_NODE` | Current Node executable |
| `XFACTOR_LOCAL_NPM_CLI` | Node-adjacent `node_modules/npm/bin/npm-cli.js` or `../lib/node_modules/npm/bin/npm-cli.js` |
| `XFACTOR_LOCAL_PLAYWRIGHT` | Repository `execution/node_modules/playwright-core/index.mjs` |
| `XFACTOR_LOCAL_CHROMIUM` | Matching installed Playwright headless-shell revision; otherwise Playwright's full Chromium executable |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright browser cache; optional during setup/packaging |

`node scripts/setup-local-worker.mjs` checks installed tools without changing them. With explicit authorization for dependency/browser downloads, run `node scripts/setup-local-worker.mjs --install`. It runs `npm ci --ignore-scripts` only against the reviewed backend/execution lockfiles, then installs Chromium. It does not install untrusted generated projects or global packages. It does not modify admin users or passwords. Linux machines must provide the system libraries required by Chromium; no privileged package installation is performed automatically.

## Produce and launch a package

Run `node scripts/package-local-worker.mjs --output dist/local-worker` with a new output directory. The directory contains the Node executable, complete npm installation, Playwright, the complete Chromium installation directory, execution/backend source and dependencies, and a per-file SHA256 manifest recording platform, architecture, and tool versions. Repository `.env`, data, tests, admin scripts, credentials and workspaces are excluded. A partially produced package fails integrity validation; choose a new destination after correcting the error.

Copy the entire directory to a machine with the same OS and architecture. Run `start-worker.cmd` on Windows or `./start-worker.sh` on Linux/macOS, including from paths containing spaces. Launchers use bundled tools and validate all file hashes, tool presence and pinned versions before starting. Keep the package directory read-only for the worker account after installation. Before launching Chromium, the launcher copies its manifest-verified files into a unique `browser-runtime-*` directory under the worker state directory and verifies the copied hashes. All browser probes and jobs use this mutable copy, because Windows browser child processes may create early log files beside their executable despite logging flags. Startup costs one browser-directory copy and requires that additional disk space. Normal startup failures and worker shutdown remove the owned copy; an abrupt launcher/process crash may leave a directory for operator cleanup. Browser logs/crash artifacts are excluded from the source package, and the complete immutable manifest is checked again by the acceptance test after real jobs. SHA256 checks detect corruption; they do not authenticate a maliciously replaced package and manifest. Obtain the package from a trusted source.

Windows Chromium's own sandbox needs read/execute access for `S-1-15-2-1` and `S-1-15-2-2` on its installed browser files. Packaging probes and launch prepare these permissions only inside their owned mutable runtime browser copy, after successful source and copy integrity validation. The directory's owner must be able to update its ACL. A permissions error blocks startup and identifies this requirement. Source operator browser installations, immutable bundle files and application data permissions are never changed. Chromium's sandbox remains enabled; this browser protection does not isolate generated Node code from the host account.

From the reviewed source checkout, `node scripts/test-local-worker-package.mjs --bundle dist/local-worker` verifies the actual bundled worker over HTTP, including authentication, manifest hashes, dependency preparation, real build/test execution, SQLite read/write, manager/viewer API permissions and all four Chromium role journeys. It uses isolated temporary state, bundled worker tools and random ports; no Docker calls are made. `--readiness-only` checks startup/authentication/trust metadata without running project jobs. The full run writes non-secret proof to `.tmp/local-worker-package-result.json` and removes owned job/state directories on exit.

The worker binds to `127.0.0.1`, defaults to port `8099`, and sets `EXECUTION_WORKER_RUNTIME=local` and `EXECUTION_WORKER_TRUST_LOCAL_CODE=1`. Change the port using `EXECUTION_WORKER_PORT`. Persistent jobs and the generated cryptographically random token live outside the package, under `~/.xfactor/local-worker`; choose another directory with `XFACTOR_LOCAL_WORKER_DATA`. On Windows restrict that directory's ACL to the worker account; Unix creation uses owner-only modes. The token is never printed. Ctrl+C requests cooperative worker shutdown over IPC, cancels active jobs and awaits their process cleanup before exit; a 60-second fallback terminates an unresponsive worker. The HTTP cancellation endpoint cancels an individual job. Readiness and job results describe the local trust profile.

## Connect XFactor

For the source checkout, install the normal backend/frontend dependencies, run `npm run worker:local:setup -- --install`, then `npm run dev:local`. The unified runner explicitly selects the local profile and shares the worker token with the backend. Plain `npm run dev` and direct `node execution/server.js` retain the Docker default. The standalone package below requires configuring the backend connection separately.

Set the XFactor backend's `EXECUTION_WORKER_URL=http://127.0.0.1:8099` and `EXECUTION_WORKER_TOKEN` to the token securely read from the state directory's `worker-token` file. Alternatively provide the same independently generated secret of at least 32 characters to both processes using `EXECUTION_WORKER_TOKEN`. Keep these values in operator configuration and out of source control/logs. Restart the backend after configuring it. This package supplies the worker; normal XFactor frontend/backend deployment configuration remains operator-owned. The bundled Node can run the existing repository backend, without changing default admin credentials.

## Verification commands

`npm --prefix execution test` runs worker unit tests without requiring Docker. `npm run test:local-worker` additionally executes the authenticated native HTTP prepare/verify roundtrip, real SQLite/API/browser gates and negative test-suite cases. `npm run test:local-worker-package -- --bundle dist/local-worker` verifies the actual standalone package. Docker integration remains explicit: `npm --prefix execution run test:docker`.

Each job owns its HOME, npm cache and temporary directories; they are removed with the job workspace. The Windows helper binary cache is separate. Windows Job Objects default to 1 GiB/100 processes for simple projects and 4 GiB/250 processes for domain applications. Operators can configure `XFACTOR_LOCAL_JOB_MEMORY_BYTES` and `XFACTOR_LOCAL_JOB_PIDS`; invalid limits fail closed. Windows 10+/Server 2016+ is required: child creation atomically assigns the Job, preventing an orphan suspended child when cancellation races with startup. Unix uses owned process groups for lifecycle cleanup; the Windows memory/process caps are not claimed on Unix. Linux Chromium system libraries and Windows PowerShell 5/.NET Framework for the first helper compilation remain OS prerequisites.

## Diagnose

Recorded Windows acceptance: 129 source worker tests passed, and the real standalone package completed its 33-check workflow, four Chromium role journeys, active-job shutdown and post-job manifest verification. See [the dated validation report](LOCAL-WORKER-VALIDATION-2026-10-01.md) for evidence and limits. This does not certify Linux/macOS runs; each target platform must pass its own CI and package acceptance.

Missing files, unexpected versions, manifest mismatches, unsupported OS/architecture, absent browser libraries or failed browser launch are blocking conditions. Repair/rebuild the package using trusted sources rather than removing checks. Backend credentials, `.env` files, saved projects and application databases must never be copied into the package. Native source and launchers cover Windows/Linux/macOS; a release is supported only after the corresponding OS/architecture CI and real prepare/verify/browser roundtrip have passed. Building/running Docker images remains a separate infrastructure check.
