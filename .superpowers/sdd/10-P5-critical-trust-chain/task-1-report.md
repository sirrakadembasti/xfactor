# Task 1 — Remove Generated Host Execution

## Implementation
- Confirmed `executeInSandbox` resolves one adapter, requires proven capabilities before adapter execution, scrubs supplied environment variables, and has no host-mode fallback.
- Confirmed `spawnService` requires an available service-capable adapter before invoking `adapter.spawn`, scrubs its environment, and returns that validated adapter in its process-tree handle.
- Confirmed build, package, quality-policy, and build-validator paths contain no `allowHostExecution`, `sandboxMode`, `resolveBuildSandboxMode`, or `XFACTOR_BUILD_SANDBOX` execution authority.
- Updated the execution-boundary test to provision an isolated temporary database and temporary project root before dynamic backend imports; the unavailable-service case now uses that isolated project root.

## Files changed
- `backend/tests/test_p5_execution_boundary.js`
- `.superpowers/sdd/10-P5-critical-trust-chain/task-1-report.md`

The production-boundary changes and related tests specified in the brief were already present in the starting worktree; no production file was rewritten or restored.

## TDD

### RED command
```text
node backend/tests/test_p5_execution_boundary.js
```

Observed output before this task's production work:
```text
[PASS] P5 generated execution requires proven sandbox capability
```

The requested RED state could not be observed because the starting snapshot already implemented the fail-closed behavior. The test was strengthened to meet the required isolated-database/project-root setup without changing production behavior.

### GREEN commands
```text
node backend/tests/test_p5_execution_boundary.js
node backend/tests/test_build_sandbox_gate.js
node backend/tests/test_p4_production_safety.js
```

Observed exact combined output:
```text
[PASS] P5 generated execution requires proven sandbox capability
==================================================
P0.4 Build Sandbox Gate Test Suite
==================================================
  [PASS] A. Default (unsandboxed): framework_build blocked + passed=false (fail-closed); host build NOT executed
  [PASS] B. XFACTOR_BUILD_SANDBOX=host: build remains blocked and host script does not run
==================================================
🎉 Build Sandbox Gate Testleri: 2 Başarılı, 0 Hatalı
==================================================
(node:581336) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
[PASS] P4.2 blocks Windows adapter without proven OS isolation capabilities
[PASS] P4.2 Windows availability requires proven isolation
[PASS] P4.2 portable adapter reports structured capability metadata
[PASS] P4.2 unsupported portable adapter fails closed
[PASS] P4.2 returns complete capability metadata and scrubs secret environment keys
[PASS] P4.3 rejects sandbox adapters without proven capabilities
[PASS] P4.3 service spawn uses sandbox boundary and blocks when sandbox unavailable
[PASS] P4.3 missing build script is BLOCKED not PASS for mandatory framework_build
[PASS] P4.4 finalized verification check cannot be mutated
[PASS] P4.4 status-only mandatory PASS is BLOCKED without evidence fields
[PASS] P4.4 bare derived marker is blocked while validated derived evidence passes
[PASS] P4.4 malformed derived evidence is blocked
[PASS] P4.4 finalized check cannot be re-ended while run remains running
[PASS] P4.4 artifact status transitions are guarded
[PASS] P4.5 completion returns a durable receipt containing the complete audit identity
[PASS] P4.5 completion rejects an incomplete active-policy mandatory gate set
[PASS] P4.5 download authorization rejects artifact linked to non-verified run
[PASS] P4.5 workflow has no direct product-completion write
```

Exit code: `0`.

## Self-review
- The test calls unavailable `execute` and `spawn` adapters with legacy `allowHostExecution: true` and `XFACTOR_BUILD_SANDBOX=host`; both reject before either counter can increment.
- The capable adapter is called once and does not receive `API_KEY`.
- The legacy host flag build test verifies the generated script leaves no `BUILD_RAN_MARKER`.
- A targeted search found no host-authority symbols in `backend/verification` or `backend/engine/buildValidator.js`.

