# P8 CI, Security Hardening, and Operational Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the roadmap with enforceable sandbox resource limits, encrypted and rotatable MFA secrets, timing-safe login behavior, secure production connectivity, automatic session maintenance, accessible live-connection feedback, mandatory CI gates, and runtime-accurate operational documentation.

**Architecture:** Keep the P5/P6 process boundary and harden its Docker adapter instead of adding native Windows execution. Isolate MFA cryptography in `backend/crypto/mfaCrypto.js`, schedule existing session cleanup through a focused maintenance module, preserve the already-correct abort-listener cleanup with regression tests, expose WebSocket state through a small presentational component, and make CI plus operations documentation the final executable contract.

**Tech Stack:** Node.js 22.23.2, npm 10.9.8, Express 4, SQLite, AES-256-GCM, Docker/bubblewrap, React 18, Vitest, Playwright Chromium, GitHub Actions.

## Global Constraints

- Implement `superpowers/specs/2026-09-06-p8-security-operations-design.md` exactly.
- Generated code never executes on the host. Docker/bubblewrap capability proof remains mandatory; unavailable isolation returns BLOCKED.
- Docker defaults are exact: `--cpus 2.0`, `--memory 1g`, `--memory-swap 1g`, `--pids-limit 100`, `--security-opt no-new-privileges:true`, `--cap-drop ALL`, `--tmpfs /tmp:rw,noexec,nosuid,size=64m`.
- Published sandbox service ports bind only to `127.0.0.1`.
- Docker sandbox availability is OS-independent and determined by an executable Docker capability probe; Windows without Docker remains fail-closed.
- Production requires `MFA_ENCRYPTION_KEY` encoded as exactly 32 bytes; previous keys are decryption-only and successful use rotates the row to the current key.
- MFA secrets are never returned in public users, session users, logs, errors, or API JSON.
- Authentication of an unknown username performs one dummy scrypt password verification.
- Production CSP permits only `'self'` and `wss:` in `connect-src`; development retains `ws:` and `wss:`.
- Expired/revoked session cleanup runs at startup and every 3,600,000ms, and scheduler timers stop during graceful shutdown.
- Existing abort listener cleanup in `llm.js` and `workflow.js` must remain leak-free; do not duplicate listeners or abstractions.
- UI connection status is perceivable by color-independent text/ARIA semantics; `uiError` receives keyboard focus when shown.
- CI backend, frontend unit, frontend build, browser E2E, audits, and production-image gates are mandatory and fail-closed.
- Tests use isolated databases, users, keys, projects, ports, and containers. Never access `backend/data/projects.db`.
- Do not implement distributed sessions, shared object storage, a WebSocket message bus, Kubernetes, WebAuthn, or native Windows Job Objects.
- Observable behavior changes use TDD: record RED, implement minimally, record GREEN, commit, and independently review.

---

### Task 1: Enforce Sandbox Resource and Network Limits

