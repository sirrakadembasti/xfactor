# XFactor Operations Guide

Single-node deployment boundary, production prerequisites, and the scaling
contract. Everything below describes observed runtime behavior — see the
referenced source files for the authoritative implementation.

## 1. Deployment boundary: single node

The backend is a single Node.js process backed by a file SQLite database
(WAL mode, `PRAGMA busy_timeout = 5000`, `foreign_keys = ON`) and local
filesystem state:

- Database: `DB_PATH` (default `<backend>/data/projects.db`).
- Projects: `PROJECTS_ROOT` (default `<backend>/../projects`).
- Artifacts: `ARTIFACTS_ROOT` (default `<backend>/data/artifacts`).
- Sessions live in the `user_sessions` table but are only valid on the node
  that holds the database and filesystem; WebSocket connections are in-process
  (`backend/server.js`, `backend/projectRepository.js`,
  `backend/artifactPaths.js`, `backend/db.js`).

Do not run two backend instances against the same paths without the
prerequisites in section 8 — there is no leader election, shared locking
beyond SQLite, or cross-node fanout.

## 2. Prerequisites

- Node.js `22.23.2`, `npm@10.9.8` (see `engines` in `package.json`).
- `GOOGLE_API_KEY` for LLM-backed generation.
- `JWT_SECRET` (session/token signing material).
- `MFA_ENCRYPTION_KEY` (32-byte hex): encrypts stored TOTP secrets.
  `MFA_PREVIOUS_ENCRYPTION_KEYS` (comma-separated 32-byte hex) keeps
  pre-rotation keys readable.
- Reverse proxy terminating TLS in front of the backend (section 6).
- Persistent storage for `DB_PATH`, `PROJECTS_ROOT`, `ARTIFACTS_ROOT`
  (section 5). The production image declares
  `VOLUME ["/app/backend/data", "/app/projects"]` (`Dockerfile`).

## 3. Authentication and sessions

- Passwords use `scrypt` hashes (`scrypt$salt$derived`, 64-byte key) with
  async verification on login and timing-safe comparison
  (`backend/auth.js`).
- MFA is a two-step RFC 6238 flow: password login first, then a 6-digit TOTP
  code over a 30-second step with a ±1-step HMAC-SHA1 window. The second step
  only accepts codes matching `/^\d{6}$/` (`verifyTotpToken`).
- Sessions are 24-hour server-side records (`SESSION_TTL_MS`,
  `user_sessions` with SHA-256 token hashes) presented as the
  `xfactor_session` cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in
  production (`backend/sessionAuth.js`).
- Login is rate-limited and mutating API calls require CSRF protection
  (`x-xfactor-csrf: 1` plus origin allowlist, `backend/security.js`).

## 4. MFA secret storage and key rotation

- TOTP secrets are stored as an AES-256-GCM envelope
  `v1:<iv-hex>:<tag-hex>:<ciphertext-hex>` (`backend/crypto/mfaCrypto.js`).
- Decryption tries the current key first, then each previous key; a secret
  that decrypts under a previous key is lazily re-encrypted under the
  current key on verification (`verifyUserTotp` in `backend/auth.js`).
- Rotation procedure: generate a new 32-byte key, move the old current key
  into `MFA_PREVIOUS_ENCRYPTION_KEYS`, set the new key as
  `MFA_ENCRYPTION_KEY`, restart. No data migration is needed.
- Development fallback (non-production only): when `MFA_ENCRYPTION_KEY` is
  unset, the key is derived from `JWT_SECRET`. Production refuses to start
  without explicit keys (`resolveMfaKeys`).

## 5. Execution sandbox and generated code

- Generated/build code executes only inside a proven sandbox adapter
  (`XFACTOR_BUILD_SANDBOX`, Docker or Bubblewrap). Without a proven
  capability the run is `BLOCKED` — there is no host fallback
  (`PortableSandboxAdapter.execute`, `backend/engine/buildValidator.js`).
