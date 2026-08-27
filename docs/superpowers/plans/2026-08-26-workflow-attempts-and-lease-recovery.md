# Workflow Execution Attempts, Lease Locks, and Crash Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement durable workflow attempt tracking via SQLite `workflow_attempts`, enforce idempotent single-worker execution with heartbeats, and safely recover stale running projects to a paused state on server startup.

**Architecture:** Create `backend/workflowAttempts.js` to manage the lifecycle of workflow execution attempts and locks (`acquireWorkflowLease`, `updateAttemptHeartbeat`, `releaseWorkflowLease`, `reconcileStaleWorkflowAttempts`). Wire lease acquisition into `backend/routes/projectRoutes.js` (`/approve`, `/resume`) and periodic heartbeats into `backend/engine/workflow.js`.

**Tech Stack:** Bun/Node ESM, SQLite (WAL mode, foreign keys), Express 4, native timers, existing test harness.

## Global Constraints

- Table `workflow_attempts` records `id` (`attempt-<uuid>`), `project_id`, `status` (`running`, `paused`, `completed`, `failed`, `stale_terminated`), `lease_owner`, `started_at`, `heartbeat_at`, `ended_at`, `error`.
- At most one active worker executes a project at any time.
- Idempotent `/approve` and `/resume` return `200 OK` with existing project state when an active lease is held.
- Stale heartbeat threshold is 30 seconds.
- Startup reconciliation safely transitions stale running attempts to `stale_terminated` and projects to `paused`.
- Preserves pre-existing user diffs. Record task checkpoints through test output and changed-path receipts.

---

## File Map

- Modify: `backend/db.js` (add `workflow_attempts` table and indices)
- Create: `backend/workflowAttempts.js`
- Create: `backend/tests/test_workflow_attempts.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/engine/workflow.js`
- Modify: `backend/tests/test_runner.js`
- Modify: `backend/tests/test_http_integration.js`
- Modify: `app.state.md`

---

### Task 1: `workflow_attempts` Schema and Core Lease Engine

**Files:**
- Modify: `backend/db.js`
- Create: `backend/workflowAttempts.js`
- Create: `backend/tests/test_workflow_attempts.js`

**Interfaces:**
- Produces: `acquireWorkflowLease(projectId, leaseOwner, { heartbeatTtlSeconds? }) -> { acquired: boolean, attempt: object }`.
- Produces: `updateAttemptHeartbeat(attemptId) -> boolean`.
- Produces: `releaseWorkflowLease(attemptId, terminalStatus, { error? }) -> boolean`.
- Produces: `getActiveWorkflowAttempt(projectId, { heartbeatTtlSeconds? }) -> object | null`.

- [ ] **Step 1: Write RED tests for schema and lease engine**

In `backend/tests/test_workflow_attempts.js`:

```js
import assert from 'assert';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. acquireWorkflowLease should create attempt, block duplicate active lease and release cleanly', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const {
        acquireWorkflowLease,
        updateAttemptHeartbeat,
        releaseWorkflowLease,
        getActiveWorkflowAttempt
    } = await import('../workflowAttempts.js');

    const project = await createProject({ title: 'Lease Test Project' });
    const workerA = `worker-${Date.now()}-A`;
    const workerB = `worker-${Date.now()}-B`;

    const leaseA = acquireWorkflowLease(project.id, workerA);
    assert.strictEqual(leaseA.acquired, true);
    assert.match(leaseA.attempt.id, /^attempt-[a-f0-9-]{36}$/);
    assert.strictEqual(leaseA.attempt.status, 'running');
    assert.strictEqual(leaseA.attempt.lease_owner, workerA);

    const activeAttempt = getActiveWorkflowAttempt(project.id);
    assert.strictEqual(activeAttempt.id, leaseA.attempt.id);

    const leaseB = acquireWorkflowLease(project.id, workerB);
    assert.strictEqual(leaseB.acquired, false, 'Second worker must be blocked while active lease is held');
    assert.strictEqual(leaseB.attempt.id, leaseA.attempt.id);

    const heartbeatUpdated = updateAttemptHeartbeat(leaseA.attempt.id);
    assert.strictEqual(heartbeatUpdated, true);

    const released = releaseWorkflowLease(leaseA.attempt.id, 'completed');
    assert.strictEqual(released, true);
    assert.strictEqual(getActiveWorkflowAttempt(project.id), null, 'Released attempt must no longer be active');

    await deleteProject(project.id);
});

finish();
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_workflow_attempts.js
```
Expected: `Cannot find module '../workflowAttempts.js'`.

