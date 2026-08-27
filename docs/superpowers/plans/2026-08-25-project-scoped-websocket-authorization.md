# Project-Scoped WebSocket Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver workflow telemetry only to an authenticated socket currently subscribed to a project that user can still view.

**Architecture:** A focused WebSocket hub owns authenticated sockets, one active-project subscription per socket, protocol responses, and event-time RBAC checks. `server.js` creates the hub; workflow publishes persisted events through it; React sends active-project subscriptions and excludes protocol control messages from telemetry state.

**Tech Stack:** Bun/Node ESM, Express 4, `ws` 8, `jsonwebtoken` 9, SQLite project roles, React 18, Vite 5.

## Global Constraints

- Connection JWT uses existing `xfactor-auth.<token>` subprotocol; token query strings remain forbidden.
- One socket subscribes to at most one active project.
- Subscription and every event delivery recheck current server-side project access.
- Admin behavior remains the existing configured-username bypass.
- Failed subscriptions preserve previous valid subscription.
- Client-side project filtering remains defense in depth, never authorization.
- Generated project directories and unrelated dirty paths remain untouched.
- Do not stage or commit: `app.state.md` records extensive user-owned dirty work and explicitly prohibits commits/staging while target files are shared.
- No token/session, reconnect-policy, logout-state, sync-route, or workflow-lock expansion.

## File Structure

- Create `backend/websocketHub.js`: message schema, subscription RBAC, protocol responses, client registry, event-time authorized delivery.
- Create `backend/tests/test_websocket_integration.js`: real production server/WebSocket isolation regression using temporary database and projects root.
- Modify `backend/server.js`: construct hub, delegate connection lifecycle, export runtime handles needed for deterministic integration cleanup.
- Modify `backend/engine/workflow.js`: publish events through hub instead of global broadcast.
- Modify `backend/routes/projectRoutes.js`: pass `wsHub` through workflow entry points.
- Modify `backend/tests/test_runner.js`: include WebSocket integration suite.
- Modify `frontend/src/App.jsx`: send active-project subscriptions and separate control frames from telemetry.
- Modify `app.state.md`: record exact verified result and advance `NEXT_ACTION` only after checks pass.

---

### Task 1: Authorized WebSocket Hub

**Files:**
- Create: `backend/websocketHub.js`
- Test: `backend/tests/test_websocket_integration.js`

**Interfaces:**
- Consumes: `jwtSecret: string`, `adminUser: string`, `getProjectRole(userId, projectId): string | null`, `verifyToken(token, secret): object`.
- Produces: `createProjectWebSocketHub(options): { clients: Set<WebSocket>, handleConnection(ws, req): void, publish(event): void }`.
- `publish(event)` consumes telemetry objects containing non-empty `projectId`.
- Socket state: `ws.user` verified JWT payload and `ws.activeProjectId` string only after successful subscription.

- [ ] **Step 1: Write failing hub contract cases**

Create a loopback HTTP server plus `WebSocketServer`, instantiate the production hub with signed JWTs and an in-memory role map, and attach `hub.handleConnection`. Connect real `ws` clients with `xfactor-auth.<token>`; do not mock socket methods.

Use deterministic helpers:

```js
function nextJson(socket, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), timeoutMs);
        socket.once('message', data => {
            clearTimeout(timer);
            resolve(JSON.parse(data.toString()));
        });
    });
}

async function expectNoMessage(socket, action, timeoutMs = 150) {
    let received = false;
    const listener = () => { received = true; };
    socket.on('message', listener);
    await action();
    await new Promise(resolve => setTimeout(resolve, timeoutMs));
    socket.off('message', listener);
    assert.strictEqual(received, false);
}
```

Cover these assertions:

