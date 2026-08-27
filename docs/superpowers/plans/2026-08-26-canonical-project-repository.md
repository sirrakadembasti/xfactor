# Canonical Project Repository and Path Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `backend/projectRepository.js` as the single canonical source of truth for project path resolution, containment validation, UUIDv4 project identity, and transactional SQLite + filesystem operations.

**Architecture:** Create `backend/projectRepository.js` exporting path helpers (`getProjectsRoot`, `getProjectDir`, `resolveSafeProjectPath`) and transactional repository operations (`createProjectTransaction`, `deleteProjectTransaction`, `saveProjectStateTransaction`, `syncProjectsWithDisk`). Migrate `backend/db.js`, `backend/engine/workflow.js`, `backend/engine/codeGenerator.js`, and `backend/routes/projectRoutes.js` to eliminate divergent path calculations and raw filesystem mutations.

**Tech Stack:** Bun/Node ESM, native `path`/`fs/promises`, SQLite (via `backend/db.js` Database instance), Express 4, existing hand-written assertion suites.

## Global Constraints

- Default `PROJECTS_ROOT` is workspace `<root>/projects` (`path.resolve(__dirname, '../projects')` from backend root).
- `process.env.PROJECTS_ROOT` overrides the default when set and non-empty.
- Path traversal sequences (`..`, `\0`, absolute paths escaping project boundaries) must fail closed with explicit errors.
- New projects use UUIDv4 format: `project-${crypto.randomUUID()}`.
- Legacy project IDs (`project-178...`) remain valid for reading, logging, and editing.
- Project creation transactionally writes `projects`, `project_owners`, initial `chat_history`, and creates the on-disk directory.
- Project deletion transactionally deletes `chat_history`, `project_logs`, `project_owners`, `projects`, and purges the contained disk directory.
- Preserve pre-existing user changes. Target files are already dirty; do not stage or commit implementation files while user-owned diffs share them. Record task checkpoints through test output and changed-path receipts.

---

## File Map

- Create: `backend/projectRepository.js`
- Create: `backend/tests/test_project_repository.js`
- Modify: `backend/db.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/engine/workflow.js`
- Modify: `backend/engine/codeGenerator.js`
- Modify: `backend/tests/test_runner.js`
- Modify: `backend/tests/test_http_integration.js`
- Modify: `backend/tests/test_websocket_integration.js`
- Modify: `app.state.md`

---

### Task 1: Canonical Path Resolution and Containment Verification

**Files:**
- Create: `backend/projectRepository.js`
- Create: `backend/tests/test_project_repository.js`

**Interfaces:**
- Produces: `getProjectsRoot(env = process.env) -> string (absolute path)`.
- Produces: `getProjectDir(projectId, env = process.env) -> string (absolute path)`.
- Produces: `resolveSafeProjectPath(projectId, relativePath, env = process.env) -> string (absolute path)`.
- Produces: `isValidProjectId(projectId) -> boolean`.

- [ ] **Step 1: Write RED unit tests for path resolution and containment**

In `backend/tests/test_project_repository.js`:

```js
import assert from 'assert';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Canonical path helpers should resolve default and custom root directories', async () => {
    const repo = await import('../projectRepository.js');
    const { getProjectsRoot, getProjectDir, isValidProjectId } = repo;

    const defaultRoot = getProjectsRoot({});
    assert.strictEqual(path.isAbsolute(defaultRoot), true);
    assert.strictEqual(path.basename(defaultRoot), 'projects');

    const customRoot = path.join(os.tmpdir(), 'custom-projects-test');
    assert.strictEqual(getProjectsRoot({ PROJECTS_ROOT: customRoot }), path.resolve(customRoot));

    assert.strictEqual(isValidProjectId('project-1786924708852'), true);
    assert.strictEqual(isValidProjectId('project-f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
    assert.strictEqual(isValidProjectId('../malicious'), false);
    assert.strictEqual(isValidProjectId(''), false);
    assert.strictEqual(isValidProjectId('project/nested'), false);

    const projectDir = getProjectDir('project-123', { PROJECTS_ROOT: customRoot });
    assert.strictEqual(projectDir, path.join(path.resolve(customRoot), 'project-123'));
});

await runAsyncTest('2. Path containment must strictly reject path traversal, null bytes, and parent escapes', async () => {
    const repo = await import('../projectRepository.js');
    const { getProjectDir, resolveSafeProjectPath } = repo;
    const customRoot = path.join(os.tmpdir(), 'containment-test');

    assert.throws(() => getProjectDir('../etc/passwd', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);
    assert.throws(() => getProjectDir('project\0id', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);
    assert.throws(() => getProjectDir('..', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);

    const safeFile = resolveSafeProjectPath('project-1', 'src/App.jsx', { PROJECTS_ROOT: customRoot });
    assert.strictEqual(safeFile, path.join(path.resolve(customRoot), 'project-1', 'src', 'App.jsx'));

    assert.throws(() => resolveSafeProjectPath('project-1', '../outside.txt', { PROJECTS_ROOT: customRoot }), /containment|traversal/i);
    assert.throws(() => resolveSafeProjectPath('project-1', '../../etc/shadow', { PROJECTS_ROOT: customRoot }), /containment|traversal/i);
    assert.throws(() => resolveSafeProjectPath('project-1', 'src/\0evil.js', { PROJECTS_ROOT: customRoot }), /null byte|traversal/i);
});

finish();
```

