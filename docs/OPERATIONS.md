# XFactor Operations Guide

Single-node deployment boundary, production prerequisites, and the scaling
contract. Everything below describes observed runtime behavior — see the
referenced source files for the authoritative implementation.

## 1. Deployment boundary: Split architecture (Web & Execution Worker)

The platform separates orchestration from generated-code execution:
1. **Web Orchestrator (`backend/server.js`)**: A Node.js process backed by a SQLite database (WAL mode). Handles authentication, project state, and the DAG engine.
2. **Execution Worker (`execution/server.js`)**: A separate process, optionally on a dedicated host. The selected runtime determines its isolation: `local-trusted` runs generated code with the worker account's privileges; the Docker runtime provides a container boundary. Process separation alone is not OS isolation.

The Web Orchestrator connects to the Execution Worker via an authenticated HTTP API.

- Database: `DB_PATH` (default `<backend>/data/projects.db`).
- Projects: `PROJECTS_ROOT` (default `<backend>/../projects`).
- Artifacts: `ARTIFACTS_ROOT` (default `<backend>/data/artifacts`).
- Worker Token: `EXECUTION_WORKER_TOKEN` (Shared secret between Web and Worker).
- Worker URL: `EXECUTION_WORKER_URL` (Points to the selected worker).

Do not run two web instances against the same paths without the prerequisites in section 8.
## 2. Prerequisites

- Node.js `22.23.2`, `npm@10.9.8` (see `engines` in `package.json`).
- `EXECUTION_WORKER_URL` and `EXECUTION_WORKER_TOKEN` pointing to a trusted execution worker instance.
- `LLM_CONFIG_ENCRYPTION_KEY` (32-byte hex/base64) and at least one LLM profile
  configured in the admin-only `/llm` page for LLM-backed generation.
- Sessions use opaque cookie tokens and server-side SHA-256 hashes; `JWT_SECRET`
  is only a legacy development fallback for MFA key derivation.
- `MFA_ENCRYPTION_KEY` (32-byte hex): encrypts stored TOTP secrets.
- Reverse proxy terminating TLS in front of the backend (section 6).
- Persistent storage for `DB_PATH`, `PROJECTS_ROOT`, `ARTIFACTS_ROOT`.
- Persistent, access-controlled storage for `backend/data/llm-profiles.json` (or
  `LLM_CONFIG_PATH`); back it up together with its encryption key.

Production reads an explicitly supplied `LLM_CONFIG_ENCRYPTION_KEY`, an existing
environment-file key, or a persisted `llm-encryption.key` beside the profile file.
On a new installation it writes the key to that persistent data directory with
mode 0600, without modifying the application directory. `LLM_CONFIG_KEY_PATH`
overrides this path. Never lose the key; encrypted profiles cannot recover it.
Both the profile file and key need a separate access-controlled backup: the
project snapshot below contains database/projects/artifacts only.

The production worker requires an operator-supplied `EXECUTION_WORKER_TOKEN` or
`WORKER_TOKEN`; the built-in development token is refused in production.
Keep the worker API on a trusted private boundary; use TLS for traffic crossing
hosts. Bearer authentication alone does not encrypt HTTP traffic.

### LLM profile operation

Provider API keys, base URLs, and model IDs are saved in encrypted profiles,
not in `.env`. `/api/llm` and `/llm` require an administrator session; mutating
requests pass the platform's origin and CSRF checks. Only one profile ID is
active at a time. The admin page shows the active profile and each profile's
last connection test result and timestamp. A passed test proves a response at
that time, not continuous provider availability. Editing a profile clears its
test result. If no profile is active, the legacy environment fallback remains
available for older installations; new installations should select a profile.

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