```js
socketA.send(JSON.stringify({ type: 'subscribe', projectId: projectA.id }));
assert.deepStrictEqual(await nextJson(socketA), { type: 'subscribed', projectId: projectA.id });

socketA.send(JSON.stringify({ type: 'subscribe', projectId: projectB.id }));
assert.deepStrictEqual(await nextJson(socketA), {
    type: 'error', code: 'PROJECT_FORBIDDEN', projectId: projectB.id
});

socketA.send('{');
assert.deepStrictEqual(await nextJson(socketA), { type: 'error', code: 'INVALID_MESSAGE' });
```

Invoke `hub.publish(event)` and prove: unsubscribed socket receives nothing; A receives project A; B never receives project A; failed/invalid subscription leaves A subscribed to project A; switching after granting A access to a second project stops prior-project delivery; deleting A's in-memory membership after subscription stops subsequent delivery.

- [ ] **Step 2: Run the new suite and observe the expected failure**

Run: `node tests/test_websocket_integration.js` from `backend`.

Expected: FAIL with module-not-found/export error because `backend/websocketHub.js` does not exist.

- [ ] **Step 3: Implement strict hub protocol and delivery**

Create `backend/websocketHub.js` with these boundaries:

```js
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function sendJson(ws, payload) {
    if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

export function createProjectWebSocketHub({ jwtSecret, adminUser, getProjectRole, verifyToken }) {
    const clients = new Set();

    function canView(user, projectId) {
        if (!user || !PROJECT_ID_PATTERN.test(projectId)) return false;
        if (user.username === adminUser) return true;
        const userId = user.userId || user.id;
        return Boolean(userId && getProjectRole(userId, projectId));
    }

    function handleMessage(ws, data, isBinary) {
        let message;
        try {
            if (isBinary) throw new Error('binary');
            message = JSON.parse(data.toString());
        } catch {
            sendJson(ws, { type: 'error', code: 'INVALID_MESSAGE' });
            return;
        }
        if (!message || message.type !== 'subscribe' ||
            typeof message.projectId !== 'string' ||
            !PROJECT_ID_PATTERN.test(message.projectId) ||
            Object.keys(message).some(key => key !== 'type' && key !== 'projectId')) {
            sendJson(ws, { type: 'error', code: 'INVALID_MESSAGE' });
            return;
        }
        if (!canView(ws.user, message.projectId)) {
            sendJson(ws, { type: 'error', code: 'PROJECT_FORBIDDEN', projectId: message.projectId });
            return;
        }
        ws.activeProjectId = message.projectId;
        sendJson(ws, { type: 'subscribed', projectId: message.projectId });
    }
```

`handleConnection` retains current safe-URL/token extraction and JWT verification behavior, registers `message`/`close` handlers only after verification, and never adds an unauthenticated socket. `publish` serializes once, then sends only where project IDs match and `canView` still succeeds. Catch per-client RBAC/send failures and skip that client; never broaden delivery on error.

- [ ] **Step 4: Run focused suite**

Run: `node tests/test_websocket_integration.js` from `backend`.

Expected: PASS for real-socket protocol, isolation, subscription switching, invalid-message preservation, and event-time revocation cases.

- [ ] **Step 5: Review boundary**

Confirm hub has no Express routes, workflow persistence, React state, role-priority duplication, or multi-project subscription set. Do not stage or commit.

---

### Task 2: Production Backend Wiring

**Files:**
- Modify: `backend/server.js:1-24,96-144,199-201,218-221`
- Modify: `backend/engine/workflow.js:80-110,148 and every logEvent caller through its existing parameter`
- Modify: `backend/routes/projectRoutes.js:147,396,413`
- Modify: `backend/tests/test_runner.js:13-25`
- Test: `backend/tests/test_websocket_integration.js`

**Interfaces:**
- Consumes: `createProjectWebSocketHub` from Task 1.
- Produces: named exports `server`, `wss`, and `wsHub` from `backend/server.js` for deterministic live-test publication/cleanup.
- `logEvent(wsHub, projectId, ...)` calls `wsHub.publish(event)` after DB persistence.
- `executeProjectTasks(projectId, wsHub)` retains existing workflow behavior.

