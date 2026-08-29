# P0-A: State and Contract Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale Next plan generation, false completed attempts, direct completed writes, and rejected checkpoint reuse through versioned contract revisions, strict CAS updates, capability blocking, separated state machines, durable repair records, and immediate coarse invalidation.

**Architecture:** Introduce `project_contracts`, `repair_issues`, and `task_checkpoints` SQLite tables. Separate the project state machine from workflow attempt lifecycle. Guard the `completed` project state, validate framework stack capabilities prior to execution, and invalidate checkpoints when new contract versions are approved.

**Tech Stack:** Node.js ESM, Express, SQLite `node:sqlite`, existing database and repository layers.

## Global Constraints

- Do not repair `projects/project-f2226560-c4b5-4147-a7b5-aeb9f7df95fb`.
- Implement only one delivery unit at a time.
- Use TDD for every observable contract change.
- No direct project `completed` write outside the state projector.
- No mandatory verification gate may treat `SKIPPED`, `BLOCKED`, missing runner, or missing evidence as PASS.
- LLM output is advisory; only machine evidence can satisfy quality policy.
- Generated code never runs with host application authority.
- Every task ends with task-specific verification, independent review, evidence update, continuity validation, and commit.
- Unexpected workspace changes belong to the user; preserve them.

---

### Task 1: Database Schema Migration (Version 7)

**Files:**
- Modify: `backend/db.js`
- Create: `backend/tests/isolatedDb.js`
- Create: `backend/tests/test_p0_a_migrations.js`

**Interfaces:**
- Consumes: None.
- Produces: `setupIsolatedTestDb(testName)` returning `{ dbPath, registerDatabase(db), cleanup() }`; cleanup closes the registered DB and removes the temporary directory with Windows-safe retries.
- Produces: SQLite tables `project_contracts`, `requirements`, `contract_elements`, `contract_tasks`, `requirement_task_links`, `requirement_element_links`, `repair_issues`, `task_checkpoints` and backfilled plan contracts.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/isolatedDb.js`, then create `backend/tests/test_p0_a_migrations.js`. Every DB test must set `DB_PATH` before the first dynamic import of `backend/db.js`:
```js
import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-a-migrations');
process.env.DB_PATH = isolated.dbPath;
const { getSchemaVersion, db } = await import('../db.js');
isolated.registerDatabase(db);
const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Schema migration 7 should create contracts, checkpoints, repair issues, and backfill existing plans', async () => {
    const version = getSchemaVersion();
    assert.strictEqual(version, 7, `Schema version should be 7, got: ${version}`);

    // Verify tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const requiredTables = [
        'project_contracts', 'requirements', 'contract_elements', 
        'contract_tasks', 'requirement_task_links', 'requirement_element_links', 
        'repair_issues', 'task_checkpoints'
    ];
    for (const tbl of requiredTables) {
        assert.ok(tables.includes(tbl), `Table ${tbl} should exist in database`);
    }

    // Verify composite unique key on project_contracts
    const pcIndexes = db.prepare('PRAGMA index_list(project_contracts)').all();
    assert.ok(pcIndexes.some(idx => idx.unique === 1), 'Unique index must exist on project_contracts');

    // Composite ownership: project B cannot attach repair/checkpoint state to project A's contract.
    db.prepare("INSERT INTO projects (id, title, status) VALUES ('owner-a', 'A', 'planning'), ('owner-b', 'B', 'planning')").run();
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES ('contract-a', 'owner-a', 1, 'draft', '{}', 'hash-a')
    `).run();
    assert.throws(() => db.prepare(`
        INSERT INTO repair_issues (
            id, project_id, contract_id, fingerprint, severity, status
        ) VALUES ('issue-cross-owner', 'owner-b', 'contract-a', 'fp', 'critical', 'open')
    `).run(), /FOREIGN KEY/);
    db.prepare("DELETE FROM projects WHERE id IN ('owner-a', 'owner-b')").run();
});

finish();
await isolated.cleanup();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_p0_a_migrations.js`
Expected: FAIL with "Schema version should be 7, got: 6" or missing tables.

- [ ] **Step 3: Write minimal implementation**

Modify `backend/db.js` to add version 7 in `MIGRATIONS`:
Modify `backend/db.js` to add version 7 in `MIGRATIONS`.
Ensure `import crypto from 'crypto';` is added at the top of `backend/db.js` (around line 15) to make all migration and backfill operations fully ESM-compliant.

