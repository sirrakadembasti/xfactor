# P8 CI, Security Hardening, and Operational Limits Design

## Goal

Harden container isolation, authentication security, resource ceilings, real-time client feedback, CI test completeness, and operational documentation across the XFactor platform. Enforce container resource limits (CPU, memory, PIDs, timeout) and loopback service port bindings; encrypt TOTP secrets at rest with AES-256-GCM and eliminate username enumeration timing differences; restrict production CSP connect-src to secure origins; sweep expired sessions automatically; clean up abort signal listeners; provide accessible WebSocket status indicators; make frontend unit and browser journeys mandatory in CI; and eliminate all discrepancies between documentation and runtime behavior.

## Scope

P8 owns:
1. Container resource limits (`--cpus 2.0`, `--memory 1g`, `--pids-limit 100`, `--tmpfs`, `--security-opt`) and loopback port bindings (`127.0.0.1:${port}:${port}`) in `portableSandbox.js`.
2. Cross-platform Docker sandbox availability (enabling Docker sandbox on Windows when Docker is available).
3. At-rest AES-256-GCM encryption of TOTP secrets with key derivation and transparent backward-compatible plaintext migration.
4. Timing-safe username lookup in `authenticateUser` using dummy scrypt password hashing.
5. Production CSP `connect-src` restriction (`'self' wss:`).
6. Scheduled session cleanup sweeper in `backend/maintenance.js` and `server.js`.
7. Abort signal listener cleanup in `backend/llm.js` and `backend/engine/workflow.js`.
8. Accessible WebSocket connection status indicator and accessible error presentation in frontend.
9. CI pipeline hardening in `.github/workflows/ci.yml`: mandatory frontend unit tests, root Playwright e2e, and audit timeouts.
10. Documentation synchronization across `README.md` and operational guides (MFA, sandbox, ZIP downloads, single-node boundaries).

P8 does not implement:
- Remote multi-node cluster orchestration or Kubernetes operators (single-node production image remains canonical).
- External Redis session caches or distributed messaging queues.
- WebAuthn/FIDO2 hardware keys (RFC 6238 TOTP remains the authentication standard).

---

## 1. Sandbox Resource Ceilings & Cross-Platform Isolation

### 1.1 Container Resource Limits (`portableSandbox.js`)
When `type === 'docker'`, container execution and service spawning must append:
- `--cpus 2.0`
- `--memory 1g --memory-swap 1g`
- `--pids-limit 100`
- `--security-opt no-new-privileges:true`
- `--cap-drop ALL`
- `--tmpfs /tmp:rw,noexec,nosuid,size=64m`

Adapter capabilities report `resourceLimits: true` when Docker is active and available.

### 1.2 Loopback Service Port Binding
When a generated service requests port forwarding:
- In Docker mode, bind strictly to loopback: `-p 127.0.0.1:${port}:${port}` instead of `0.0.0.0:${port}`.
- Guarantees sandboxed processes cannot expose listeners on external network interfaces.

### 1.3 Windows Docker Availability
- In `isAvailable()` of `portableSandbox.js`: if `this.type === 'docker'`, check `docker --version` regardless of OS platform. If Docker is installed and running on Windows, Docker sandbox is reported as available.
- If Docker is not available on Windows, fallback returns fail-closed `status: 'BLOCKED'`.

---

## 2. Authentication Hardening & TOTP Encryption

### 2.1 AES-256-GCM At-Rest Encryption (`backend/crypto/mfaCrypto.js`)
- Module exports:
  - `encryptMfaSecret(plaintextHex, key): string`
  - `decryptMfaSecret(ciphertextString, keys): { plaintext: string, keyIndex: number }`
  - `getMfaEncryptionKeys(env?: NodeJS.ProcessEnv): { current: Buffer, previous: Buffer[] }`