- Generated/build code executes in the Execution Worker; the web backend does not execute generated code. Normal `npm run dev` and `npm run dev:local` select the Docker-free `local-trusted` runtime with explicit launcher consent. This runtime is not an OS sandbox. Use a dedicated account/machine when that trust boundary is required.
- `npm run dev:docker` selects container execution. Direct `node execution/server.js` defaults to Docker unless `EXECUTION_WORKER_RUNTIME=local` is configured; local execution additionally requires `EXECUTION_WORKER_TRUST_LOCAL_CODE=1`. Missing runtime capability blocks verification rather than producing a PASS or silently choosing another profile. The legacy in-process sandbox adapter configuration is not a substitute for worker evidence.
- Docker isolation enforces exactly: `--cpus 2.0`, `--memory 1g`, `--memory-swap 1g`, `--pids-limit 100`, `--security-opt no-new-privileges:true`, `--cap-drop ALL`, `--tmpfs /tmp:rw,noexec,nosuid,size=64m`, and loopback-only port publishing.
- Both runtimes start job processes with controlled environments and execution deadlines. Local execution does not inherit the operator's npm credentials or environment wholesale; these controls do not remove the account privileges available to generated code.
- The Docker CI lane enforces real Docker evidence; the native worker CI lane is separate.
- For Docker execution, build the operator-owned runtime with
  `docker build -t xfactor-worker-runtime execution`. It includes Chromium and
  pinned Playwright Core, independent of generated project dependencies.
  Interactive role journeys use temporary demo accounts and a fresh browser
  context; role/session proof, visible outcomes, keyboard access and mobile
  overflow are measured. Missing evidence never becomes PASS.
- Authenticated worker `/readyz` checks the selected runtime: Docker checks its daemon/image; local execution resolves pinned tools and launches Chromium to prove real renderer JavaScript and DOM execution. Missing resources produce 503. An unauthenticated 401 only proves the API is listening. A running job is aborted at its deadline, including subprocesses.
- Local readiness failures expose a generic 503 response. Worker logs contain only allowlisted `phase`, `name` and `code` values; they omit error messages, stacks, paths and tokens. Tool resolution precedes the 30-second renderer probe, so a cold startup can take longer than that probe alone.
- `VERIFICATION_JOB_TIMEOUT_MS` defaults to 900000 ms (15 minutes). The local development launcher supplies 1500000 ms (25 minutes) only when unset/blank; an explicitly smaller value is preserved. The hard cap is 1500000 ms, invalid values fail validation, and per-command limits still apply. Changing configuration affects new jobs after restart; it does not extend an active job's deadline.
- Provider connections validate all DNS answers at socket connection time and
  reject non-public addresses and redirects. The explicit local HTTP switch is
  restricted to loopback development endpoints.
## 6. Artifacts and verified ZIP downloads

Filesystem availability and historical verification are separate. An artifact
row may retain `verified` evidence while its ZIP is missing or no longer matches
its recorded SHA-256. The project response reports availability separately;
the download route still requires valid evidence and matching bytes. Missing
source directories never implicitly delete projects or artifacts.

Migration 16 adds the durable `artifact_maintenance` journal without foreign-key
cascades to deleted projects. Normal project deletion refuses a project with a
completion receipt. For a permitted deletion, registered, hash-matching ZIPs
are queued inside the database deletion transaction and moved after commit to
`ARTIFACTS_ROOT/.quarantine/`. A delivered `PROJECTS_ROOT/<project-id>.zip` copy
is owned only when its digest matches a registered artifact; its quarantine is
`PROJECTS_ROOT/.artifact-quarantine/`, keeping the move on its source filesystem.
Pending moves are retried on startup and disk synchronization. Failed moves
remain journaled; no permanent purge is implemented.

From the repository root, `node backend/scripts/artifact-maintenance.js` opens
the existing DB read-only and audits storage without applying migrations.
For maintenance writes, start the updated backend once to apply migration 16,
then stop backend and worker and run
`node backend/scripts/artifact-maintenance.js --quarantine --offline`.
Use the same `DB_PATH`, `PROJECTS_ROOT`, and `ARTIFACTS_ROOT` environment settings
as the deployment. The CLI does not load the backend environment file itself.
`--offline` is an operator declaration, not a service-stop command; a running
workflow blocks CLI writes. `--orphans-only` filters newly selected candidates,
but recovery can also retry previously journaled pending operations.

Unprotected `rejected`/`superseded` artifacts become retention candidates after
seven days from their DB creation time, provided their project is not running
or deleting. Unregistered ZIPs need a file modification age of at least 24 hours
and no running workflow anywhere. Recovery rechecks receipt/status protection,
running production, path ownership and digest under the database write lock.
Inventory and synchronization do not automatically enqueue retention candidates.
See [artifact lifecycle and recovery](ARTIFACT-LIFECYCLE.md) for current findings
and operational limits; these controls do not recover already missing ZIPs.

