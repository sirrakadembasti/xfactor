# Persistent Chat Action Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist successful workflow and helper UI actions as canonical user/Manager messages in project chat history without duplicates or false success messages.

**Architecture:** Add an idempotent repository primitive backed by a new `chat_history.action_key` column and unique partial index. Project routes record action messages only after successful authorization/state mutation, then return canonical project state; frontend sends one action ID per click and refreshes chat state from backend. Delete remains intentionally unaudited in project chat because deletion cascades chat history.

**Tech Stack:** Node.js 22 ESM, Express 4, built-in SQLite, React 18, Vite 6, Vitest 3.

## Global Constraints

- Backend is the only source of persistent chat messages; frontend MUST NOT append synthetic action messages.
- Existing route URLs and `chat_history` roles (`user`, `model`) MUST remain unchanged.
- Failed actions MUST NOT write success messages.
- Idempotent `approve` and `resume` paths MUST NOT duplicate messages.
- ZIP messages MUST be written only after verified artifact authorization succeeds.
- Project deletion MUST NOT create a project-chat message.
- Existing verified artifact and project access controls MUST remain fail-closed.
- All production changes MUST follow RED → GREEN TDD.

---

### Task 1: Idempotent Action Message Persistence

**Files:**
- Modify: `backend/db.js` — add migration 14 after migration 13.
- Modify: `backend/projectRepository.js` — add action-message repository primitive.
- Create: `backend/tests/test_project_action_chat_audit.js`
- Modify: `backend/tests/testInventory.js`

**Interfaces:**
- Produces: `appendProjectActionMessages(projectId, { actionId, userText, modelText, createdAt? }) -> { inserted: boolean, messages: Array }`
- `actionId` is a non-empty client/request identity, maximum 128 characters.
- Stored keys are `${actionId}:user` and `${actionId}:model`.

- [ ] **Step 1: Write failing migration and repository tests**

Add tests that initialize an isolated database and assert:

```js
await runAsyncTest('action message append persists an ordered user/model pair once', async () => {
  const result = appendProjectActionMessages(project.id, {
    actionId: 'approve-action-1',
    userText: '✅ Mimari planı onayladım. Uygulama üretimini başlat.',
    modelText: '🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.'
  });
  assert.strictEqual(result.inserted, true);
  const duplicate = appendProjectActionMessages(project.id, {
    actionId: 'approve-action-1',
    userText: 'ignored duplicate',
    modelText: 'ignored duplicate'
  });
  assert.strictEqual(duplicate.inserted, false);
  const rows = db.prepare('SELECT role, text_content, action_key FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL ORDER BY id').all(project.id);
  assert.deepStrictEqual(rows.map(row => row.role), ['user', 'model']);
  assert.deepStrictEqual(rows.map(row => row.action_key), ['approve-action-1:user', 'approve-action-1:model']);
});
```

