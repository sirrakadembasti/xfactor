# XFactor Current Remediation Design

## Status

Approved design for a superseding remediation initiative. The existing P0–P4 plans and evidence remain historical records. This design governs P5–P8 work derived from the 2026-09-04 repository audit.

## Goal

Restore the platform’s claimed trust boundaries by preventing generated code from executing with host authority, enforcing verified-only artifact download and canonical completion, and requiring TOTP for MFA-enabled accounts before addressing production packaging, data reconciliation, architecture debt, CI, and operational hardening.

## Canonical Records

- `guncel-todo.md`: user-facing current roadmap and ordered task state.
- This document: approved design, boundaries, and acceptance contracts.
- `implementation-plans/10-P5-critical-trust-chain.md`: detailed executable P5 plan created after written-spec review.
- `PROJECT-CONTINUITY.md` and `yol-haitasi-todo.md`: historical P0–P4 ledger records until a coherent supersession update links them to the new initiative.

## Global Constraints

- Execute one delivery unit at a time in dependency order: P5 → P6 → P7 → P8.
- Implement observable behavior changes with TDD.
- Never treat generated or LLM-produced code as trusted host code.
- Mandatory verification cannot pass on skipped, blocked, missing, or evidence-free execution.
- Only canonical machine evidence may authorize artifact download or project completion.
- Use isolated temporary databases and project roots in tests.
- Preserve unrelated dirty-worktree changes.
- Do not perform unrelated refactoring.
- Mark roadmap tasks complete only after tests, behavioral proof, review, and evidence updates.

## Delivery Architecture

### P5 — Critical Trust Chain

P5 closes four connected invariants before production or architecture work:

1. Generated commands require an available isolation-capable adapter. Environment configuration cannot authorize host execution.
2. Artifact persistence exposes one canonical model; database snake_case fields do not leak into domain consumers.
3. Download is server-authorized and verified-artifact-only. The browser cannot synthesize a substitute ZIP.
4. MFA-enabled users cannot receive a session without a valid current TOTP.

### P6 — Production Operability

P6 establishes backend ownership of archive dependencies, a single explicit frontend deployment model, deterministic lockfile installation, and a smoke-tested production image.

### P7 — Data and Architecture Reliability

P7 replaces duplicate/destructive disk synchronization with one non-destructive reconciliation service, defines SQLite contention policy, fixes file API contracts, and narrows oversized modules only where required by the changed responsibilities.

### P8 — CI, Security Hardening, and Operations

P8 makes frontend unit and browser E2E tests mandatory, provides a real Windows isolation boundary or isolated worker replacement, adds sandbox resource/network constraints, hardens MFA secret storage and timing behavior, aligns documentation with runtime behavior, and documents scaling limits.

## P5 Component Design

### 1. Execution Boundary

Generated build and service commands enter a single execution boundary. The boundary checks adapter capabilities before process creation. If isolation is unavailable, it returns a structured `BLOCKED` result and creates no child process. Host execution remains unavailable to generated-project paths even when `XFACTOR_BUILD_SANDBOX=host` is present.

Tests use injected fake adapters. No test proves isolation by executing untrusted commands on the real host.

### 2. Artifact Domain Model

The artifact repository maps SQL rows to a domain object:

```js
{
  id,
  projectId,
  contractId,
  kind,
  path,
  sha256,
  size,
  manifestJson,
  status,
  verificationRunId,
  createdAt
}
```

SQL remains snake_case internally. Every repository read returns the domain model. Verification, completion, report generation, and download consumers migrate in one clean cutover; no dual field aliases remain.

A successful completion uses the same verification run identity across:

```text
verification_runs.id
  = artifacts.verification_run_id
  = completion_receipts.run_id
```

Existing completed projects without receipts are reported for operator-controlled reconciliation. P5 does not silently mutate or delete them.

### 3. Verified-Only Download

The browser may download only a server artifact that is verified against the latest approved contract. Client-side ZIP construction and the JSZip/FileSaver fallback are removed. The file listing endpoint remains an authorized IDE/read surface, not a packaging authority.

The frontend constructs artifact download URLs from the configured API base, preserving same-origin development and split-origin production deployments. If no verified artifact exists, the UI disables download and displays an explicit status.

### 4. MFA Login Enforcement

The existing endpoint accepts an optional TOTP:

```http
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "...",
  "totp": "123456"
}
```

State transitions:

```text
password invalid
  → 401, no session

password valid + MFA disabled
  → session cookie + 200

password valid + MFA enabled + TOTP absent
  → 202 { mfaRequired: true }, no session

password valid + MFA enabled + TOTP invalid
  → 401, no session

password valid + MFA enabled + TOTP valid
  → session cookie + 200
```

The frontend changes from credential entry to a TOTP step on 202. Password and MFA intermediate state are cleared on success, cancellation, logout, error-boundary reset, and account-state reset. MFA enrollment, recovery codes, and QR provisioning are outside P5.

## Error Handling

- Sandbox unavailable: structured `BLOCKED`; never implicit host fallback.
- Artifact linkage mismatch: completion fails closed before `completed` or receipt creation.
- Missing verified artifact: no browser ZIP fallback; visible non-destructive UI error.
- Invalid or absent required TOTP: no session record and no `Set-Cookie` session token.
- Existing inconsistent production data: report only; no automatic destructive repair.
- CAS conflict: preserve current state and return conflict rather than retrying with stale data.

## Verification Strategy

Each P5 behavior receives a regression test that fails before its implementation:

1. Sandbox unavailable creates no generated child process and returns `BLOCKED`.
2. Artifact repository maps `verification_run_id` to `verificationRunId` and completion creates a receipt tied to the same run.
3. Unverified projects expose no client-side download path.
4. Configured API base controls artifact download origin.
5. MFA-enabled password-only login creates neither session nor session cookie.
6. Valid TOTP creates a session; invalid TOTP does not.
7. MFA-disabled password login remains compatible.

Verification order:

1. Narrow unit test.
2. Route integration test with isolated `DB_PATH` and `PROJECTS_ROOT`.
3. Frontend unit test.
4. Relevant backend regression suite.
5. Real browser MFA and download scenarios.
6. Continuity validator.
7. Independent code review.
8. Evidence and roadmap update.

## P5 Exit Criteria

P5 is verified only when all conditions hold:

- Generated commands cannot execute with host authority.
- Missing sandbox capability is represented as `BLOCKED` and blocks mandatory verification.
- Verified artifact download is the only ZIP path exposed by the UI.
- Artifact, verification run, completion receipt, and latest approved contract are consistently linked.
- MFA-enabled users cannot obtain sessions using only passwords.
- MFA-disabled authentication remains operational.
- Narrow tests, related suites, and actual browser flows pass.
- Review has no blocking findings.
- Evidence records exact commands, exit codes, and observed behavior.

## Out of Scope for P5

- Windows restricted-token/Job Object implementation.
- MFA enrollment, recovery codes, and QR provisioning.
- Production frontend serving and Docker packaging.
- Disk reconciliation redesign.
- Broad module decomposition.
- Sandbox CPU/RAM/PID/disk policy.
- Documentation-wide claim cleanup.

These belong to P6–P8 in `guncel-todo.md`.