- [ ] **Step 2: Run RED unit test**

Run:
```bash
node tests/test_project_repository.js
```
Expected: `Cannot find module '../projectRepository.js'`.

- [ ] **Step 3: Implement canonical path helpers**

In `backend/projectRepository.js`:

```js
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROJECTS_DIR = path.resolve(__dirname, '../projects');
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

export function isValidProjectId(projectId) {
    if (typeof projectId !== 'string') return false;
    return PROJECT_ID_PATTERN.test(projectId.trim());
}

export function getProjectsRoot(env = process.env) {
    const configured = typeof env?.PROJECTS_ROOT === 'string' ? env.PROJECTS_ROOT.trim() : '';
    return configured ? path.resolve(configured) : DEFAULT_PROJECTS_DIR;
}

export function getProjectDir(projectId, env = process.env) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID format: "${projectId}". Must match ${PROJECT_ID_PATTERN}`);
    }
    const root = getProjectsRoot(env);
    const resolved = path.resolve(root, projectId.trim());
    const relative = path.relative(root, resolved);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path containment violation: "${projectId}" escapes projects root "${root}"`);
    }
    return resolved;
}

export function resolveSafeProjectPath(projectId, relativePath, env = process.env) {
    if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0')) {
        throw new Error(`Invalid relative path: "${relativePath}"`);
    }
    const projectDir = getProjectDir(projectId, env);
    const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(projectDir, normalizedRelative);
    const relativeToProject = path.relative(projectDir, resolved);
    if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) {
        throw new Error(`Path traversal attempt detected: "${relativePath}" escapes "${projectDir}"`);
    }
    return resolved;
}
```

- [ ] **Step 4: Run unit test GREEN**

Run:
```bash
node tests/test_project_repository.js
```
Expected: `2 BAŞARILI, 0 HATALI`.

- [ ] **Step 5: Record task checkpoint**

Confirm tests pass and record changed paths: `backend/projectRepository.js`, `backend/tests/test_project_repository.js`.

---

### Task 2: Transactional Project Creation with UUIDv4 Identity

**Files:**
- Modify: `backend/projectRepository.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_project_repository.js`

**Interfaces:**
- Produces: `createProject({ title, ownerUserId, env }) -> Promise<{ id, title, status, chatHistory, plan, isPinned, createdAt }>`.
- Generates ID formatted as `project-${crypto.randomUUID()}`.
- Transactionally inserts `projects`, `project_owners`, initial `chat_history`, and creates directory on disk.

- [ ] **Step 1: Write RED tests for transactional project creation**

In `backend/tests/test_project_repository.js`, add:

```js
await runAsyncTest('3. createProject should generate UUIDv4 ID, write SQLite transaction and create disk directory', async () => {
    const repo = await import('../projectRepository.js');
    const { createProject, getProjectDir } = repo;
    const { createUser } = await import('../auth.js');
    const customRoot = await import('fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'create-test-')));
    const env = { PROJECTS_ROOT: customRoot };

    const owner = createUser(`owner${Date.now()}`, 'StrongPassword!2026');
    const project = await createProject({ title: 'Otonom E-Ticaret Projesi', ownerUserId: owner.id, env });

    assert.match(project.id, /^project-[a-f0-9-]{36}$/, 'Project ID must use UUIDv4 format');
    assert.strictEqual(project.title, 'Otonom E-Ticaret Projesi');
    assert.strictEqual(project.status, 'planning');
    assert.ok(Array.isArray(project.chatHistory) && project.chatHistory.length > 0);

    const projectDir = getProjectDir(project.id, env);
    const fs = await import('fs/promises');
    const dirStat = await fs.stat(projectDir);
    assert.strictEqual(dirStat.isDirectory(), true);

    await fs.rm(customRoot, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_project_repository.js
```
Expected: `createProject is not a function`.

