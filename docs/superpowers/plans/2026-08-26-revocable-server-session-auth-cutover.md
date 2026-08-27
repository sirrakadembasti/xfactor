# Revocable Server Session Auth Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-stored 24-hour JWTs with fixed-lifetime, revocable HttpOnly server sessions across REST, WebSocket, frontend bootstrap, and durable DB-admin authorization.

**Architecture:** `backend/auth.js` owns users, admin role, and opaque session persistence. New `backend/sessionAuth.js` owns cookie parsing/serialization plus HTTP session and CSRF middleware. Express and WebSocket share the same session verifier; frontend knows only `checking | authenticated | anonymous` and sends cookies with credentialed requests.

**Tech Stack:** Bun/Node ESM, Express 4, SQLite, `ws` 8, React 18, Vite 5, existing hand-written assertion/integration suites.

## Global Constraints

- Web UI is the only supported auth client; do not preserve CLI/API Bearer compatibility.
- Session lifetime is fixed at 24 hours; no rolling renewal, refresh token, remember-me, or token family.
- Cookie name is `xfactor_session`; attributes are `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=86400`, plus `Secure` in production.
- Raw session tokens are 32 random bytes encoded as 64 lowercase hex characters; only SHA-256 hashes reach SQLite.
- Logout revokes only the current session and always clears its cookie.
- Every unsafe API method requires allowed `Origin` and `X-XFactor-CSRF: 1`.
- WebSocket upgrade, subscription, and publish paths revalidate the same server session and current DB user.
- Admin access comes only from `users.is_admin`; username equality and runtime environment password bypass are removed.
- Clean cutover: remove JWT, localStorage token, Bearer, and auth-subprotocol paths without aliases or feature flags.
- Preserve all pre-existing user changes. Target files are already dirty; do not stage or commit implementation files while user-owned diffs share them. Record task checkpoints through test output and changed-path receipts instead.
- Do not inspect or modify `projects/**`, `backend/projects/**`, `backend/data/projects.db`, runtime `.env`, or generated-project source.

---

## File Map

- Modify `backend/db.js`: idempotent `users.is_admin` column and unique session-hash index.
- Modify `backend/auth.js`: public user shape, durable admin promotion, fixed-lifetime session creation/verification/revocation.
- Create `backend/sessionAuth.js`: cookie contract, request token extraction, `requireAuth`, and CSRF middleware.
- Modify `backend/security.js`: remove JWT helpers; add unsafe-method/Origin/CSRF predicate.
- Modify `backend/routes/authRoutes.js`: DB-only login, `/session`, and idempotent `/logout`.
- Modify `backend/server.js`: shared session middleware, CSRF boundary, cookie-authenticated WS upgrade, DB-admin RBAC.
- Modify `backend/websocketHub.js`: session-ID revalidation at subscribe and publish time.
- Modify `backend/routes/projectRoutes.js`: consume canonical `req.user.id/isAdmin`; remove configured-admin dependency.
- Create `backend/scripts/create_admin.js`: interactive no-echo one-time admin provisioning.
- Modify `backend/package.json` and `backend/package-lock.json`: add `create-admin`; remove `jsonwebtoken`.
- Modify `backend/tests/test_backend.js`: persistence, config, security, and frontend request-option contracts.
- Modify `backend/tests/test_http_integration.js`: real cookie/CSRF/session/admin/logout contracts.
- Modify `backend/tests/test_websocket_integration.js`: cookie/Origin/revocation contracts.
- Create `backend/tests/test_admin_cli.js`: interactive CLI behavior without password disclosure.
- Modify `backend/tests/test_runner.js`: include admin CLI suite.
- Modify `frontend/src/services/api.js`: credentialed cookie request options; remove token storage/header helpers.
- Modify `frontend/src/App.jsx`: session bootstrap, complete account reset, cookie REST/WS flow.
- Modify `frontend/src/main.jsx`: error-boundary reset performs server logout instead of localStorage deletion.
- Modify `backend/.env.example`, `README.md`, `docs/KULLANIM-KILAVUZU.md`, `docs/USAGE.md`, `backend/scripts/generate_graph.js`: operator/auth contract.
- Modify `app.state.md`: observed execution result and next action only after verification.

---

### Task 1: Durable User and Session Model

**Files:**
- Modify: `backend/db.js:34-110`
- Modify: `backend/auth.js:41-107,226-287`
- Test: `backend/tests/test_backend.js:22-138`

**Interfaces:**
- Produces: `SESSION_TTL_MS = 86_400_000`.
- Produces: `toPublicUser(user) -> { id, username, isAdmin }`.
- Produces: `promoteUserToAdmin(username, password) -> public user`; existing users must pass their current password.
- Produces: `createSession(userId, { now? }) -> { id, userId, token, expiresAt }`.
- Produces: `verifySessionToken(token, { now? }) -> { id, expiresAt, user } | null`.
- Produces: `verifySessionId(sessionId, { now? }) -> { id, expiresAt, user } | null`.
- Produces: `revokeSession(token) -> boolean` and retained `revokeAllSessionsForUser(userId) -> boolean`.

