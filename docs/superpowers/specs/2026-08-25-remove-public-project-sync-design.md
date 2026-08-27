# Remove Public Project Sync Design

## Goal

Prevent any authenticated HTTP client from triggering the global disk-to-database project synchronization mutation.

## Current Problem

`POST /api/projects/sync` requires only a valid JWT. The operation scans every generated project directory, inserts or updates global project records, creates completion logs/chat messages, and deletes selected orphan test records. This authority is unrelated to the caller's project membership.

The frontend exposes this mutation to every logged-in user through the sidebar refresh button. An admin-only route would still depend on the current username-based admin bypass and retain an unnecessary production HTTP mutation surface.

## Decision

Remove the public route and its complete frontend contract. Keep `syncProjectsWithDisk()` as an internal backend-startup operation only.

No replacement admin route, compatibility alias, feature flag, or CLI command is introduced.

## Backend Cutover

Remove `syncProjectsWithDisk` from `backend/routes/projectRoutes.js` imports and delete `POST /sync` from the project router. Express therefore returns `404` for `/api/projects/sync` after normal authentication middleware routing.

`backend/db.js` retains the function and startup invocation. Its filesystem-root behavior, mutation semantics, and error handling are unchanged in this focused security cutover. Project-root unification remains a separate roadmap item.

## Frontend Cutover

Remove all public-sync UI and state:

- `isSyncing` state from `frontend/src/App.jsx`.
- `handleSyncProjects` from `frontend/src/App.jsx`.
- Sync props passed to `Sidebar`.
- Sidebar refresh button and unused `RefreshCw` import.
- `syncProjects()` from `frontend/src/services/api.js`.

Normal four-second project-list polling remains unchanged. Project creation, pinning, rename, deletion, and selection remain unchanged.

## Documentation

Remove the user-facing “Disk ile Senkronize Et” action from `docs/KULLANIM-KILAVUZU.md`. Do not document an internal startup operation as an end-user feature.

## Error and Security Behavior

Both normal-user and configured-admin JWT requests to `POST /api/projects/sync` receive `404`. The response must not expose synchronization details or invoke `syncProjectsWithDisk()`.

Authentication remains enforced on actual project routes. Removing this route does not weaken other middleware.

## Testing

Extend live HTTP integration coverage:

1. Seed/login two normal users and create their isolated projects as existing test setup already does.
2. Send `POST /projects/sync` with normal-user bearer token; assert `404`.
3. Login configured admin and send same request; assert `404`.
4. Re-list normal user's projects and assert IDs are unchanged, proving removed route caused no global mutation visible through API.

Run full backend suite and frontend production build. Browser verification confirms sidebar contains no disk-sync control while project creation and listing remain usable.

## Scope Boundary

In scope:

- Route removal.
- Frontend contract/UI removal.
- Live regression coverage.
- User documentation and `app.state.md` checkpoint update.

Out of scope:

- Rewriting startup synchronization.
- `PROJECTS_ROOT` unification.
- Crash recovery and workflow locking.
- New admin-role/session model.
- New CLI or operational endpoint.

## Repository Safety

Working tree contains extensive user-owned staged, unstaged, deleted, and untracked changes. Do not reset, stage, or commit. Generated project directories remain untouched.