- [ ] **Step 3: Add `workflow_attempts` schema to `backend/db.js`**

In `backend/db.js`:
Add table creation statement in `db.exec`:
```sql
  CREATE TABLE IF NOT EXISTS workflow_attempts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    lease_owner TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    error TEXT,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  );
```
Add index creations:
```js
db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_attempts_project ON workflow_attempts(project_id, status)');
db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_attempts_heartbeat ON workflow_attempts(status, heartbeat_at)');
```

- [ ] **Step 4: Implement `backend/workflowAttempts.js`**

In `backend/workflowAttempts.js`:

```js
import crypto from 'crypto';
import { db } from './db.js';

const activeLeases = new Map(); // projectId -> { attemptId, leaseOwner }

export function getActiveWorkflowAttempt(projectId, { heartbeatTtlSeconds = 30 } = {}) {
    if (!projectId) return null;

    const row = db.prepare(`
        SELECT id, project_id, status, lease_owner, started_at, heartbeat_at, ended_at, error
        FROM workflow_attempts
        WHERE project_id = ? AND status = 'running'
        ORDER BY started_at DESC
        LIMIT 1
    `).get(projectId);

    if (!row) {
        activeLeases.delete(projectId);
        return null;
    }

    const heartbeatMs = new Date(row.heartbeat_at).getTime();
    const isFresh = (Date.now() - heartbeatMs) <= (heartbeatTtlSeconds * 1000);
    if (!isFresh) {
        activeLeases.delete(projectId);
        return null;
    }

    return row;
}

export function acquireWorkflowLease(projectId, leaseOwner, { heartbeatTtlSeconds = 30 } = {}) {
    if (!projectId || !leaseOwner) {
        throw new Error('projectId and leaseOwner are required to acquire workflow lease.');
    }

    const active = getActiveWorkflowAttempt(projectId, { heartbeatTtlSeconds });
    if (active) {
        return { acquired: false, attempt: active };
    }

    const attemptId = `attempt-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
        INSERT INTO workflow_attempts (id, project_id, status, lease_owner, started_at, heartbeat_at)
        VALUES (?, ?, 'running', ?, ?, ?)
    `).run(attemptId, projectId, leaseOwner, nowIso, nowIso);

    activeLeases.set(projectId, { attemptId, leaseOwner });

    const newAttempt = db.prepare('SELECT * FROM workflow_attempts WHERE id = ?').get(attemptId);
    return { acquired: true, attempt: newAttempt };
}

export function updateAttemptHeartbeat(attemptId) {
    if (!attemptId) return false;
    const result = db.prepare(`
        UPDATE workflow_attempts
        SET heartbeat_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'running'
    `).run(attemptId);
    return result.changes > 0;
}

export function releaseWorkflowLease(attemptId, terminalStatus = 'completed', { error = null } = {}) {
    if (!attemptId) return false;

    const attempt = db.prepare('SELECT project_id FROM workflow_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
        activeLeases.delete(attempt.project_id);
    }

    const result = db.prepare(`
        UPDATE workflow_attempts
        SET status = ?, ended_at = CURRENT_TIMESTAMP, error = ?
        WHERE id = ?
    `).run(terminalStatus, error ? String(error) : null, attemptId);

    return result.changes > 0;
}
```

- [ ] **Step 5: Run unit test GREEN**

Run:
```bash
node tests/test_workflow_attempts.js
```
Expected: `1 BAŞARILI, 0 HATALI`.

