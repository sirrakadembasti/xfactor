# Revocable Server Session Auth Cutover Design

## Goal

Replace 24-hour browser-stored JWT authentication with one revocable, opaque server-session model for XFactor's web UI. Remove JavaScript-readable credentials, runtime environment-admin bypass, JWT/Bearer compatibility paths, and token-bearing WebSocket subprotocols.

## Scope

Included:

- HttpOnly cookie authentication for REST and WebSocket traffic.
- Fixed 24-hour server sessions with current-session logout.
- Persistent database-backed admin role and one-time admin provisioning CLI.
- CSRF and WebSocket Origin enforcement.
- Frontend cookie-session bootstrap and complete account-state cleanup.
- Clean removal of old JWT, localStorage, Bearer, subprotocol, and environment-admin paths.
- Behavioral HTTP, WebSocket, CLI, and browser verification.

Excluded:

- CLI or third-party API authentication.
- Refresh tokens, rolling sessions, remember-me behavior, and OAuth.
- A user-facing “log out every device” action.
- General database migration framework work.

## Decision

Use opaque server sessions in an HttpOnly cookie.

Existing `user_sessions` helpers and schema already establish the intended server-side revocation boundary. Completing that boundary requires less state and fewer failure modes than access/refresh-token rotation. Keeping the session token as a localStorage Bearer credential would satisfy revocation but leave the confirmed XSS credential-exfiltration risk unchanged.

## Data Model

### Users

Add `users.is_admin INTEGER NOT NULL DEFAULT 0`. Authorization reads this durable role from the current database user; username equality never grants admin access.

Existing databases receive the column through the repository's current idempotent startup schema pattern. A versioned migration system remains separate Phase 2 work.

### Sessions

`user_sessions` remains the sole credential store:

- `id`: internal session identifier.
- `user_id`: owning database user.
- `token_hash`: unique SHA-256 hash of the opaque token.
- `expires_at`: fixed absolute expiry, 24 hours after login.
- `revoked_at`: explicit revocation timestamp.
- `created_at`: audit timestamp.

Raw session tokens are returned only through `Set-Cookie`; they are never persisted or logged. Session creation uses 32 cryptographically random bytes. Creation deletes expired rows; revoked rows remain until their fixed expiry, then follow the same cleanup path.

Session verification hashes the presented token, selects an unexpired and unrevoked row, then loads the current user record. Missing session, revoked session, expired session, or deleted user fails closed.

## Admin Provisioning

Remove runtime login use of `ADMIN_USER` and `ADMIN_PASS`. Add a one-time interactive `create-admin` CLI which:

1. accepts or prompts for username;
2. reads and confirms password without echoing it or placing it in process arguments;
3. validates password through the existing credential rules;
4. creates a new user, or verifies the supplied password for an existing user without resetting it;
5. sets the verified user's `is_admin = 1`.

The server does not read an admin password. `JWT_SECRET`, `ADMIN_USER`, and `ADMIN_PASS` are removed from runtime configuration, examples, tests, and operator documentation.

## HTTP Authentication Flow

### Cookie contract

Cookie name: `xfactor_session`.

Attributes:

- `HttpOnly` always;
- `SameSite=Lax` always;
- `Path=/` always;
- `Max-Age=86400` and matching absolute expiry;
- `Secure` in production, omitted only for loopback development.

### Login

`POST /api/login` validates the existing username/password payload and authenticates only a database user. On success it revokes any session identified by the current cookie, creates a new session, sets the cookie, and returns the public current-user object. The response contains no token. Invalid credentials keep one generic 401 response.

### Session bootstrap

`GET /api/session` verifies the cookie and returns the public current-user object. Frontend uses this endpoint before rendering account-scoped UI. Invalid or absent sessions return a stable 401 contract and clear a stale cookie.

### Protected routes

One `requireAuth` middleware parses the cookie, verifies the session, loads the current user, and assigns that user to `req.user`. Project RBAC reads `req.user.id` and `req.user.isAdmin`. No JWT claims, configured username bypass, Authorization header, or compatibility fallback remains.

### Logout

`POST /api/logout` revokes only the session named by the current cookie and clears the cookie with matching attributes. It is idempotent: malformed, expired, or already-revoked cookies are still cleared without exposing credential state.

## CSRF and Origin Policy

Cookie authentication introduces ambient browser credentials. Every unsafe API method (`POST`, `PUT`, `PATCH`, `DELETE`) therefore requires both:

- an `Origin` exactly matching the configured allowlist; and
- `X-XFactor-CSRF: 1`.

The static header is not a secret. Its purpose is to force a CORS preflight for cross-origin callers; the allowlist and credentials policy remain authoritative. Missing or invalid proof returns 403 with stable code `CSRF_REJECTED`. Login and logout use the same rule. Safe methods do not require the header.

Frontend fetches use `credentials: 'include'`; unsafe calls add the CSRF header centrally. CORS remains explicit-origin with credentials enabled.

## WebSocket Authentication

Browser WebSocket upgrades automatically include the session cookie. Upgrade acceptance requires:

1. existing HTTPS/WSS transport policy;
2. an allowed browser `Origin`;
3. a valid server session.

Remove token extraction, `Authorization` fallback, `xfactor-auth.<token>`, JWT verification, and auth subprotocol negotiation. After validating the raw cookie once, the socket retains only the internal session ID for subsequent database revalidation.

Session validity and current database user are rechecked when processing subscriptions and before publishing each project event. Project membership is then checked using the current user. Logout, expiry, user deletion, admin-role removal, and session revocation therefore stop new subscriptions and event delivery on already-open sockets. A rejected recheck sends no project data and closes or invalidates the socket with a stable policy response.

## Frontend State Model

Replace token truth with explicit auth state:

- `checking`: initial `GET /api/session` in progress;
- `authenticated`: current user loaded;
- `anonymous`: no valid session.

No account-scoped dashboard content renders while checking. Login transitions to authenticated using returned user data. Reload restores the session through the cookie endpoint.

All requests include credentials. No token is read from or written to localStorage, no Authorization header is built, and WebSocket construction supplies no auth subprotocol.

One account-reset function closes the socket and clears projects, active project, project state, logs, DAG data, files, selected file, chat state, and account-related loading/error state. Logout and every 401 call this reset before showing login, preventing stale-account flashes.

## Error Handling

- Missing, invalid, expired, or revoked session: generic 401 with stable auth code; stale cookie cleared.
- Invalid credentials: generic 401; no user-existence disclosure.
- Invalid Origin or CSRF proof: 403 `CSRF_REJECTED`.
- Invalid WebSocket origin/session: reject upgrade or close with a stable policy code; never send internal errors.
- Database or entropy failure: existing global redacted 500 boundary with request ID.
- Session tokens and cookie values never enter structured logs, WebSocket reason text, or response JSON.

## Clean Cutover

Remove every obsolete path in one change:

- `jsonwebtoken` dependency and imports;
- JWT signing and verification;
- `JWT_SECRET` runtime requirement;
- runtime `ADMIN_USER`/`ADMIN_PASS` login bypass;
- Authorization Bearer generation and parsing;
- `xfactor_token` localStorage access;
- token-bearing WebSocket subprotocol creation, parsing, and negotiation;
- tests and docs describing the JWT model.

No aliases, dual-mode middleware, feature flags, or deprecated compatibility endpoints remain.

## Verification

### Backend unit and integration contracts

- Session creation stores only a hash and fixes expiry at 24 hours.
- Valid session resolves current DB user; expired, revoked, deleted-user, and replayed logout session fail.
- Login sets correct development and production cookie attributes and returns no token.
- `GET /api/session` restores identity from cookie.
- Protected REST routes accept cookie and reject Bearer-only requests.
- Logout revokes current session, clears cookie, and leaves a separate session valid.
- Unsafe requests reject missing/invalid Origin or CSRF header.
- Admin CLI creates/promotes a DB user without accepting plaintext password in process arguments.
- Admin access depends on `is_admin`, not username.
- WebSocket accepts allowed-origin cookie sessions and rejects cross-origin, missing-cookie, Bearer, and auth-subprotocol attempts.
- Revocation after socket connection prevents later subscribe and publish delivery.

### Frontend and browser contracts

- Production frontend build succeeds.
- Login reaches project list without localStorage credentials or Authorization headers.
- Reload restores the session through `GET /api/session`.
- WebSocket connects without auth subprotocol and receives only authorized project telemetry.
- Logout clears account data before login UI appears.
- Back/reload after logout cannot restore the revoked session.

### Final checks

Run focused auth/HTTP/WebSocket suites, authoritative backend suite, frontend production build, and actual browser smoke. Update `app.state.md` only with observed results and the next uncompleted roadmap action.