- [ ] **Step 1: Write RED persistence tests**

Replace the current session assertion with behavioral checks shaped as follows:

```js
const {
    SESSION_TTL_MS,
    createUser,
    findUserByUsername,
    promoteUserToAdmin,
    createSession,
    verifySessionToken,
    verifySessionId,
    revokeSession
} = await import('../auth.js');

const username = `session${Date.now()}`;
const password = 'StrongPassword!2028';
const user = createUser(username, password);
assert.strictEqual(user.isAdmin, false);
assert.throws(() => promoteUserToAdmin(username, 'WrongPassword!2028'), /credential/i);
assert.deepStrictEqual(promoteUserToAdmin(username, password), {
    id: user.id,
    username,
    isAdmin: true
});
assert.strictEqual(findUserByUsername(username).isAdmin, true);

const now = new Date('2026-08-26T12:00:00.000Z');
const session = createSession(user.id, { now });
assert.match(session.token, /^[a-f0-9]{64}$/);
assert.strictEqual(
    new Date(session.expiresAt).getTime() - now.getTime(),
    SESSION_TTL_MS
);
const stored = db.prepare('SELECT token_hash FROM user_sessions WHERE id = ?').get(session.id);
assert.notStrictEqual(stored.token_hash, session.token);
assert.strictEqual(stored.token_hash, crypto.createHash('sha256').update(session.token).digest('hex'));
assert.deepStrictEqual(verifySessionToken(session.token, { now }).user, {
    id: user.id,
    username,
    isAdmin: true
});
assert.strictEqual(verifySessionId(session.id, { now }).id, session.id);

const other = createSession(user.id, { now });
assert.strictEqual(revokeSession(session.token), true);
assert.strictEqual(verifySessionToken(session.token, { now }), null);
assert.strictEqual(verifySessionToken(other.token, { now }).id, other.id);

db.prepare('UPDATE user_sessions SET expires_at = ? WHERE id = ?')
    .run('2026-08-26T11:59:59.000Z', other.id);
assert.strictEqual(verifySessionId(other.id, { now }), null);
```

Add a separate deleted-user assertion: create a user and session, delete that user row, then assert both token and session-ID verification return `null`.

- [ ] **Step 2: Run the RED test**

Run from `backend`:

```bash
node tests/test_backend.js
```

Expected: session/admin assertions fail because `isAdmin`, `promoteUserToAdmin`, fixed clock input, structured verification, and session-ID verification do not exist.

- [ ] **Step 3: Add idempotent schema changes**

After existing `projects` column checks in `backend/db.js`, add:

```js
if (!columnExists('users', 'is_admin')) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)');
```

- [ ] **Step 4: Implement canonical user/admin shape**

In `backend/auth.js`, map DB rows through one private helper:

```js
function mapUserRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash,
        isAdmin: row.is_admin === 1
    };
}

export function toPublicUser(user) {
    if (!user) return null;
    return { id: user.id, username: user.username, isAdmin: user.isAdmin === true };
}
```

Use `mapUserRow` in `findUserByUsername`, `getUserById`, and `createUser`. Add:

```js
export function promoteUserToAdmin(username, password) {
    let user = findUserByUsername(username);
    if (user && !verifyPassword(password, user.passwordHash)) {
        throw new Error('Existing user credentials do not match.');
    }
    if (!user) user = createUser(username, password);
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    return toPublicUser({ ...user, isAdmin: true });
}
```

- [ ] **Step 5: Implement fixed sessions and shared verification**

Replace configurable TTL behavior with:

```js
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function mapSessionRow(row, nowMs) {
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= nowMs) return null;
    return {
        id: row.session_id,
        expiresAt: row.expires_at,
        user: {
            id: row.user_id,
            username: row.username,
            isAdmin: row.is_admin === 1
        }
    };
}
```

`createSession(userId, { now = new Date() } = {})` must delete rows whose `expires_at <= now.toISOString()`, create a 32-byte hex token, insert its SHA-256 hash, and set `expiresAt` to `now + SESSION_TTL_MS`. Both verification functions must use a `JOIN users` query selecting session ID, expiry, revocation, user ID, username, and `is_admin`; one queries `token_hash`, the other session `id`. Return `mapSessionRow(row, now.getTime())`.

- [ ] **Step 6: Run persistence tests GREEN**

Run:

```bash
node tests/test_backend.js
```

Expected: all backend assertions pass, including hash-only storage, fixed expiry, current user/admin loading, per-session revoke, expiry, and deleted-user rejection.

- [ ] **Step 7: Record task checkpoint**

Record exact command result and changed paths `backend/db.js`, `backend/auth.js`, `backend/tests/test_backend.js`. Do not stage them.

---

### Task 2: Session Cookie and CSRF Primitives

**Files:**
- Create: `backend/sessionAuth.js`
- Modify: `backend/security.js:1-20,66-73,128-156`
- Modify: `backend/tests/test_backend.js:22-220`