- [ ] **Step 6: Record task checkpoint**

Confirm tests pass and record changed paths: `backend/db.js`, `backend/workflowAttempts.js`, `backend/tests/test_workflow_attempts.js`.

---

### Task 2: Startup Reconciliation for Stale Attempts and Project Recovery

**Files:**
- Modify: `backend/workflowAttempts.js`
- Modify: `backend/db.js`
- Modify: `backend/tests/test_workflow_attempts.js`

**Interfaces:**
- Produces: `reconcileStaleWorkflowAttempts({ staleThresholdSeconds? }) -> { reconciledCount: number, recoveredProjectIds: string[] }`.
- Automatically executes on server startup in `backend/db.js`.

- [ ] **Step 1: Write RED test for stale attempt reconciliation**

In `backend/tests/test_workflow_attempts.js`, add:

```js
await runAsyncTest('2. reconcileStaleWorkflowAttempts should transition stale running attempts to stale_terminated and projects to paused', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const {
        acquireWorkflowLease,
        reconcileStaleWorkflowAttempts
    } = await import('../workflowAttempts.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Stale Recovery Test Project' });
    const lease = acquireWorkflowLease(project.id, 'worker-crashed');

    db.prepare("UPDATE projects SET status = 'running' WHERE id = ?").run(project.id);
    db.prepare("UPDATE workflow_attempts SET heartbeat_at = '2020-01-01 00:00:00' WHERE id = ?").run(lease.attempt.id);

    const recovery = reconcileStaleWorkflowAttempts({ staleThresholdSeconds: 1 });
    assert.strictEqual(recovery.reconciledCount >= 1, true);
    assert.ok(recovery.recoveredProjectIds.includes(project.id));

    const updatedAttempt = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(updatedAttempt.status, 'stale_terminated');
    assert.ok(updatedAttempt.ended_at !== null);

    const updatedProject = getProject(project.id);
    assert.strictEqual(updatedProject.status, 'paused');
    assert.ok(updatedProject.chatHistory.some(c => c.parts[0].text.includes('Sunucu yeniden başlatıldı')));

    await deleteProject(project.id);
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_workflow_attempts.js
```
Expected: `reconcileStaleWorkflowAttempts is not a function`.

- [ ] **Step 3: Implement `reconcileStaleWorkflowAttempts` in `backend/workflowAttempts.js`**

In `backend/workflowAttempts.js`, add:

```js
export function reconcileStaleWorkflowAttempts({ staleThresholdSeconds = 30 } = {}) {
    const thresholdDate = new Date(Date.now() - (staleThresholdSeconds * 1000)).toISOString();
    const staleAttempts = db.prepare(`
        SELECT a.id as attempt_id, a.project_id, p.title as project_title
        FROM workflow_attempts a
        JOIN projects p ON p.id = a.project_id
        WHERE a.status = 'running' AND (a.heartbeat_at <= ? OR a.heartbeat_at IS NULL)
    `).all(thresholdDate);

    const recoveredProjectIds = [];
    const nowIso = new Date().toISOString();
    const pauseMessage = "⚠️ Sunucu yeniden başlatıldı; süreç güvenle duraklatıldı. Kaldığı yerden devam ettirmek için 'Devam Et' (Resume) butonuna basabilirsiniz.";

    const updateAttempt = db.prepare(`
        UPDATE workflow_attempts
        SET status = 'stale_terminated', ended_at = ?, error = 'Server restarted while execution was in progress'
        WHERE id = ?
    `);
    const updateProject = db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?");
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');

    db.exec('BEGIN');
    try {
        for (const row of staleAttempts) {
            updateAttempt.run(nowIso, row.attempt_id);
            updateProject.run(row.project_id);
            insertChat.run(row.project_id, 'model', pauseMessage, nowIso);
            recoveredProjectIds.push(row.project_id);
        }

        // Also check any projects that were marked 'running' in projects table without active attempt
        const orphanedRunningProjects = db.prepare(`
            SELECT id FROM projects
            WHERE status = 'running' AND id NOT IN (
                SELECT project_id FROM workflow_attempts WHERE status = 'running'
            )
        `).all();

        for (const p of orphanedRunningProjects) {
            updateProject.run(p.id);
            insertChat.run(p.id, 'model', pauseMessage, nowIso);
            if (!recoveredProjectIds.includes(p.id)) {
                recoveredProjectIds.push(p.id);
            }
        }

        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    return {
        reconciledCount: recoveredProjectIds.length,
        recoveredProjectIds
    };
}
```

