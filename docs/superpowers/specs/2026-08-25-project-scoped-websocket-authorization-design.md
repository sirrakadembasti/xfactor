# Project-Scoped WebSocket Authorization Design

## Goal

Prevent authenticated users from receiving telemetry for projects they cannot currently view. Keep one WebSocket connection per browser session and deliver events only for the project actively selected in the UI.

## Scope

This change covers WebSocket subscription authorization, event-time authorization, frontend active-project subscription, and live integration coverage.

Out of scope: token storage and refresh, logout state cleanup, reconnect backoff redesign, global sync authorization, workflow locking, and other Phase 1 items in `app.state.md`.

## Current Problem

`backend/server.js` authenticates a WebSocket connection and adds it to a global `Set`. `backend/engine/workflow.js::logEvent` then sends every project event to every open authenticated socket. `frontend/src/App.jsx` discards events for inactive projects, but client-side filtering does not prevent disclosure.

## Decision

Use a message-based, single-active-project subscription.

Connection authentication proves user identity only. After connection, the client sends:

```json
{ "type": "subscribe", "projectId": "project-123" }
```

The server validates the message and current project access before storing `activeProjectId` on the socket. Authorization is checked again immediately before each event is sent. This second check closes the race where membership is revoked after subscription.

Alternative approaches rejected:

- Project ID in connection URL: forces reconnection on each project switch and mixes resource selection into connection lifecycle.
- User-wide event fan-out: still sends inactive-project telemetry and violates the selected least-privilege behavior.

## Server Components

### Connection identity

The existing JWT subprotocol remains unchanged. A verified socket stores the decoded user identity. Invalid or missing tokens continue to close the connection with policy-violation status.

### Subscription handler

Each authenticated socket accepts text JSON messages with exactly the supported operation shape:

```json
{ "type": "subscribe", "projectId": "<valid-project-id>" }
```

Project IDs follow the existing server route identifier contract. The handler derives `userId` from `payload.userId || payload.id`. The configured admin identity retains its existing bypass. Other users require current `viewer`, `editor`, or `owner` membership from the database.

A successful subscription atomically replaces the previous active project and returns:

```json
{ "type": "subscribed", "projectId": "project-123" }
```

A failed request does not clear or replace the previous valid subscription.

### Event delivery

`logEvent` continues to persist every event before attempting live delivery. For each open socket, delivery requires all conditions:

1. `socket.activeProjectId === event.projectId`.
2. Socket identity is still valid in memory from connection authentication.
3. User is still admin or currently has project membership in the database.

This is fail-closed: missing identity, missing subscription, malformed project ID, database lookup failure, or removed membership means no event delivery.

Authorization stays server-side. Frontend filtering may remain as defense in depth but is not treated as access control.

## Protocol Errors

Malformed JSON, binary messages, unsupported operations, or invalid fields return:

```json
{ "type": "error", "code": "INVALID_MESSAGE" }
```

A well-formed subscription without current project access returns:

```json
{ "type": "error", "code": "PROJECT_FORBIDDEN", "projectId": "project-123" }
```

Protocol errors do not expose database details, project existence, roles, stack traces, or JWT content. They do not close an otherwise authenticated connection.

## Frontend Data Flow

`frontend/src/App.jsx` keeps the existing single connection.

- No token: no WebSocket connection.
- Socket opens: send subscription for current active project, if present.
- Active project changes while socket is open: send a new subscription for that project.
- Token changes: existing effect teardown closes the old socket; new authenticated connection starts clean.
- `subscribed` and `error` control messages are not inserted into logs or DAG state.
- Telemetry events continue through the existing deduplication and project-ID defense-in-depth check.

No multi-project subscription set is introduced.

## Testing

Add live WebSocket integration coverage using the existing backend runtime and `ws` dependency. Test setup creates two users and two owned projects through actual HTTP endpoints, then authenticates WebSocket connections with the production subprotocol.

Required observable contracts:

1. Unsubscribed authenticated socket receives no project telemetry.
2. Authorized subscription receives its project event.
3. User A cannot subscribe to User B's project and receives `PROJECT_FORBIDDEN`.
4. User A receives no User B event, including while subscribed to User A's project.
5. Switching subscription stops delivery from the prior project.
6. Removing membership after a successful subscription stops later delivery, proving event-time reauthorization.
7. Invalid messages produce `INVALID_MESSAGE` and do not replace the last valid subscription.

The WebSocket integration suite must be included in `backend/npm test`, remain deterministic, close sockets/server resources, and fail nonzero through the existing fail-closed harness.

Frontend verification uses the production build plus an actual browser flow: login, select a project, observe subscription acknowledgement/authorized telemetry, switch project, and confirm only the newly active project updates.

## Security Invariants

- Authentication alone never grants project telemetry.
- Project authorization is evaluated at subscription time and event-delivery time.
- No event is broadcast before project matching and authorization succeed.
- Client-side filtering is never the authorization boundary.
- Authorization failures reveal no project metadata beyond the client-supplied ID.
- Existing REST role semantics remain the single project-membership source.

## Change Boundary

Expected production files:

- `backend/server.js`
- `backend/engine/workflow.js`
- `frontend/src/App.jsx`

Expected test/runner files:

- New backend WebSocket integration test under `backend/tests/`
- `backend/tests/test_runner.js`

`app.state.md` receives verified execution results and the next action only after all checks pass.

## Repository Safety

The working tree contains extensive pre-existing staged, unstaged, deleted, and untracked user work. Implementation must not reset, stage, or rewrite unrelated paths. Generated project directories remain out of scope. The design document is intentionally not committed because `app.state.md` explicitly prohibits commits or staging while user-owned dirty changes share target files.