Also assert invalid/empty `actionId` is rejected and no partial pair remains if the second insert fails.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node backend/tests/test_project_action_chat_audit.js`

Expected: FAIL because migration 14 and `appendProjectActionMessages` do not exist.

- [ ] **Step 3: Add migration 14**

Add:

```js
{
  version: 14,
  name: '014_chat_action_idempotency',
  up: database => {
    if (!columnExists(database, 'chat_history', 'action_key')) {
      database.exec('ALTER TABLE chat_history ADD COLUMN action_key TEXT');
    }
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_history_action_key
      ON chat_history(action_key)
      WHERE action_key IS NOT NULL;
    `);
  }
}
```

- [ ] **Step 4: Implement the repository primitive**

Use `BEGIN IMMEDIATE`; return existing rows when either key exists; otherwise insert the user and model rows atomically. Reuse the existing chat message output shape (`id`, `role`, `parts`, `created_at`).

- [ ] **Step 5: Register the new suite and verify GREEN**

Add `test_project_action_chat_audit.js` to `backend/tests/testInventory.js`.

Run:

```bash
node backend/tests/test_project_action_chat_audit.js
node backend/tests/test_database_migrations.js
```

Expected: both suites pass, migration version reports 14.

- [ ] **Step 6: Commit**

```bash
git add backend/db.js backend/projectRepository.js backend/tests/test_project_action_chat_audit.js backend/tests/testInventory.js
git commit -m "feat(chat): add idempotent action audit messages"
```

---

### Task 2: Workflow Actions in Canonical Chat History

**Files:**
- Modify: `backend/routes/projectRoutes.js` — approve, resume, pause routes.
- Modify: `frontend/src/services/api.js` — action ID header helper.
- Modify: `frontend/src/App.jsx` — pass stable action IDs per click and consume canonical state.
- Modify: `backend/tests/test_project_action_chat_audit.js`
- Modify: `frontend/src/components/__tests__/P9ProjectIsolation.test.jsx`

**Interfaces:**
- Consumes: `appendProjectActionMessages` from Task 1.
- Produces: request header `X-XFactor-Action-Id` and canonical `getProject(id)` JSON responses.

- [ ] **Step 1: Add failing backend workflow-action tests**

Test successful approve/resume/pause transitions with action IDs and assert exact ordered messages. Test invalid transitions and idempotent repeated approve/resume requests add no messages.

Exact copy:

```text
approve user: ✅ Mimari planı onayladım. Uygulama üretimini başlat.
approve model: 🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.
resume user: ▶️ Süreci kaldığı yerden devam ettir.
resume model: Süreç kaldığı görevden devam ettiriliyor.
pause user: ⏸️ Üretim sürecini duraklat.
pause model: Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.
```

- [ ] **Step 2: Verify backend RED**

Run: `XFACTOR_TEST_RUNNER_FILES=test_project_action_chat_audit.js node backend/tests/test_runner.js`

Expected: FAIL because action routes do not write canonical chat rows.

- [ ] **Step 3: Implement route persistence**

For each route:

1. Validate and execute the transition.
2. If the route returns an existing/idempotent lease, do not append.
3. Read `X-XFactor-Action-Id`; if absent generate a server request-scoped ID.
4. Call `appendProjectActionMessages` after the successful transition.
5. Return `getProject(id)` plus existing response metadata (`attemptId`, `idempotent`).

Replace direct `state.chatHistory.push(...)` in resume/pause with repository persistence.

- [ ] **Step 4: Add failing frontend API/header tests**

In `frontend/src/services/api.test.js`, assert approve/pause/resume send `X-XFactor-Action-Id`. In `P9ProjectIsolation.test.jsx`, assert canonical API messages replace local state and survive project switching.

- [ ] **Step 5: Implement frontend action IDs**

Add:

```js
const createActionId = action => `${action}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
```

Generate once per click in `App.jsx`; pass via API options headers. Do not append local chat messages.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
XFACTOR_TEST_RUNNER_FILES=test_project_action_chat_audit.js node backend/tests/test_runner.js
npm --prefix frontend run test:unit
```

Expected: backend focused suite and all frontend tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/projectRoutes.js backend/tests/test_project_action_chat_audit.js frontend/src/services/api.js frontend/src/services/api.test.js frontend/src/App.jsx frontend/src/components/__tests__/P9ProjectIsolation.test.jsx
git commit -m "feat(chat): audit workflow button actions"
```

---

### Task 3: Helper Actions in Canonical Chat History

**Files:**
- Modify: `backend/routes/projectRoutes.js` — sync, patch/pin, download routes.
- Modify: `frontend/src/services/api.js` — sync/pin/download action IDs and active project context.
- Modify: `frontend/src/App.jsx` — refresh active project chat after helper actions.
- Modify: `backend/tests/test_project_action_chat_audit.js`
- Modify: `frontend/src/services/api.test.js`
- Modify: `frontend/src/components/__tests__/P5DownloadPolicy.test.jsx`

**Interfaces:**
- Consumes: Task 1 repository helper and Task 2 `X-XFactor-Action-Id` convention.
- Sync request body accepts optional `{ activeProjectId }`.

- [ ] **Step 1: Add failing backend helper-action tests**

Assert:

```text
sync user: 🔄 Diskteki projeleri uygulamayla senkronize ettim.
sync model: Senkronizasyon tamamlandı: <registered> yeni, <missing> eksik, <updated> güncellenen proje.
pin user: 📌 Projeyi başa sabitledim.
pin model: Proje yan menünün üst sırasına taşındı.
unpin user: 📌 Projenin sabitlemesini kaldırdım.
unpin model: Proje normal sıralamaya döndürüldü.
download user: 📥 Doğrulanmış proje ZIP paketini indirdim.
download model: Doğrulanmış artefakt başarıyla indirildi.
```

Test unauthorized/failed sync, patch, and download produce no messages. Assert delete produces no action-keyed chat rows.

- [ ] **Step 2: Verify backend RED**

Run: `XFACTOR_TEST_RUNNER_FILES=test_project_action_chat_audit.js node backend/tests/test_runner.js`

Expected: helper route action-message assertions fail.

- [ ] **Step 3: Implement helper route persistence**

- Sync: after successful sync, if `activeProjectId` exists and requester can view it, append summary messages. No active project → structured log only.
- Pin: append only when `is_pinned`/`isPinned` is present and update succeeds. Rename-only updates do not create pin messages.
- Download: authorize first, append messages, then call `res.download`.
- Delete: unchanged; no message.

- [ ] **Step 4: Add failing frontend helper tests**

Assert sync sends `{ activeProjectId }` plus action header; pin sends action header; artifact download request includes action header and refreshes active project state after navigation is initiated.

- [ ] **Step 5: Implement frontend refresh behavior**

After successful sync/pin/download, call `fetchProjectState(activeProjectId)` when the acted-on project is active. Preserve request epoch fencing.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
XFACTOR_TEST_RUNNER_FILES=test_project_action_chat_audit.js,test_p1_7_task1_routes.js,test_p5_artifact_completion.js node backend/tests/test_runner.js
npm --prefix frontend run test:unit
```

Expected: all selected backend suites and all frontend tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/projectRoutes.js backend/tests/test_project_action_chat_audit.js frontend/src/services/api.js frontend/src/services/api.test.js frontend/src/App.jsx frontend/src/components/__tests__/P5DownloadPolicy.test.jsx
git commit -m "feat(chat): audit helper button actions"
```

---

### Task 4: Documentation, Graphify, and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `kullanici-kilavuzu.md`
- Modify: `backend/scripts/generate_graph.js`
- Modify: `graphify-out/*`

**Interfaces:**
- Documents the action audit behavior delivered by Tasks 1–3.

- [ ] **Step 1: Update user documentation**

Document that successful workflow/helper button actions appear in chat, survive reload/project switching, and that delete is excluded because its project chat is removed.

- [ ] **Step 2: Update Graphify and generate artifacts**

Add the design and implementation plan nodes and `test_project_action_chat_audit.js`; connect the test to `projectRoutes.js` and `projectRepository.js`.

Run: `npm run graph`

Expected: successful graph/report/tree generation with updated node/edge counts.

- [ ] **Step 3: Run focused and full verification**

Run:

```bash
node backend/tests/test_project_action_chat_audit.js
npm --prefix frontend run test:unit
npm --prefix backend test
npm run test:e2e
```

Expected: all commands exit 0. If Docker-dependent suites are unavailable, report the exact blocked suite and retain fail-closed behavior; do not claim full success.

- [ ] **Step 4: Commit**

```bash
git add README.md kullanici-kilavuzu.md backend/scripts/generate_graph.js graphify-out/
git commit -m "docs: document persistent chat action audit"
```