**Files:**
- Create: `backend/tests/test_p8_sandbox_limits.js`
- Modify: `backend/verification/adapters/portableSandbox.js`
- Modify: `backend/tests/test_sandbox_adapters.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `DEFAULT_SANDBOX_LIMITS = { cpus: '2.0', memory: '1g', memorySwap: '1g', pids: '100', tmpfs: '/tmp:rw,noexec,nosuid,size=64m' }`.
- Produces: `buildDockerIsolationArgs({ port?, limits? }): string[]` shared by `execute` and `spawn`.
- Changes: Docker `isAvailable()` probes Docker on every OS; bubblewrap remains Linux-only.
- Changes: Docker capability result includes `resourceLimits: true`; unavailable Docker remains `available:false`.

**Evidence:** Append Task 1 commands, exits, cgroup observations, and loopback command evidence to `implementation-evidence/P8.md` during Task 6.

- [x] **Step 1: Write failing command and real-runtime tests**

Create `backend/tests/test_p8_sandbox_limits.js` with these observable contracts:

1. `buildDockerIsolationArgs({ port: 5173 })` includes the exact limits and `-p 127.0.0.1:5173:5173`, and contains no wildcard host binding.
2. `new PortableSandboxAdapter('docker').getCapabilities()` reports `resourceLimits:true` when Docker is available.
3. When Docker is available, execute a disposable `node:22.23.2-alpine` command inside the adapter that prints `/sys/fs/cgroup/memory.max`, `/sys/fs/cgroup/pids.max`, and `/sys/fs/cgroup/cpu.max`; assert memory ≤ 1GiB, PIDs = 100, and CPU quota represents ≤ 2 cores.
4. Simulate Windows through an injected platform/probe function and assert available Docker is accepted; a failing probe returns unavailable/BLOCKED.

Use unique container names and cleanup in `finally`. Docker-unavailable local runs may skip the cgroup case but P8 evidence/CI cannot mark verified without a real Docker run.

- [x] **Step 2: Run RED**

Run: `node backend/tests/test_p8_sandbox_limits.js`
Expected: FAIL because limit arguments, cross-platform Docker probing, and `resourceLimits:true` are absent.

- [x] **Step 3: Implement one Docker isolation-argument builder**

In `portableSandbox.js`:

```js
export const DEFAULT_SANDBOX_LIMITS = Object.freeze({
  cpus: '2.0', memory: '1g', memorySwap: '1g', pids: '100',
  tmpfs: '/tmp:rw,noexec,nosuid,size=64m'
});

export function buildDockerIsolationArgs({ port = null, limits = DEFAULT_SANDBOX_LIMITS } = {}) {
  return [
    '--cpus', limits.cpus,
    '--memory', limits.memory,
    '--memory-swap', limits.memorySwap,
    '--pids-limit', limits.pids,
    '--security-opt', 'no-new-privileges:true',
    '--cap-drop', 'ALL',
    '--tmpfs', limits.tmpfs,
    ...(port ? ['-p', `127.0.0.1:${port}:${port}`] : [])
  ];
}
```

Use it in Docker `buildServiceCommand` and `execute`; do not maintain two argument lists. Add dependency injection only for `platform` and Docker probe so tests do not monkey-patch globals.

- [x] **Step 4: Preserve bubblewrap and fail-closed behavior**

Bubblewrap keeps namespace isolation and reports `resourceLimits:true` only when its enforced limits are present. Unsupported/unavailable adapters must not spawn. Update existing adapter tests to the new exact command.

- [x] **Step 5: Run GREEN and regressions**

Run: `node backend/tests/test_p8_sandbox_limits.js && node backend/tests/test_sandbox_adapters.js && node backend/tests/test_p5_execution_boundary.js`
Expected: PASS; real cgroup values and loopback-only port binding are observed, and P5 unavailable-adapter no-spawn remains intact.

- [x] **Step 6: Commit Task 1**

```bash
git add backend/verification/adapters/portableSandbox.js backend/tests/test_p8_sandbox_limits.js backend/tests/test_sandbox_adapters.js backend/tests/test_runner.js
git commit -m "feat(p8): enforce sandbox resource and network limits"
```

---

### Task 2: Encrypt, Rotate, and Migrate MFA Secrets

**Files:**
- Create: `backend/crypto/mfaCrypto.js`
- Create: `backend/tests/test_p8_mfa_crypto.js`
- Modify: `backend/auth.js`
- Modify: `backend/routes/authRoutes.js`
- Modify: `backend/config.js`
- Modify: `backend/tests/test_p2_security_auth.js`
- Modify: `backend/tests/test_p5_mfa_login.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `getMfaEncryptionKeys(env): { current: Buffer, previous: Buffer[] }`.
- Produces: `encryptMfaSecret(plaintextHex, key): string` using `v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`.
- Produces: `decryptMfaSecret(payload, keys): { plaintext: string, keyIndex: number }`.
- Produces: `verifyUserTotp(user, token, env = process.env): boolean`; migrates plaintext/previous-key rows after successful verification.
- Keeps: `verifyTotpToken(plaintextSecret, token): boolean` pure and database-independent.
- Changes: `generateTotpSecret(userId, env = process.env)` stores encrypted data and returns plaintext once.