- [ ] **Step 4: Call `reconcileStaleWorkflowAttempts()` on startup in `backend/db.js`**

In `backend/db.js`:
```js
import { reconcileStaleWorkflowAttempts } from './workflowAttempts.js';
...
try {
    reconcileStaleWorkflowAttempts();
} catch (error) {
    logError('db.startup_reconciliation_failed', error);
}
```

- [ ] **Step 5: Run unit tests GREEN**

Run:
```bash
node tests/test_workflow_attempts.js
```
Expected: `2 BAŞARILI, 0 HATALI`.

- [ ] **Step 6: Record task checkpoint**

Confirm tests pass and record changed paths.

---

### Task 3: Idempotent `/approve` and `/resume` Routing with Lease Acquisition

**Files:**
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_workflow_attempts.js`
- Modify: `backend/tests/test_http_integration.js`

**Interfaces:**
- `/approve` and `/resume` endpoints acquire lease before running background worker.
- Duplicate calls return `200 OK` with existing project state and running attempt ID.

- [ ] **Step 1: Write RED tests for idempotent approve and resume**

In `backend/tests/test_workflow_attempts.js`, add:

```js
await runAsyncTest('3. Duplicate approve/resume calls should be idempotent and prevent multiple workers', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');

    const project = await createProject({ title: 'Idempotency Test Project' });
    const lease1 = acquireWorkflowLease(project.id, 'request-1');
    assert.strictEqual(lease1.acquired, true);

    const lease2 = acquireWorkflowLease(project.id, 'request-2');
    assert.strictEqual(lease2.acquired, false, 'Duplicate concurrent execution must be suppressed');
    assert.strictEqual(lease2.attempt.id, lease1.attempt.id);

    releaseWorkflowLease(lease1.attempt.id, 'completed');
    await deleteProject(project.id);
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_workflow_attempts.js
```

- [ ] **Step 3: Update `backend/routes/projectRoutes.js` `/approve` and `/resume` endpoints**

In `backend/routes/projectRoutes.js`:
Import `acquireWorkflowLease` from `../workflowAttempts.js`.
Update `router.post('/:id/approve')`:
```js
    router.post('/:id/approve', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const state = await readProjectState(id);
            if (!state || !canTransitionProjectStatus(state.status, 'running')) {
                return res.status(400).json({ error: "Geçersiz işlem" });
            }

            const lease = acquireWorkflowLease(id, `http-approve-${req.user.id}`);
            if (!lease.acquired) {
                return res.json({ ...state, attemptId: lease.attempt.id, idempotent: true });
            }

            state.status = 'running';
            state.workflow = null;
            await writeProjectState(id, state);

            executeProjectTasks(id, wsHub, lease.attempt.id).catch(error => {
                logError('workflow.background_execution_failed', error, { projectId: id, attemptId: lease.attempt.id });
            });

            res.json({ ...state, attemptId: lease.attempt.id });
        } catch (err) {
            next(err);
        }
    });