**Interfaces:**
- Consumes Task 1 `verifySessionToken`.
- Produces `SESSION_COOKIE_NAME`, `readSessionToken(req)`, `serializeSessionCookie(token, expiresAt, { production })`, `serializeClearedSessionCookie({ production })`.
- Produces `createRequireAuth({ production }) -> Express middleware`.
- Produces `createCsrfProtection({ allowedOrigins }) -> Express middleware`.
- Produces `isValidCsrfRequest(req, allowedOrigins) -> boolean`.

- [ ] **Step 1: Add RED security and cookie tests**

In `test_backend.js`, replace JWT security assertions with:

```js
const unsafe = {
    method: 'POST',
    headers: { origin: 'https://xfactor.example', 'x-xfactor-csrf': '1' }
};
assert.strictEqual(isValidCsrfRequest(unsafe, ['https://xfactor.example']), true);
assert.strictEqual(isValidCsrfRequest(
    { ...unsafe, headers: { origin: 'https://evil.example', 'x-xfactor-csrf': '1' } },
    ['https://xfactor.example']
), false);
assert.strictEqual(isValidCsrfRequest({ method: 'GET', headers: {} }, []), true);

const cookie = serializeSessionCookie(
    'a'.repeat(64),
    '2026-08-27T12:00:00.000Z',
    { production: true }
);
assert.match(cookie, /^xfactor_session=[a-f0-9]{64};/);
for (const attribute of ['Max-Age=86400', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure']) {
    assert.ok(cookie.includes(attribute));
}
assert.ok(!serializeSessionCookie(
    'a'.repeat(64),
    '2026-08-27T12:00:00.000Z',
    { production: false }
).includes('Secure'));
assert.strictEqual(
    readSessionToken({ headers: { cookie: `other=1; xfactor_session=${'b'.repeat(64)}` } }),
    'b'.repeat(64)
);
assert.strictEqual(readSessionToken({ headers: { cookie: 'xfactor_session=invalid' } }), null);
```

Add middleware harnesses with plain request/response objects:

```js
function mockResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

const middlewareUser = createUser(`middleware${Date.now()}`, 'MiddlewarePassword!2028');
const middlewareSession = createSession(middlewareUser.id);
const authenticatedReq = {
    method: 'GET',
    headers: { cookie: `xfactor_session=${middlewareSession.token}` }
};
const authenticatedRes = mockResponse();
let nextCalled = false;
createRequireAuth({ production: false })(authenticatedReq, authenticatedRes, () => {
    nextCalled = true;
});
assert.strictEqual(nextCalled, true);
assert.strictEqual(authenticatedReq.authSessionId, middlewareSession.id);
assert.strictEqual(authenticatedReq.user.id, middlewareUser.id);

const missingRes = mockResponse();
createRequireAuth({ production: false })(
    { method: 'GET', headers: {} },
    missingRes,
    () => assert.fail('missing session must not call next')
);
assert.strictEqual(missingRes.statusCode, 401);
assert.strictEqual(missingRes.body.code, 'AUTH_REQUIRED');
assert.ok(missingRes.headers['set-cookie'].includes('Max-Age=0'));

const csrfRes = mockResponse();
createCsrfProtection({ allowedOrigins: ['https://xfactor.example'] })(
    { method: 'POST', headers: { origin: 'https://evil.example' } },
    csrfRes,
    () => assert.fail('invalid CSRF proof must not call next')
);
assert.strictEqual(csrfRes.statusCode, 403);
assert.strictEqual(csrfRes.body.code, 'CSRF_REJECTED');
```

- [ ] **Step 2: Run the RED primitive tests**

Run from `backend`:

```bash
node tests/test_backend.js
```

Expected: missing cookie/CSRF exports and remaining JWT security helpers fail.

- [ ] **Step 3: Implement CSRF predicate and remove JWT security helpers**

In `security.js`, remove the `jsonwebtoken` import, `extractWebSocketToken`, and `validateWebSocketAuthToken`. Add:

```js
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isValidCsrfRequest(req, allowedOrigins = []) {
    const method = String(req?.method || 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) return true;
    return req?.headers?.['x-xfactor-csrf'] === '1'
        && isAllowedOrigin(req?.headers?.origin, allowedOrigins);
}
```

- [ ] **Step 4: Create `sessionAuth.js` cookie contract**

Implement token parsing without a general cookie dependency because accepted alphabet is fixed:

```js
import { verifySessionToken } from './auth.js';
import { isValidCsrfRequest } from './security.js';

export const SESSION_COOKIE_NAME = 'xfactor_session';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function readSessionToken(req) {
    const cookieHeader = req?.headers?.cookie;
    if (typeof cookieHeader !== 'string') return null;
    for (const part of cookieHeader.split(';')) {
        const [name, ...valueParts] = part.trim().split('=');
        if (name !== SESSION_COOKIE_NAME) continue;
        const value = valueParts.join('=');
        return TOKEN_PATTERN.test(value) ? value : null;
    }
    return null;
}
```

