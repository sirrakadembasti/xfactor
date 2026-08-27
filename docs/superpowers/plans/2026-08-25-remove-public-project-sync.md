# Remove Public Project Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every authenticated HTTP/UI path that can trigger global disk-to-database project synchronization while preserving internal startup sync.

**Architecture:** Delete the Express route and all browser-facing sync state, handler, props, button, and API method as one clean contract cutover. Keep `syncProjectsWithDisk()` private to `db.js` startup and prove route absence through live HTTP integration tests for normal and configured-admin identities.

**Tech Stack:** Bun/Node ESM, Express 4, SQLite, React 18, Vite 5.

## Global Constraints

- `POST /api/projects/sync` must return `404` for normal and configured-admin JWT callers.
- Removed route must not invoke `syncProjectsWithDisk()` or mutate the caller-visible project list.
- `syncProjectsWithDisk()` and its `db.js` startup invocation remain unchanged.
- No admin replacement, compatibility alias, feature flag, or CLI command.
- Four-second project-list polling remains unchanged.
- `PROJECTS_ROOT` unification remains separate scope.
- Do not touch generated project directories.
- Do not reset, stage, or commit because target files share extensive user-owned dirty work.

## File Structure

- Modify `backend/tests/test_http_integration.js`: live route-absence and no-visible-mutation regression.
- Modify `backend/routes/projectRoutes.js`: remove public sync import and route.
- Modify `frontend/src/App.jsx`: remove sync state, handler, and Sidebar props.
- Modify `frontend/src/components/Sidebar.jsx`: remove refresh control and unused import.
- Modify `frontend/src/services/api.js`: remove dead public sync client method.
- Modify `docs/KULLANIM-KILAVUZU.md`: remove user-facing sync action.
- Modify `app.state.md`: record verified cutover and advance next action.

---

### Task 1: Remove Public Backend Sync Route

**Files:**
- Test: `backend/tests/test_http_integration.js:112-205`
- Modify: `backend/routes/projectRoutes.js:6,197-205`

**Interfaces:**
- Consumes existing live `request()` helper, configured `ADMIN_USER`/`ADMIN_PASS`, and project list route.
- Produces no replacement endpoint; `POST /api/projects/sync` falls through Express and returns `404`.
- Preserves `backend/db.js::syncProjectsWithDisk()` startup use.

- [ ] **Step 1: Write failing live route-absence assertions**

After existing users/projects are created, capture Owner A's exact visible IDs. Login configured admin through the real login route, then call the sync URL with raw `fetch` so Express's HTML `404` body is not forced through `request()` JSON parsing:

```js
const visibleProjectIdsBeforeSync = listA.body.map(project => project.id);

const adminLogin = await request(baseUrl, '/login', {
    method: 'POST',
    body: JSON.stringify({
        username: env.ADMIN_USER,
        password: env.ADMIN_PASS
    })
});
assert.strictEqual(adminLogin.response.status, 200);

const normalSyncResponse = await fetch(`${baseUrl}/projects/sync`, {
    method: 'POST',
    headers: authA
});
const adminSyncResponse = await fetch(`${baseUrl}/projects/sync`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminLogin.body.token}` }
});
assert.strictEqual(normalSyncResponse.status, 404);
assert.strictEqual(adminSyncResponse.status, 404);