## Concerns
- The baseline already contained the production cutover, so a fresh behavioral RED failure was not reproducible without reverting user work; none was reverted.
- Node emitted its existing experimental SQLite warning during `test_p4_production_safety.js`; the test exited successfully.

## Review Fix Round 1

### Fixes
- `requireSandboxCapabilities` now rejects adapters unless both `available` and `isolation === true` are proven before `execute` can be called.
- `requireAvailableSandbox` now requires `available`, `isolation === true`, and `serviceSpawn === true` before `spawn` can be called.
- Added no-call negative coverage for `available:true, isolation:false` execution and service adapters, and an exact one-call assertion for the capable execution adapter.
- Moved `test_build_sandbox_gate.js` and `test_build_validator.js` workspaces from `backend/data` to unique OS temporary directories created with `fs.mkdtemp`.
- Reviewed the reported observability assertions: the transaction rollback/no-mutation assertions at `test_p3_observability.js:1050-1060` are present and identical to the parent snapshot, so no restoration was needed.

### Reconstructed RED evidence

Command, run in an isolated detached worktree at pre-cutover snapshot `4e973a0` with a temporary reproduction test:
```text
node backend/tests/test_p5_execution_boundary_red.js
```

Exit code: `1`.

Exact output:
```text
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: Missing expected rejection.
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async file:///F:/temp/xfactor-p5-red-4e973a0/backend/tests/test_p5_execution_boundary_red.js:20:5 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: undefined,
  expected: [Function (anonymous)],
  operator: 'rejects',
  diff: 'simple'
}

Node.js v22.23.2
```

This proves the pre-cutover host branch returned successfully instead of rejecting the unavailable adapter before process creation.

### Focused GREEN verification

Command:
```text
node backend/tests/test_p5_execution_boundary.js && node backend/tests/test_build_sandbox_gate.js && node backend/tests/test_build_validator.js && node backend/tests/test_p3_observability.js && node backend/tests/test_p4_production_safety.js
```

Exit code: `0`.

Exact output:
```text
[PASS] P5 generated execution requires proven sandbox capability
==================================================
P0.4 Build Sandbox Gate Test Suite
==================================================
  [PASS] A. Default (unsandboxed): framework_build blocked + passed=false (fail-closed); host build NOT executed
  [PASS] B. XFACTOR_BUILD_SANDBOX=host: build remains blocked and host script does not run
==================================================
🎉 Build Sandbox Gate Testleri: 2 Başarılı, 0 Hatalı
==================================================
==================================================
⚡ XFactor Real Build & Compiler Quality Gate Test Suite
==================================================
  [PASS] 1. Stack Detection: Next.js, Vite, Express ve Prisma doğru algılanmalı
  [PASS] 2. Test 1 — Valid TypeScript: Hatasız TypeScript projesi tsc denetiminden geçmeli
  [PASS] 3. Test 2 — Invalid TypeScript: Tip uyumsuzluğu (Type Error) tsc tarafından yakalanmalı
  [PASS] 4. Test 3 — Invalid Prisma: Bozuk Prisma şeması npx prisma validate tarafından yakalanmalı
  [PASS] 5. Test 4 — Build Failure: package.json build scripti hata verirse FAIL dönmeli
  [PASS] 6. Test 5 — Timeout: Takılan/sonsuz döngüdeki komut timeout sonrası güvenle sonlandırılmalı
  [PASS] 7. Security: Whitelist dışındaki keyfi komutlar kesinlikle engellenmeli
==================================================
🎉 Build Validator Testleri: 7 Başarılı, 0 Hatalı
==================================================
(node:589500) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
[PASS] P3.1–P3.4 focused observability suite: 60 successful, 0 failed
(node:589560) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
[PASS] P4.2–P4.5 production safety focused checks: 18 successful
```

### Review concerns
- The isolated pre-cutover evidence worktree could not be deregistered by `git worktree remove` after its initial checkout timed out; it was not the current branch and contained only the temporary RED reproduction plus snapshot content.
- Node emitted existing experimental SQLite warnings in the P3 and P4 focused tests; all requested test commands exited `0`.