```js
    {
        version: 7,
        name: '007_state_contract_safety',
        up: (database) => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS project_contracts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    contract_json TEXT NOT NULL,
                    contract_hash TEXT NOT NULL,
                    source_message_id INTEGER,
                    supersedes_revision INTEGER,
                    approved_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, revision),
                    UNIQUE(project_id, id),
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS requirements (
                    id TEXT PRIMARY KEY,
                    contract_id TEXT NOT NULL,
                    stable_key TEXT NOT NULL,
                    statement TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    priority TEXT NOT NULL,
                    mandatory INTEGER DEFAULT 1,
                    source_message_id INTEGER,
                    status TEXT NOT NULL,
                    supersedes_requirement_id TEXT,
                    UNIQUE(contract_id, stable_key),
                    UNIQUE(contract_id, id),
                    FOREIGN KEY(contract_id) REFERENCES project_contracts(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS contract_elements (
                    id TEXT PRIMARY KEY,
                    contract_id TEXT NOT NULL,
                    element_type TEXT NOT NULL,
                    stable_key TEXT NOT NULL,
                    spec_json TEXT NOT NULL,
                    UNIQUE(contract_id, stable_key),
                    UNIQUE(contract_id, id),
                    FOREIGN KEY(contract_id) REFERENCES project_contracts(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS contract_tasks (
                    id TEXT PRIMARY KEY,
                    contract_id TEXT NOT NULL,
                    stable_key TEXT NOT NULL,
                    task_spec_json TEXT NOT NULL,
                    UNIQUE(contract_id, stable_key),
                    UNIQUE(contract_id, id),
                    FOREIGN KEY(contract_id) REFERENCES project_contracts(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS requirement_task_links (
                    contract_id TEXT NOT NULL,
                    requirement_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    PRIMARY KEY (contract_id, requirement_id, task_id),
                    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, task_id) REFERENCES contract_tasks (contract_id, id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS requirement_element_links (
                    contract_id TEXT NOT NULL,
                    requirement_id TEXT NOT NULL,
                    element_id TEXT NOT NULL,
                    PRIMARY KEY (contract_id, requirement_id, element_id),
                    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, element_id) REFERENCES contract_elements (contract_id, id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS repair_issues (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    contract_id TEXT NOT NULL,
                    run_id TEXT,
                    requirement_id TEXT,
                    fingerprint TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    resolved_at DATETIME,
                    FOREIGN KEY(project_id, contract_id)
                      REFERENCES project_contracts(project_id, id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS task_checkpoints (
                    project_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    contract_id TEXT NOT NULL,
                    plan_hash TEXT NOT NULL,
                    task_spec_hash TEXT NOT NULL,
                    input_hash TEXT NOT NULL,
                    output_hash TEXT NOT NULL,
                    gate_version TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('completed', 'invalidated')),
                    requirement_ids TEXT NOT NULL DEFAULT '[]',
                    invalidation_reason TEXT,
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    invalidated_at DATETIME,
                    PRIMARY KEY(
                        project_id, task_id, contract_id,
                        plan_hash, task_spec_hash, input_hash,
                        output_hash, gate_version
                    ),
                    FOREIGN KEY(project_id, contract_id)
                      REFERENCES project_contracts(project_id, id) ON DELETE CASCADE
                );
            `);

            // Add indexes for optimization
            database.exec('CREATE INDEX IF NOT EXISTS idx_project_contracts_project ON project_contracts(project_id, status)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_repair_issues_project ON repair_issues(project_id, status)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_task_checkpoints_project ON task_checkpoints(project_id, invalidated_at)');

            // Backfill existing plans atomically; one invalid row rolls back the migration.
            const projects = database.prepare("SELECT id, plan, status, created_at FROM projects WHERE plan IS NOT NULL").all();
            for (const project of projects) {
                // Check if a contract for this project already exists to preserve main's partial patches
                const contractExists = database.prepare("SELECT 1 FROM project_contracts WHERE project_id = ?").get(project.id);
                if (contractExists) continue;

                const parsedPlan = JSON.parse(project.plan);
                const canonicalPlan = JSON.stringify(parsedPlan);
                const hash = crypto.createHash('sha256').update(canonicalPlan).digest('hex');
                const contractId = `contract-${crypto.randomUUID()}`;
                const approvedStatuses = new Set(['pending_approval', 'running', 'paused', 'completed']);
                const contractStatus = approvedStatuses.has(project.status) ? 'approved' : 'draft';
                const approvedAt = contractStatus === 'approved' ? project.created_at : null;
                database.prepare(`
                    INSERT INTO project_contracts (
                        id, project_id, revision, status, contract_json,
                        contract_hash, approved_at, created_at
                    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
                `).run(contractId, project.id, contractStatus, canonicalPlan, hash, approvedAt, project.created_at);
            }
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_p0_a_migrations.js`
Expected: PASS

- [ ] **Step 5: Record evidence and validate continuity**

Update `implementation-evidence/P0-A.md` to note Task 1 migration success.
Run: `node scripts/validate-continuity.mjs`
Expected: PASS (reconciles ledger/planning files).

- [ ] **Step 6: Commit**

```bash
git add backend/db.js backend/tests/isolatedDb.js backend/tests/test_p0_a_migrations.js
git commit -m "migration: add state contract safety schema with isolated DB fixture"
```
---

### Task 2: Separated State Machine, CAS Projector, and Status Transitions

**Files:**
- Create: `backend/engine/stateMachine.js`
- Modify: `backend/projectRepository.js`, `backend/auth.js`
- Create: `backend/tests/test_p0_a_state_transitions.js`

**Interfaces:**
- Consumes: None
- Produces: `PROJECT_STATUS` enum, `WORKFLOW_STATUS` enum, `canTransitionProject` transition checks, and CAS-protected `saveProjectState`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_p0_a_state_transitions.js`:
```js
import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('2. Project state machine should block invalid status changes, guard completed writes, and perform CAS check', async () => {
    const { createProject, getProject, saveProjectState, deleteProject } = await import('../projectRepository.js');
    const { PROJECT_STATUS, canTransitionProject } = await import('../engine/stateMachine.js');

    // Verify staged product lifecycle: no planning/pending/running shortcut to completed
    assert.ok(canTransitionProject(PROJECT_STATUS.PLANNING, PROJECT_STATUS.PENDING_APPROVAL));
    assert.strictEqual(canTransitionProject(PROJECT_STATUS.PLANNING, PROJECT_STATUS.COMPLETED), false);
    assert.strictEqual(canTransitionProject(PROJECT_STATUS.PENDING_APPROVAL, PROJECT_STATUS.COMPLETED), false);
    assert.strictEqual(canTransitionProject(PROJECT_STATUS.COMPLETED, PROJECT_STATUS.IMPLEMENTING), false);
    // P0-A deliberately has no public completed edge. P0-B later adds the
    // evidence-backed completion projector after verification tables exist.
    assert.strictEqual(canTransitionProject(PROJECT_STATUS.ARTIFACT_VERIFIED, PROJECT_STATUS.COMPLETED), false);

    const project = await createProject({ title: 'CAS State Machine Test' });
    const initialRev = project.revision || 1;


    // 1. CAS Check: Update with correct revision passes
    project.status = PROJECT_STATUS.PENDING_APPROVAL;
    await saveProjectState(project);
    const updated = getProject(project.id);
    assert.strictEqual(updated.status, PROJECT_STATUS.PENDING_APPROVAL);
    assert.strictEqual(updated.revision, initialRev + 1);
    // Illegal non-completed transition is rejected even with a fresh revision.
    const illegalState = { ...updated, status: PROJECT_STATUS.VERIFICATION_RUNNING };
    await assert.rejects(
        saveProjectState(illegalState),
        /Illegal project transition: pending_approval -> verification_running/
    );

    // 2. CAS Check: Concurrent/stale revision update fails
    const staleState = { ...updated, revision: initialRev };
    staleState.status = PROJECT_STATUS.CONTRACT_APPROVED;
    await assert.rejects(saveProjectState(staleState), /CAS Revision conflict/);

    // 3. Direct completed write cannot bypass staged verification/artifact evidence
    const badCompletedState = { ...updated, status: PROJECT_STATUS.COMPLETED };
    await assert.rejects(
        saveProjectState(badCompletedState),
        /Cannot transition project to completed: required verified lifecycle evidence is missing/
    );

    await deleteProject(project.id);
});

finish();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_p0_a_state_transitions.js`
Expected: FAIL with import errors or failing assertions (no CAS check yet).