- Docker isolation enforces exactly:
  `--cpus 2.0`, `--memory 1g`, `--memory-swap 1g`, `--pids-limit 100`,
  `--security-opt no-new-privileges:true`, `--cap-drop ALL`,
  `--tmpfs /tmp:rw,noexec,nosuid,size=64m`, and loopback-only port
  publishing (`-p 127.0.0.1:<port>:<port>`; wildcard `0.0.0.0` binding is
  rejected). See `buildDockerIsolationArgs` and `DEFAULT_SANDBOX_LIMITS`.
- Sandboxed processes start with a scrubbed environment and a 60-second
  default execution bound.
- CI enforces real Docker evidence: the backend suite runs with
  `P8_REQUIRE_DOCKER_LIMITS=1`, so the cgroup-limits test fails instead of
  skipping when no Docker daemon is available
  (`backend/tests/test_p8_sandbox_limits.js`, `.github/workflows/ci.yml`).

## 6. Artifacts and verified ZIP downloads

- ZIP artifacts are produced server-side and recorded with SHA-256 hashes;
  downloads go through the authenticated route
  `GET /api/projects/:id/contracts/:contractId/artifacts/:artifactId/download`
  (`requireAuth` + `projectAccess('viewer')`), served with `res.download`
  from the server-side artifact path — never reconstructed from a client
  file list (`backend/routes/projectRoutes.js`).
- Release gating uses the isolated `artifactVerifier` clean room plus
  durable completion receipts (migration 10) before an artifact becomes
  downloadable.

## 7. Persistence, proxy/TLS, and maintenance

- **Persistence:** back up `DB_PATH` together with `PROJECTS_ROOT` and
  `ARTIFACTS_ROOT`. SQLite checkpoints WAL on graceful shutdown
  (`checkpointWAL`).
- **Reverse proxy / TLS contract:** production requires `TRUST_PROXY=loopback`
  and HTTPS-only `ALLOWED_ORIGINS` (`validateRuntimeConfig` in
  `backend/config.js`). `trust proxy` is enabled only in production; every
  request and WebSocket handshake must arrive over a secure transport or it
  is rejected with `426 HTTPS_REQUIRED` (`isSecureTransportRequest`).
  Responses carry a restrictive CSP (`default-src 'self'`, no frames) and
  `Strict-Transport-Security: max-age=31536000; includeSubDomains` on secure
  transports (`createSecurityHeadersMiddleware`).
- **Maintenance interval:** a scheduler sweeps `user_sessions` every hour
  (`DEFAULT_INTERVAL_MS = 3_600_000`): expired sessions are deleted and
  sessions revoked more than 7 days ago are purged
  (`createMaintenanceScheduler` in `backend/maintenance.js`).
- **Health:** `GET /healthz` (liveness) and `GET /readyz` (readiness);
  the production image adds a 30s-interval Docker `HEALTHCHECK` on
  `http://127.0.0.1:8000/healthz`.

## 8. Horizontal-scaling prerequisites

Scaling past one node is explicitly unsupported until all of these hold:

1. **Shared SQL database** replacing the file SQLite store (all nodes must
   see the same contracts, sessions, receipts, and migrations).
2. **Shared projects/artifacts storage** behind `PROJECTS_ROOT` /
   `ARTIFACTS_ROOT` (same paths and bytes on every node).
3. **Distributed sessions** (shared session store or sticky routing keyed on
   `xfactor_session`, plus shared CSRF origin policy).
4. **Pub/sub WebSocket fanout** so project events published on one node
   reach subscribers connected to another.

## 9. CI gates (authoritative)

`.github/workflows/ci.yml` is fail-closed and covered by the structural
contract test `backend/tests/test_p8_ci_contract.js`:

- `test` job: installs backend, frontend, and root dependencies (`npm ci`);
  backend and frontend `npm audit --audit-level=high` each bounded by
  `timeout 60s` and blocking; backend suite with
  `P8_REQUIRE_DOCKER_LIMITS=1`; frontend `test:unit`; frontend build;
  Chromium install plus root `test:e2e`.
- `production-image` job: declares `needs: test`, contains no
  `continue-on-error`, and proves the production HTTPS container surface.