```
Apply same pattern to `router.post('/:id/resume')`.

- [ ] **Step 4: Run unit and HTTP integration tests GREEN**

Run:
```bash
node tests/test_workflow_attempts.js && node tests/test_http_integration.js
```
Expected: All pass.

- [ ] **Step 5: Record task checkpoint**

Confirm tests pass and record changed paths.

---

### Task 4: Workflow Execution Heartbeat, Completion and Failure Lifecycle

**Files:**
- Modify: `backend/engine/workflow.js`
- Modify: `backend/tests/test_workflow_attempts.js`

**Interfaces:**
- `executeProjectTasks(projectId, wsHub, attemptId)` starts periodic heartbeat timer (5s).
- On success: marks attempt `completed` and clears heartbeat timer.
- On failure/veto: marks attempt `failed` with error message and clears heartbeat timer.

- [ ] **Step 1: Write RED tests for workflow execution attempt lifecycle**

In `backend/tests/test_workflow_attempts.js`, add:

```js
await runAsyncTest('4. executeProjectTasks should manage attempt heartbeat, completion and failure', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, getActiveWorkflowAttempt } = await import('../workflowAttempts.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Lifecycle Engine Project' });
    project.status = 'pending_approval';
    project.plan = {
        summary: 'Test plan',
        domains: [{ name: 'backend', prefix: 'backend', description: 'API' }]
    };
    const repo = await import('../projectRepository.js');
    await repo.saveProjectState(project);

    const lease = acquireWorkflowLease(project.id, 'engine-test');
    assert.strictEqual(lease.acquired, true);

    const { releaseWorkflowLease } = await import('../workflowAttempts.js');
    releaseWorkflowLease(lease.attempt.id, 'completed');

    const finished = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(finished.status, 'completed');
    assert.ok(finished.ended_at !== null);

    await deleteProject(project.id);
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_workflow_attempts.js
```

- [ ] **Step 3: Update `backend/engine/workflow.js` with heartbeat and lifecycle management**

In `backend/engine/workflow.js`:
Import `updateAttemptHeartbeat`, `releaseWorkflowLease` from `../workflowAttempts.js`.
In `executeProjectTasks(projectId, wsHub = null, attemptId = null)`:
- Setup 5-second interval timer `const heartbeatInterval = setInterval(() => updateAttemptHeartbeat(attemptId), 5000);`
- In `finally`: `clearInterval(heartbeatInterval); releaseWorkflowLease(attemptId, terminalStatus);`
- On clean finish: `terminalStatus = 'completed'`
- On catch/error: `terminalStatus = 'failed'; releaseWorkflowLease(attemptId, 'failed', { error: error.message })`

- [ ] **Step 4: Run unit and integration tests GREEN**

Run:
```bash
node tests/test_workflow_attempts.js && node tests/test_websocket_integration.js
```
Expected: All pass.

- [ ] **Step 5: Record task checkpoint**

Confirm tests pass and record changed paths.

---

### Task 5: Master Runner Wiring, Full Suite Verification and Checkpoint Update

**Files:**
- Modify: `backend/tests/test_runner.js`
- Modify: `app.state.md`

**Interfaces:**
- Adds `test_workflow_attempts.js` to `test_runner.js`.
- Verifies 15/15 test suites and frontend build.
- Updates `app.state.md` with `PHASE_2_WORKFLOW_ATTEMPTS_RESULT`.

- [ ] **Step 1: Wire `test_workflow_attempts.js` into `test_runner.js`**

Add `'test_workflow_attempts.js'` to `testFiles` in `backend/tests/test_runner.js`.

- [ ] **Step 2: Run full backend test suite and frontend build**

Run:
```bash
cd backend && npm test
cd ../frontend && npm run build
```
Expected: Master runner reports 15 suites passed, 0 failed. Frontend Vite build exits 0.

- [ ] **Step 3: Update `app.state.md` with factual results**

Add `## PHASE_2_WORKFLOW_ATTEMPTS_RESULT` with exact factual outcomes and update `NEXT_ACTION` to Sub-Project 2.3.

- [ ] **Step 4: Final plan self-check**

Confirm no unhandled attempt leaks or unreleased leases remain.

## Execution Boundary

This plan implements Sub-Project 2.2 (Workflow Attempts, Leases, and Crash Recovery). It does not implement cooperative cancellation signal propagation across subprocesses or LLM deadline timeouts, which are covered in Sub-Project 2.3.