`serializeSessionCookie` must emit `Max-Age=86400`, the supplied `Expires`, `Path=/`, `HttpOnly`, and `SameSite=Lax`, appending `Secure` only in production. `serializeClearedSessionCookie` must use empty value, `Max-Age=0`, epoch `Expires`, and matching Path/HttpOnly/SameSite/Secure attributes.

- [ ] **Step 5: Implement middleware factories**

`createRequireAuth({ production })` reads and verifies the token. On success it assigns `req.user = session.user` and `req.authSessionId = session.id`. On failure it sets the clearing cookie and returns status 401:

```js
{ error: 'Oturum gerekli.', code: 'AUTH_REQUIRED' }
```

`createCsrfProtection({ allowedOrigins })` calls `isValidCsrfRequest`; failure returns status 403:

```js
{ error: 'İstek kaynağı doğrulanamadı.', code: 'CSRF_REJECTED' }
```

- [ ] **Step 6: Run primitive tests GREEN**

Run:

```bash
node tests/test_backend.js
```

Expected: cookie parsing/serialization, session middleware, CSRF predicate, and removal of JWT security helpers pass without changing live routes yet.

- [ ] **Step 7: Record task checkpoint**

Record exact command result and changed/new paths `backend/security.js`, `backend/sessionAuth.js`, and `backend/tests/test_backend.js`. Do not stage them.

### Task 3: No-Echo Admin Provisioning CLI

**Files:**
- Create: `backend/scripts/create_admin.js`
- Create: `backend/tests/test_admin_cli.js`
- Modify: `backend/package.json:7-11`
- Modify: `backend/tests/test_runner.js:13-26`

**Interfaces:**
- Consumes Task 1 `promoteUserToAdmin(username, password)`.
- Produces `readTerminalLine(prompt, { hidden, stdin, stdout }) -> Promise<string>`.
- Produces `runCreateAdmin({ args, stdin, stdout, provision }) -> Promise<public user>`.
- Produces operator command `npm run create-admin -- [username]`; passwords are never accepted in process arguments.

- [ ] **Step 1: Write RED CLI suite**

Create a fake TTY using `EventEmitter` with `isTTY = true`, `setRawMode(value)` recording transitions, `resume()`, and `pause()`. Capture stdout writes. Exercise:

```js
const provisionCalls = [];
const run = runCreateAdmin({
    args: ['existing-admin'],
    stdin: fakeInput,
    stdout: fakeOutput,
    provision: (username, password) => {
        provisionCalls.push({ username, password });
        return { id: 'admin-id', username, isAdmin: true };
    }
});
feedKeys(fakeInput, 'StrongPassword!2026\rStrongPassword!2026\r');
const result = await run;
assert.deepStrictEqual(result, { id: 'admin-id', username: 'existing-admin', isAdmin: true });
assert.deepStrictEqual(provisionCalls, [{ username: 'existing-admin', password: 'StrongPassword!2026' }]);
assert.ok(!fakeOutput.text.includes('StrongPassword!2026'));
assert.deepStrictEqual(fakeInput.rawModeTransitions, [true, false, true, false]);
await assert.rejects(
    runCreateAdmin({ args: ['admin', 'plaintext-password'], stdin: fakeInput, stdout: fakeOutput, provision: () => {} }),
    /username argument/i
);
```

Add mismatch and non-TTY rejection cases. The suite must exit nonzero through existing test harness conventions.

- [ ] **Step 2: Run CLI suite RED**

Run:

```bash
node tests/test_admin_cli.js
```

Expected: module not found.

- [ ] **Step 3: Implement terminal input and provisioning runner**

`readTerminalLine` must:

- reject when stdin/stdout are not TTYs;
- set raw mode only while reading;
- accept Enter, printable characters, Backspace, and Ctrl+C;
- echo printable characters only when `hidden === false`;
- always restore raw mode and listeners in success/error cleanup.

`runCreateAdmin` accepts zero or one username argument, prompts visibly when omitted, reads password and confirmation hidden, rejects mismatch, then calls `provision`. Print only `Admin hazır: <username>` after success.

Guard executable entry with:

```js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCreateAdmin({ args: process.argv.slice(2) }).catch(error => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}
```

- [ ] **Step 4: Wire package and master runner**

Add:

```json
"create-admin": "bun scripts/create_admin.js"
```

Add `test_admin_cli.js` after `test_backend.js` in `test_runner.js`.

- [ ] **Step 5: Run CLI suite GREEN**

Run:

```bash
node tests/test_admin_cli.js
```

Expected: all fake-TTY, hidden-password, mismatch, extra-argument, and cleanup assertions pass.

- [ ] **Step 6: Smoke actual CLI in a PTY against a temporary DB**

Launch from `backend` with temporary `DB_PATH`:

```bash
npm run create-admin -- smoke-admin
```

