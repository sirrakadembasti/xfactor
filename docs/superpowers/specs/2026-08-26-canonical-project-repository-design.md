# Canonical Project Repository and Path Service Design

## Goal

Introduce a single, authoritative project repository and path service (`backend/projectRepository.js`) to eliminate divergent path calculations, guarantee directory containment, enforce UUID project identity, and perform transactional project creation, state updates, and deletion across SQLite and the filesystem.

## Scope

Included:

- Canonical path resolution (`getProjectsRoot`, `getProjectDir`, `resolveSafeProjectPath`) supporting `process.env.PROJECTS_ROOT` and defaulting to `<workspace>/projects`.
- Strict path containment checks preventing path traversal, null bytes, parent escapes (`..`), and root directory accidental deletion.
- UUIDv4 project ID generation (`project-<uuid>`) with full backward compatibility for existing timestamp IDs (`project-178...`).
- Transactional project creation (`createProjectTransaction`) atomically inserting `projects`, `project_owners`, and initializing disk storage.
- Atomic state persistence (`saveProjectStateTransaction`) committing project state, plan, workflow metadata, and chat events in a single SQLite transaction.
- Safe transactional deletion (`deleteProjectTransaction`) removing all related SQLite tables (`projects`, `project_owners`, `chat_history`, `project_logs`) and purging the validated project disk directory.
- Migration of `backend/db.js`, `backend/engine/workflow.js`, `backend/engine/codeGenerator.js`, and `backend/routes/projectRoutes.js` to consume the canonical repository service.
- Comprehensive unit and integration verification covering path containment, transactional rollbacks, custom `PROJECTS_ROOT` overrides, and legacy project preservation.

Excluded:

- Workflow execution leases and attempt management (`workflow_attempts` table) — covered in Sub-Project 2.2.
- Cooperative cancellation, pause drain, and LLM deadlines — covered in Sub-Project 2.3.
- Subprocess sandbox isolation — covered in Phase 3.

## Architecture

### Module Structure

```text
backend/
├── db.js                 # Low-level SQLite WAL connection, migrations, basic table schema
├── projectRepository.js  # CANONICAL SERVICE: Paths, Containment, CRUD, State, Disk Sync
├── engine/
│   ├── workflow.js       # Imports paths and state from projectRepository
│   ├── codeGenerator.js  # Imports safe file resolution from projectRepository
│   └── ...
└── routes/
    └── projectRoutes.js  # Dispatches route actions through projectRepository
```

### Path Resolution and Containment Rules

1. **Root Directory (`getProjectsRoot(env)`):**
   - If `env.PROJECTS_ROOT` is defined and non-empty, use `path.resolve(env.PROJECTS_ROOT)`.
   - Default: `path.resolve(__dirname, '../../projects')` (pointing directly to workspace-level `projects/`).
2. **Project Directory (`getProjectDir(projectId, env)`):**
   - Validate `projectId` against `/^[a-zA-Z0-9_-]+$/`.
   - Resolve absolute target: `path.resolve(getProjectsRoot(env), projectId)`.
   - Containment assertion: `path.relative(getProjectsRoot(env), targetDir)` must not start with `..` and must not equal `''`.
3. **Safe Subpath Resolution (`resolveSafeProjectPath(projectId, relativePath, env)`):**
   - Reject paths containing `\0` or parent traversal sequences.
   - Resolve against `getProjectDir(projectId, env)`.
   - Verify resolved path is strictly contained within the project directory.

## Data Model & Identity

### Project IDs

- Format for newly created projects: `project-${crypto.randomUUID()}`.
- Format for existing projects: `project-<timestamp>` (e.g. `project-1786924708852`).
- Both formats satisfy `^[a-zA-Z0-9_-]{3,64}$` validation across REST routes, WebSocket subscriptions, and database foreign keys.

### Transactional Boundaries

#### 1. Creation (`createProject({ title, ownerUserId, env })`)

1. Validate title using `validateProjectTitle`.
2. Generate ID: `project-${crypto.randomUUID()}`.
3. Compute and verify `projectDir`.
4. Begin SQLite transaction:
   - Insert `projects (id, title, status='planning', created_at)`.
   - Insert `project_owners (project_id, user_id, role='owner', created_at)`.
   - Insert initial Manager welcome message in `chat_history`.
5. Create directory `fs.mkdir(projectDir, { recursive: true })`.
6. Write initial `state.json` or protocol scaffolding.
7. Commit SQLite transaction. If disk write fails, roll back DB transaction and clean created directory.

#### 2. State & Chat Persistence (`saveProjectState(state)`)

1. Begin SQLite transaction.
2. Update `projects` table (`title`, `status`, `plan`, `workflow_state`).
3. Append any newly added chat messages from `state.chatHistory` to `chat_history`.
4. Commit SQLite transaction.
5. Emit `dbEvents.emit('stateChange:${state.id}', state.status)`.

#### 3. Deletion (`deleteProject(projectId, { env })`)

1. Validate ID and compute `projectDir` with strict containment check.
2. Assert `projectDir !== getProjectsRoot(env)` to prevent catastrophic root deletion.
3. Begin SQLite transaction:
   - Delete from `chat_history WHERE project_id = ?`.
   - Delete from `project_logs WHERE project_id = ?`.
   - Delete from `project_owners WHERE project_id = ?`.
   - Delete from `projects WHERE id = ?`.
4. Purge directory from disk: `fs.rm(projectDir, { recursive: true, force: true })`.
5. Commit SQLite transaction. If filesystem removal fails, log warning with request ID while preserving database consistency.

#### 4. Disk Synchronization (`syncProjectsWithDisk({ env })`)

1. Scan `getProjectsRoot(env)` with `fs.readdir(..., { withFileTypes: true })`.
2. Reconcile on-disk directories with database rows using `projectRepository` containment logic.
3. Fix orphan projects or missing records within a single transaction.

## Error Handling

- **Invalid ID or Path Traversal:** Returns `400 BAD_REQUEST` with stable code `INVALID_PROJECT_PATH` or `INVALID_PROJECT_ID`.
- **Non-existent Project:** Returns `404 NOT_FOUND` with stable code `PROJECT_NOT_FOUND`.
- **Database/Filesystem System Errors:** Caught by global error handler, logged with redacted context and request ID, returning `500 INTERNAL_ERROR`.

## Verification Strategy

### Unit Tests (`backend/tests/test_project_repository.js`)

1. `getProjectsRoot` respects `process.env.PROJECTS_ROOT` and defaults to workspace `projects/`.
2. `getProjectDir` rejects traversal attempts (`../../etc`, `..`, `/absolute/path`, null bytes).
3. `resolveSafeProjectPath` permits safe project subpaths and rejects parent escapes.
4. `createProject` generates `project-<uuid>` and transactionally stores both project and owner.
5. `deleteProject` transactionally cleans DB rows and removes project files safely.
6. `syncProjectsWithDisk` uses canonical root and reconciles disk state without drift.

### Integration Tests

1. `node tests/test_http_integration.js`: Prove real HTTP project lifecycle (create, list, chat, delete) against temporary `PROJECTS_ROOT`.
2. `node tests/test_websocket_integration.js`: Prove WebSocket subscription against repository-backed project state.
3. `npm test`: Full 14-suite backend test suite passes with exit code 0.
4. `npm run build`: Frontend production compilation passes without errors.
