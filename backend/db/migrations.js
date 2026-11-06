/**
 * Database Schema Migrations (DAT-6b)
 * Versioned SQLite migrations for XFactor platform.
 */

export function columnExists(database, tableName, columnName) {
    try {
        const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
        return columns.some((column) => column.name === columnName);
    } catch {
        return false;
    }
}

export const MIGRATIONS = [
    {
        version: 1,
        name: '001_initial_schema',
        up: (database) => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL,
                    plan TEXT,
                    owner_id TEXT,
                    is_pinned INTEGER DEFAULT 0,
                    workflow_state TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS project_owners (
                    project_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'owner',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (project_id, user_id),
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS user_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL,
                    expires_at DATETIME NOT NULL,
                    revoked_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                );
                
                CREATE TABLE IF NOT EXISTS chat_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    text_content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                );
                
                CREATE TABLE IF NOT EXISTS project_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    agent TEXT,
                    action TEXT,
                    file TEXT,
                    message TEXT,
                    node_id TEXT,
                    parent_node_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                );

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
            `);
        }
    },
    {
        version: 2,
        name: '002_schema_indexes_and_extensions',
        up: (database) => {
            if (!columnExists(database, 'projects', 'owner_id')) {
                database.exec('ALTER TABLE projects ADD COLUMN owner_id TEXT');
            }
            if (!columnExists(database, 'projects', 'is_pinned')) {
                database.exec('ALTER TABLE projects ADD COLUMN is_pinned INTEGER DEFAULT 0');
            }
            if (!columnExists(database, 'projects', 'workflow_state')) {
                database.exec('ALTER TABLE projects ADD COLUMN workflow_state TEXT');
            }
            if (!columnExists(database, 'users', 'is_admin')) {
                database.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
            }
            database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_attempts_project ON workflow_attempts(project_id, status)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_attempts_heartbeat ON workflow_attempts(status, heartbeat_at)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_project_owners_user_id ON project_owners(user_id)');
        }
    },
    {
        version: 3,
        name: '003_workflow_attempts_running_unique_index',
        up: (database) => {
            // Önce varsa geçmiş testlerden kalma duplicate running attempt'leri stale_terminated yap
            database.exec(`
                UPDATE workflow_attempts
                SET status = 'stale_terminated', ended_at = CURRENT_TIMESTAMP
                WHERE status = 'running' AND id NOT IN (
                    SELECT id FROM workflow_attempts WHERE status = 'running' GROUP BY project_id HAVING MAX(started_at)
                );
            `);
            database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_attempts_running_unique ON workflow_attempts(project_id) WHERE status = \'running\'');
        }
    },
    {
        version: 4,
        name: '004_project_state_revision',
        up: (database) => {
            if (!columnExists(database, 'projects', 'revision')) {
                database.exec('ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
            }
        }
    },
    {
        version: 5,
        name: '005_db_constraints_and_indexes',
        up: (database) => {
            // 1. chat_history ve project_logs için bileşik indeksler
            database.exec('CREATE INDEX IF NOT EXISTS idx_chat_history_project_id ON chat_history(project_id, id)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_project_logs_project_id ON project_logs(project_id, id)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at, revoked_at)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)');
        }
    },
    {
        version: 6,
        name: '006_user_mfa_support',
        up: (database) => {
            if (!columnExists(database, 'users', 'totp_secret')) {
                database.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
            }
            if (!columnExists(database, 'users', 'mfa_enabled')) {
                database.exec('ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0');
            }
        }
    },
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
                    FOREIGN KEY (contract_id, requirement_id)
                      REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, task_id)
                      REFERENCES contract_tasks (contract_id, id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS requirement_element_links (
                    contract_id TEXT NOT NULL,
                    requirement_id TEXT NOT NULL,
                    element_id TEXT NOT NULL,
                    PRIMARY KEY (contract_id, requirement_id, element_id),
                    FOREIGN KEY (contract_id, requirement_id)
                      REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, element_id)
                      REFERENCES contract_elements (contract_id, id) ON DELETE CASCADE
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

            database.exec('CREATE INDEX IF NOT EXISTS idx_project_contracts_project ON project_contracts(project_id, status)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_repair_issues_project ON repair_issues(project_id, status)');
            database.exec('CREATE INDEX IF NOT EXISTS idx_task_checkpoints_project ON task_checkpoints(project_id, invalidated_at)');

            const projects = database.prepare(
                'SELECT id, plan, status, created_at FROM projects WHERE plan IS NOT NULL'
            ).all();
            for (const project of projects) {
                const contractExists = database.prepare(
                    'SELECT 1 FROM project_contracts WHERE project_id = ?'
                ).get(project.id);
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
                `).run(
                    contractId,
                    project.id,
                    contractStatus,
                    canonicalPlan,
                    hash,
                    approvedAt,
                    project.created_at
                );
            }
        }
    },
    {
        version: 8,
        name: '008_verification_evidence',
        up: (database) => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS verification_runs (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    contract_id TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'failed', 'verified', 'rejected', 'blocked')),
                    policy_version TEXT NOT NULL,
                    started_at DATETIME NOT NULL,
                    ended_at DATETIME,
                    UNIQUE(contract_id, id),
                    FOREIGN KEY(project_id, contract_id)
                      REFERENCES project_contracts(project_id, id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS verification_checks (
                    id TEXT PRIMARY KEY,
                    contract_id TEXT NOT NULL,
                    run_id TEXT NOT NULL,
                    gate_name TEXT NOT NULL,
                    applicability TEXT NOT NULL CHECK(applicability IN ('MANDATORY', 'OPTIONAL', 'NOT_APPLICABLE')),
                    status TEXT NOT NULL CHECK(status IN ('PASS', 'FAIL', 'BLOCKED', 'NOT_APPLICABLE')),
                    command TEXT,
                    cwd TEXT,
                    exit_code INTEGER,
                    started_at DATETIME NOT NULL,
                    ended_at DATETIME,
                    timed_out INTEGER NOT NULL DEFAULT 0 CHECK(timed_out IN (0, 1)),
                    stdout_digest TEXT,
                    stderr_digest TEXT,
                    evidence_json TEXT,
                    UNIQUE(contract_id, id),
                    FOREIGN KEY(contract_id, run_id)
                      REFERENCES verification_runs(contract_id, id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_verification_runs_project ON verification_runs(project_id, status);
                CREATE INDEX IF NOT EXISTS idx_verification_checks_run ON verification_checks(contract_id, run_id);
            `);
        }
    },
    {
        version: 9,
        name: '009_contract_traceability_artifacts',
        up: (database) => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS artifacts (
                    id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    contract_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    path TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    manifest_json TEXT,
                    status TEXT NOT NULL CHECK(status IN ('draft', 'built', 'verification_pending', 'verified', 'rejected', 'superseded')),
                    verification_run_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (contract_id, id),
                    FOREIGN KEY (project_id, contract_id) REFERENCES project_contracts (project_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, verification_run_id) REFERENCES verification_runs (contract_id, id)
                );

                CREATE TABLE IF NOT EXISTS artifact_files (
                    contract_id TEXT NOT NULL,
                    artifact_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    PRIMARY KEY (contract_id, artifact_id, path),
                    FOREIGN KEY (contract_id, artifact_id) REFERENCES artifacts (contract_id, id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS requirement_file_links (
                    contract_id TEXT NOT NULL,
                    requirement_id TEXT NOT NULL,
                    artifact_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    PRIMARY KEY (contract_id, requirement_id, artifact_id, path),
                    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, artifact_id, path) REFERENCES artifact_files (contract_id, artifact_id, path) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS requirement_check_links (
                    contract_id TEXT NOT NULL,
                    requirement_id TEXT NOT NULL,
                    verification_check_id TEXT NOT NULL,
                    PRIMARY KEY (contract_id, requirement_id, verification_check_id),
                    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, verification_check_id) REFERENCES verification_checks (contract_id, id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS requirement_artifact_links (
                    contract_id TEXT NOT NULL,
                    requirement_id TEXT NOT NULL,
                    artifact_id TEXT NOT NULL,
                    PRIMARY KEY (contract_id, requirement_id, artifact_id),
                    FOREIGN KEY (contract_id, requirement_id) REFERENCES requirements (contract_id, id) ON DELETE CASCADE,
                    FOREIGN KEY (contract_id, artifact_id) REFERENCES artifacts (contract_id, id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, status);
                CREATE INDEX IF NOT EXISTS idx_artifact_files_artifact ON artifact_files(contract_id, artifact_id);
                CREATE INDEX IF NOT EXISTS idx_req_file_links ON requirement_file_links(contract_id, requirement_id);
                CREATE INDEX IF NOT EXISTS idx_req_check_links ON requirement_check_links(contract_id, requirement_id);
                CREATE INDEX IF NOT EXISTS idx_req_artifact_links ON requirement_artifact_links(contract_id, requirement_id);
            `);
        }
    },
    {
        version: 10,
        name: '010_completion_receipts',
        up: (database) => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS completion_receipts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    contract_id TEXT NOT NULL,
                    contract_hash TEXT NOT NULL,
                    artifact_id TEXT NOT NULL,
                    artifact_hash TEXT NOT NULL,
                    run_id TEXT NOT NULL,
                    policy_version TEXT NOT NULL,
                    mandatory_gate_digests TEXT NOT NULL,
                    previous_revision INTEGER NOT NULL,
                    next_revision INTEGER NOT NULL,
                    completed_at DATETIME NOT NULL,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
                    FOREIGN KEY (project_id, contract_id) REFERENCES project_contracts(project_id, id) ON DELETE RESTRICT,
                    FOREIGN KEY (contract_id, artifact_id)
                      REFERENCES artifacts(contract_id, id) ON DELETE RESTRICT,
                    FOREIGN KEY (contract_id, run_id) REFERENCES verification_runs(contract_id, id) ON DELETE RESTRICT,
                    CHECK (next_revision = previous_revision + 1)
                );

                CREATE INDEX IF NOT EXISTS idx_completion_receipts_project
                    ON completion_receipts(project_id, next_revision);
                CREATE INDEX IF NOT EXISTS idx_completion_receipts_run
                    ON completion_receipts(run_id);

                CREATE TRIGGER IF NOT EXISTS completion_receipts_immutable_update
                BEFORE UPDATE ON completion_receipts
                BEGIN
                    SELECT RAISE(ABORT, 'completion receipts are immutable');
                END;

                CREATE TRIGGER IF NOT EXISTS completion_receipts_immutable_delete
                BEFORE DELETE ON completion_receipts
                BEGIN
                    SELECT RAISE(ABORT, 'completion receipts are immutable');
                END;
            `);
        }
    },
    {
        version: 11,
        name: '011_workflow_lease_fencing',
        up: (database) => {
            for (const column of ['started_epoch', 'heartbeat_epoch', 'ended_epoch']) {
                if (!columnExists(database, 'workflow_attempts', column)) {
                    database.exec(`ALTER TABLE workflow_attempts ADD COLUMN ${column} INTEGER`);
                }
            }
            if (!columnExists(database, 'project_logs', 'attempt_id')) {
                database.exec('ALTER TABLE project_logs ADD COLUMN attempt_id TEXT');
            }
            if (!columnExists(database, 'project_logs', 'lease_owner')) {
                database.exec('ALTER TABLE project_logs ADD COLUMN lease_owner TEXT');
            }
            if (!columnExists(database, 'task_checkpoints', 'attempt_id')) {
                database.exec('ALTER TABLE task_checkpoints ADD COLUMN attempt_id TEXT');
            }
            if (!columnExists(database, 'task_checkpoints', 'lease_owner')) {
                database.exec('ALTER TABLE task_checkpoints ADD COLUMN lease_owner TEXT');
            }
            if (!columnExists(database, 'repair_issues', 'attempt_id')) {
                database.exec('ALTER TABLE repair_issues ADD COLUMN attempt_id TEXT');
            }
            if (!columnExists(database, 'repair_issues', 'lease_owner')) {
                database.exec('ALTER TABLE repair_issues ADD COLUMN lease_owner TEXT');
            }
            if (!columnExists(database, 'completion_receipts', 'attempt_id')) {
                database.exec('ALTER TABLE completion_receipts ADD COLUMN attempt_id TEXT');
            }
            if (!columnExists(database, 'completion_receipts', 'lease_owner')) {
                database.exec('ALTER TABLE completion_receipts ADD COLUMN lease_owner TEXT');
            }
            database.exec(`
                CREATE INDEX IF NOT EXISTS idx_workflow_attempts_heartbeat_epoch
                    ON workflow_attempts(status, heartbeat_epoch);
                CREATE INDEX IF NOT EXISTS idx_project_logs_attempt
                    ON project_logs(project_id, attempt_id);
                CREATE INDEX IF NOT EXISTS idx_completion_receipts_attempt
                    ON completion_receipts(project_id, attempt_id);
            `);
        }
    },
    {
        version: 12,
        name: '012_totp_replay_protection',
        up: (database) => {
            if (!columnExists(database, 'users', 'totp_last_counter')) {
                database.exec('ALTER TABLE users ADD COLUMN totp_last_counter INTEGER');
            }
        }
    },
    {
        version: 13,
        name: '013_project_deletion_intents',
        up: (database) => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS project_deletion_intents (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL UNIQUE,
                    source_path TEXT NOT NULL,
                    trash_path TEXT NOT NULL,
                    original_status TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    error TEXT,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_project_deletion_intents_phase
                    ON project_deletion_intents(phase, updated_at);
            `);
        }
    },
    {
        version: 14,
        name: '014_chat_action_idempotency',
        up: database => {
            if (!columnExists(database, 'chat_history', 'action_key')) {
                database.exec('ALTER TABLE chat_history ADD COLUMN action_key TEXT');
            }
            database.exec('DROP INDEX IF EXISTS idx_chat_history_action_key');
            database.exec(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_history_action_key
                ON chat_history(project_id, action_key)
                WHERE action_key IS NOT NULL;
            `);
        }
    },
    {
        version: 15,
        name: '015_project_llm_token_usage',
        up: database => {
            database.exec(`
                CREATE TABLE IF NOT EXISTS project_llm_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    total_tokens INTEGER,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_project_llm_usage_project ON project_llm_usage(project_id);
            `);
        }
    },
    {
        version: 16,
        name: '016_artifact_maintenance',
        up: database => database.exec(`
            CREATE TABLE IF NOT EXISTS artifact_maintenance (
                id TEXT PRIMARY KEY, project_id TEXT, artifact_id TEXT,
                source_path TEXT NOT NULL, quarantine_path TEXT NOT NULL,
                sha256 TEXT NOT NULL, reason TEXT NOT NULL, phase TEXT NOT NULL,
                error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_artifact_maintenance_phase ON artifact_maintenance(phase);
        `)
    },
    {
        version: 17,
        name: '017_checkpoint_identity_version',
        up: database => {
            if (!columnExists(database, 'task_checkpoints', 'task_identity_version')) {
                database.exec('ALTER TABLE task_checkpoints ADD COLUMN task_identity_version INTEGER NOT NULL DEFAULT 0');
            }
        }
    },
    {
        version: 18,
        name: '018_canonical_ownership_status_and_links',
        // Rebuilds parent tables; the runner disables enforcement and re-checks every key before commit.
        disableForeignKeys: true,
        up: database => migrateCanonicalSchema(database)
    },
];

// Frozen value sets for migration 18. Migrations are history: they never read live code constants.
// test_schema_canonical_constraints.js keeps these aligned with stateMachine/auth/repair writers.
export const MIGRATION_18_VALUES = Object.freeze({
    projectStatus: Object.freeze(['planning', 'pending_approval', 'contract_approved', 'implementing',
        'implementation_finished', 'verification_pending', 'verification_running', 'verification_failed', 'paused',
        'failed', 'build_verified', 'runtime_verified', 'acceptance_verified', 'artifact_verified', 'completed',
        'capability_blocked', 'deleting']),
    contractStatus: Object.freeze(['draft', 'pending_approval', 'approved', 'superseded', 'rejected']),
    attemptStatus: Object.freeze(['running', 'completed', 'rejected', 'failed', 'aborted', 'stale_terminated', 'paused']),
    repairStatus: Object.freeze(['open', 'resolved']),
    repairSeverity: Object.freeze(['critical', 'high']),
    repairOrigin: Object.freeze(['static_audit', 'worker_rejection', 'verification_blocker']),
    chatRole: Object.freeze(['user', 'model']),
    projectRole: Object.freeze(['owner', 'editor', 'viewer'])
});

const sqlList = values => values.map(value => `'${value}'`).join(', ');

function assertValuesWithin(database, table, column, allowed) {
    const unexpected = database.prepare(`SELECT DISTINCT ${column} AS value FROM ${table} WHERE ${column} IS NULL OR ${column} NOT IN (${sqlList(allowed)})`)
        .all().map(row => String(row.value));
    if (unexpected.length) throw new Error(`Migration 18: ${table}.${column} has values outside the canonical set: ${unexpected.slice(0, 10).join(', ')}`);
}

function snapshot(database, table, columns) {
    return database.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY rowid`).all().map(row => JSON.stringify(row));
}

/**
 * SQLite's documented table-rebuild procedure: create the canonical table, copy, verify, drop the old
 * table, rename, then restore its indexes and triggers. Columns in `preserved` must survive byte-for-byte.
 */
function rebuildTable(database, { table, createSql, columns, select = columns, preserved = columns }) {
    const companions = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name")
        .all(table).map(row => row.sql);
    const staging = `${table}__m18`;
    const before = snapshot(database, table, preserved);
    database.exec(createSql.replace('__TABLE__', staging));
    database.exec(`INSERT INTO ${staging} (${columns.join(', ')}) SELECT ${select.join(', ')} FROM ${table} ORDER BY rowid`);
    const after = snapshot(database, staging, preserved);
    if (after.length !== before.length || after.some((row, index) => row !== before[index])) {
        throw new Error(`Migration 18: rebuilding ${table} did not preserve its ${before.length} row(s).`);
    }
    database.exec(`DROP TABLE ${table}`);
    database.exec(`ALTER TABLE ${staging} RENAME TO ${table}`);
    for (const sql of companions) database.exec(sql);
}

function migrateCanonicalSchema(database) {
    const values = MIGRATION_18_VALUES;
    // 1. Fail closed on any value the canonical schema would reject, naming it.
    assertValuesWithin(database, 'projects', 'status', values.projectStatus);
    assertValuesWithin(database, 'project_contracts', 'status', values.contractStatus);
    assertValuesWithin(database, 'workflow_attempts', 'status', values.attemptStatus);
    assertValuesWithin(database, 'repair_issues', 'status', values.repairStatus);
    assertValuesWithin(database, 'repair_issues', 'severity', values.repairSeverity);
    assertValuesWithin(database, 'chat_history', 'role', values.chatRole);
    assertValuesWithin(database, 'project_owners', 'role', values.projectRole);

    // 2. Ownership has one source: project_owners. Carry any legacy owner_id over before dropping it.
    for (const row of database.prepare(`SELECT p.id, p.owner_id, p.created_at FROM projects p
        WHERE p.owner_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM project_owners po WHERE po.project_id = p.id AND po.user_id = p.owner_id)`).all()) {
        if (!database.prepare('SELECT 1 FROM users WHERE id = ?').get(row.owner_id)) {
            throw new Error(`Migration 18: project ${row.id} names a missing owner ${row.owner_id}.`);
        }
        database.prepare("INSERT INTO project_owners (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)")
            .run(row.id, row.owner_id, row.created_at);
    }

    // 3. Repair issues carry their provenance explicitly. Static audit rows stored the workflow attempt
    //    id in run_id; they keep it in attempt_id only, so run_id can reference verification_runs.
    const originCase = `CASE
        WHEN run_id IS NOT NULL AND run_id = attempt_id
             AND EXISTS (SELECT 1 FROM workflow_attempts a WHERE a.id = repair_issues.run_id) THEN 'static_audit'
        WHEN run_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM verification_runs v WHERE v.id = repair_issues.run_id AND v.contract_id = repair_issues.contract_id) THEN 'worker_rejection'
        WHEN run_id IS NULL AND json_extract(detail_json, '$.kind') = 'verification_controller_blocker' THEN 'verification_blocker'
    END`;
    const unknownOrigin = database.prepare(`SELECT id FROM repair_issues WHERE (${originCase}) IS NULL`).all().map(row => row.id);
    if (unknownOrigin.length) throw new Error(`Migration 18: repair issues with unknown provenance: ${unknownOrigin.slice(0, 10).join(', ')}`);

    // 4. Unused tables: refuse to drop anything that holds data.
    for (const table of ['requirement_element_links', 'contract_elements']) {
        const count = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
        if (count) throw new Error(`Migration 18: ${table} is not empty (${count} rows); refusing to drop it.`);
    }
    database.exec('DROP TABLE requirement_element_links; DROP TABLE contract_elements;');

    // 5. Canonical tables.
    rebuildTable(database, {
        table: 'projects',
        createSql: `CREATE TABLE __TABLE__ (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN (${sqlList(values.projectStatus)})),
            plan TEXT,
            is_pinned INTEGER DEFAULT 0,
            workflow_state TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            revision INTEGER NOT NULL DEFAULT 1
        )`,
        columns: ['id', 'title', 'status', 'plan', 'is_pinned', 'workflow_state', 'created_at', 'revision']
    });
    rebuildTable(database, {
        table: 'project_owners',
        createSql: `CREATE TABLE __TABLE__ (
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN (${sqlList(values.projectRole)})),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`,
        columns: ['project_id', 'user_id', 'role', 'created_at']
    });
    rebuildTable(database, {
        table: 'chat_history',
        createSql: `CREATE TABLE __TABLE__ (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN (${sqlList(values.chatRole)})),
            text_content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            action_key TEXT,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        )`,
        columns: ['id', 'project_id', 'role', 'text_content', 'created_at', 'action_key']
    });
    rebuildTable(database, {
        table: 'workflow_attempts',
        createSql: `CREATE TABLE __TABLE__ (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN (${sqlList(values.attemptStatus)})),
            lease_owner TEXT NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            error TEXT,
            started_epoch INTEGER,
            heartbeat_epoch INTEGER,
            ended_epoch INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        )`,
        columns: ['id', 'project_id', 'status', 'lease_owner', 'started_at', 'heartbeat_at', 'ended_at', 'error',
            'started_epoch', 'heartbeat_epoch', 'ended_epoch']
    });
    rebuildTable(database, {
        table: 'project_contracts',
        createSql: `CREATE TABLE __TABLE__ (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN (${sqlList(values.contractStatus)})),
            contract_json TEXT NOT NULL,
            contract_hash TEXT NOT NULL,
            source_message_id INTEGER,
            supersedes_revision INTEGER,
            approved_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, revision),
            UNIQUE(project_id, id),
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY(source_message_id) REFERENCES chat_history(id) ON DELETE SET NULL
        )`,
        columns: ['id', 'project_id', 'revision', 'status', 'contract_json', 'contract_hash', 'source_message_id',
            'supersedes_revision', 'approved_at', 'created_at']
    });
    rebuildTable(database, {
        table: 'requirements',
        createSql: `CREATE TABLE __TABLE__ (
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
            FOREIGN KEY(contract_id) REFERENCES project_contracts(id) ON DELETE CASCADE,
            FOREIGN KEY(source_message_id) REFERENCES chat_history(id) ON DELETE SET NULL,
            FOREIGN KEY(supersedes_requirement_id) REFERENCES requirements(id) ON DELETE SET NULL
        )`,
        columns: ['id', 'contract_id', 'stable_key', 'statement', 'kind', 'priority', 'mandatory', 'source_message_id',
            'status', 'supersedes_requirement_id']
    });
    const repairColumns = ['id', 'project_id', 'contract_id', 'run_id', 'requirement_id', 'fingerprint', 'severity',
        'status', 'detail_json', 'created_at', 'resolved_at', 'attempt_id', 'lease_owner', 'origin'];
    rebuildTable(database, {
        table: 'repair_issues',
        createSql: `CREATE TABLE __TABLE__ (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            contract_id TEXT NOT NULL,
            run_id TEXT,
            requirement_id TEXT,
            fingerprint TEXT NOT NULL,
            severity TEXT NOT NULL CHECK(severity IN (${sqlList(values.repairSeverity)})),
            status TEXT NOT NULL CHECK(status IN (${sqlList(values.repairStatus)})),
            detail_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            attempt_id TEXT,
            lease_owner TEXT,
            origin TEXT NOT NULL CHECK(origin IN (${sqlList(values.repairOrigin)})),
            CHECK(origin <> 'static_audit' OR run_id IS NULL),
            CHECK(origin <> 'worker_rejection' OR run_id IS NOT NULL),
            FOREIGN KEY(project_id, contract_id) REFERENCES project_contracts(project_id, id) ON DELETE CASCADE,
            FOREIGN KEY(contract_id, run_id) REFERENCES verification_runs(contract_id, id),
            FOREIGN KEY(attempt_id) REFERENCES workflow_attempts(id) ON DELETE SET NULL
        )`,
        columns: repairColumns,
        select: [...repairColumns.slice(0, 3), `CASE WHEN (${originCase}) = 'static_audit' THEN NULL ELSE run_id END`,
            ...repairColumns.slice(4, 13), `(${originCase})`],
        preserved: repairColumns.filter(column => !['run_id', 'origin'].includes(column))
    });
    rebuildTable(database, {
        table: 'project_logs',
        createSql: `CREATE TABLE __TABLE__ (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            agent TEXT,
            action TEXT,
            file TEXT,
            message TEXT,
            node_id TEXT,
            parent_node_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            attempt_id TEXT,
            lease_owner TEXT,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
            FOREIGN KEY (attempt_id) REFERENCES workflow_attempts (id) ON DELETE SET NULL
        )`,
        columns: ['id', 'project_id', 'agent', 'action', 'file', 'message', 'node_id', 'parent_node_id', 'created_at',
            'attempt_id', 'lease_owner']
    });
    rebuildTable(database, {
        table: 'task_checkpoints',
        createSql: `CREATE TABLE __TABLE__ (
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
            attempt_id TEXT,
            lease_owner TEXT,
            task_identity_version INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version),
            FOREIGN KEY(project_id, contract_id) REFERENCES project_contracts(project_id, id) ON DELETE CASCADE,
            FOREIGN KEY(attempt_id) REFERENCES workflow_attempts(id) ON DELETE SET NULL
        )`,
        columns: ['project_id', 'task_id', 'contract_id', 'plan_hash', 'task_spec_hash', 'input_hash', 'output_hash',
            'gate_version', 'status', 'requirement_ids', 'invalidation_reason', 'revision', 'created_at', 'invalidated_at',
            'attempt_id', 'lease_owner', 'task_identity_version']
    });
    // Receipts stay immutable: rows are copied as-is and the immutability triggers are restored.
    rebuildTable(database, {
        table: 'completion_receipts',
        createSql: `CREATE TABLE __TABLE__ (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            contract_id TEXT NOT NULL,
            contract_hash TEXT NOT NULL,
            artifact_id TEXT NOT NULL,
            artifact_hash TEXT NOT NULL,
            run_id TEXT NOT NULL,
            policy_version TEXT NOT NULL,
            mandatory_gate_digests TEXT NOT NULL,
            previous_revision INTEGER NOT NULL,
            next_revision INTEGER NOT NULL,
            completed_at DATETIME NOT NULL,
            attempt_id TEXT,
            lease_owner TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
            FOREIGN KEY (project_id, contract_id) REFERENCES project_contracts(project_id, id) ON DELETE RESTRICT,
            FOREIGN KEY (contract_id, artifact_id) REFERENCES artifacts(contract_id, id) ON DELETE RESTRICT,
            FOREIGN KEY (contract_id, run_id) REFERENCES verification_runs(contract_id, id) ON DELETE RESTRICT,
            FOREIGN KEY (attempt_id) REFERENCES workflow_attempts(id) ON DELETE SET NULL,
            CHECK (next_revision = previous_revision + 1)
        )`,
        columns: ['id', 'project_id', 'contract_id', 'contract_hash', 'artifact_id', 'artifact_hash', 'run_id',
            'policy_version', 'mandatory_gate_digests', 'previous_revision', 'next_revision', 'completed_at', 'attempt_id',
            'lease_owner']
    });
}