Type `StrongPassword!2026` twice. Observe password characters do not echo and output is exactly `Admin hazır: smoke-admin`. Query the temporary DB through a short Bun command and observe `users.is_admin = 1`; delete only the temporary DB afterward.

- [ ] **Step 7: Record task checkpoint**

Record exact suite and PTY smoke evidence. Do not stage implementation files.

---

### Task 4: Live HTTP and WebSocket Session Cutover

**Files:**
- Modify: `backend/config.js:20-70`
- Modify: `backend/routes/authRoutes.js:1-34`
- Modify: `backend/server.js:1-191`
- Modify: `backend/websocketHub.js:1-133`
- Modify: `backend/routes/projectRoutes.js:148-190`
- Modify: `backend/tests/test_http_integration.js:54-318`
- Modify: `backend/tests/test_websocket_integration.js:1-261`

**Interfaces:**
- Consumes Task 1 session/user/admin functions.
- Consumes Task 2 cookie, `requireAuth`, and CSRF middleware.
- Produces `createAuthRouter({ requireAuth, production })` with `POST /login`, `GET /session`, and `POST /logout`.
- Produces `createProjectWebSocketHub({ getProjectRole, verifySessionId })`.
- `req.user` is `{ id, username, isAdmin }`; sockets retain only `authSessionId`.

- [ ] **Step 1: Rewrite HTTP integration RED**

Use one origin and cookie helper:

```js
const APP_ORIGIN = 'https://xfactor.example';
const csrfHeaders = { origin: APP_ORIGIN, 'x-xfactor-csrf': '1' };
const cookiePair = response => response.headers.get('set-cookie')?.split(';', 1)[0] || '';
```

Seed normal users and `promoteUserToAdmin('integration-admin', 'IntegrationAdmin!2026')` through the existing isolated Bun seed. Remove `JWT_SECRET`, `ADMIN_USER`, and `ADMIN_PASS` from test environment.

Add assertions in order:

1. login without Origin/header returns 403 `CSRF_REJECTED`;
2. login with `csrfHeaders` returns `{ user }`, no `token`, and a Secure/HttpOnly/SameSite/Max-Age cookie;
3. `GET /session` with Cookie returns the same user;
4. Bearer-only protected request returns 401;
5. cookie-backed project POST without CSRF returns 403;
6. cookie + CSRF creates projects and preserves owner isolation;
7. second login without presenting first Cookie creates an independent session;
8. logout first Cookie returns success and clearing cookie;
9. first Cookie replay returns 401 while second Cookie remains valid;
10. durable DB admin sees all projects and removed sync route remains 404.

Move the authenticated secure-WebSocket acceptance check from this HTTP suite into the WebSocket suite below. Retain only plaintext upgrade rejection here, because transport rejection occurs before auth.

- [ ] **Step 2: Rewrite WebSocket integration RED**

Remove JWT imports, signing, token parameters, and subprotocol negotiation. Connect with:

```js
function connect(url, { cookie, origin = 'http://127.0.0.1:5173', protocols } = {}) {
    return new Promise((resolve, reject) => {
        const headers = { Origin: origin };
        if (cookie) headers.Cookie = cookie;
        const socket = protocols
            ? new WebSocket(url, protocols, { headers })
            : new WebSocket(url, { headers });
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}
```

For isolated hub tests, attach `req.authSessionId` during test-server upgrade and back `verifySessionId` with a mutable session map. Preserve all project subscription/RBAC checks. Delete session A after subscription, then assert later subscribe/publish sends no project data and closes with code 1008.

For actual server tests:

- login with allowed Origin + CSRF and extract cookie pairs;
- create projects with Cookie + CSRF;
- accept allowed-Origin Cookie session with no protocol;
- reject missing-cookie, cross-origin-cookie, Bearer-only, and `['xfactor-auth.obsolete']` attempts;
- logout session A through HTTP and prove its open socket receives no later event;
- prove session B remains connected and authorized for project B.

- [ ] **Step 3: Run both live suites RED**

Run:

```bash
node tests/test_http_integration.js && node tests/test_websocket_integration.js
```

Expected: login lacks cookie/CSRF/session endpoints and WebSocket still requires JWT/subprotocol auth.

- [ ] **Step 4: Cut runtime config to transport requirements**

Delete `ADMIN_USER`, `ADMIN_PASS`, and `JWT_SECRET` parsing, validation, and returned fields from `validateRuntimeConfig`. Preserve production `TRUST_PROXY=loopback` and HTTPS-only `ALLOWED_ORIGINS` checks exactly. Replace backend config tests with development success and existing production transport validation:

```js
assert.doesNotThrow(() => validateRuntimeConfig({
    NODE_ENV: 'development',
    ALLOWED_ORIGINS: 'http://localhost:5173'
}));
```

- [ ] **Step 5: Replace auth routes**

`createAuthRouter({ requireAuth, production })` must:

