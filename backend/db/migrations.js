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
];
