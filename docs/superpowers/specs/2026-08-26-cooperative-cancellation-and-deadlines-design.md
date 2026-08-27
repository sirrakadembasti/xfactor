# Cooperative Cancellation, Pause Drain Semantics, and Provider Deadlines Design

## Goal

Provide cooperative cancellation across the orchestration pipeline, enforce bounded LLM provider deadlines with intelligent retry classes, enable instantaneous pause lifecycle transitions without runaway token/compute consumption, and version workflow checkpoints by deterministic plan hashes to prevent stale report re-use across revisions.

## Scope

Included:

- Cancellation controller registry (`backend/engine/cancellation.js`) managing per-project `AbortController` instances.
- Cancellation signal propagation to LLM fetch calls (`backend/llm.js`), concurrency wave pools (`runWithConcurrency`), and validator subprocesses (`backend/engine/buildValidator.js`).
- LLM request deadlines (60s default) combining caller abort signals and deadline timers via `AbortSignal.any()`.
- Intelligent retry classification in `fetchWithRetry`: retries only transient rate-limit (429) and server (5xx) responses with backoff; immediately halts on abort signals or 4xx client errors.
- Instantaneous pause lifecycle (`POST /api/projects/:id/pause`): aborts in-flight execution, transitions workflow attempt to `paused`, records safe checkpoint state, and releases execution lease.
- Deterministic plan hashing (`computePlanHash`): invalidates cached director/teamleader checkpoint state when specifications or domain architectures change between approvals.
- Unit and integration tests covering signal propagation, timeout rejection, instant pause lease release, and plan revision cache invalidation.

Excluded:

- Subprocess sandbox/container isolation (CPU/memory/network containment) — covered in Phase 3.
- Frontend DAG log virtualization — covered in Phase 4.

## Architecture

### 1. Cancellation Registry (`backend/engine/cancellation.js`)

A dedicated module manages process-local `AbortController` lifecycle:

```text
Project Execution Start
  -> registerProjectAbortController(projectId, controller)

POST /api/projects/:id/pause  OR  deleteProject
  -> abortProjectExecution(projectId, reason = 'PAUSED')
       -> controller.abort(reason)
       -> activeControllers.delete(projectId)

Workflow Exit (completed, failed, paused)
  -> unregisterProjectAbortController(projectId)
```

### 2. LLM Timeouts and Signal Propagation (`backend/llm.js`)

`generateLLMResponse(messages, { signal, timeoutMs = 60000, ...options })`:

1. Merges signals using standard `AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean))`.
2. Passes merged signal into `fetch(url, { ..., signal: mergedSignal })`.
3. Handles `AbortError` and `TimeoutError` cleanly:
   - If timed out: logs structured warning and throws `Error('LLM call exceeded ${timeoutMs}ms deadline')`.
   - If aborted by user: throws `error` with `code = 'ABORT_ERR'` and message identifying the abort reason.
4. `fetchWithRetry(url, options, { retries = 3, signal })`:
   - Checks `if (signal?.aborted) throw new Error('Execution aborted');` before each retry attempt.
   - Retries only HTTP status 429 and 500..599 with exponential backoff (1s, 2s, 3s).

### 3. Concurrency Pool and Subprocess Abort (`backend/engine/`)

1. **`runWithConcurrency(items, limit, workerFn, { signal } = {})`:**
   - Checks `signal?.aborted` before dispatching any pending item from the queue.
   - If aborted, immediately rejects pending queue promises and returns partial/aborted results.
2. **`validateProjectBuild(projectDir, { signal, timeout = 30000 } = {})`:**
   - If `signal` is aborted, immediately kills child process tree using `tree-kill` or process group termination and exits fail-closed.

### 4. Deterministic Plan Checkpointing (`backend/engine/workflow.js`)

`computePlanHash(plan)`:

1. Extracts canonical representation: `{ summary: plan.summary, talimatname: plan.talimatname, domains: plan.domains }`.
2. Computes SHA-256 hash trimmed to 16 hex characters.
3. Compares `currentHash` against `state.workflow?.planHash`.
4. If hash differs, resets cached `directorSpecs` and `teamleaderPlans` so revised architectures do not reuse obsolete task outputs.
5. Updates `state.workflow.planHash = currentHash`.

### 5. Pause Lifecycle & Lease Release

When `POST /api/projects/:id/pause` is invoked:

1. `abortProjectExecution(id, 'PAUSED')` signals the active worker.
2. Worker catches `PAUSED` abort, marks `state.status = 'paused'`, commits current checkpoint state via `writeProjectState(id, state)`.
3. Worker `finally` block calls `releaseWorkflowLease(attemptId, 'paused')` and unregisters abort controller.
4. Subsequent `/resume` request acquires a fresh lease with a new attempt ID and resumes from the verified checkpoint.

## Error Handling

- **LLM Timeout:** Caught and mapped to structured `llm.timeout` log and descriptive error.
- **User Pause / Abort:** Recognized as clean control flow, not an unexpected system crash; logs `workflow.execution_paused` instead of `workflow.execution_failed`.
- **Subprocess Timeout / Abort:** Process killed gracefully with SIGTERM, followed by SIGKILL if stubborn, avoiding zombie processes.

## Verification Strategy

1. **Unit Tests (`backend/tests/test_cancellation_and_deadlines.js`):**
   - AbortController registry attaches and signals accurately.
   - `generateLLMResponse` rejects on timeout deadline and abort signal.
   - `runWithConcurrency` stops spawning items when signal aborts.
   - `computePlanHash` detects revisions and clears stale checkpoint caches.
   - `/pause` call releases active workflow lease and leaves attempt in `paused` state.
2. **Full Suite & Build:**
   - Full 16-suite backend test runner exits 0.
   - Production Vite frontend build exits 0.