**Evidence:** Append Task 2 commands, exits, tamper rejection, migration, rotation, secret-projection, and timing observations to `implementation-evidence/P8.md` during Task 6.

- [x] **Step 1: Write crypto, migration, and timing RED tests**

Create `test_p8_mfa_crypto.js` with isolated DB and fixed 32-byte test keys:

- AES-GCM round trip returns original 40-character hex secret and uses a random 12-byte IV.
- Changing IV, tag, or ciphertext causes authenticated decryption failure.
- Production missing/invalid `MFA_ENCRYPTION_KEY` throws before user mutation.
- `generateTotpSecret` returns plaintext but persists only a `v1:` payload.
- Successful login with a legacy plaintext row rewrites it encrypted; invalid token leaves it unchanged.
- A row encrypted by `MFA_PREVIOUS_ENCRYPTION_KEYS` verifies and rotates to the current key.
- Login/session/public projections never include the encrypted or plaintext secret.
- Unknown username and wrong password paths both execute a scrypt verification. Use a focused injected verifier seam or deterministic call counter, not wall-clock thresholds.

- [x] **Step 2: Run RED**

Run: `node backend/tests/test_p8_mfa_crypto.js`
Expected: FAIL because crypto helpers, encrypted storage, rotation, migration, and dummy verification do not exist.

- [x] **Step 3: Implement strict key parsing and AES-GCM**

Accept exactly 64 hex chars or base64 decoding to 32 bytes. Production has no default. Development/test derives current key from JWT secret. Use `crypto.randomBytes(12)`, `createCipheriv('aes-256-gcm', ...)`, and `timingSafeEqual` only where fixed-length comparison is needed. Errors must not contain keys or secrets.

- [x] **Step 4: Wire auth enrollment, verification, migration, and timing defense**

Add `verifyUserTotp(user, token, env)` and update `authRoutes.js` to call it. Migration update must use `WHERE id = ? AND totp_secret = ?` so concurrent key rotation cannot be overwritten. Add a module-initialized dummy hash and always call the same password verifier for unknown users.

- [x] **Step 5: Run GREEN and auth regressions**

Run: `node backend/tests/test_p8_mfa_crypto.js && node backend/tests/test_p5_mfa_login.js && node backend/tests/test_p2_security_auth.js`
Expected: PASS; encrypted enrollment, tamper rejection, legacy migration, previous-key rotation, dummy verification, and P5 MFA session ordering all hold.

- [x] **Step 6: Commit Task 2**

```bash
git add backend/crypto/mfaCrypto.js backend/auth.js backend/routes/authRoutes.js backend/config.js backend/tests/test_p8_mfa_crypto.js backend/tests/test_p2_security_auth.js backend/tests/test_p5_mfa_login.js backend/tests/test_runner.js
git commit -m "feat(p8): encrypt and rotate MFA secrets"
```

---

### Task 3: Harden CSP and Schedule Session Maintenance

**Files:**
- Create: `backend/maintenance.js`
- Create: `backend/tests/test_p8_security_operations.js`
- Modify: `backend/security.js`
- Modify: `backend/server.js`
- Modify: `backend/tests/test_health_and_lifecycle.js`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- Produces: `sweepExpiredSessions(database = db, now = new Date()): { sweptCount: number }`.
- Produces: `createMaintenanceScheduler({ database?, intervalMs = 3_600_000, setTimeoutFn?, setIntervalFn?, clearTimeoutFn?, clearIntervalFn? }): { stop(): void }`.
- Changes: production CSP exact `connect-src 'self' wss:`; development exact `connect-src 'self' ws: wss:`.
- Preserves: `llm.js` and `workflow.js` abort-listener cleanup, verified by listener-count regressions.

**Evidence:** Append Task 3 commands, exits, CSP values, swept counts, timer lifecycle, and listener counts to `implementation-evidence/P8.md` during Task 6.

- [x] **Step 1: Write failing CSP/maintenance tests and listener regressions**