- Encrypted format: `v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
- Key resolution:
  - Production requires `MFA_ENCRYPTION_KEY` (exactly 32 bytes encoded as 64 hex characters or base64).
  - Optional `MFA_PREVIOUS_ENCRYPTION_KEYS` is a comma-separated list of prior 32-byte keys used only for decryption during rotation.
  - Development/test derives 32 bytes using `crypto.createHash('sha256').update(env.JWT_SECRET || 'dev-secret').digest()` when the current key is unset.
- `generateTotpSecret(userId)` returns the plaintext enrollment secret once but stores only the encrypted `v1:` value.
- `verifyUserTotp(user, token)` owns database migration because it has `user.id`: it decrypts encrypted secrets, verifies RFC 6238, and rewrites the row with the current key after successful verification when the secret was plaintext legacy data or used a previous key.
- The pure `verifyTotpToken(plaintextSecret, token)` remains database-independent and never mutates rows.

### 2.2 Timing-Safe Login Lookup (`backend/auth.js`)
- Precompute a static dummy scrypt hash at module initialization:
  `const DUMMY_HASH = hashPassword('timing-safe-dummy-scrypt-probe-key-value');`
- In `authenticateUser(username, password)`:
  - If `findUserByUsername(username)` returns null:
    Execute `verifyPassword(password, DUMMY_HASH)` anyway before returning `null`.
  - Guarantees authentication response time for nonexistent usernames is indistinguishable from users with incorrect passwords.

---

## 3. Production CSP, Session Sweeper & Listener Leak Cleanup

### 3.1 Content Security Policy (`backend/security.js`)
- In `createSecurityHeadersMiddleware`:
  - If `production === true`:
    `connect-src 'self' wss:;` (strictly eliminates plaintext `ws:` in production).
  - If `production === false`:
    `connect-src 'self' ws: wss:;` (allows local HTTP Vite proxying).

### 3.2 Scheduled Session Maintenance Sweeper (`backend/maintenance.js`)
- Module exports `sweepExpiredSessions(database = db): { sweptCount: number }`.
- In `backend/server.js`:
  - Run initial sweep on server start (`setTimeout(..., 0).unref()`).
  - Schedule periodic sweep every 60 minutes (`setInterval(..., 3600000).unref()`).
  - Clear sweep timers during graceful shutdown (`handleGracefulShutdown`).

### 3.3 Abort Signal Listener Cleanup
- In `backend/llm.js` (`generateLLMResponse`):
  - Ensure `signal.removeEventListener('abort', onAbort)` is called in a `finally` block for `abortPromise` / `mergedSignal`.
- In `backend/engine/workflow.js` (`checkPause`):
  - Clean up the `abort` listener when the pause check resolves or resumes.
- Guarantees event listeners do not leak across repetitive agent loop iterations.

---

## 4. Accessible UI Feedback, CI Pipeline & Documentation

### 4.1 Accessible WebSocket Status Indicator (`frontend/src/App.jsx`)
- Render an accessible live status indicator in the header / navigation:
  - `wsState === 'connected'`: Green badge with aria-label `Canlı bağlantı aktif`.
  - `wsState === 'reconnecting'`: Amber badge with aria-label `Canlı bağlantı yeniden kuruluyor...`.
  - `wsState === 'disconnected'`: Slate badge with aria-label `Canlı bağlantı kesildi`.
- Maintain accessible `role="alert"` and focus management on `uiError` banners.

### 4.2 Automated CI Pipeline Gate (`.github/workflows/ci.yml`)
- Update `test` job:
  - Add 60s timeout to `npm audit --audit-level=high`.
  - Add `npm --prefix frontend run test:unit`.
  - Add `npx playwright install --with-deps chromium && npx playwright test --project=chromium`.
- `production-image` job depends on `test` job (`needs: test`), ensuring image building only occurs when all unit, integration, and browser tests succeed.

### 4.3 Documentation & Operational Sync (`README.md`, `docs/`)
- Update `README.md` to document:
  - RFC 6238 TOTP two-step login and encrypted secret storage.
  - Fail-closed container sandbox architecture with CPU, memory, and PID limits.
  - Server-side authorized immutable artifact ZIP downloads.
- Create `docs/OPERATIONS.md`:
  - Document single-node deployment boundaries (SQLite WAL, local storage volumes).
  - Document prerequisites for future horizontal scaling (distributed database, shared project NFS/S3, centralized pub/sub WebSocket bus).

---

## 5. Verification & Testing Strategy

1. **Sandbox Limits Test (`backend/tests/test_p8_sandbox_limits.js`):**
   - Verify Docker command arguments include `--cpus 2`, `--memory 1g`, `--pids-limit 100`, `--tmpfs`, and `-p 127.0.0.1:...`.
   - Verify adapter capabilities report `resourceLimits: true`.
2. **MFA Crypto & Timing Test (`backend/tests/test_p8_mfa_crypto.js`):**
   - Verify `encryptMfaSecret` / `decryptMfaSecret` round-trip with AES-256-GCM.
   - Verify tampering with ciphertext or authTag throws an authentication failure error.
   - Verify legacy plaintext secret auto-migrates to `v1:...` upon successful verification.
   - Verify dummy scrypt execution in `authenticateUser` for unknown usernames.
3. **CSP & Maintenance Test (`backend/tests/test_p8_security_operations.js`):**
   - Verify production CSP `connect-src` excludes plaintext `ws:`.
   - Verify `sweepExpiredSessions` purges expired session records from SQLite.
   - Verify abort listener cleanup prevents listener accumulation.
4. **Frontend Unit Test (`frontend/src/components/__tests__/P8UiStatus.test.jsx`):**
   - Verify accessible WebSocket status badges for connected, reconnecting, and disconnected states.
5. **Full Project Verification:**
   - Full backend suites pass.
   - Full frontend unit suites pass.
   - Full frontend build passes.
   - Full Playwright Chromium browser tests pass.