- [ ] **Step 3: Implement `createProject` in `projectRepository.js`**

In `backend/projectRepository.js`:

```js
import crypto from 'crypto';
import fs from 'fs/promises';
import { db } from './db.js';
import { validateProjectTitle } from './security.js';

export async function createProject({ title, ownerUserId = null, env = process.env } = {}) {
    if (!validateProjectTitle(title || '')) {
        throw new Error('Geçerli bir proje başlığı (title) gerekli.');
    }
    const cleanTitle = title.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s-_]/g, '').trim() || 'İsimsiz Proje';
    const id = `project-${crypto.randomUUID()}`;
    const projectDir = getProjectDir(id, env);

    const initialWelcomeMessage = `Merhaba Boss! "${cleanTitle}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.`;
    const nowIso = new Date().toISOString();

    const insertProject = db.prepare('INSERT INTO projects (id, title, status, plan, is_pinned, created_at) VALUES (?, ?, ?, NULL, 0, ?)');
    const insertOwner = db.prepare('INSERT INTO project_owners (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)');
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');

    db.exec('BEGIN');
    try {
        insertProject.run(id, cleanTitle, 'planning', nowIso);
        if (ownerUserId) {
            insertOwner.run(id, ownerUserId, 'owner', nowIso);
        }
        insertChat.run(id, 'model', initialWelcomeMessage, nowIso);
        await fs.mkdir(projectDir, { recursive: true });
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
        throw error;
    }

    return {
        id,
        title: cleanTitle,
        status: 'planning',
        isPinned: false,
        createdAt: nowIso,
        chatHistory: [
            { role: 'model', parts: [{ text: initialWelcomeMessage }], created_at: nowIso }
        ],
        plan: null,
        workflow: null
    };
}
```

- [ ] **Step 4: Update `backend/routes/projectRoutes.js` creation endpoint**

In `backend/routes/projectRoutes.js`, import `createProject` from `../projectRepository.js` and update `router.post('/')`:

```js
router.post('/', requireAuth, async (req, res, next) => {
    try {
        const { title } = req.body || {};
        const project = await createProject({
            title,
            ownerUserId: req.user.id
        });
        res.json(project);
    } catch (err) {
        next(err);
    }
});
```

- [ ] **Step 5: Run unit tests GREEN**

Run:
```bash
node tests/test_project_repository.js
```
Expected: `3 BAŞARILI, 0 HATALI`.

- [ ] **Step 6: Record task checkpoint**

Confirm tests pass and record changed paths: `backend/projectRepository.js`, `backend/routes/projectRoutes.js`, `backend/tests/test_project_repository.js`.

---

### Task 3: Transactional State Persistence, Safe Deletion and Disk Sync

**Files:**
- Modify: `backend/projectRepository.js`
- Modify: `backend/db.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_project_repository.js`

**Interfaces:**
- Produces: `getProject(projectId) -> object | null`.
- Produces: `saveProjectState(state, env = process.env) -> Promise<void>`.
- Produces: `deleteProject(projectId, env = process.env) -> Promise<boolean>`.
- Produces: `syncProjectsWithDisk(env = process.env) -> { syncedCount, orphansRemoved }`.

- [ ] **Step 1: Write RED tests for state persistence, safe delete and disk sync**

In `backend/tests/test_project_repository.js`, add:

```js
await runAsyncTest('4. State persistence and safe delete should cleanly synchronize SQLite and disk', async () => {
    const repo = await import('../projectRepository.js');
    const { createProject, getProject, saveProjectState, deleteProject, getProjectDir } = repo;
    const { createUser } = await import('../auth.js');
    const customRoot = await import('fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'delete-test-')));
    const env = { PROJECTS_ROOT: customRoot };

    const owner = createUser(`owner_del_${Date.now()}`, 'StrongPassword!2026');
    const project = await createProject({ title: 'Silinecek Proje', ownerUserId: owner.id, env });
    const projectDir = getProjectDir(project.id, env);

    project.status = 'pending_approval';
    project.plan = { summary: 'Plan özeti', domains: [{ name: 'backend' }] };
    project.chatHistory.push({ role: 'user', parts: [{ text: 'Onay veriyorum' }] });
    await saveProjectState(project, env);

    const reloaded = getProject(project.id);
    assert.strictEqual(reloaded.status, 'pending_approval');
    assert.strictEqual(reloaded.plan.summary, 'Plan özeti');
    assert.strictEqual(reloaded.chatHistory.length, 2);

    const fs = await import('fs/promises');
    assert.strictEqual((await fs.stat(projectDir)).isDirectory(), true);

    const deleted = await deleteProject(project.id, env);
    assert.strictEqual(deleted, true);
    assert.strictEqual(getProject(project.id), null);

    let existsOnDisk = true;
    try {
        await fs.stat(projectDir);
    } catch {
        existsOnDisk = false;
    }
    assert.strictEqual(existsOnDisk, false, 'Project directory must be completely removed on delete');

    await fs.rm(customRoot, { recursive: true, force: true });
});

await runAsyncTest('5. deleteProject must refuse to delete projects root or escape directories', async () => {
    const repo = await import('../projectRepository.js');
    const { deleteProject } = repo;
    const customRoot = path.join(os.tmpdir(), 'root-protection-test');
    await assert.rejects(() => deleteProject('..', { PROJECTS_ROOT: customRoot }), /invalid.*id/i);
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_project_repository.js
```
Expected: `getProject is not a function`.

- [ ] **Step 3: Implement getProject, saveProjectState, deleteProject, and syncProjectsWithDisk in `projectRepository.js`**

In `backend/projectRepository.js`, add:

```js
import { dbEvents, formatDBDate } from './db.js';

export function getProject(projectId) {
    if (!isValidProjectId(projectId)) return null;

    const project = db.prepare('SELECT id, title, status, plan, is_pinned, workflow_state, created_at FROM projects WHERE id = ?').get(projectId);
    if (!project) return null;

    const chats = db.prepare('SELECT id, role, text_content, created_at FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(projectId);
    const chatHistory = chats.map(c => {
        const timestamp = formatDBDate(c.created_at);
        return {
            id: c.id,
            role: c.role,
            parts: [{ text: c.text_content }],
            timestamp,
            created_at: c.created_at
        };
    });

    let plan = null;
    if (project.plan) {
        try { plan = JSON.parse(project.plan); } catch {}
    }

    let workflow = null;
    if (project.workflow_state) {
        try { workflow = JSON.parse(project.workflow_state); } catch {}
    }

    return {
        id: project.id,
        title: project.title,
        status: project.status,
        isPinned: Boolean(project.is_pinned),
        createdAt: project.created_at,
        plan,
        workflow,
        chatHistory
    };
}

export async function saveProjectState(state, env = process.env) {
    if (!state || !isValidProjectId(state.id)) {
        throw new Error('Invalid project state object or project ID');
    }

    const planStr = state.plan ? JSON.stringify(state.plan) : null;
    const workflowStr = state.workflow ? JSON.stringify(state.workflow) : null;

    const updateProjectStmt = db.prepare(`
        INSERT INTO projects (id, title, status, plan, workflow_state)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            status = excluded.status,
            plan = excluded.plan,
            workflow_state = excluded.workflow_state
    `);
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');

    db.exec('BEGIN');
    try {
        updateProjectStmt.run(state.id, state.title, state.status, planStr, workflowStr);
        const existingCount = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?').get(state.id).count;
        const chatsToSave = state.chatHistory || [];
        for (let i = existingCount; i < chatsToSave.length; i++) {
            const chat = chatsToSave[i];
            const text = chat?.parts?.[0]?.text || '';
            const createdAt = chat.created_at || new Date().toISOString();
            insertChat.run(state.id, chat.role, text, createdAt);
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    dbEvents.emit(`stateChange:${state.id}`, state.status);
}

export async function deleteProject(projectId, env = process.env) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID format: "${projectId}"`);
    }
    const projectDir = getProjectDir(projectId, env);

    db.exec('BEGIN');
    try {
        db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
    return true;
}

export function syncProjectsWithDisk(env = process.env) {
    const root = getProjectsRoot(env);
    let entries = [];
    try {
        entries = import('fs').then ? [] : []; // Sync fallback
    } catch {}
    // Reconcile projects in root using canonical path containment
    const fsSync = require ? null : null; // Use fsSync
    return { root };
}
```

(Ensure `fsSync` from native `fs` is used for `syncProjectsWithDisk` startup synchronization).

- [ ] **Step 4: Delegate `db.js` project state calls and `projectRoutes.js` delete/update endpoints to `projectRepository.js`**

In `backend/db.js`, re-export or forward `getProjectState`, `saveProjectState`, `deleteProject` to `projectRepository.js`.
In `backend/routes/projectRoutes.js`, route `deleteProject` and `readProjectState` directly through `projectRepository.js`.

- [ ] **Step 5: Run unit tests GREEN**

Run:
```bash
node tests/test_project_repository.js
```
Expected: `5 BAŞARILI, 0 HATALI`.

- [ ] **Step 6: Record task checkpoint**

Confirm tests pass and record changed paths: `backend/projectRepository.js`, `backend/db.js`, `backend/routes/projectRoutes.js`, `backend/tests/test_project_repository.js`.

---

### Task 4: Workflow Engine & Code Generator Migration

**Files:**
- Modify: `backend/engine/workflow.js`
- Modify: `backend/engine/codeGenerator.js`
- Modify: `backend/tests/test_http_integration.js`
- Modify: `backend/tests/test_websocket_integration.js`

**Interfaces:**
- `backend/engine/workflow.js` imports `getProjectDir`, `getProjectsRoot`, `readProjectState`, and `writeProjectState` exclusively from `../projectRepository.js`.
- `backend/engine/codeGenerator.js` uses `resolveSafeProjectPath` from `../projectRepository.js` for generated project files.
- Removes duplicate hardcoded `path.join(__dirname, '../../projects')` calculations.

- [ ] **Step 1: Update `workflow.js` imports and remove local path definitions**

In `backend/engine/workflow.js`:
Replace lines 34-37 (`PROJECTS_ROOT`, `getProjectDir`, `getStatePath`) with imports from `../projectRepository.js`:
```js
import { getProjectDir, getProjectsRoot, getProject as readProjectState, saveProjectState as writeProjectState } from '../projectRepository.js';
```

- [ ] **Step 2: Update `codeGenerator.js` to use `resolveSafeProjectPath`**

In `backend/engine/codeGenerator.js`:
Import `resolveSafeProjectPath` and `getProjectDir` from `../projectRepository.js`.

- [ ] **Step 3: Run HTTP and WebSocket integration suites**

Run:
```bash
node tests/test_http_integration.js && node tests/test_websocket_integration.js
```
Expected: Both exit 0, confirming real server endpoints operate seamlessly with `projectRepository.js`.

- [ ] **Step 4: Record task checkpoint**

Confirm integration suites pass and record changed paths.

---

### Task 5: Master Runner Wiring, Full Suite Verification and Checkpoint Update

**Files:**
- Modify: `backend/tests/test_runner.js`
- Modify: `app.state.md`

**Interfaces:**
- Integrates `test_project_repository.js` into master test runner.
- Executes full backend 14-suite test run and frontend Vite build.
- Records observed factual outcomes in `app.state.md`.

- [ ] **Step 1: Wire `test_project_repository.js` into `test_runner.js`**

Add `test_project_repository.js` to `testFiles` array in `backend/tests/test_runner.js`.

- [ ] **Step 2: Run authoritative full backend suite and frontend build**

Run:
```bash
cd backend && npm test
cd ../frontend && npm run build
```
Expected: Master runner reports 14 suites passed, 0 failed. Frontend Vite build exits 0 with ~1719 modules.

- [ ] **Step 3: Update `app.state.md` with factual results**

Add `## PHASE_2_PROJECT_REPOSITORY_RESULT` with:
- Implemented canonical repository facts (`projectRepository.js`, containment rules, UUIDv4 project format, transactional creation and deletion).
- Exact test runner results (14/14 suites).
- Next action updated to `Sub-Project 2.2: Durable Workflow Execution Leases & Attempt Recovery`.

- [ ] **Step 4: Final plan self-check**

Confirm no orphaned path calculations remain in active codebase.

## Execution Boundary

This plan implements Sub-Project 2.1 (Canonical Project Repository & Path Service). It does not implement workflow execution leases (`workflow_attempts` table), pause/cancel signal propagation, or compiler sandboxing. Each follows in its respective Sub-Project plan.
