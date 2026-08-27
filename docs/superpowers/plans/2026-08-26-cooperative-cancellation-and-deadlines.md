# Cooperative Cancellation, Pause Drain Semantics, and Provider Deadlines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement cooperative cancellation with `AbortController`, enforce 60s LLM provider deadlines, handle instantaneous pause lifecycle with lease release, and version checkpoints via plan hashes.

**Architecture:** Create `backend/engine/cancellation.js` to manage per-project abort controllers. Update `backend/llm.js` to merge abort signals with 60s timeout deadlines and filter retries. Update `runWithConcurrency` in `backend/engine/workflow.js` to halt pool dispatch on abort. Update `POST /api/projects/:id/pause` to abort in-flight execution and release leases. Add `computePlanHash` to invalidate stale checkpoint caches upon plan revision.

**Tech Stack:** Bun/Node ESM, `AbortController` / `AbortSignal.any()`, `crypto` (SHA-256), Express 4, native timers, existing test harness.

## Global Constraints

- Cancellation is cooperative: network sockets and pool dispatches stop immediately upon abort.
- `generateLLMResponse` defaults to a 60,000ms deadline.
- Only 429 and 5xx responses trigger backoff retry; abort signals or 4xx responses stop immediately.
- Pausing an active project transitions attempt status to `paused` and releases the lease without crashing.
- Plan hash is a 16-character hexadecimal SHA-256 of normalized summary, talimatname, and domains.
- Preserves pre-existing user diffs. Record task checkpoints through test output and changed-path receipts.

---

## File Map

- Create: `backend/engine/cancellation.js`
- Create: `backend/tests/test_cancellation_and_deadlines.js`
- Modify: `backend/llm.js`
- Modify: `backend/engine/workflow.js`
- Modify: `backend/engine/buildValidator.js`
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/tests/test_runner.js`
- Modify: `app.state.md`

---

### Task 1: Cancellation Registry and Concurrency Pool Abort Propagation

**Files:**
- Create: `backend/engine/cancellation.js`
- Modify: `backend/engine/workflow.js`
- Create: `backend/tests/test_cancellation_and_deadlines.js`

**Interfaces:**
- Produces: `registerProjectAbortController(projectId, controller) -> void`.
- Produces: `abortProjectExecution(projectId, reason?) -> boolean`.
- Produces: `getProjectAbortSignal(projectId) -> AbortSignal | null`.
- Produces: `unregisterProjectAbortController(projectId) -> boolean`.
- Updates `runWithConcurrency(items, limit, workerFn, { signal }?) -> Promise<array>`.

- [ ] **Step 1: Write RED tests for cancellation registry and pool abort**

In `backend/tests/test_cancellation_and_deadlines.js`:

```js
import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Cancellation registry should register, signal, and unregister controllers', async () => {
    const {
        registerProjectAbortController,
        abortProjectExecution,
        getProjectAbortSignal,
        unregisterProjectAbortController
    } = await import('../engine/cancellation.js');

    const projectId = `proj-cancel-${Date.now()}`;
    const controller = new AbortController();

    registerProjectAbortController(projectId, controller);
    assert.strictEqual(getProjectAbortSignal(projectId), controller.signal);
    assert.strictEqual(controller.signal.aborted, false);

    const aborted = abortProjectExecution(projectId, 'PAUSED');
    assert.strictEqual(aborted, true);
    assert.strictEqual(controller.signal.aborted, true);
    assert.strictEqual(controller.signal.reason, 'PAUSED');

    unregisterProjectAbortController(projectId);
    assert.strictEqual(getProjectAbortSignal(projectId), null);
});

await runAsyncTest('2. runWithConcurrency should immediately halt queue dispatch when signal aborts', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    const controller = new AbortController();
    const executed = [];

    const items = [1, 2, 3, 4, 5, 6];
    const poolPromise = runWithConcurrency(items, 2, async (item) => {
        executed.push(item);
        if (item === 2) {
            controller.abort('STOP');
        }
        await new Promise(r => setTimeout(r, 20));
        return item * 10;
    }, { signal: controller.signal });

    const results = await poolPromise;
    assert.ok(executed.length <= 4, 'Pool must not execute remaining items after abort');
});

finish();
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_cancellation_and_deadlines.js
```
Expected: `Cannot find module '../engine/cancellation.js'`.

- [ ] **Step 3: Implement `backend/engine/cancellation.js`**

In `backend/engine/cancellation.js`:

```js
const controllers = new Map(); // projectId -> AbortController