const listAfterRemovedSync = await request(baseUrl, '/projects', { headers: authA });
assert.deepStrictEqual(
    listAfterRemovedSync.body.map(project => project.id),
    visibleProjectIdsBeforeSync
);
```

Mutation caught: restoring the authenticated route makes both status assertions receive `200` and fails the test.

- [ ] **Step 2: Run the live HTTP test and verify RED**

Run: `node tests/test_http_integration.js` from `backend`.

Expected: FAIL at `normalSyncResponse.status`, actual `200`, proving current public mutation route remains reachable.

- [ ] **Step 3: Remove route and dead router import**

In `backend/routes/projectRoutes.js`, remove `syncProjectsWithDisk` from the `../db.js` import and delete the complete `router.post('/sync', ...)` block. Renumbering comments is optional only if touched comments become incorrect; do not alter route behavior.

Do not edit `backend/db.js`.

- [ ] **Step 4: Run focused backend contracts**

Run from `backend`:

```text
node tests/test_http_integration.js
node tests/test_websocket_integration.js
```

Expected: both exit `0`; removed sync route returns `404`, existing project isolation and WebSocket authorization remain green.

- [ ] **Step 5: Review backend boundary**

Search backend route modules for `/sync`. Confirm no public route or alias remains and `db.js` still owns exactly the startup call. Do not stage or commit.

---

### Task 2: Remove Browser Sync Contract

**Files:**
- Modify: `frontend/src/App.jsx:1-55,101-113,525-545`
- Modify: `frontend/src/components/Sidebar.jsx:1-30,38-60`
- Modify: `frontend/src/services/api.js:120-130`
- Modify: `docs/KULLANIM-KILAVUZU.md:188-195`

**Interfaces:**
- Removes `handleSyncProjects` and `isSyncing` Sidebar props.
- Removes `createApiClient().syncProjects`.
- Preserves project polling, create, select, pin, rename, and delete interfaces.

- [ ] **Step 1: Capture failing browser behavior**

Launch actual backend/frontend and login. Observe sidebar button with accessible title `Disk ile Senkronize Et`. This presence is RED evidence because approved contract requires no public sync control.

- [ ] **Step 2: Remove App sync orchestration**

Delete:

```js
const [isSyncing, setIsSyncing] = useState(false);
```

Delete the complete `handleSyncProjects` function. Remove these Sidebar props:

```jsx
handleSyncProjects={handleSyncProjects}
isSyncing={isSyncing}
```

Keep `fetchProjects()` polling effect unchanged.

- [ ] **Step 3: Remove Sidebar control**

Remove `RefreshCw` from the `lucide-react` import, remove `handleSyncProjects`/`isSyncing` from Sidebar parameters, and delete only this button:

```jsx
<button
  onClick={handleSyncProjects}
  title="Disk ile Senkronize Et"
  className={`p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-indigo-600 transition ${isSyncing ? 'animate-spin text-indigo-600' : ''}`}
>
  <RefreshCw size={16} />
</button>
```

Keep the adjacent new-project button and header layout.

- [ ] **Step 4: Remove API and documentation contract**

Delete `syncProjects()` from `createApiClient()` while preserving valid object syntax. Remove only `🔄 Disk ile Senkronize Et` from the user-guide action list. Do not document startup sync as user functionality.

- [ ] **Step 5: Build frontend**

Run: `npm run build` from `frontend`.

Expected: exit `0`; Vite completes with no missing prop/import or object-syntax error.

- [ ] **Step 6: Verify actual browser surface**

Reload actual frontend after login. Assert no element has title `Disk ile Senkronize Et`; assert `Yeni Proje Başlat` remains and project list renders. Create one project through UI and confirm it appears, proving adjacent project controls remain usable.

- [ ] **Step 7: Review frontend boundary**

Search `frontend/src` and `docs/KULLANIM-KILAVUZU.md` for `handleSyncProjects`, `isSyncing`, `syncProjects`, `projects/sync`, and `Disk ile Senkronize Et`; expect no matches. Do not stage or commit.

---

### Task 3: Full Verification and State Handoff

**Files:**
- Modify: `app.state.md:848-863`
- Verify: complete backend/frontend contracts

**Interfaces:**
- Consumes exact focused/full test, build, and browser results.
- Produces `PHASE_1_PUBLIC_SYNC_REMOVAL_RESULT` and one concrete remaining `NEXT_ACTION`.

- [ ] **Step 1: Run full backend suite**

Run: `npm test` from `backend`.

Expected: exit `0`, `12/12` suites unless concurrent suite additions change actual count. Record observed counts rather than expected values.

- [ ] **Step 2: Run fresh frontend production build**

Run: `npm run build` from `frontend`.

Expected: exit `0`; record actual Vite module count.

- [ ] **Step 3: Complete mandatory cleanup**

Stop browser fixture services, close managed browser, and remove temporary database/projects directories. Confirm no new runtime fixture remains. Keep design/plan artifacts; remove no user files.

- [ ] **Step 4: Update living checkpoint**

Append:

```markdown
## PHASE_1_PUBLIC_SYNC_REMOVAL_RESULT

- Authenticated normal and configured-admin callers receive `404` for the removed `POST /api/projects/sync` route.
- Browser sync state, handler, API method, sidebar control, and user-guide action were removed as one clean cutover.
- Internal startup `syncProjectsWithDisk()` remains unchanged.
```

Add verification bullets containing the exact focused HTTP command/exit status, observed normal/admin `404` statuses, backend suite count, Vite module count, and browser observations from Tasks 1–3. Copy observed values without prediction.

Set `NEXT_ACTION` to the next uncompleted ordered Phase 1 item: centralized redacted error responses and sensitive-log handling.

- [ ] **Step 5: Final security review**

Verify normal/admin HTTP callers cannot trigger sync, no frontend caller remains, startup sync still exists, and no compatibility route/alias was added. Obtain independent review; fix Critical/Important findings before completion. Finish without staging or committing.