- [ ] **Step 3: Write minimal implementation**

```js
export const PROJECT_STATUS = {
    PLANNING: 'planning',
    PENDING_APPROVAL: 'pending_approval',
    CONTRACT_APPROVED: 'contract_approved',
    IMPLEMENTING: 'implementing',
    IMPLEMENTATION_FINISHED: 'implementation_finished',
    VERIFICATION_PENDING: 'verification_pending',
    VERIFICATION_RUNNING: 'verification_running',
    VERIFICATION_FAILED: 'verification_failed',
    PAUSED: 'paused',
    BUILD_VERIFIED: 'build_verified',
    RUNTIME_VERIFIED: 'runtime_verified',
    ACCEPTANCE_VERIFIED: 'acceptance_verified',
    ARTIFACT_VERIFIED: 'artifact_verified',
    COMPLETED: 'completed',
    CAPABILITY_BLOCKED: 'capability_blocked'
};

export const WORKFLOW_STATUS = {
    RUNNING: 'running',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    FAILED: 'failed',
    ABORTED: 'aborted',
    STALE_TERMINATED: 'stale_terminated'
};

export function canTransitionProject(fromStatus, toStatus) {
    if (fromStatus === toStatus) return true; // CAS-protected metadata/chat update
    const allowed = {
        [PROJECT_STATUS.PLANNING]: [PROJECT_STATUS.PENDING_APPROVAL, PROJECT_STATUS.CAPABILITY_BLOCKED],
        [PROJECT_STATUS.PENDING_APPROVAL]: [PROJECT_STATUS.CONTRACT_APPROVED, PROJECT_STATUS.CAPABILITY_BLOCKED, PROJECT_STATUS.PLANNING],
        [PROJECT_STATUS.CONTRACT_APPROVED]: [PROJECT_STATUS.IMPLEMENTING, PROJECT_STATUS.PLANNING],
        [PROJECT_STATUS.IMPLEMENTING]: [PROJECT_STATUS.IMPLEMENTATION_FINISHED, PROJECT_STATUS.PAUSED, PROJECT_STATUS.PLANNING],
        [PROJECT_STATUS.IMPLEMENTATION_FINISHED]: [PROJECT_STATUS.VERIFICATION_PENDING],
        [PROJECT_STATUS.VERIFICATION_PENDING]: [PROJECT_STATUS.VERIFICATION_RUNNING],
        [PROJECT_STATUS.VERIFICATION_RUNNING]: [PROJECT_STATUS.VERIFICATION_FAILED, PROJECT_STATUS.BUILD_VERIFIED],
        [PROJECT_STATUS.VERIFICATION_FAILED]: [PROJECT_STATUS.PAUSED, PROJECT_STATUS.PLANNING],
        [PROJECT_STATUS.BUILD_VERIFIED]: [PROJECT_STATUS.RUNTIME_VERIFIED, PROJECT_STATUS.PAUSED],
        [PROJECT_STATUS.RUNTIME_VERIFIED]: [PROJECT_STATUS.ACCEPTANCE_VERIFIED, PROJECT_STATUS.PAUSED],
        [PROJECT_STATUS.ACCEPTANCE_VERIFIED]: [PROJECT_STATUS.ARTIFACT_VERIFIED],
        // P0-A intentionally keeps artifact_verified terminal. P0-B adds the
        // private evidence-backed completion projector after Migration 8.
        [PROJECT_STATUS.ARTIFACT_VERIFIED]: [],
        [PROJECT_STATUS.PAUSED]: [PROJECT_STATUS.IMPLEMENTING, PROJECT_STATUS.VERIFICATION_PENDING, PROJECT_STATUS.PLANNING],
        [PROJECT_STATUS.CAPABILITY_BLOCKED]: [PROJECT_STATUS.PLANNING, PROJECT_STATUS.PENDING_APPROVAL],
        [PROJECT_STATUS.COMPLETED]: []
    };
    return allowed[fromStatus]?.includes(toStatus) === true;
}
```