- [ ] **Step 1: Extend the suite with failing production-bootstrap coverage**

After focused hub cases, set a temporary `DB_PATH`, `PROJECTS_ROOT`, loopback `PORT`, JWT/admin configuration, and dynamically import `server.js`. Seed two users, login through actual HTTP routes, create one project per user, and connect through `/ws/logs` using the production subprotocol. Assert `server.js` exports `wsHub`, authorized subscription acknowledges, forbidden subscription rejects, and `wsHub.publish` isolates events. Cleanup closes clients, `wss`, `server`, and temporary files in `finally`.

- [ ] **Step 2: Run production-bootstrap coverage and observe the expected failure**

Run: `node tests/test_websocket_integration.js` from `backend`.

Expected: focused hub cases pass, then production section fails because `server.js` still owns a raw client `Set` and does not export `wsHub`.

- [ ] **Step 3: Inspect exported-symbol callsites with LSP**

Run LSP references before changing `logEvent` and `executeProjectTasks`. Expected callsites: workflow-internal `logEvent` calls plus `projectRoutes.js` workflow starts. Migrate all; leave no `wsClients` alias.

- [ ] **Step 4: Replace raw socket set with hub**

In `server.js`, import `createProjectWebSocketHub`, instantiate with current `JWT_SECRET`, `ADMIN_USER`, `getProjectRole`, `jwt.verify`, and replace inline connection handler:

```js
const wsHub = createProjectWebSocketHub({
    jwtSecret: JWT_SECRET,
    adminUser: ADMIN_USER,
    getProjectRole,
    verifyToken: jwt.verify
});

wss.on('connection', wsHub.handleConnection);
```

Pass `wsHub` into `createProjectRouter`. Export runtime handles without changing normal startup:

```js
export { server, wss, wsHub };
```

Keep `handleProtocols`, `/ws/logs`, bind address, CORS, rate limits, and REST middleware unchanged.

- [ ] **Step 5: Replace workflow broadcast with authorized publish**

Change only delivery lines in `logEvent`:

```js
if (wsHub) {
    wsHub.publish(event);
}
```

Rename the parameter through `executeProjectTasks`, router factory, approve/resume callsites, and every internal `logEvent` call. No compatibility fallback accepting raw `Set`.

- [ ] **Step 6: Register suite in fail-closed runner**

Insert `'test_websocket_integration.js'` immediately after `'test_http_integration.js'` in `testFiles`.

- [ ] **Step 7: Run backend WebSocket and HTTP contracts**

Run from `backend`:

```text
node tests/test_websocket_integration.js
node tests/test_http_integration.js
```

Expected: both exit `0`; WebSocket suite proves production authorization/isolation, HTTP suite remains silent and green.

- [ ] **Step 8: Review backend diff**

Check: no raw broadcast loop remains; no socket receives before successful subscription; event-time DB lookup exists; errors expose no role/existence details; previous subscription changes only after successful authorization. Do not stage or commit.

---

### Task 3: Active-Project Frontend Subscription

**Files:**
- Modify: `frontend/src/App.jsx:165-239`

**Interfaces:**
- Consumes server control frames `{type:'subscribed', projectId}` and `{type:'error', code, projectId?}`.
- Produces exactly `{type:'subscribe', projectId: activeProjectId}` when authenticated socket is open and active project exists.
- Existing telemetry event schema remains unchanged.

- [ ] **Step 1: Add a failing observable frontend check**

Use browser Network/WebSocket frames against the live backend after login. Before implementation, selecting a project sends no subscription frame and no `subscribed` acknowledgement appears. Record this as red behavioral evidence; do not add source-text tests.

- [ ] **Step 2: Add one subscription sender**

Inside the WebSocket effect, define a closure that reads `activeProjectRef.current` and sends only on an open socket:

```js
const subscribeToActiveProject = socket => {
  const projectId = activeProjectRef.current;
  if (projectId && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', projectId }));
  }
};
```