- ZIP artifacts are produced server-side and recorded with SHA-256 hashes;
  downloads go through the authenticated route
  `GET /api/projects/:id/contracts/:contractId/artifacts/:artifactId/download`
  (`requireAuth` + `projectAccess('viewer')`), served with `res.download`
  from the server-side artifact path — never reconstructed from a client
  file list (`backend/routes/projectRoutes.js`).
- Successful download action messages are appended after the transfer callback
  succeeds. A missing file or disconnected transfer does not record success.
- Release gating requires the execution worker to complete all mandatory gates (e.g., `clean_install`, `typecheck`), and provide durable completion receipts with strictly validated `evidence_json` and `stdout/stderr` digests before an artifact becomes downloadable. Unverified requests strictly return `409 Conflict`.

## 7. Persistence, proxy/TLS, and maintenance

- **Persistence & Recovery:** Back up `DB_PATH` together with `PROJECTS_ROOT` and `ARTIFACTS_ROOT`. SQLite checkpoints WAL on graceful shutdown (`checkpointWAL`). Recovery tools are provided to safely restore backups and invalidate stale workflow leases without data corruption.
- **Snapshot procedure:** Stop the web orchestrator and worker writers before
  using the CLI: `node backend/scripts/backup.js --offline --db ABSOLUTE_DB_PATH
  --projects ABSOLUTE_PROJECTS_ROOT --artifacts ABSOLUTE_ARTIFACTS_ROOT
  --output ABSOLUTE_EMPTY_DESTINATION`. `--offline` declares that writers have
  been stopped; it does not stop them. Embedded callers must supply a quiescing
  lifecycle coordinator. SQLite `VACUUM INTO` includes committed WAL pages.
  The snapshot is a directory containing `manifest.json`, `db`, `projects`
  and `artifacts`, with byte counts and SHA-256 hashes, rather than tar.gz.
  Restore into a fresh target using `node backend/scripts/restore.js
  --snapshot ABSOLUTE_SNAPSHOT --target ABSOLUTE_TARGET`; artifact DB paths
  are rewritten to the final destination and receipt hashes checked.
- Worker job-store JSON is durable state. Corruption stops worker startup;
  restore the file from a known backup rather than silently discarding jobs.
- **Graceful Bounded Shutdown:** The web orchestrator catches `SIGTERM/SIGINT` and executes a bounded shutdown (default `SHUTDOWN_TIMEOUT_MS=3000`), ensuring websockets are closed, pending DB transactions are finalized, and the SQLite connection is safely terminated.
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
- **Health:** `GET /healthz` reports process liveness. `GET /readyz` reports
  full workload readiness, including database, storage, production frontend,
  and execution-worker capacity for both `prepare_dependencies` and
  `verify_artifact`; it returns HTTP 503 when any required dependency or worker
  capability is unavailable. The production image adds a 30s-interval Docker
  `HEALTHCHECK` on `http://127.0.0.1:8000/healthz`.
- **Readiness timeout:** `READINESS_WORKER_TIMEOUT_MS` bounds the worker
  capability check (backend default `2000` ms). The local development launcher
  uses `35000` ms when this setting is unset/empty and preserves an explicitly
  configured value. A stalled worker makes `/readyz` return HTTP 503 instead of
  leaving the probe open indefinitely. The local cold tool/browser checks can
  exceed this budget on a busy machine; inspect the safe worker phase diagnostic
  and retry after the required tools are available.

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
  The worker suite also builds its fixed image and runs authenticated HTTP and
  Docker isolation tests. Browser containers use an init process to reap children;
  GPU rendering and zygote are disabled, with a fresh single-process browser per
  journey. The worker container remains the isolation boundary within existing
  CPU, memory and PID limits.
- `production-image` job: declares `needs: test`, contains no
  `continue-on-error`, and proves the production HTTPS container surface.
- `local-worker` job: Windows, Linux ve macOS matrisi üzerinde sabit sürümlü araçları kurar, yerel entegrasyonu çalıştırır, platform paketini üretir ve gerçek paket/kapanış kabulünü doğrular. Docker gerektirmez. Matrisin tanımlanması bu platformlarda CI'nın geçtiği anlamına gelmez; ilk paket kabulü [1 Ekim raporunda](LOCAL-WORKER-VALIDATION-2026-10-01.md), son Windows uygulama üretim kanıtı [21 Ekim raporundadır](LOCAL-WORKER-VALIDATION-2026-10-21.md).