Modify `backend/auth.js` to delegate transition logic:
```js
import { canTransitionProject, PROJECT_STATUS } from './engine/stateMachine.js';

export const PROJECT_LIFECYCLE = Object.values(PROJECT_STATUS);

export function isValidProjectStatus(status) {
    return typeof status === 'string' && PROJECT_LIFECYCLE.includes(status);
}

export function canTransitionProjectStatus(fromStatus, toStatus) {
    return canTransitionProject(fromStatus, toStatus);
}
```

Modify `backend/projectRepository.js` `saveProjectState` to enforce every lifecycle transition and CAS against the persisted row. P0-A has no verification-evidence tables yet; every direct completed write remains forbidden until P1-C’s private projector.
```js
    const expectedRevision = Number(state.revision || 1);
    const nextRevision = expectedRevision + 1;

    db.exec('BEGIN IMMEDIATE;');
    try {
        const persisted = db.prepare(
            'SELECT status, revision FROM projects WHERE id = ?'
        ).get(state.id);
        if (!persisted) throw new Error(`Project ${state.id} does not exist`);
        if (persisted.revision !== expectedRevision) {
            throw new Error(`CAS Revision conflict on project ${state.id}`);
        }
        if (!isValidProjectStatus(state.status)) {
            throw new Error(`Unknown project status: ${state.status}`);
        }
        if (state.status === PROJECT_STATUS.COMPLETED) {
            throw new Error('Cannot transition project to completed: required verified lifecycle evidence is missing');
        }
        if (!canTransitionProject(persisted.status, state.status)) {
            throw new Error(`Illegal project transition: ${persisted.status} -> ${state.status}`);
        }

        const result = db.prepare(`
            UPDATE projects
            SET title = ?, status = ?, plan = ?, workflow_state = ?, revision = ?
            WHERE id = ? AND revision = ? AND status = ?
        `).run(
            state.title,
            state.status,
            planStr,
            workflowStr,
            nextRevision,
            state.id,
            expectedRevision,
            persisted.status
        );
        if (result.changes !== 1) {
            throw new Error(`CAS Revision conflict on project ${state.id}`);
        }
        state.revision = nextRevision;

        const existingCount = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?').get(state.id).count;
        const chatsToSave = state.chatHistory || [];
        for (let i = existingCount; i < chatsToSave.length; i++) {
            const chat = chatsToSave[i];
            const text = chat?.parts?.[0]?.text || '';
            const createdAt = chat.created_at || new Date().toISOString();
            insertChat.run(state.id, chat.role, text, createdAt);
        }
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_p0_a_state_transitions.js`
Expected: PASS

- [ ] **Step 5: Record evidence and validate continuity**

Update `implementation-evidence/P0-A.md` with Task 2 CAS projector state success.
Run: `node scripts/validate-continuity.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/engine/stateMachine.js backend/projectRepository.js backend/auth.js backend/tests/test_p0_a_state_transitions.js
git commit -m "feat: separate state machine and enforce database-level CAS update checks"
```
### Task 3: Versioned Contract Revision Persistence & Approval Flow

**Files:**
- Create: `backend/contracts/projectContract.js`
- Modify: `backend/routes/projectRoutes.js`
- Create: `backend/tests/test_p0_a_contract_flow.js`

**Interfaces:**
- Consumes: Database schema from Task 1, CAS state save from Task 2.
- Produces: `createContractRevision(projectId, plan, sourceMessageId)`, `approveContractRevision(projectId, revision)` helper methods.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_p0_a_contract_flow.js`:
```js
import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('3. Plan ready should save pending revision and approval should activate approved contract status', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { createContractRevision, getLatestRevision } = await import('../contracts/projectContract.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Contract Revision Flow Test' });

    // 1. Create plan draft
    const samplePlan = {
        summary: 'Unit test contract',
        frontend: { framework: 'react', frameworkVersion: '18' },
        backend: { framework: 'express' },
        database: { engine: 'sqlite' }
    };
    const revision = await createContractRevision(project.id, samplePlan, 100);
    assert.strictEqual(revision, 1);

    const draft = getLatestRevision(project.id);
    assert.strictEqual(draft.status, 'pending_approval');
    assert.strictEqual(draft.source_message_id, 100);

    // 2. Try approving revision
    const { approveContractRevision } = await import('../contracts/projectContract.js');
    await approveContractRevision(project.id, 1);

    const approved = getLatestRevision(project.id);
    assert.strictEqual(approved.status, 'approved');
    assert.ok(approved.approved_at !== null);

    await deleteProject(project.id);
});

finish();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_p0_a_contract_flow.js`
Expected: FAIL with module import errors.

- [ ] **Step 3: Write minimal implementation**

Create `backend/contracts/projectContract.js`:
```js
import crypto from 'crypto';
import { db } from '../db.js';

export function createContractRevision(projectId, plan, sourceMessageId) {
    const planJson = typeof plan === 'string' ? plan : JSON.stringify(plan);
    const hash = crypto.createHash('sha256').update(planJson).digest('hex');

    db.exec('BEGIN IMMEDIATE;');
    try {
        // Mark any previous pending revisions as superseded
        db.prepare(`
            UPDATE project_contracts
            SET status = 'superseded'
            WHERE project_id = ? AND status = 'pending_approval'
        `).run(projectId);

        const latest = db.prepare('SELECT MAX(revision) as rev FROM project_contracts WHERE project_id = ?').get(projectId);
        const nextRev = (latest?.rev || 0) + 1;
        const id = `contract-${crypto.randomUUID()}`;

        db.prepare(`
            INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, source_message_id, supersedes_revision)
            VALUES (?, ?, ?, 'pending_approval', ?, ?, ?, ?)
        `).run(id, projectId, nextRev, planJson, hash, sourceMessageId, latest?.rev || null);

        db.exec('COMMIT;');
        return nextRev;
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }
}