Create `test_p8_security_operations.js`:

- Production middleware header excludes token `ws:` while retaining `'self' wss:`; development includes both.
- Seed active, expired, recent-revoked, and old-revoked sessions; sweep removes only expired/old-revoked and returns exact count.
- Fake timer functions prove immediate startup schedule, 3,600,000ms interval, `unref()` calls, and idempotent `stop()` cleanup.
- Repeated completed/aborted `generateLLMResponse` and `checkPause` operations leave zero additional `abort` listeners. Use `events.getEventListeners(signal, 'abort')` before/after.

- [x] **Step 2: Run RED**

Run: `node backend/tests/test_p8_security_operations.js`
Expected: FAIL because production CSP still allows `ws:`, maintenance module/scheduler are absent, or listener contracts are unproved.

- [x] **Step 3: Implement maintenance module and CSP split**

Delegate session deletion to the existing auth cleanup semantics or execute the same predicate against an injected DB. Scheduler owns both timers and never starts at module import.

- [x] **Step 4: Wire scheduler lifecycle to server**

Create scheduler after server configuration, and call `maintenance.stop()` in graceful shutdown before closing HTTP/SQLite. Keep probe behavior unchanged.

- [x] **Step 5: Run GREEN and lifecycle regressions**

Run: `node backend/tests/test_p8_security_operations.js && node backend/tests/test_health_and_lifecycle.js && node backend/tests/test_p2_security_auth.js`
Expected: PASS; CSP, exact sweep predicate, timer cleanup, listener counts, and server shutdown all hold.

- [x] **Step 6: Commit Task 3**

```bash
git add backend/maintenance.js backend/security.js backend/server.js backend/tests/test_p8_security_operations.js backend/tests/test_health_and_lifecycle.js backend/tests/test_runner.js
git commit -m "feat(p8): schedule session maintenance and harden CSP"
```

---

### Task 4: Expose Accessible Connection and Error Status

**Files:**
- Create: `frontend/src/components/ConnectionStatus.jsx`
- Create: `frontend/src/components/__tests__/P8UiStatus.test.jsx`
- Modify: `frontend/src/components/Header.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Produces: `ConnectionStatus({ state })` for `connected | reconnecting | connecting | disconnected`.
- Changes: `Header` accepts `wsState` and renders text plus `role="status"`/`aria-live="polite"`.
- Changes: `uiError` alert receives programmatic focus when a new error appears; dismiss clears error and returns focus to the initiating control when available.

**Evidence:** Append Task 4 commands, exits, rendered labels, live-region semantics, focus, and dismiss behavior to `implementation-evidence/P8.md` during Task 6.

- [x] **Step 1: Write failing frontend behavior tests**

Render the focused component/Header/App with realistic props and assert:

- Connected label `Canlı bağlantı aktif`.
- Connecting/reconnecting label `Canlı bağlantı yeniden kuruluyor...`.
- Disconnected label `Canlı bağlantı kesildi`.
- Every state uses a visible text label and `role="status"`; color is not the only cue.
- A new `uiError` focuses the `role="alert"`; dismiss button is keyboard operable and removes it.

- [x] **Step 2: Run RED**

Run: `npm --prefix frontend run test:unit -- --run src/components/__tests__/P8UiStatus.test.jsx`
Expected: FAIL because the status component/labels and focus behavior do not exist.

- [x] **Step 3: Implement minimal component and wiring**

Use an exhaustive state map, no decorative-only semantics, and pass `wsState` from App to Header. Add an alert ref/effect; do not restructure App's WebSocket state machine.

- [x] **Step 4: Run GREEN and frontend regressions**

Run: `npm --prefix frontend run test:unit -- --run src/components/__tests__/P8UiStatus.test.jsx && npm --prefix frontend run test:unit`
Expected: PASS with accessible status/focus behavior and all existing frontend tests.

- [x] **Step 5: Commit Task 4**

```bash
git add frontend/src/components/ConnectionStatus.jsx frontend/src/components/Header.jsx frontend/src/App.jsx frontend/src/components/__tests__/P8UiStatus.test.jsx
git commit -m "feat(p8): expose accessible live connection status"
```

---

### Task 5: Make CI and Operations Documentation Authoritative

**Files:**
- Create: `docs/OPERATIONS.md`
- Create: `backend/tests/test_p8_ci_contract.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `backend/tests/test_runner.js`