## 10. Yerel worker işletimi

Platform ajan talimatları ve protokol şablonları kökteki [`x-agents/`](../x-agents/README.md) altında tutulur; `docs/` artık sistem istemi kaynağı değildir. Backend sabit dosya izin listesi kullanır ve eksik/geçersiz talimatta başka kaynağa dönmez. Proje kökleri ve proje klasörleri ajan diziniyle doğrudan veya bağlantı üzerinden çakışamaz. Üretim Dockerfile bu dizini `/app/x-agents` altında root sahipliğinde kopyalar; çalışma verisi volume'lerini burada bağlamayın. Yerel worker için aynı hesapla çalışan kodun OS yetkileri bu dizin ayrımıyla değişmez.

Docker olmadan gerçek doğrulama için `npm run dev:local` veya paketli worker kullanılabilir. `local-trusted` profili açık operatör seçimi gerektirir; OS izolasyonu sağlamaz. Setup/paket/bağlantı komutları [yerel paket kılavuzundadır](LOCAL-WORKER-PACKAGE.md). Kaynak, paketli worker ve Docker entegrasyon testleri ayrı komutlarla çalıştırılır; Docker'ın bulunmaması yerel testleri devre dışı bırakmaz.

`npm run dev` ve `npm run dev:local` varsayılan uygulama akışında Docker olmadan yerel profili seçer. Docker profili `npm run dev:docker` ile açıkça seçilir. Doğrudan `node execution/server.js` düşük seviyeli worker komutudur; runtime/token yapılandırması ayrıca yapılır. Yerel kaynak kurulumu için `npm run worker:local:setup -- --install`, ardından `npm run dev` kullanın; backend/frontend bağımlılıkları ayrıca kurulmalıdır. `npm run test:local-worker` kaynak entegrasyonunu, `npm run test:local-worker-package -- --bundle dist/local-worker` gerçek dağıtım paketini doğrular. Üretilen uygulamanın Docker imajını build/run etmek ve container izolasyonunu test etmek ayrı işlemlerdir; Docker gerektirir.

Paket manifesti her dosyanın SHA256 bütünlüğünü doğrular; imzalı yayın yerine geçmez. Chromium, doğrulanmış kaynak paketten paket dışındaki benzersiz ve hashleri tekrar doğrulanan çalışma kopyasına alınır. Normal kapanış ve açılış hataları bu kopyayı temizler; ani launcher çöküşünden kalan kopyalar operatör tarafından temizlenebilir. Linux Chromium sistem kitaplıkları ve platforma özgü işletim sistemi gereksinimleri kılavuzda belirtilmiştir.

Worker'a kapatma mesajı gönderildiğinde önce aktif işler iptal edilip süreçler ve çalışma dizinleri temizlenir. Windows'ta launcher IPC kullanır; native Job Object yardımcısı ayrıca worker'ın beklenmedik kapanışını izleyip çocuk süreçleri sonlandırır. İlk helper derlemesi iptal ve job deadline'a tabidir. Her işin HOME, npmrc, npm logları, geçici dizinleri ve uygulama veritabanı çalışma alanıyla birlikte temizlenir. Public npm paket önbelleği işlerin dışında `xfactor-local-cache/npm` altında kalır (varsayılan üst dizin `os.tmpdir()`, `XFACTOR_LOCAL_WORKER_DATA` ayarlıysa o dizin); registry `https://registry.npmjs.org` olarak sabitlenir ve operatörün npm kimlik bilgileri aktarılmaz. Bu önbellek kaynak kodu veya doğrulama sonucu yerine geçmez; iş sonlanınca silinmez. Windows helper önbelleği de ayrıdır. Worker kapanışı sırasında bekleyen yeni işler başlatılmaz; kesilen aktif işler `failed_interrupted` olarak kaydedilir.

Worker'ın son 64 komuta ait aşama, çalıştırılabilir dosya adı, başlangıç/bitiş, çıkış kodu ve timeout bilgisi tanılama içindir. İş/lease sınırıyla kaydedilir; ham argüman, ortam değişkeni ve çıktı içermez. Bu kayıtlar kalite PASS kanıtının veya tamamlanma makbuzunun yerine kullanılamaz.