export function approveContractRevision(projectId, revision) {
    db.exec('BEGIN IMMEDIATE;');
    try {
        // Mark any previous approved revision as superseded
        db.prepare(`
            UPDATE project_contracts
            SET status = 'superseded'
            WHERE project_id = ? AND status = 'approved'
        `).run(projectId);

        const result = db.prepare(`
            UPDATE project_contracts
            SET status = 'approved', approved_at = ?
            WHERE project_id = ? AND revision = ? AND status = 'pending_approval'
        `).run(new Date().toISOString(), projectId, revision);

        if (result.changes === 0) {
            throw new Error(`Revision ${revision} is not pending approval or does not exist.`);
        }
        db.exec('COMMIT;');
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }
}

export function getLatestRevision(projectId) {
    return db.prepare(`
        SELECT * FROM project_contracts
        WHERE project_id = ?
        ORDER BY revision DESC LIMIT 1
    `).get(projectId);
}
```

Modify `backend/routes/projectRoutes.js` `/approve` and `/chat` to use versioned contracts:
```js
// Inside router.post('/:id/chat') around plan ready check:
            const revisableStatuses = new Set([
                PROJECT_STATUS.PLANNING,
                PROJECT_STATUS.PENDING_APPROVAL,
                PROJECT_STATUS.PAUSED,
                PROJECT_STATUS.VERIFICATION_FAILED,
                PROJECT_STATUS.CAPABILITY_BLOCKED
            ]);
            if (isPlanReady && revisableStatuses.has(freshState.status)) {
                const sourceMsgId = modelMsg.id;
                const draftPlan = parsedPlan || normalizeManagerPlanFromText(freshState.title, responseText);
                const { createContractRevision } = await import('../contracts/projectContract.js');
                createContractRevision(id, draftPlan, sourceMsgId);

                // A second revision while pending approval supersedes the prior
                // contract without losing the pending_approval product state.
                freshState.status = PROJECT_STATUS.PENDING_APPROVAL;
                await writeProjectState(id, freshState);
            }

// Inside router.post('/:id/approve') route:
    router.post('/:id/approve', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const state = await readProjectState(id);
            if (!state || !canTransitionProjectStatus(state.status, PROJECT_STATUS.CONTRACT_APPROVED)) {
                return res.status(400).json({ error: "Geçersiz işlem" });
            }

            const { getLatestRevision, approveContractRevision } = await import('../contracts/projectContract.js');
            const latestRev = getLatestRevision(id);
            if (!latestRev || latestRev.status !== 'pending_approval') {
                return res.status(400).json({ error: "Onaylanacak bekleyen bir plan bulunamadı." });
            }

            approveContractRevision(id, latestRev.revision);
            state.status = PROJECT_STATUS.CONTRACT_APPROVED;
            await writeProjectState(id, state);

            const lease = acquireWorkflowLease(id, `http-approve-${req.user.id}`);
            if (!lease.acquired) {
                return res.json({ ...state, attemptId: lease.attempt.id, idempotent: true });
            }

            const approvedState = await readProjectState(id);
            if (!canTransitionProjectStatus(approvedState.status, PROJECT_STATUS.IMPLEMENTING)) {
                releaseWorkflowLease(lease.attempt.id, 'failed', { error: 'Invalid implementing transition' });
                return res.status(409).json({ error: 'Proje uygulama durumuna geçirilemedi.' });
            }
            approvedState.status = PROJECT_STATUS.IMPLEMENTING;
            approvedState.workflow = normalizeWorkflowState(null);
            await writeProjectState(id, approvedState);
            
            executeProjectTasks(id, wsHub, lease.attempt.id).catch(error => {
                logError('workflow.background_execution_failed', error, { projectId: id, attemptId: lease.attempt.id });
            });
            res.json({ ...state, attemptId: lease.attempt.id });
        } catch (err) {
            next(err);
        }
    });
```

- [ ] **Step 5: Record evidence and validate continuity**

Update `implementation-evidence/P0-A.md` with Task 3 contract revision flow success.
Run: `node scripts/validate-continuity.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/contracts/projectContract.js backend/routes/projectRoutes.js backend/tests/test_p0_a_contract_flow.js
git commit -m "feat: persist draft and approved versioned contracts in DB during chat and approval"
```

### Task 4: Stack Capability Verification & `capability_blocked` State

**Files:**
- Modify: `backend/contracts/projectContract.js`, `backend/routes/projectRoutes.js`
- Create: `backend/tests/test_p0_a_capability_check.js`

**Interfaces:**
- Consumes: `projectContract.js`
- Produces: `validateContractCapabilities(contractJson)` capability check, returning `{ valid: boolean, errors: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_p0_a_capability_check.js`:
```js
import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('4. Contract validation should reject unsupported frameworks and transition to capability_blocked', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { createContractRevision, validateContractCapabilities, getLatestRevision, rejectContractForCapabilities } = await import('../contracts/projectContract.js');
    const { PROJECT_STATUS } = await import('../engine/stateMachine.js');

    const project = await createProject({ title: 'Capability Block Test' });

    // 1. Supported stack passes capability validation
    const validPlan = {
        frontend: { framework: 'react' },
        backend: { framework: 'express' },
        database: { engine: 'sqlite' }
    };
    const validCheck = validateContractCapabilities(validPlan);
    assert.strictEqual(validCheck.valid, true);

    // 2. Unsupported stack fails capability validation
    const invalidPlan = {
        frontend: { framework: 'nuxt' }, // Nuxt is unsupported
        backend: { framework: 'express' },
        database: { engine: 'sqlite' }
    };
    const invalidCheck = validateContractCapabilities(invalidPlan);
    assert.strictEqual(invalidCheck.valid, false);
    assert.ok(invalidCheck.errors.some(e => e.includes('nuxt')));

    // 3. Unsupported contract is rejected and project enters canonical capability_blocked state.
    const revision = createContractRevision(project.id, invalidPlan, 200);
    const blockedProj = rejectContractForCapabilities({
        projectId: project.id,
        revision,
        expectedProjectRevision: project.revision,
        errors: invalidCheck.errors
    });
    assert.strictEqual(blockedProj.status, PROJECT_STATUS.CAPABILITY_BLOCKED);

    const latest = getLatestRevision(project.id);
    assert.strictEqual(latest.status, 'rejected');

    await deleteProject(project.id);
});