export function registerProjectAbortController(projectId, controller) {
    if (!projectId || !controller) return;
    controllers.set(projectId, controller);
}

export function getProjectAbortSignal(projectId) {
    return controllers.get(projectId)?.signal || null;
}

export function abortProjectExecution(projectId, reason = 'ABORTED') {
    const controller = controllers.get(projectId);
    if (!controller) return false;
    controller.abort(reason);
    controllers.delete(projectId);
    return true;
}

export function unregisterProjectAbortController(projectId) {
    return controllers.delete(projectId);
}
```

- [ ] **Step 4: Update `runWithConcurrency` in `backend/engine/workflow.js`**

In `backend/engine/workflow.js`:

```js
export async function runWithConcurrency(items, limit, workerFn, { signal = null } = {}) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const concurrencyLimit = Math.max(1, limit || 1);
    const results = [];
    const executing = new Set();

    for (const item of items) {
        if (signal?.aborted) break;

        let p;
        p = (async () => {
            if (signal?.aborted) return null;
            const res = await workerFn(item);
            results.push(res);
            return res;
        })().finally(() => {
            executing.delete(p);
        });

        executing.add(p);
        if (executing.size >= concurrencyLimit) {
            await Promise.race(executing);
        }
    }

    await Promise.all(executing);
    return results;
}
```

- [ ] **Step 5: Run unit tests GREEN**

Run:
```bash
node tests/test_cancellation_and_deadlines.js
```
Expected: `2 BAŞARILI, 0 HATALI`.

- [ ] **Step 6: Record task checkpoint**

Confirm tests pass and record changed paths: `backend/engine/cancellation.js`, `backend/engine/workflow.js`, `backend/tests/test_cancellation_and_deadlines.js`.

---

### Task 2: LLM Provider Deadlines, Abort Merging, and Intelligent Retry

**Files:**
- Modify: `backend/llm.js`
- Modify: `backend/tests/test_cancellation_and_deadlines.js`

**Interfaces:**
- `generateLLMResponse(messages, { signal?, timeoutMs = 60000, ...options } = {})`
- `fetchWithRetry(url, options, { retries = 3, signal? } = {})`

- [ ] **Step 1: Write RED tests for LLM deadlines and abort signals**

In `backend/tests/test_cancellation_and_deadlines.js`, add:

```js
await runAsyncTest('3. generateLLMResponse should reject immediately on timeout or abort signal', async () => {
    const { generateLLMResponse } = await import('../llm.js');

    const controller = new AbortController();
    controller.abort('USER_CANCEL');

    await assert.rejects(
        () => generateLLMResponse([{ role: 'user', content: 'test' }], { signal: controller.signal, allowMockFallback: false }),
        /abort|cancel/i
    );

    await assert.rejects(
        () => generateLLMResponse([{ role: 'user', content: 'timeout test' }], { timeoutMs: 1, allowMockFallback: false }),
        /deadline|timeout|abort/i
    );
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_cancellation_and_deadlines.js
```

- [ ] **Step 3: Update `backend/llm.js`**

In `backend/llm.js`:

```js
async function fetchWithRetry(url, options, { retries = 3, signal = null } = {}) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        if (signal?.aborted) {
            throw new Error(`LLM fetch aborted: ${signal.reason || 'ABORTED'}`);
        }
        try {
            const res = await fetch(url, { ...options, signal });
            if (res.status === 429 || res.status >= 500) {
                if (i < retries - 1 && !signal?.aborted) {
                    const backoffMs = 1000 * (i + 1);
                    logWarning('llm.fetch_retry_status', null, { status: res.status, attempt: i + 1, backoffMs });
                    await new Promise(r => setTimeout(r, backoffMs));
                    continue;
                }
            }
            return res;
        } catch (err) {
            lastError = err;
            if (signal?.aborted || err.name === 'AbortError' || err.name === 'TimeoutError') {
                throw err;
            }
            logWarning('llm.fetch_retry_failed', err, { attempt: i + 1, totalAttempts: retries });
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, 1000 * (i + 1)));
            }
        }
    }
    throw new Error(`Fetch ${retries} denemeden sonra başarısız oldu. Son hata: ${lastError?.message}`);
}
```

In `generateLLMResponse`:
Combine `options.signal` with timeout:
```js
    const timeoutMs = Number(options.timeoutMs ?? process.env.LLM_TIMEOUT_MS ?? 60000);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const mergedSignal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
