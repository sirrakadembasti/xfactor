# Workflow Execution Attempts, Lease Locks, and Crash Recovery Design

## Goal

Provide durable tracking of workflow execution lifecycles through a persistent `workflow_attempts` table, prevent duplicate concurrent executions via idempotent lease locks, and ensure resilient crash recovery by reconciling stale running attempts into a safe paused state on startup.

## Scope

Included:

- SQLite table `workflow_attempts` recording attempt IDs, project references, statuses, lease owners, start/heartbeat/end timestamps, and error messages.
- Active workflow lease management (`acquireWorkflowLease`, `updateAttemptHeartbeat`, `releaseWorkflowLease`, `getActiveWorkflowAttempt`) ensuring at most one worker executes a project at any time.
- Idempotent `/approve` and `/resume` API endpoints returning the existing running attempt metadata when a fresh lease is already held.
- Periodic heartbeat updater during active workflow stages.
- Server startup reconciliation (`reconcileStaleWorkflowAttempts`) safely transitioning stale running projects and attempts into `paused` / `stale_terminated` status with informative chat and log notifications.
- Atomic attempt completion and failure recording in `backend/engine/workflow.js` with structured error redaction.
- Unit and integration verification covering lease concurrency, duplicate request suppression, crash reconciliation, and cascade cleanup on project deletion.

Excluded:

- Cooperative cancellation, pause drain, and LLM deadlines — covered in Sub-Project 2.3.
- Subprocess sandbox isolation — covered in Phase 3.

## Architecture & Data Model

### SQLite Schema (`backend/db.js`)

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

CREATE INDEX IF NOT EXISTS idx_workflow_attempts_project ON workflow_attempts (project_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_attempts_heartbeat ON workflow_attempts (status, heartbeat_at);
```

### Module Responsibilities

1. **`backend/workflowAttempts.js`:**
   - Owns `workflow_attempts` queries and the process-local + DB lease engine.
   - `acquireWorkflowLease(projectId, leaseOwner, { heartbeatTtlSeconds = 30 })`:
     - Checks if an active attempt exists with a heartbeat fresher than `heartbeatTtlSeconds`.
     - If active and fresh: returns `{ acquired: false, attempt: activeAttempt }`.
     - If none or stale: closes any stale attempt as `stale_terminated`, inserts new attempt row with `status = 'running'`, sets active in-memory lease, and returns `{ acquired: true, attempt: newAttempt }`.
   - `updateAttemptHeartbeat(attemptId)`: updates `heartbeat_at = CURRENT_TIMESTAMP`.
   - `releaseWorkflowLease(attemptId, terminalStatus, { error = null } = {})`:
     - Updates attempt with `status = terminalStatus`, `ended_at = CURRENT_TIMESTAMP`, `error = error`.
     - Removes in-memory lease.
   - `reconcileStaleWorkflowAttempts({ staleThresholdSeconds = 30 } = {})`:
     - Runs on server bootstrap.
     - Selects running attempts whose heartbeat is older than threshold or left from a terminated process.
     - Marks attempts as `stale_terminated`.
     - Transitions associated `running` projects to `paused`.
     - Inserts safe recovery notification in `chat_history` and structured log.

2. **`backend/routes/projectRoutes.js`:**
   - In `/approve` and `/resume`, calls `acquireWorkflowLease(id, processLeaseOwner)`.
   - If `acquired === false`, returns `200 OK` with existing project state and running attempt ID (idempotency).
   - If `acquired === true`, transitions project status to `running`, starts background `executeProjectTasks(id, wsHub, attempt.id)`.

3. **`backend/engine/workflow.js`:**
   - Accepts `attemptId` in `executeProjectTasks(projectId, wsHub, attemptId)`.
   - Starts periodic heartbeat timer (every 5 seconds).
   - Updates heartbeat between major orchestration waves (Manager, Directors, Teamleaders, Coders, Quality Gate, Tester).
   - On clean finish, marks attempt `completed` and releases lease.
   - On error or veto, marks attempt `failed` with redacted error message and releases lease.
   - Guaranteed cleanup in `finally` block cancels heartbeat timer and releases lease if still open.

## Error Handling & Edge Cases

- **Double-Click / Parallel Requests:** Second request finds active lease, skips spawning duplicate worker, returns current state (200 OK).
- **Server Crash / Process SIGKILL:** On next server startup, `reconcileStaleWorkflowAttempts` detects expired heartbeat, marks attempt `stale_terminated`, resets project status to `paused`, and posts chat explanation.
- **Workflow Error during Execution:** Caught in `executeProjectTasks`, attempt marked `failed` with redacted error string, project marked `paused` or `failed`, lease released.
- **Project Deletion:** `FOREIGN KEY ... ON DELETE CASCADE` automatically purges attempt records when project is deleted.

## Verification Strategy

1. **Unit Tests (`backend/tests/test_workflow_attempts.js`):**
   - Attempt creation, heartbeat update, and terminal state release.
   - Active lease acquisition blocks concurrent second lease for same project.
   - Stale attempt recovery safely resets status to `stale_terminated` and project to `paused`.
   - Cascade deletion cleans attempt rows when parent project is deleted.
2. **Integration Tests (`backend/tests/test_http_integration.js`):**
   - Sequential and concurrent `/approve` and `/resume` calls result in exactly one execution attempt.
   - Simulated crash recovery leaves project in `paused` state ready for resumption.
3. **Master Runner & Frontend:**
   - Full 15-suite backend run exits 0.
   - Production Vite build exits 0.