```js
router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!validateLoginPayload({ username, password })) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı adı veya şifre formatı.' });
    }
    const user = authenticateUser(username.trim(), password);
    if (!user) {
        return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }
    const existingToken = readSessionToken(req);
    if (existingToken) revokeSession(existingToken);
    const session = createSession(user.id);
    res.setHeader('Set-Cookie', serializeSessionCookie(
        session.token,
        session.expiresAt,
        { production }
    ));
    return res.json({ user: toPublicUser(user) });
});
router.get('/session', requireAuth, (req, res) => res.json({ user: req.user }));
router.post('/logout', (req, res) => {
    const token = readSessionToken(req);
    if (token) revokeSession(token);
    res.setHeader('Set-Cookie', serializeClearedSessionCookie({ production }));
    return res.status(200).json({ success: true });
});
```


- [ ] **Step 6: Wire HTTP middleware and durable admin RBAC**

In `server.js`:

- remove `jsonwebtoken` and all runtime admin/JWT constants;
- install `createCsrfProtection({ allowedOrigins })` on `/api` after CORS and before routers;
- create `requireAuth = createRequireAuth({ production: runtimeConfig.production })`;
- pass `{ requireAuth, production: runtimeConfig.production }` to auth router;
- pass only `{ requireAuth, projectAccess, wsHub }` to project router;
- in `projectAccess`, use `req.user.id` and short-circuit only on `req.user.isAdmin === true`.

In `projectRoutes.js`, remove `ADMIN_USER` from factory arguments. Listing becomes:

```js
const projects = req.user.isAdmin
    ? getAllProjects()
    : getUserProjects(req.user.id);
```

Project creation always uses `req.user.id` as owner, including admins.

- [ ] **Step 7: Authenticate WebSocket upgrades with Cookie and Origin**

Use callback-form `verifyClient`. Evaluate:

1. `isSecureTransportRequest(req, transportPolicy)`; reject 426;
2. `isAllowedOrigin(req.headers.origin, allowedOrigins)`; reject 403;
3. `verifySessionToken(readSessionToken(req))`; reject 401;
4. assign only `req.authSessionId = session.id`; accept.

Delete `handleProtocols`. Instantiate:

```js
const wsHub = createProjectWebSocketHub({
    getProjectRole,
    verifySessionId
});
```

- [ ] **Step 8: Rework hub around current session identity**

Delete token reading, JWT verification, and configured username bypass. `handleConnection` rejects missing `req.authSessionId`; accepted sockets store only that ID. Resolve access through:

```js
function resolveViewer(sessionId, projectId) {
    if (!sessionId || typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) return null;
    const session = verifySessionId(sessionId);
    if (!session) return null;
    if (session.user.isAdmin) return session.user;
    return getProjectRole(session.user.id, projectId) ? session.user : null;
}
```

Subscription-time invalid session closes 1008 with `SESSION_INVALID`. Project denial retains `{ type: 'error', code: 'PROJECT_FORBIDDEN', projectId }` and preserves prior valid subscription. Publish-time invalid session closes client 1008 and sends no event. Valid sessions recheck current project membership immediately before every send.

- [ ] **Step 9: Run live HTTP and WebSocket suites GREEN**

Run:

```bash
node tests/test_http_integration.js && node tests/test_websocket_integration.js
```

Expected: cookie login/session/logout/replay, CSRF, durable admin, transport, Origin, legacy-auth rejection, project isolation, membership revocation, and live session revocation all pass.

- [ ] **Step 10: Run backend unit contracts after live cutover**

Run:

```bash
node tests/test_backend.js && node tests/test_admin_cli.js
```

Expected: config, cookie/session helpers, frontend-independent security assertions, and CLI contracts all pass.

- [ ] **Step 11: Record task checkpoint**

Record exact four-suite outputs and all changed paths. Do not stage them.

### Task 5: Frontend Session Bootstrap and Account-State Cutover

**Files:**
- Modify: `frontend/src/services/api.js:1-160`
- Modify: `frontend/src/App.jsx:1-271,501-512`
- Modify: `frontend/src/main.jsx:1-50`
- Modify: `backend/tests/test_backend.js:202-238`

**Interfaces:**
- Produces `buildSessionRequestOptions(options = {}) -> RequestInit` with `credentials: 'include'` and CSRF header on unsafe methods.
- Retains `resolveApiBaseUrl`, `API_BASE_URL`, `buildApiUrl`, `buildWebSocketUrl`, and `createApiClient`.
- Removes `getStoredToken`, `setStoredToken`, `clearStoredToken`, and `buildAuthHeaders`.
- `App` auth state is exactly `checking | authenticated | anonymous` plus `currentUser`.

- [ ] **Step 1: Write RED frontend service contract**

Replace backend test 0h token assertions with:

```js
const apiModule = await import('../../frontend/src/services/api.js');
const { buildSessionRequestOptions, buildWebSocketUrl, buildApiUrl } = apiModule;
const getOptions = buildSessionRequestOptions();
assert.strictEqual(getOptions.credentials, 'include');
assert.strictEqual(getOptions.headers.Authorization, undefined);
assert.strictEqual(getOptions.headers['X-XFactor-CSRF'], undefined);

const postOptions = buildSessionRequestOptions({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
});
assert.strictEqual(postOptions.credentials, 'include');
assert.strictEqual(postOptions.headers['X-XFactor-CSRF'], '1');
assert.strictEqual(postOptions.headers.Authorization, undefined);
assert.strictEqual(buildWebSocketUrl('https://xfactor.example/api'), 'wss://xfactor.example/ws/logs');
assert.ok(!buildWebSocketUrl('https://xfactor.example/api').includes('token'));
```

- [ ] **Step 2: Run service contract RED**

Run from `backend`:

```bash
node tests/test_backend.js
```

Expected: `buildSessionRequestOptions` is missing and old token helpers remain in use.

- [ ] **Step 3: Replace frontend request credential helpers**

In `api.js`, add:

```js
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const buildSessionRequestOptions = (options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (UNSAFE_METHODS.has(method)) headers['X-XFactor-CSRF'] = '1';
  return { ...options, method, credentials: 'include', headers };
};
```

Delete all localStorage and Bearer helpers. `createApiClient.request` calls `fetch(url, buildSessionRequestOptions({ ...options, headers }))`; add `getSession()` and `logout()` methods, and keep `login()` under the same unsafe request builder.

- [ ] **Step 4: Replace App token truth and centralize account reset**

Use:

```js
const [authStatus, setAuthStatus] = useState('checking');
const [currentUser, setCurrentUser] = useState(null);
```

Add one reset boundary:

```js
const clearAccountState = useCallback(() => {
  if (ws.current) ws.current.close();
  ws.current = null;
  activeProjectRef.current = null;
  setProjects([]);
  setSearchQuery('');
  setActiveProjectId(null);
  setProjectState(null);
  setChatInput('');
  setIsThinking(false);
  setActiveMenuProjectId(null);
  const emptyDag = computeHierarchicalDAG([]);
  setNodes(emptyDag.nodes);
  setEdges(emptyDag.edges);
  setLogs([]);
  setViewMode('chat');
  setProjectFiles([]);
  setActiveFile(null);
  setLoginPassword('');
  setLoginError('');
}, []);

const becomeAnonymous = useCallback(() => {
  clearAccountState();
  setCurrentUser(null);
  setAuthStatus('anonymous');
}, [clearAccountState]);
```

`authFetch` uses `buildSessionRequestOptions`; on 401 it calls `becomeAnonymous` before throwing.

- [ ] **Step 5: Add startup, login, logout, and WS transitions**

Bootstrap once:

```js
useEffect(() => {
  let active = true;
  fetch(`${API_BASE}/session`, buildSessionRequestOptions())
    .then(async response => {
      if (!response.ok) throw new Error('AUTH_REQUIRED');
      return response.json();
    })
    .then(data => {
      if (!active) return;
      setCurrentUser(data.user);
      setAuthStatus('authenticated');
    })
    .catch(() => {
      if (active) becomeAnonymous();
    });
  return () => { active = false; };
}, [becomeAnonymous]);
```

Login posts through `buildSessionRequestOptions`, reads `data.user`, and never handles a token. Logout posts `/logout`; in `finally`, call `becomeAnonymous` so local account state clears even on network failure.

Replace every `token` condition/dependency with `authStatus === 'authenticated'`. Construct WebSocket exactly as `new WebSocket(WS_URL)`. Existing effect cleanup must cancel reconnect timer and close the socket.

Render a neutral full-screen loading surface while `authStatus === 'checking'`; render `LoginView` only for `anonymous`.

- [ ] **Step 6: Fix error-boundary reset semantics**

Import `API_BASE_URL`, `buildApiUrl`, and `buildSessionRequestOptions` in `main.jsx`. Replace reset logic with:

```js
handleReset = async () => {
  try {
    await fetch(
      buildApiUrl(API_BASE_URL, '/logout'),
      buildSessionRequestOptions({ method: 'POST' })
    );
  } catch {
    // Navigation still clears rendered account state when backend is unavailable.
  }
  window.location.href = '/';
};
```

Remove localStorage access and change copy from browser-cache token cleanup to server-session reset.

- [ ] **Step 7: Run service and production-build checks GREEN**

Run:

```bash
cd backend && node tests/test_backend.js
cd ../frontend && npm run build
```

Expected: frontend service contract passes; Vite production build exits 0.

- [ ] **Step 8: Browser smoke actual auth lifecycle**

Use temporary DB/project roots. Provision `browser-owner` through the admin/user helper, start backend and Vite with managed long-running process tools, then browser-drive:

1. initial page shows login only after `/api/session` returns 401;
2. login sends `Origin`, `X-XFactor-CSRF: 1`, and no Authorization header;
3. response JSON has user and no token; `localStorage.getItem('xfactor_token') === null`;
4. project list renders;
5. reload restores dashboard through `/api/session` without another login;
6. WS handshake has no `Sec-WebSocket-Protocol` auth value and subscription succeeds;
7. logout request returns 200, login UI appears, and projects/logs/files are absent;
8. reload remains logged out and cannot replay the revoked cookie.