finish();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_p0_a_capability_check.js`
Expected: FAIL with capability check validation undefined or wrong results.

- [ ] **Step 3: Write minimal implementation**

Modify `backend/contracts/projectContract.js` to add stack validation:
```js
// P0-A owns the single capability registry. P1-A may only EXTEND it after
// implementing a matching generator adapter; it may never bypass or duplicate it.
export const SUPPORTED_STACKS = {
    frontends: ['react', 'vite'], // nuxt/vue intentionally unsupported until a Nuxt adapter exists
    backends: ['express', 'node'],
    databases: ['sqlite']
};

export function validateContractCapabilities(contractJson) {
    const contract = typeof contractJson === 'string' ? JSON.parse(contractJson) : contractJson;
    const frontendFramework = contract.frontend?.framework?.toLowerCase();
    const backendFramework = contract.backend?.framework?.toLowerCase();
    const dbEngine = contract.database?.engine?.toLowerCase();

    const errors = [];
    if (frontendFramework && !SUPPORTED_STACKS.frontends.includes(frontendFramework)) {
        errors.push(`Frontend framework "${frontendFramework}" is not supported.`);
    }
    if (backendFramework && !SUPPORTED_STACKS.backends.includes(backendFramework)) {
        errors.push(`Backend framework "${backendFramework}" is not supported.`);
    }
    if (dbEngine && !SUPPORTED_STACKS.databases.includes(dbEngine)) {
        errors.push(`Database engine "${dbEngine}" is not supported.`);
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
```

Modify `/approve` route to call one repository transaction; routes must not nest `writeProjectState` inside a raw SQLite transaction:
```js
            const {
                getLatestRevision,
                validateContractCapabilities,
                rejectContractForCapabilities
            } = await import('../contracts/projectContract.js');
            const latestRev = getLatestRevision(id);
            if (!latestRev || latestRev.status !== 'pending_approval') {
                return res.status(400).json({ error: "Onaylanacak bekleyen bir plan bulunamadı." });
            }

            const capCheck = validateContractCapabilities(latestRev.contract_json);
            if (!capCheck.valid) {
                const blocked = rejectContractForCapabilities({
                    projectId: id,
                    revision: latestRev.revision,
                    expectedProjectRevision: state.revision,
                    errors: capCheck.errors
                });
                return res.status(400).json({
                    error: 'Unsupported architecture stack',
                    status: blocked.status,
                    details: capCheck.errors
                });
            }
```

`rejectContractForCapabilities` owns one `BEGIN IMMEDIATE` transaction: reject the pending contract, CAS-update the same project to `PROJECT_STATUS.CAPABILITY_BLOCKED`, persist the explanatory chat record, and commit. Any failed write rolls back all three changes.

- [ ] **Step 5: Record evidence and validate continuity**

Update `implementation-evidence/P0-A.md` with Task 4 capability verification success.
Run: `node scripts/validate-continuity.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/contracts/projectContract.js backend/routes/projectRoutes.js backend/tests/test_p0_a_capability_check.js
git commit -m "feat: enforce stack capabilities and capability_blocked state"
```
---

### Task 5: Rejection Recording, Durable Repair Issues & Checkpoint Invalidation

**Files:**
- Modify: `backend/engine/workflow.js`, `backend/engine/fileProtocol.js`, `backend/workflowAttempts.js`
- Create: `backend/tests/test_p0_a_rejections.js`

**Interfaces:**
- Consumes: Task checkpoint database schema.
- Produces: Correct terminal status on failure, `repair_issues` registration, and task checkpoint invalidation checks in `isTaskCompleted`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_p0_a_rejections.js`:
```js
import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('5. Workflow failure should transition attempt to failed, log repair issues, and invalidate checkpoints', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { releaseWorkflowLease, acquireWorkflowLease } = await import('../workflowAttempts.js');
    const { db } = await import('../db.js');
    const { isTaskCompleted } = await import('../engine/fileProtocol.js');

    const { createContractRevision, approveContractRevision } = await import('../contracts/projectContract.js');
    const { invalidateProjectCheckpoints } = await import('../contracts/projectContract.js');
    const project = await createProject({ title: 'Failure Integration Test' });
    const lease = acquireWorkflowLease(project.id, 'test-rejection-runner');

    // 1. Rejected verifier decision records a rejected attempt, never completed
    releaseWorkflowLease(lease.attempt.id, 'rejected', { error: 'Verification failed' });

    const updatedAttempt = db.prepare('SELECT status, error FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(updatedAttempt.status, 'rejected');
    assert.strictEqual(updatedAttempt.error, 'Verification failed');

    // 2. Create a real contract revision so repair issue/checkpoint FKs resolve
    const revisionNumber = createContractRevision(project.id, {
        frontend: { framework: 'react' },
        backend: { framework: 'express' },
        database: { engine: 'sqlite' }
    }, 200);
    approveContractRevision(project.id, revisionNumber);
    const contractId = db.prepare(
        'SELECT id FROM project_contracts WHERE project_id = ? AND revision = ?'
    ).get(project.id, revisionNumber).id;

    // 3. Create durable repair issue linked to the real contract
    const issueId = `issue-${Date.now()}`;
    db.prepare(`
        INSERT INTO repair_issues (id, project_id, contract_id, fingerprint, severity, status)
        VALUES (?, ?, ?, 'syntax-error-App.jsx', 'critical', 'open')
    `).run(issueId, project.id, contractId);

    const openCount = db.prepare('SELECT COUNT(*) as count FROM repair_issues WHERE project_id = ? AND status = ?').get(project.id, 'open').count;
    assert.strictEqual(openCount, 1);

    // 4. Create a completed checkpoint, then coarse-invalidate and assert it is no longer reusable
    db.prepare(`
        INSERT INTO task_checkpoints (project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version, status, revision)
        VALUES (?, 'task-1', ?, 'plan1', 'spec1', 'in1', 'out1', 'v1', 'completed', 1)
    `).run(project.id, contractId);

    invalidateProjectCheckpoints(project.id);

    const completed = await isTaskCompleted('fake-coder-dir', null, [], { projectId: project.id, taskId: 'task-1' });
    assert.strictEqual(completed, false, 'Coarse-invalidated checkpoint must not be reusable');


    await deleteProject(project.id);
});

finish();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_p0_a_rejections.js`
Expected: FAIL due to missing logic or unhandled arguments in `isTaskCompleted`.

- [ ] **Step 3: Write minimal implementation**

Modify `backend/engine/workflow.js` to avoid defaulting failed runs to completed in the event of tester/verifier rejections:
```js
// Inside executeProjectTasks(projectId, wsHub, attemptId) around line 640:
            if (!testResult.approved) {
                await writeDurum(projectDir, 'BASARISIZ', `Proje kabul testlerini geçemedi: ${testResult.summary}`);
                await logEvent(wsHub, projectId, "Tester", "error", "", `Proje kabul testlerini geçemedi: ${testResult.summary}`, "tester", "manager");

                // RECORD DURABLE REPAIR ISSUES
                const latestContract = db.prepare("SELECT id FROM project_contracts WHERE project_id = ? AND status = 'approved'").get(projectId);
                if (latestContract) {
                    for (const issue of testResult.issues) {
                        const issueId = `repair-${crypto.randomUUID()}`;
                        const fp = crypto.createHash('md5').update(issue).digest('hex');
                        db.prepare(`
                            INSERT INTO repair_issues (id, project_id, contract_id, run_id, fingerprint, severity, status, detail_json)
                            VALUES (?, ?, ?, ?, ?, 'critical', 'open', ?)
                        `).run(issueId, projectId, latestContract.id, attemptId, fp, JSON.stringify({ issue }));
                    }
                }
                
                terminalStatus = 'rejected'; // Verifier/tester rejection is never a completed attempt
                executionError = `Proje kabul testlerini geçemedi: ${testResult.summary}`;

                const failedState = await readProjectState(projectId);
                if (failedState) {
                    failedState.status = 'verification_failed';
                    const now = new Date();
                    const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const formattedTime = now.toLocaleTimeString('tr-TR', { hour12: false });

                    if (!failedState.chatHistory) failedState.chatHistory = [];
                    failedState.chatHistory.push({
                        role: 'model',
                        parts: [{ text: `⚠️ **Tester Kalite Kapısı Uyarısı:**\n\nProje kabul testlerinde bazı sözdizimi veya kırık ithalat (import) hataları tespit edildi ve proje güvenli modda duraklatıldı:\n\n${testResult.issues.map(i => `- ${i}`).join('\n')}\n\nSüreci düzeltip devam ettirmek için üst menüdeki **'Projeyi Devam Ettir (Resume)'** butonuna basabilir veya bana revizyon bildirebilirsiniz.` }],
                        timestamp: `${formattedDate} ${formattedTime}`,
                        created_at: now.toISOString()
                    });
                    await writeProjectState(projectId, failedState);
                }
                return;
            }
```

Add coarse invalidation helper when approving contract revisions in `backend/contracts/projectContract.js`:
```js
export function invalidateProjectCheckpoints(projectId) {
    db.prepare(`
        UPDATE task_checkpoints
        SET invalidated_at = ?
        WHERE project_id = ? AND invalidated_at IS NULL
    `).run(new Date().toISOString(), projectId);
}
```
And call this within `approveContractRevision(projectId, revision)`:
```js
        const result = db.prepare(`
            UPDATE project_contracts
            SET status = 'approved', approved_at = ?
            WHERE project_id = ? AND revision = ? AND status = 'pending_approval'
        `).run(new Date().toISOString(), projectId, revision);

        if (result.changes === 0) {
            throw new Error(`Revision ${revision} is not pending approval or does not exist.`);
        }
        
        // Coarse invalidation of checkpoints
        invalidateProjectCheckpoints(projectId);
        
        db.exec('COMMIT;');
```

Modify `isTaskCompleted` in `backend/engine/fileProtocol.js` to verify checkpoints status in database:
```js
export async function isTaskCompleted(coderDir, projectDir = null, targetFiles = [], options = {}) {
    try {
        const { projectId, taskId } = options;
        if (projectId && taskId) {
            const checkpoint = db.prepare(`
                SELECT invalidated_at FROM task_checkpoints
                WHERE project_id = ? AND task_id = ?
                ORDER BY created_at DESC LIMIT 1
            `).get(projectId, taskId);

            if (checkpoint && checkpoint.invalidated_at !== null) {
                return false; // Checkpoint has been coarsely invalidated
            }
        }

        const durum = await readDurum(coderDir);
        if (durum && (durum.includes('BASARISIZ') || durum.includes('REDDEDILDI'))) {
            return false;
        }

        const raporExists = await fs.stat(path.join(coderDir, 'RAPOR.md')).then(() => true).catch(() => false);
        const durumCompleted = Boolean(durum && durum.includes('TAMAMLANDI'));

        if (!raporExists && !durumCompleted) {
            return false;
        }

        if (projectDir && Array.isArray(targetFiles) && targetFiles.length > 0) {
            for (const relPath of targetFiles) {
                if (typeof relPath === 'string' && relPath.trim()) {
                    const fullPath = path.join(projectDir, relPath);
                    const fileExists = await fs.stat(fullPath).then(s => s.size > 0).catch(() => false);
                    if (!fileExists) {
                        return false;
                    }
                }
            }
        }

        return true;
    } catch {
        return false;
    }
}
```
Update the checkpoint lookup call within `backend/engine/workflow.jsProcessTask` to supply the options block:
```js
const alreadyCompleted = await isTaskCompleted(coderDir, projectDir, task.targetFiles, { projectId, taskId });
```

- [ ] **Step 5: Record evidence and validate continuity**

Update `implementation-evidence/P0-A.md` with Task 5 rejection handling and invalidation success.
Run: `node scripts/validate-continuity.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/engine/workflow.js backend/engine/fileProtocol.js backend/workflowAttempts.js backend/tests/test_p0_a_rejections.js
git commit -m "feat: track failed workflow attempts, write repair issues, and invalidate checkpoints on contract change"
```
---

### Task 6: Cutover and Compatibility Cleanup

**Files:**
- Modify: `backend/db.js`, `backend/projectRepository.js`
- Create: `backend/tests/test_p0_a_cutover.js`

**Interfaces:**
- Consumes: None
- Produces: Project loading/saving logic decoupled from `projects.plan` database writes.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_p0_a_cutover.js`:
```js
import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('6. Project repository should elide read/write actions on the legacy plan column', async () => {
    const { createProject, getProject, saveProjectState, deleteProject } = await import('../projectRepository.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Cutover Test Proj' });

    // Verify that new saves put null or ignore the plan field in projects table
    project.plan = { summary: 'Legacy bypass check' };
    await saveProjectState(project);

    const row = db.prepare('SELECT plan FROM projects WHERE id = ?').get(project.id);
    assert.strictEqual(row.plan, null, 'Plan column in projects table must be null post-cutover');

    await deleteProject(project.id);
});

finish();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_p0_a_cutover.js`
Expected: FAIL with `plan` column being equal to JSON instead of null.

- [ ] **Step 3: Write minimal implementation**

Modify `getProject` in `backend/projectRepository.js` to elide `plan` from project selection and read it from `project_contracts` instead:
```js
    const project = db.prepare('SELECT id, title, status, is_pinned, workflow_state, revision, created_at FROM projects WHERE id = ?').get(projectId);
    if (!project) return null;

    // Load active approved contract plan if available, otherwise get latest revision
    const contractRow = db.prepare(`
        SELECT contract_json FROM project_contracts
        WHERE project_id = ?
        ORDER BY (CASE WHEN status = 'approved' THEN 1 ELSE 0 END) DESC, revision DESC LIMIT 1
    `).get(projectId);

    let plan = null;
    if (contractRow && contractRow.contract_json) {
        try { plan = JSON.parse(contractRow.contract_json); } catch {}
    }
```

Modify `saveProjectState` in `backend/projectRepository.js` to bypass writing `planStr` into the `projects` table:
```js
    const workflowStr = state.workflow ? JSON.stringify(state.workflow) : null;
    const currentRevision = Number(state.revision || 1);
    const nextRevision = currentRevision + 1;

    // Use NULL for plan field to deprecate column
    const updateProjectStmt = db.prepare(`
        UPDATE projects
        SET title = ?, status = ?, plan = NULL, workflow_state = ?, revision = ?
        WHERE id = ? AND revision = ?
    `);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_p0_a_cutover.js`
Expected: PASS

- [ ] **Step 5: Record evidence and validate continuity**

Update `implementation-evidence/P0-A.md` with Task 6 compatibility cutover success.
Run: `node scripts/validate-continuity.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/projectRepository.js backend/tests/test_p0_a_cutover.js
git commit -m "cleanup: deprecate legacy plan column in projects table and complete cutover"
```
## Unit Exit Gate

- [ ] Run every P0-A task-specific test and the affected backend integration suites.
- [ ] Confirm migration/backfill, pending-approval revision, CAS state transitions, rejection status, repair persistence, and coarse checkpoint invalidation behavior.
- [ ] Obtain independent reviewer approval and independent tester reproduction.
- [ ] Record exact commands, exit codes, commit, and decisions in `implementation-evidence/P0-A.md`; set `status: verified` only after all mandatory evidence passes.
- [ ] Mark P0-A verified in `implementation-plans/00-MASTER-EXECUTION-PLAN.md` and `yol-haitasi-todo.md`; advance `PROJECT-CONTINUITY.md` only after the evidence receipt exists.
- [ ] Run `node scripts/validate-continuity.mjs`.
- [ ] Commit source, tests, evidence, plans, roadmap, and continuity as one logical checkpoint.