**Interfaces:**
- CI `test` job produces mandatory backend, frontend unit/build, and Chromium E2E verdicts.
- CI audits are bounded by `timeout 60s` and failures remain blocking.
- `production-image` declares `needs: test`.
- Operations guide defines current single-node boundary and explicit horizontal-scaling prerequisites.

**Evidence:** Append Task 5 commands, exits, parsed CI job/step assertions, and documentation/runtime parity review to `implementation-evidence/P8.md` during Task 6.

- [x] **Step 1: Write failing CI contract test**

Create a behavioral YAML parse/structure test that asserts:

- Test job installs backend, frontend, and root dependencies with `npm ci`.
- Audits for backend/frontend each have 60-second process bounds and are blocking.
- Frontend `test:unit`, frontend build, and root `test:e2e`/Chromium are present in the required test job.
- Production-image job has `needs: test` and no `continue-on-error`.

Do not use brittle whole-file string equality; parse YAML or inspect normalized job/step objects.

- [x] **Step 2: Run RED**

Run: `node backend/tests/test_p8_ci_contract.js`
Expected: FAIL because frontend unit/root E2E/audit bounds/job dependency are absent.

- [x] **Step 3: Update CI fail-closed gates**

Install root and frontend dependencies before their tests. Use GNU `timeout 60s npm audit --audit-level=high`. Run `npm --prefix frontend run test:unit`, build, install Chromium, and `npm run test:e2e`. Keep production smoke after `needs:test`.

- [x] **Step 4: Synchronize README and create operations guide**

Document only observed behavior: two-step RFC 6238 MFA, AES-GCM secret envelope/key rotation, container-only generated execution and exact limits, server-authorized verified ZIP downloads, persistent volumes, reverse proxy/TLS contract, maintenance interval, and current single-node limitation. Horizontal scaling prerequisites: shared SQL database, shared projects/artifacts, distributed sessions, and pub/sub WebSocket fanout.

- [x] **Step 5: Run GREEN and documentation checks**

Run: `node backend/tests/test_p8_ci_contract.js && node backend/tests/test_docs_agent_sync.js && node scripts/validate-continuity.mjs`
Expected: PASS; CI graph and documentation references match runtime and continuity remains valid.

- [x] **Step 6: Commit Task 5**

```bash
git add .github/workflows/ci.yml README.md docs/OPERATIONS.md backend/tests/test_p8_ci_contract.js backend/tests/test_runner.js
git commit -m "ci(p8): require complete tests and document operations"
```

---

### Task 6: Verify and Record P8

**Files:**
- Create: `implementation-evidence/P8.md`
- Modify: `guncel-todo.md`
- Modify: `PROJECT-CONTINUITY.md`
- Modify: `yol-haitasi-todo.md`
- Modify: `implementation-plans/00-MASTER-EXECUTION-PLAN.md`
- Modify: `implementation-plans/13-P8-security-operations.md`
- Modify: `scripts/validate-continuity.mjs`

**Interfaces:**
- Consumes reviewed Task 1–5 commits and exact verification output.
- Produces final immutable P8 evidence and closes the P0–P8 roadmap; no P9 source action is invented.

**Evidence:** This task creates `implementation-evidence/P8.md`; no P8 checkbox/status becomes verified before every mandatory gate passes.

- [x] **Step 1: Register deliberate continuity RED**

Add P8 to validator IDs/plans/dependencies with `P8:['P7']`, add unchecked roadmap/master rows, and do not create P8 evidence yet.

Run: `node scripts/validate-continuity.mjs`
Expected: FAIL specifically because `implementation-evidence/P8.md` is absent/unverified.

- [x] **Step 2: Run focused P8 checks**