Capture browser network/DOM observations; this is behavioral proof for the account-state change.

- [ ] **Step 9: Record task checkpoint**

Record exact backend test, Vite build, and browser observations. Stop managed backend/frontend processes and delete only temporary data.

---

### Task 6: Dependency, Operator Docs, Full Verification, and Checkpoint

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `backend/.env.example`
- Modify: `README.md:130-200`
- Modify: `docs/KULLANIM-KILAVUZU.md:90-151`
- Modify: `docs/USAGE.md:56-64`
- Modify: `backend/scripts/generate_graph.js:141-207`
- Modify: `app.state.md:14-30,183-196,477-515,661-681,882-895`

**Interfaces:**
- Removes runtime dependency `jsonwebtoken`.
- Documents `npm run create-admin -- <username>` before first login.
- Produces final checkpoint `PHASE_1_REVOCABLE_SERVER_SESSION_RESULT` from observed commands only.

- [ ] **Step 1: Remove JWT dependency deterministically**

Run from `backend`:

```bash
npm uninstall jsonwebtoken
```

Confirm `package.json` and lockfile no longer declare the package. Preserve `jsonwebtoken` strings inside generated-project quality fixtures and scaffold dependency catalogs: those validate generated application code and are not XFactor runtime auth.

- [ ] **Step 2: Update runtime environment and operator docs**

Remove `JWT_SECRET`, `ADMIN_USER`, and `ADMIN_PASS` from `backend/.env.example`, README, and usage guides. Add first-admin provisioning before server login:

```bash
cd backend
npm run create-admin -- admin
```

State that the command prompts and confirms the password without echo, stores a scrypt password hash and durable admin role, and can promote an existing user only when that user's current password is supplied. Document 24-hour HttpOnly cookie sessions, current-session logout, and production Secure-cookie/HTTPS requirement. Replace JWT/Bearer/subprotocol descriptions and stale test-count claims with behavior-based wording.

Update `generate_graph.js` descriptions to “HttpOnly server-session API client” and “Scrypt + revocable session + RBAC” without hard-coded test counts.

- [ ] **Step 3: Scan active runtime/docs for obsolete auth paths**

Search only active platform/runtime/docs, excluding historical superpowers plans/specs and generated-project audit fixtures. Expected no matches:

```text
JWT_SECRET
ADMIN_USER
ADMIN_PASS
xfactor_token
xfactor-auth
jsonwebtoken
Authorization: Bearer (XFactor auth only; LLM provider Authorization remains valid)
```

Any match in `backend/llm.js` remains because it authenticates outbound provider calls. Any match in quality-gate generated-source fixtures remains because those fixtures audit generated applications.

- [ ] **Step 4: Run focused behavioral suites**

From `backend`:

```bash
node tests/test_backend.js
node tests/test_admin_cli.js
node tests/test_http_integration.js
node tests/test_websocket_integration.js
```

Expected: every command exits 0. HTTP output proves cookie login/session/logout/replay and CSRF. WS output proves allowed-origin cookie auth and live revocation. CLI output proves hidden credential handling.

- [ ] **Step 5: Run authoritative backend and frontend checks**

Run:

```bash
cd backend && npm test
cd ../frontend && npm run build
```

Expected: master runner exits 0 with all 13 suites passing; Vite build exits 0.

- [ ] **Step 6: Repeat final browser smoke after dependency/docs cutover**

Exercise login → project list → reload restore → authorized WebSocket subscribe → logout → reload rejection. Confirm no localStorage credential, Authorization header, or token subprotocol appears. This repeat is required because it validates the final assembled surface, not only Task 5's intermediate frontend.

- [ ] **Step 7: Update `app.state.md` from observed evidence**

Update current authentication diagrams/risks to the cookie-session contract. Mark A-01/A-03/A-04/A-06 and Phase 1 items 8-9 complete only when their exact verification above passed. Add `PHASE_1_REVOCABLE_SERVER_SESSION_RESULT` with four factual bullet groups: implemented session/admin/CSRF/WS/frontend contracts; focused command outputs and exit codes; full backend/frontend outputs; browser observations. Set:

```markdown
## NEXT_ACTION

Phase 2: introduce one canonical project repository/path service and durable workflow attempt/lease records.
```

Never copy expected counts into this result; transcribe only observed output.

- [ ] **Step 8: Final plan-contract review**

Confirm all affected callers, active docs, config examples, tests, and package metadata use only the server-session model. Confirm no runtime `.env`, generated project, unrelated dirty file, or pre-existing staged change was modified by verification.

## Execution Boundary

This plan completes Phase 1 auth selection and account-transition cleanup. It does not implement refresh tokens, external API credentials, OAuth, rolling sessions, all-device logout UI, general schema migrations, workflow leases, cancellation, sandboxing, or generated-project repairs.