```
Pass `signal: mergedSignal` into Google REST fetch and OpenAI fetch calls.

- [ ] **Step 4: Run unit tests GREEN**

Run:
```bash
node tests/test_cancellation_and_deadlines.js
```
Expected: `3 BAŞARILI, 0 HATALI`.

- [ ] **Step 5: Record task checkpoint**

Confirm tests pass and record changed paths.

---

### Task 3: Instantaneous Pause Route and Attempt Lease Release

**Files:**
- Modify: `backend/routes/projectRoutes.js`
- Modify: `backend/engine/workflow.js`
- Modify: `backend/tests/test_cancellation_and_deadlines.js`
- Modify: `backend/tests/test_http_integration.js`

**Interfaces:**
- `POST /api/projects/:id/pause` invokes `abortProjectExecution(id, 'PAUSED')`.
- `executeProjectTasks` catches `'PAUSED'` abort, updates status to `paused`, and releases lease cleanly.

- [ ] **Step 1: Write RED tests for instant pause and lease release**

In `backend/tests/test_cancellation_and_deadlines.js`, add:

```js
await runAsyncTest('4. abortProjectExecution should release workflow attempt as paused', async () => {
    const { createProject, deleteProject, getProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, getActiveWorkflowAttempt } = await import('../workflowAttempts.js');
    const { registerProjectAbortController, abortProjectExecution } = await import('../engine/cancellation.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Pause Abort Test Project' });
    const lease = acquireWorkflowLease(project.id, 'worker-pause-test');
    const controller = new AbortController();
    registerProjectAbortController(project.id, controller);

    assert.strictEqual(getActiveWorkflowAttempt(project.id)?.id, lease.attempt.id);

    const paused = abortProjectExecution(project.id, 'PAUSED');
    assert.strictEqual(paused, true);
    assert.strictEqual(controller.signal.aborted, true);

    const { releaseWorkflowLease } = await import('../workflowAttempts.js');
    releaseWorkflowLease(lease.attempt.id, 'paused');

    const attempt = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(attempt.status, 'paused');
    assert.strictEqual(getActiveWorkflowAttempt(project.id), null, 'Lease must be free after pause');

    await deleteProject(project.id);
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_cancellation_and_deadlines.js
```

- [ ] **Step 3: Update `POST /api/projects/:id/pause` in `backend/routes/projectRoutes.js`**

In `backend/routes/projectRoutes.js`:
Import `abortProjectExecution` from `../engine/cancellation.js`.
In `router.post('/:id/pause')`:
```js
    router.post('/:id/pause', requireAuth, projectAccess('owner'), async (req, res) => {
        const { id } = req.params;
        const state = await readProjectState(id);
        if (!state || !canTransitionProjectStatus(state.status, 'paused')) {
            return res.status(400).json({ error: "Geçersiz işlem" });
        }

        abortProjectExecution(id, 'PAUSED');

        state.status = 'paused';
        state.chatHistory.push({ role: 'model', parts: [{ text: "Süreç tarafınızdan duraklatıldı. Hangi ajanların veya mimarinin değişmesini istersiniz?" }] });
        await writeProjectState(id, state);

        res.json(state);
    });
```

- [ ] **Step 4: Connect abort controller in `executeProjectTasks` in `backend/engine/workflow.js`**

In `backend/engine/workflow.js`:
Import `registerProjectAbortController`, `unregisterProjectAbortController` from `./cancellation.js`.
In `executeProjectTasks`:
1. Create `const abortController = new AbortController();`
2. Register: `registerProjectAbortController(projectId, abortController);`
3. Pass `signal: abortController.signal` to `callAgentLLM` and `runWithConcurrency`.
4. In `catch (error)`:
   - If `abortController.signal.aborted && abortController.signal.reason === 'PAUSED'`:
     - `terminalStatus = 'paused';`
     - Log info `workflow.execution_paused` instead of error.
5. In `finally`:
   - `unregisterProjectAbortController(projectId);`

- [ ] **Step 5: Run unit and HTTP integration tests GREEN**

Run:
```bash
node tests/test_cancellation_and_deadlines.js && node tests/test_http_integration.js
```
Expected: All pass.

- [ ] **Step 6: Record task checkpoint**

Confirm tests pass and record changed paths.

---

### Task 4: Deterministic Plan Checkpointing and Cache Invalidation

**Files:**
- Modify: `backend/engine/workflow.js`
- Modify: `backend/tests/test_cancellation_and_deadlines.js`

**Interfaces:**
- Produces: `computePlanHash(plan) -> string (16-char hex)`.
- Updates `executeProjectTasks` to clear `directorSpecs` and `teamleaderPlans` when `planHash` changes.

- [ ] **Step 1: Write RED tests for plan hash computation and cache invalidation**

In `backend/tests/test_cancellation_and_deadlines.js`, add:

```js
await runAsyncTest('5. computePlanHash should produce stable hash and detect plan revisions', async () => {
    const { computePlanHash } = await import('../engine/workflow.js');

    const plan1 = {
        summary: 'E-Ticaret',
        talimatname: '# Şartname v1',
        domains: [{ name: 'backend' }, { name: 'frontend' }]
    };
    const plan2 = {
        summary: 'E-Ticaret',
        talimatname: '# Şartname v1',
        domains: [{ name: 'backend' }, { name: 'frontend' }]
    };
    const planRevised = {
        summary: 'E-Ticaret Revize',
        talimatname: '# Şartname v2',
        domains: [{ name: 'backend' }, { name: 'frontend' }, { name: 'admin' }]
    };

    const hash1 = computePlanHash(plan1);
    const hash2 = computePlanHash(plan2);
    const hashRevised = computePlanHash(planRevised);

    assert.strictEqual(hash1, hash2, 'Identical plans must produce identical hashes');
    assert.notStrictEqual(hash1, hashRevised, 'Revised plan must produce different hash');
    assert.match(hash1, /^[a-f0-9]{16}$/);
});
```

- [ ] **Step 2: Run RED test**

Run:
```bash
node tests/test_cancellation_and_deadlines.js
```
Expected: `computePlanHash is not a function`.

- [ ] **Step 3: Implement `computePlanHash` and plan revision check in `backend/engine/workflow.js`**

In `backend/engine/workflow.js`:

```js
import crypto from 'crypto';

export function computePlanHash(plan) {
    if (!plan || typeof plan !== 'object') return '0'.repeat(16);
    const normalized = {
        summary: String(plan.summary || '').trim(),
        talimatname: String(plan.talimatname || '').trim(),
        domains: (plan.domains || []).map(d => ({
            name: typeof d === 'string' ? d : d.name,
            prefix: typeof d === 'string' ? d : (d.prefix || d.name)
        }))
    };
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
}
```

In `executeProjectTasks`:
Before loading cached `directorSpecs` and `teamleaderPlans`:
```js
    const planHash = computePlanHash(plan);
    if (!state.workflow) state.workflow = {};
    if (state.workflow.planHash && state.workflow.planHash !== planHash) {
        logWarning('workflow.plan_revised_cache_cleared', null, { projectId, previousHash: state.workflow.planHash, newHash: planHash });
        state.workflow.directorSpecs = {};
        state.workflow.teamleaderPlans = {};
    }
    state.workflow.planHash = planHash;
```

- [ ] **Step 4: Run unit tests GREEN**

Run:
```bash
node tests/test_cancellation_and_deadlines.js
```
Expected: `5 BAŞARILI, 0 HATALI`.

- [ ] **Step 5: Record task checkpoint**

Confirm tests pass and record changed paths.

---

### Task 5: Master Runner Wiring, Full Suite Verification and Checkpoint Update

**Files:**
- Modify: `backend/tests/test_runner.js`
- Modify: `app.state.md`

**Interfaces:**
- Adds `test_cancellation_and_deadlines.js` to `test_runner.js`.
- Verifies 16/16 backend suites and frontend build.
- Updates `app.state.md` with `PHASE_2_CANCELLATION_DEADLINES_RESULT`.

- [ ] **Step 1: Wire `test_cancellation_and_deadlines.js` into `test_runner.js`**

Add `'test_cancellation_and_deadlines.js'` to `testFiles` in `backend/tests/test_runner.js`.

- [ ] **Step 2: Run full backend suite and frontend build**

Run:
```bash
cd backend && npm test
cd ../frontend && npm run build
```
Expected: Master runner reports 16 suites passed, 0 failed. Frontend Vite build exits 0.

- [ ] **Step 3: Update `app.state.md` with factual results**

Add `## PHASE_2_CANCELLATION_DEADLINES_RESULT` and mark Phase 2 complete. Set `NEXT_ACTION` to Phase 3.

- [ ] **Step 4: Final plan self-check**

Confirm no dangling timeouts or uncaught AbortSignals exist.

## Execution Boundary

This plan completes Phase 2 (Durable and Deterministic Workflow Lifecycle). Subprocess sandboxing and compiler isolation follow in Phase 3.