Run: `node backend/tests/test_p8_sandbox_limits.js && node backend/tests/test_p8_mfa_crypto.js && node backend/tests/test_p8_security_operations.js && node backend/tests/test_p8_ci_contract.js`
Expected: PASS with real Docker cgroup evidence, crypto migration/rotation, CSP/maintenance/listener proof, and CI graph assertions.

Run: `npm --prefix frontend run test:unit -- --run src/components/__tests__/P8UiStatus.test.jsx`
Expected: PASS with all accessibility states and focus behavior.

- [x] **Step 3: Run trust-chain regressions**

Run: `node backend/tests/test_p5_execution_boundary.js && node backend/tests/test_p5_mfa_login.js && node backend/tests/test_p6_static_serving.js && node backend/tests/test_p7_sqlite_durability.js && node backend/tests/test_p7_delete_protection.js`
Expected: PASS with P5–P7 invariants unchanged.

- [x] **Step 4: Run complete project and production verification**

Run: `npm --prefix backend test`
Expected: PASS, zero failed suites.

Run: `npm --prefix frontend run test:unit && npm --prefix frontend run build`
Expected: PASS, zero unit failures and clean Vite build.

Run: `npx playwright test --project=chromium`
Expected: PASS for browser suite; production-only fixture test may be explicitly skipped outside its harness.

Run: `node scripts/test-p6-image-contract.mjs && npm run test:production-image`
Expected: PASS with clean image limits, HTTPS surface, authenticated WSS, verified ZIP, and persistence observations.

- [x] **Step 5: Perform final security/operability audit**

Block verification on any host execution fallback, unbounded Docker resource, wildcard published port, plaintext production `ws:`, plaintext MFA row after enrollment/migration, secret response/log, username timing shortcut, leaked abort listener, unscheduled cleanup, optional CI gate, or documentation/runtime mismatch.

- [x] **Step 6: Write evidence and close roadmap**

Create P8 evidence frontmatter (`unit:P8`, plan path, `status:verified`) and record exact commits, review verdicts, commands, exits, counts, Docker cgroup values, crypto/timing observations, UI accessibility, CI graph, production smoke, and audit result. Mark P8 and exit gates verified in roadmaps/master/current continuity. Set exact next action to `Roadmap P0–P8 is verified; perform no new source implementation until a new approved design/plan exists.`

- [x] **Step 7: Run continuity GREEN**

Run: `node scripts/validate-continuity.mjs`
Expected: PASS with 13 units, current P8/verified, dependency P7 verified, and no next implementation invented.

- [x] **Step 8: Commit Task 6**

```bash
git add implementation-evidence/P8.md guncel-todo.md PROJECT-CONTINUITY.md yol-haitasi-todo.md implementation-plans/00-MASTER-EXECUTION-PLAN.md implementation-plans/13-P8-security-operations.md scripts/validate-continuity.mjs
git commit -m "docs: record verified P8 security and operations"
```

## P8 Exit Gate

- [x] **CI requires backend, frontend unit/build, Chromium E2E, audits, and production-image smoke.
- [x] **Docker sandbox enforces CPU, memory, swap, PID, privilege, tmpfs, timeout, and loopback-port boundaries with real runtime evidence.
- [x] **Windows uses Docker isolation when available and otherwise blocks generated execution.
- [x] **MFA secrets use authenticated encryption, support previous-key rotation, and transparently migrate legacy rows.
- [x] **Unknown-user login performs dummy scrypt verification.
- [x] **Production CSP excludes plaintext WebSocket connections.
- [x] **Session sweeper and graceful timer cleanup are active.
- [x] **Abort listener counts remain stable after completion and cancellation.
- [x] **WebSocket and UI error states are accessible and keyboard operable.
- [x] **README and operations guide match observed runtime behavior and state single-node limits.
- [x] **Full backend/frontend/browser/image/production smoke gates pass.
- [x] **Independent final security review has no blocking finding.
- [x] **`implementation-evidence/P8.md` and continuity validator close P0–P8 as verified.