Call it from `socket.onopen` after the teardown guard.

- [ ] **Step 3: Resubscribe on active-project changes without reconnecting**

Add a separate effect keyed by `activeProjectId` and `token`:

```js
useEffect(() => {
  const socket = ws.current;
  if (token && activeProjectId && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', projectId: activeProjectId }));
  }
}, [activeProjectId, token]);
```

Do not add `activeProjectId` to connection-effect dependencies; project switches must not rebuild the socket.

- [ ] **Step 4: Separate control frames from telemetry**

At start of `onmessage`, after JSON parsing:

```js
if (data.type === 'subscribed') return;
if (data.type === 'error') {
  console.error(`WS protocol error: ${data.code}`);
  return;
}
```

Keep existing `data.projectId` active-project guard and telemetry deduplication unchanged. Never insert control frames into logs or DAG.

- [ ] **Step 5: Build frontend**

Run: `npm run build` from `frontend`.

Expected: exit `0`; Vite production bundle completes without React hook or syntax failure.

- [ ] **Step 6: Browser-drive active-project behavior**

Launch actual backend and frontend, then use browser tooling to login and select project A. Inspect WebSocket frames: one subscribe request and one acknowledgement for A. Switch to project B without reconnecting: same socket sends B subscription and receives B acknowledgement. Publish controlled A/B events through the live test fixture/hub; UI updates only for B after switch. Logout/close surface and stop both processes.

- [ ] **Step 7: Review frontend boundary**

Confirm no URL token, no project query parameter, no multi-project set, no reconnect redesign, and no control message in logs/DAG. Do not stage or commit.

---

### Task 4: Full Verification and State Handoff

**Files:**
- Modify: `app.state.md:827-850`
- Verify: backend/frontend changed contracts

**Interfaces:**
- Consumes exact command outputs from Tasks 2-3.
- Produces `PHASE_1_WEBSOCKET_AUTHORIZATION_RESULT` and one concrete `NEXT_ACTION`; no unverified claims.

- [ ] **Step 1: Run full backend suite**

Run: `npm test` from `backend`.

Expected: exit `0`; all prior 11 suites plus new WebSocket suite pass, yielding `12/12` if no concurrent suite additions exist. Record actual counts/output, not expected numbers, when different.

- [ ] **Step 2: Re-run production frontend build**

Run: `npm run build` from `frontend`.

Expected: exit `0`. Record actual Vite module count/output.

- [ ] **Step 3: Complete mandatory cleanup review**

Check applicable tests, docs, and scaffold impact. No generated scaffold/protocol/docs change is required because wire protocol is browser/backend internal and operator commands remain unchanged. Remove temporary test artifacts and obsolete raw-broadcast comments/names. Do not touch generated project directories.

- [ ] **Step 4: Update living checkpoint**

Append a concise result section after current environment-security result:

```markdown
## PHASE_1_WEBSOCKET_AUTHORIZATION_RESULT

- WebSocket clients subscribe to one active project through an authenticated message protocol.
- Subscription-time and event-time RBAC checks prevent cross-project delivery and stop delivery after membership revocation.
- Frontend project switches resubscribe on the existing socket; protocol control frames do not enter telemetry state.
- Live WebSocket integration verification: `<exact command and observed result>`.
- Backend suite: `<exact observed suite counts>`; frontend build: `<exact observed output>`; browser scenario: `<exact observed behavior>`.
```

Replace `NEXT_ACTION` only from remaining ordered Phase 1 work in the existing roadmap. Given current checkpoint, use restriction/removal of public global project sync unless new evidence changes priority.

- [ ] **Step 5: Final security review**

Verify against design invariants: authentication is insufficient without subscription; unauthorized sockets receive no event bytes; authorization rechecks current DB state; invalid operations preserve prior subscription; no project metadata leaks beyond supplied ID; frontend filtering is not relied upon. Report any blocker exactly; otherwise finish without staging or committing.
