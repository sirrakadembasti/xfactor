import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { db, dbEvents, formatDBDate } from './db.js';
import { assertWorkflowLease } from './workflowAttempts.js';
import { validateProjectTitle } from './security.js';
import { isValidProjectStatus } from './auth.js';
import { canTransitionProject, PROJECT_STATUS } from './engine/stateMachine.js';
import { getArtifact, getLatestVerifiedArtifact } from './repositories/artifactRepository.js';


export * from './projectPaths.js';
import { getProjectDir, getProjectsRoot, isValidProjectId } from './projectPaths.js';
import { reconcileProjectsWithDisk, autoRegisterDiscoveredProjects, rehydrateProjectStateFromDisk, rehydrateProjectChatHistoryFromDisk, rehydrateProjectLogsFromDisk } from './services/reconciliationService.js';

export function slugifyTitle(title) {
    if (!title || typeof title !== 'string') return 'proje';
    const trMap = {
        'ç': 'c', 'Ç': 'c',
        'ğ': 'g', 'Ğ': 'g',
        'ı': 'i', 'İ': 'i', 'I': 'i',
        'ö': 'o', 'Ö': 'o',
        'ş': 's', 'Ş': 's',
        'ü': 'u', 'Ü': 'u'
    };
    let slug = String(title)
        .replace(/[çÇğĞıİIöÖşŞüÜ]/g, ch => trMap[ch] || ch)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!slug) slug = 'proje';
    return slug.slice(0, 48);
}

export function generateNextProjectId(title, { database = db, env = process.env } = {}) {
    const slug = slugifyTitle(title);
    const root = getProjectsRoot(env);
    let maxSeq = 0;

    try {
        if (database) {
            const rows = database.prepare('SELECT id FROM projects WHERE id = ? OR id LIKE ?').all(slug, `${slug}-%`);
            for (const r of rows) {
                if (r.id === slug) {
                    maxSeq = Math.max(maxSeq, 1);
                } else {
                    const match = r.id.match(new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
                    if (match) {
                        maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
                    }
                }
            }
        }
    } catch {}

    try {
        if (fsSync.existsSync(root)) {
            const entries = fsSync.readdirSync(root, { withFileTypes: true });
            for (const d of entries) {
                if (!d.isDirectory()) continue;
                if (d.name === slug) {
                    maxSeq = Math.max(maxSeq, 1);
                } else {
                    const match = d.name.match(new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
                    if (match) {
                        maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
                    }
                }
            }
        }
    } catch {}

    const nextSeq = maxSeq + 1;
    return `${slug}-${nextSeq}`;
}

export async function createProject({ title, ownerUserId = null, env = process.env, customId = null } = {}) {
    if (!validateProjectTitle(title || '')) {
        throw new Error('Geçerli bir proje başlığı (title) gerekli.');
    }
    const cleanTitle = title.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s-_]/g, '').trim() || 'İsimsiz Proje';
    const id = customId || generateNextProjectId(cleanTitle, { database: db, env });
    const projectDir = getProjectDir(id, env);

    const initialWelcomeMessage = `Merhaba Boss! "${cleanTitle}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.`;
    const nowIso = new Date().toISOString();

    // 1. Önce dizin oluşturulur (SQLite transaction içinde await fs tutulmaz)
    await fs.mkdir(projectDir, { recursive: true });

    const insertProject = db.prepare('INSERT INTO projects (id, title, status, plan, is_pinned, created_at) VALUES (?, ?, ?, NULL, 0, ?)');
    const insertOwner = db.prepare('INSERT INTO project_owners (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)');
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');

    // 2. Senkron SQLite transaction
    db.exec('BEGIN IMMEDIATE;');
    try {
        insertProject.run(id, cleanTitle, 'planning', nowIso);
        if (ownerUserId) {
            insertOwner.run(id, ownerUserId, 'owner', nowIso);
        }
        insertChat.run(id, 'model', initialWelcomeMessage, nowIso);
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
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

export function getProject(projectId) {
    if (!isValidProjectId(projectId)) return null;

    const project = db.prepare(
        'SELECT id, title, status, plan, is_pinned, workflow_state, revision, created_at FROM projects WHERE id = ?'
    ).get(projectId);
    if (!project) return null;

    const contractRow = db.prepare(`
        SELECT id, contract_json FROM project_contracts
        WHERE project_id = ?
        ORDER BY
            CASE WHEN status = 'approved' THEN 1 ELSE 0 END DESC,
            revision DESC
        LIMIT 1
    `).get(projectId);

    let chats = db.prepare('SELECT id, role, text_content, created_at FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(projectId);
    if (chats.length <= 1) {
        try {
            const projectDir = getProjectDir(projectId);
            rehydrateProjectChatHistoryFromDisk(projectDir, { projectId, database: db });
            chats = db.prepare('SELECT id, role, text_content, created_at FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(projectId);
        } catch {}
    }

    let chatHistory = chats.map(c => {
        const timestamp = formatDBDate(c.created_at);
        return {
            id: c.id,
            role: c.role,
            parts: [{ text: c.text_content }],
            timestamp,
            created_at: c.created_at
        };
    });

    if (chatHistory.length === 0) {
        const welcomeText = project.status === 'completed'
            ? `Merhaba Boss! "${project.title}" projesi tamamlanmış ve tüm dosyaları hazırdır. Proje üzerinde yeni bir revizyon yapmak, değişiklik istemek veya soru sormak için buradan bana iletebilirsiniz.`
            : `Merhaba Boss! "${project.title}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.`;
        chatHistory = [{
            id: 0,
            role: 'model',
            parts: [{ text: welcomeText }],
            timestamp: formatDBDate(project.created_at),
            created_at: project.created_at
        }];
    }

    let plan = null;
    if (project.plan) {
        try { plan = JSON.parse(project.plan); } catch {}
    }
    if (contractRow?.contract_json) {
        try { plan = JSON.parse(contractRow.contract_json); } catch {}
    }

    let workflow = null;
    if (project.workflow_state) {
        try { workflow = JSON.parse(project.workflow_state); } catch {}
    }

    const artifactCandidate = (contractRow && getLatestVerifiedArtifact({ projectId, contractId: contractRow.id }))
        || getLatestVerifiedArtifact({ projectId });
    let artifact = null;
    if (artifactCandidate) {
        try {
            artifact = assertVerifiedArtifactEvidence({
                projectId,
                contractId: artifactCandidate.contractId,
                artifactId: artifactCandidate.id
            }).artifact;
        } catch {}
    }
    const latestArtifact = artifact && {
        id: artifact.id,
        status: artifact.status,
        sha256: artifact.sha256,
        size: artifact.size,
        verificationRunId: artifact.verificationRunId
    };

    return {
        id: project.id,
        title: project.title,
        status: project.status,
        isPinned: Boolean(project.is_pinned),
        createdAt: project.created_at,
        revision: project.revision || 1,
        plan,
        workflow,
        remediation: workflow?.remediation || null,
        last_error: workflow?.last_error || null,
        chatHistory,
        contractId: contractRow?.id || null,
        latestArtifact: latestArtifact || null
    };
}
export function getAllProjects() {
    return db.prepare(
        'SELECT id, title, status, is_pinned, created_at FROM projects ORDER BY is_pinned DESC, created_at DESC'
    ).all().map(project => ({
        id: project.id,
        title: project.title,
        status: project.status,
        isPinned: Boolean(project.is_pinned),
        createdAt: project.created_at
    }));
}

export function updateProject(id, updates = {}) {
    const fields = [];
    const values = [];
    if (typeof updates.title === 'string' && updates.title.trim()) {
        fields.push('title = ?');
        values.push(updates.title.trim());
    }
    if (typeof updates.is_pinned !== 'undefined' || typeof updates.isPinned !== 'undefined') {
        const pinVal = updates.is_pinned !== undefined ? (updates.is_pinned ? 1 : 0) : (updates.isPinned ? 1 : 0);
        fields.push('is_pinned = ?');
        values.push(pinVal);
    }
    if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return getProject(id);
}

export function projectStateTransitionInTransaction({
    projectId,
    expectedRevision,
    statuses,
    attemptId = null,
    leaseOwner = null,
    transactionOpen = false
}) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID: "${projectId}"`);
    }
    if (!Array.isArray(statuses) || statuses.length === 0) {
        throw new Error('At least one project status transition is required.');
    }

    const ownsTransaction = !transactionOpen;
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE;');
    try {
        if (attemptId !== null || leaseOwner !== null) {
            assertWorkflowLease(attemptId, leaseOwner, { projectId });
        }
        const persisted = db.prepare(
            'SELECT status, revision FROM projects WHERE id = ?'
        ).get(projectId);
        if (!persisted) {
            throw new Error(`Project ${projectId} does not exist.`);
        }
        if (persisted.revision !== expectedRevision) {
            throw new Error(`CAS Revision conflict on project ${projectId}`);
        }

        let currentStatus = persisted.status;
        for (const nextStatus of statuses) {
            if (!isValidProjectStatus(nextStatus)) {
                throw new Error(`Unknown project status: ${nextStatus}`);
            }
            if (nextStatus === PROJECT_STATUS.COMPLETED) {
                throw new Error(
                    'Cannot transition project to completed: required verified lifecycle evidence is missing'
                );
            }
            if (!canTransitionProject(currentStatus, nextStatus)) {
                throw new Error(`Illegal project transition: ${currentStatus} -> ${nextStatus}`);
            }
            currentStatus = nextStatus;
        }

        const nextRevision = expectedRevision + statuses.length;
        const result = db.prepare(`
            UPDATE projects
            SET status = ?, revision = ?
            WHERE id = ? AND revision = ? AND status = ?
        `).run(
            currentStatus,
            nextRevision,
            projectId,
            expectedRevision,
            persisted.status
        );
        if (result.changes !== 1) {
            throw new Error(`CAS Revision conflict on project ${projectId}`);
        }
        if (ownsTransaction) db.exec('COMMIT;');
        return { status: currentStatus, revision: nextRevision };
    } catch (error) {
        if (ownsTransaction) {
            try { db.exec('ROLLBACK;'); } catch {}
        }
        throw error;
    }
}

const P4_MANDATORY_GATES = [
    'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
    'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
    'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
    'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
];

function parseEvidence(value) {
    if (!value) return null;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}

function isIsoTimestamp(value) {
    if (typeof value !== 'string') return false;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/);
    if (!match) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime())
        && date.getUTCFullYear() === Number(match[1])
        && date.getUTCMonth() + 1 === Number(match[2])
        && date.getUTCDate() === Number(match[3])
        && date.getUTCHours() === Number(match[4])
        && date.getUTCMinutes() === Number(match[5])
        && date.getUTCSeconds() === Number(match[6])
        && date.getUTCMilliseconds() === Number(match[7] || 0);
}

function leaseOptionsFrom(...candidates) {
    return candidates.find(candidate => candidate
        && (Object.prototype.hasOwnProperty.call(candidate, 'attemptId')
            || Object.prototype.hasOwnProperty.call(candidate, 'leaseOwner'))) || null;
}

function assertMutationLease(projectId, options) {
    if (!options) return;
    const { attemptId = null, leaseOwner = null } = options;
    if (!attemptId || !leaseOwner) {
        const error = new Error('attemptId and leaseOwner are required for fenced workflow mutations.');
        error.code = 'WORKFLOW_LEASE_FENCED';
        throw error;
    }
    assertWorkflowLease(attemptId, leaseOwner, { projectId });
}

/**
 * Authorizes a verified artifact for completion/download. This is deliberately
 * shared by the projector and HTTP route so neither path can weaken the gate.
 */
export function assertVerifiedArtifactEvidence({ projectId, contractId, artifactId, strict = true } = {}) {
    const latestContract = db.prepare(`
        SELECT id FROM project_contracts WHERE project_id = ? AND status = 'approved'
        ORDER BY revision DESC LIMIT 1
    `).get(projectId);
    if (!latestContract || latestContract.id !== contractId) {
        throw new Error(`Contract ${contractId} is not the latest approved contract for project ${projectId}.`);
    }
    const artifact = getArtifact({ projectId, contractId, artifactId });
    if (!artifact || artifact.status !== 'verified' || !artifact.verificationRunId) {
        throw new Error(`Artifact ${artifactId} is not verified or lacks verification run linkage.`);
    }
    const run = db.prepare(`
        SELECT * FROM verification_runs
        WHERE id = ? AND project_id = ? AND contract_id = ?
    `).get(artifact.verificationRunId, projectId, contractId);
    if (!run || run.status !== 'verified') throw new Error(`Verification run ${artifact.verificationRunId} is not verified.`);

    if (run.policy_version !== '2.0') {
        throw new Error('Verification run policy version is not active.');
    }
    const checks = db.prepare(`
        SELECT * FROM verification_checks WHERE contract_id = ? AND run_id = ?
        ORDER BY id
    `).all(contractId, run.id);
    const mandatory = checks.filter(check => check.applicability === 'MANDATORY');
    const names = mandatory.map(check => check.gate_name);
    const expected = [...P4_MANDATORY_GATES].sort();
    if (names.length !== expected.length || [...names].sort().some((name, i) => name !== expected[i])) {
        throw new Error(`Verification run ${run.id} has an incomplete mandatory gate set.`);
    }
    for (const check of mandatory) {
        const evidence = parseEvidence(check.evidence_json);
        const payload = evidence?.evidence && typeof evidence.evidence === 'object'
            ? { ...evidence, ...evidence.evidence } : evidence;
        const derivedSources = payload?.sourceGateNames || payload?.sourceCheckIds;
        const producerAllowed = ['quality-policy-test', 'quality-policy', 'aggregate-verification'].includes(payload?.producer);
        const sourceValid = Array.isArray(derivedSources) && derivedSources.length > 0
            && derivedSources.every(value => typeof value === 'string' && value.trim().length > 0);
        const derived = payload?.kind === 'derived_gate' && producerAllowed && sourceValid
            && payload.policyVersion === '2.0'
            && isIsoTimestamp(payload.computedAt || payload.endedAt);
        if (derived && (payload.sourceGateNames || payload.sourceCheckIds)) {
            const passByName = new Set(checks.filter(item => item.status === 'PASS').map(item => item.gate_name));
            const passById = new Set(checks.filter(item => item.status === 'PASS').map(item => item.id));
            if (payload.sourceGateNames?.some(name => !passByName.has(name))
                || payload.sourceCheckIds?.some(id => !passById.has(id))) {
                throw new Error(`Mandatory gate ${check.gate_name} has invalid derived evidence sources.`);
            }
        }
        const executable = Boolean(check.command) && check.exit_code !== null && check.exit_code !== undefined;
        if (check.status !== 'PASS' || !payload || Object.keys(payload).length === 0
            || (!derived && !executable) || !check.stdout_digest || !check.stderr_digest
            || !isIsoTimestamp(check.started_at) || !isIsoTimestamp(check.ended_at)) {
            throw new Error(`Mandatory gate ${check.gate_name} lacks complete evidence.`);
        }
    }
    const required = db.prepare(
        'SELECT id FROM requirements WHERE contract_id = ? AND mandatory = 1'
    ).all(contractId);
    for (const req of required) {
        const linked = db.prepare(`
            SELECT 1 FROM requirement_check_links l
            JOIN verification_checks c ON c.contract_id = l.contract_id AND c.id = l.verification_check_id
            WHERE l.contract_id = ? AND l.requirement_id = ? AND c.run_id = ? AND c.status = 'PASS'
            LIMIT 1
        `).get(contractId, req.id, run.id);
        if (!linked) throw new Error(`Mandatory requirement traceability is incomplete for contract ${contractId}.`);
    }
    const openRepairs = db.prepare(`
        SELECT COUNT(*) AS count FROM repair_issues
        WHERE project_id = ? AND contract_id = ? AND status = 'open'
    `).get(projectId, contractId).count;
    if (openRepairs > 0) throw new Error(`Project ${projectId} has open repair issues.`);
    let diskHash = null;
    try { diskHash = crypto.createHash('sha256').update(fsSync.readFileSync(artifact.path)).digest('hex'); } catch {
        throw new Error(`Artifact ${artifactId} file is unavailable.`);
    }
    if (diskHash !== artifact.sha256) throw new Error(`Artifact ${artifactId} file hash does not match persisted evidence.`);
    return { artifact, run };
}
export function completeVerifiedProject({
    projectId,
    contractId,
    artifactId,
    expectedRevision,
    attemptId = null,
    leaseOwner = null
}) {
    if (!isValidProjectId(projectId)) throw new Error(`Invalid project ID: "${projectId}"`);
    db.exec('BEGIN IMMEDIATE;');
    try {
        if (attemptId !== null || leaseOwner !== null) {
            assertWorkflowLease(attemptId, leaseOwner, { projectId });
        }
        const persisted = db.prepare('SELECT status, revision FROM projects WHERE id = ?').get(projectId);
        if (!persisted) throw new Error(`Project ${projectId} does not exist.`);
        if (persisted.revision !== Number(expectedRevision || 1)) throw new Error(`CAS Revision conflict on project ${projectId}.`);
        if (persisted.status !== PROJECT_STATUS.ARTIFACT_VERIFIED) {
            throw new Error(`Project ${projectId} status must be artifact_verified (was ${persisted.status}).`);
        }
        const { artifact, run } = assertVerifiedArtifactEvidence({
            projectId, contractId, artifactId, strict: true
        });
        const contract = db.prepare(
            'SELECT contract_hash FROM project_contracts WHERE project_id = ? AND id = ?'
        ).get(projectId, contractId);
        if (!contract) throw new Error(`Contract ${contractId} does not exist for project ${projectId}.`);
        const mandatoryGateDigests = db.prepare(`
            SELECT gate_name, stdout_digest, stderr_digest
            FROM verification_checks
            WHERE contract_id = ? AND run_id = ? AND applicability = 'MANDATORY'
            ORDER BY gate_name
        `).all(contractId, run.id);
        const previousRevision = persisted.revision;
        const nextRevision = previousRevision + 1;
        const completedAt = new Date().toISOString();
        const result = db.prepare(`
            UPDATE projects SET status = ?, revision = ?
            WHERE id = ? AND revision = ? AND status = ?
        `).run(PROJECT_STATUS.COMPLETED, nextRevision, projectId, previousRevision, PROJECT_STATUS.ARTIFACT_VERIFIED);
        if (result.changes !== 1) throw new Error(`CAS Revision conflict on project ${projectId}.`);
        const completionReceiptId = `completion-${crypto.randomUUID()}`;
        db.prepare(`
            INSERT INTO completion_receipts (
                id, project_id, contract_id, contract_hash, artifact_id, artifact_hash,
                run_id, policy_version, mandatory_gate_digests,
                previous_revision, next_revision, completed_at, attempt_id, lease_owner
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            completionReceiptId, projectId, contractId, contract.contract_hash,
            artifactId, artifact.sha256, run.id, run.policy_version,
            JSON.stringify(mandatoryGateDigests), previousRevision, nextRevision, completedAt,
            attemptId, leaseOwner
        );
        db.exec('COMMIT;');
        return { runId: run.id, artifactId, completionReceiptId, ...getProject(projectId) };
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
}

/**
 * Atomik tekil sohbet mesajı ekleme (Bütün state dizisini ezmeden güvenli append)
 */
export function appendProjectChatMessage(projectId, role, textContent, createdAt = new Date().toISOString()) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID: "${projectId}"`);
    }
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');
    const result = insertChat.run(projectId, role, textContent, createdAt);
    return {
        id: Number(result.lastInsertRowid),
        role,
        parts: [{ text: textContent }],
        created_at: createdAt
    };
}

export function appendProjectActionMessages(projectId, {
    actionId,
    userText,
    modelText,
    createdAt = new Date().toISOString(),
    inTransaction = false
} = {}) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID: "${projectId}"`);
    }
    if (typeof actionId !== 'string' || !actionId.trim() || actionId.length > 128) {
        throw new Error('Invalid actionId: expected a non-empty string of at most 128 characters.');
    }

    const userActionKey = `${actionId}:user`;
    const modelActionKey = `${actionId}:model`;
    const toMessage = row => ({
        id: Number(row.id),
        role: row.role,
        parts: [{ text: row.text_content }],
        created_at: row.created_at
    });
    const findMessages = () => db.prepare(`
        SELECT id, role, text_content, created_at
        FROM chat_history
        WHERE project_id = ? AND action_key IN (?, ?)
        ORDER BY id ASC
    `).all(projectId, userActionKey, modelActionKey);

    let transactionOpen = false;
    if (!inTransaction) {
        db.exec('BEGIN IMMEDIATE;');
        transactionOpen = true;
    }
    try {
        const existingRows = findMessages();
        if (existingRows.length > 0) {
            if (transactionOpen) {
                db.exec('COMMIT;');
                transactionOpen = false;
            }
            return { inserted: false, messages: existingRows.map(toMessage) };
        }

        db.prepare(`
            INSERT INTO chat_history (project_id, role, text_content, action_key, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(projectId, 'user', userText, userActionKey, createdAt);
        db.prepare(`
            INSERT INTO chat_history (project_id, role, text_content, action_key, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(projectId, 'model', modelText, modelActionKey, createdAt);

        const insertedRows = findMessages();
        if (transactionOpen) {
            db.exec('COMMIT;');
            transactionOpen = false;
        }
        return { inserted: true, messages: insertedRows.map(toMessage) };
    } catch (error) {
        if (transactionOpen) {
            try { db.exec('ROLLBACK;'); } catch {}
        }
        throw error;
}
}
export async function saveProjectState(stateOrId, stateOrEnv = process.env, maybeEnv = process.env) {
    const state = (typeof stateOrId === 'object' && stateOrId !== null) ? stateOrId : stateOrEnv;
    const options = [stateOrId, stateOrEnv, maybeEnv].find(candidate => candidate
        && typeof candidate === 'object'
        && (Object.prototype.hasOwnProperty.call(candidate, 'inTransaction')
            || Object.prototype.hasOwnProperty.call(candidate, 'onTransaction')));
    const inTransaction = Boolean(options?.inTransaction);
    const onTransaction = options?.onTransaction;
    const leaseOptions = typeof stateOrId === 'object' && stateOrId !== null
        ? leaseOptionsFrom(stateOrEnv)
        : leaseOptionsFrom(maybeEnv);

    if (!state || !isValidProjectId(state.id)) {
        throw new Error(`Invalid project state or project ID: ${state?.id}`);
    }

    if (state.remediation !== undefined) {
        if (state.workflow) {
            state.workflow.remediation = state.remediation;
        } else if (state.remediation) {
            state.workflow = { remediation: state.remediation };
        }
    }
    if (state.last_error !== undefined) {
        if (state.workflow) {
            state.workflow.last_error = state.last_error;
        } else if (state.last_error) {
            state.workflow = { last_error: state.last_error };
        }
    }
    const workflowStr = state.workflow ? JSON.stringify(state.workflow) : null;
    const expectedRevision = Number(state.revision || 1);
    const nextRevision = expectedRevision + 1;
    const insertChat = db.prepare(
        'INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)'
    );

    let transactionOpen = false;
    if (!inTransaction) {
        db.exec('BEGIN IMMEDIATE;');
        transactionOpen = true;
    }
    try {
        assertMutationLease(state.id, leaseOptions);
        const persisted = db.prepare(
            'SELECT status, revision FROM projects WHERE id = ?'
        ).get(state.id);
        if (!persisted) {
            throw new Error(`Project ${state.id} does not exist`);
        }
        if (persisted.revision !== expectedRevision) {
            throw new Error(`CAS Revision conflict on project ${state.id}`);
        }
        if (!isValidProjectStatus(state.status)) {
            throw new Error(`Unknown project status: ${state.status}`);
        }
        if (state.status === PROJECT_STATUS.COMPLETED) {
            throw new Error(
                'Cannot transition project to completed: required verified lifecycle evidence is missing'
            );
        }
        if (!canTransitionProject(persisted.status, state.status)) {
            throw new Error(`Illegal project transition: ${persisted.status} -> ${state.status}`);
        }
        const result = db.prepare(`
            UPDATE projects
            SET title = ?, status = ?, plan = NULL, workflow_state = ?, revision = ?
            WHERE id = ? AND revision = ? AND status = ?
        `).run(
            state.title,
            state.status,
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

        // Contract revisions are owned by createContractRevision/approveContractRevision.
        // A workflow checkpoint may carry an older plan snapshot and must not rewrite them.
        if (state.plan && !db.prepare('SELECT id FROM project_contracts WHERE project_id = ? LIMIT 1').get(state.id)) {
            const contractJson = JSON.stringify(state.plan);
            const contractHash = crypto.createHash('sha256').update(contractJson).digest('hex');
            const contractId = `contract-${crypto.randomUUID()}`;
            db.prepare(`
                INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash)
                VALUES (?, ?, ?, 'approved', ?, ?)
            `).run(contractId, state.id, nextRevision, contractJson, contractHash);
        }

        const existingCount = db.prepare(
            'SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?'
        ).get(state.id).count;
        const chatsToSave = state.chatHistory || [];
        for (let i = existingCount; i < chatsToSave.length; i++) {
            const chat = chatsToSave[i];
            const text = chat?.parts?.[0]?.text || '';
            const createdAt = chat.created_at || new Date().toISOString();
            insertChat.run(state.id, chat.role, text, createdAt);
        }
        onTransaction?.();
        if (transactionOpen) {
            db.exec('COMMIT;');
            transactionOpen = false;
        }
    } catch (error) {
        if (transactionOpen) {
            db.exec('ROLLBACK;');
            transactionOpen = false;
        }
        throw error;
    }
    dbEvents.emit(`stateChange:${state.id}`, state.status);
}

function parseDeleteOptions(envOrOptions, maybeOptions) {
    let provided = {};
    let env = process.env;
    let force = false;
    let database = db;
    if (typeof envOrOptions === 'object' && envOrOptions !== null) {
        if ('env' in envOrOptions || 'force' in envOrOptions || 'fsOps' in envOrOptions || 'database' in envOrOptions) {
            env = envOrOptions.env || process.env;
            force = Boolean(envOrOptions.force);
            provided = envOrOptions.fsOps || {};
            database = envOrOptions.database || db;
        } else {
            env = envOrOptions;
            force = Boolean(maybeOptions?.force);
            provided = maybeOptions?.fsOps || {};
            database = maybeOptions?.database || db;
        }
    } else {
        force = Boolean(maybeOptions?.force);
        provided = maybeOptions?.fsOps || {};
        database = maybeOptions?.database || db;
    }
    return { env, force, fsOps: { ...fs, ...provided }, database };
}

function lockReceiptError() {
    const error = new Error('RESTRICT: Cannot delete project with verified delivery receipt');
    error.code = 'PROJECT_LOCKED_RECEIPT';
    return error;
}

function trashRootFor(env) {
    try {
        const legacyTrash = path.join(getProjectsRoot(env), '.trash');
        if (fsSync.existsSync(legacyTrash)) {
            const entries = fsSync.readdirSync(legacyTrash);
            if (entries.length === 0) {
                fsSync.rmdirSync(legacyTrash);
            }
        }
    } catch {}

    const configured = typeof env?.TRASH_ROOT === 'string' ? env.TRASH_ROOT.trim() : '';
    return path.resolve(configured || path.join(os.tmpdir(), 'xfactor-trash'));
}


function updateIntent(database, intentId, phase, error = null) {
    database.prepare(
        'UPDATE project_deletion_intents SET phase = ?, error = ?, updated_at = ? WHERE id = ?'
    ).run(phase, error ? String(error.message || error) : null, new Date().toISOString(), intentId);
}

async function movePath(source, target, fsOps = fs) {
    const renameFn = fsOps.rename || fs.rename;
    try {
        await renameFn(source, target);
    } catch (err) {
        if (err && (err.code === 'EXDEV' || String(err.message || '').includes('EXDEV'))) {
            const cpFn = fsOps.cp || fs.cp;
            const rmFn = fsOps.rm || fs.rm;
            await cpFn(source, target, { recursive: true });
            await rmFn(source, { recursive: true, force: true });
        } else {
            throw err;
        }
    }
}

async function restoreIntentSource(intent, fsOps) {
    if (!fsSync.existsSync(intent.source_path) && fsSync.existsSync(intent.trash_path)) {
        await movePath(intent.trash_path, intent.source_path, fsOps);
    }
}

async function removeOwnedTrash(intent, fsOps) {
    if (fsSync.existsSync(intent.trash_path)) {
        await fsOps.rm(intent.trash_path, { recursive: true, force: true });
    }
}

async function finalizeDeletion(intent, { env, force, fsOps, database }) {
    const receipt = database.prepare('SELECT id FROM completion_receipts WHERE project_id = ? LIMIT 1').get(intent.project_id);
    if (receipt && !force) {
        await restoreIntentSource(intent, fsOps);
        database.prepare('UPDATE projects SET status = ? WHERE id = ?').run(intent.original_status, intent.project_id);
        try {
            database.prepare('DELETE FROM project_deletion_intents WHERE id = ?').run(intent.id);
        } catch {}
        throw lockReceiptError();
    }

    database.exec('BEGIN IMMEDIATE;');
    try {
        const lockedReceipt = database.prepare(
            'SELECT id FROM completion_receipts WHERE project_id = ? LIMIT 1'
        ).get(intent.project_id);
        if (lockedReceipt && !force) throw lockReceiptError();
        if (force) {
            database.exec('DROP TRIGGER IF EXISTS completion_receipts_immutable_delete');
            try {
                database.prepare('DELETE FROM completion_receipts WHERE project_id = ?').run(intent.project_id);
            } finally {
                database.exec(`CREATE TRIGGER IF NOT EXISTS completion_receipts_immutable_delete
                    BEFORE DELETE ON completion_receipts
                    BEGIN
                        SELECT RAISE(ABORT, 'completion receipts are immutable');
                    END`);
            }
        }
        database.prepare('DELETE FROM chat_history WHERE project_id = ?').run(intent.project_id);
        database.prepare('DELETE FROM project_logs WHERE project_id = ?').run(intent.project_id);
        database.prepare('DELETE FROM project_owners WHERE project_id = ?').run(intent.project_id);
        database.prepare('DELETE FROM workflow_attempts WHERE project_id = ?').run(intent.project_id);
        database.prepare('DELETE FROM project_deletion_intents WHERE id = ?').run(intent.id);
        database.prepare('DELETE FROM projects WHERE id = ?').run(intent.project_id);
        database.exec('COMMIT;');
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        if (error.code === 'PROJECT_LOCKED_RECEIPT') {
            try {
                await restoreIntentSource(intent, fsOps);
                database.prepare('UPDATE projects SET status = ? WHERE id = ?').run(intent.original_status, intent.project_id);
                database.prepare('DELETE FROM project_deletion_intents WHERE id = ?').run(intent.id);
            } catch {}
        } else {
            try { updateIntent(database, intent.id, 'trashed', error); } catch {}
        }
        throw error;
    }

    try {
        updateIntent(database, intent.id, 'cleanup_pending');
        await removeOwnedTrash(intent, fsOps);
        database.prepare('DELETE FROM project_deletion_intents WHERE id = ?').run(intent.id);
    } catch (error) {
        try { updateIntent(database, intent.id, 'cleanup_pending', error); } catch {}
        throw error;
    }
    return true;
}

export async function deleteProject(projectId, envOrOptions = process.env, maybeOptions = {}) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID format: "${projectId}"`);
    }
    const options = parseDeleteOptions(envOrOptions, maybeOptions);
    const database = options.database;
    const project = database.prepare('SELECT status FROM projects WHERE id = ?').get(projectId);
    if (!project) return false;
    const receipt = database.prepare('SELECT id FROM completion_receipts WHERE project_id = ? LIMIT 1').get(projectId);
    if (receipt && !options.force) throw lockReceiptError();

    const projectDir = getProjectDir(projectId, options.env);
    const root = trashRootFor(options.env);
    const trashDir = path.join(root, `.trash-${projectId}-${Date.now()}-${crypto.randomUUID()}`);
    await options.fsOps.mkdir?.(root, { recursive: true });
    const now = new Date().toISOString();
    const intent = {
        id: `deletion-${crypto.randomUUID()}`,
        project_id: projectId,
        source_path: projectDir,
        trash_path: trashDir,
        original_status: project.status,
        phase: 'prepared'
    };
    database.exec('BEGIN IMMEDIATE;');
    try {
        const currentReceipt = database.prepare('SELECT id FROM completion_receipts WHERE project_id = ? LIMIT 1').get(projectId);
        if (currentReceipt && !options.force) throw lockReceiptError();
        database.prepare(`
            INSERT INTO project_deletion_intents
                (id, project_id, source_path, trash_path, original_status, phase, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(intent.id, intent.project_id, intent.source_path, intent.trash_path, intent.original_status, intent.phase, now, now);
        database.prepare("UPDATE projects SET status = 'deleting' WHERE id = ?").run(projectId);
        database.exec('COMMIT;');
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }

    const { abortProjectExecution } = await import('./engine/cancellation.js');
    abortProjectExecution(projectId, 'DELETED');
    if (fsSync.existsSync(projectDir)) {
        try {
            await movePath(projectDir, trashDir, options.fsOps);
            updateIntent(database, intent.id, 'trashed');
        } catch (error) {
            try {
                database.prepare('UPDATE projects SET status = ? WHERE id = ?').run(intent.original_status, projectId);
                updateIntent(database, intent.id, 'rename_failed', error);
            } catch {}
            throw error;
        }
    } else {
        updateIntent(database, intent.id, 'trashed');
    }
    return finalizeDeletion(intent, options);
}

export async function recoverPendingProjectDeletions({ env = process.env, database = db, fsOps = fs, force = false } = {}) {
    const intents = database.prepare(`
        SELECT id, project_id, source_path, trash_path, original_status, phase, error
        FROM project_deletion_intents ORDER BY created_at, id
    `).all();
    const results = [];
    for (const intent of intents) {
        const project = database.prepare('SELECT id FROM projects WHERE id = ?').get(intent.project_id);
        const receipt = database.prepare('SELECT id FROM completion_receipts WHERE project_id = ? LIMIT 1').get(intent.project_id);
        if (receipt && !force) {
            await restoreIntentSource(intent, fsOps);
            database.prepare('UPDATE projects SET status = ? WHERE id = ?').run(intent.original_status, intent.project_id);
            database.prepare('DELETE FROM project_deletion_intents WHERE id = ?').run(intent.id);
            results.push({ projectId: intent.project_id, status: 'protected' });
            continue;
        }
        if (!project) {
            await removeOwnedTrash(intent, fsOps);
            database.prepare('DELETE FROM project_deletion_intents WHERE id = ?').run(intent.id);
            results.push({ projectId: intent.project_id, status: 'cleaned' });
            continue;
        }
        if (fsSync.existsSync(intent.source_path) && !fsSync.existsSync(intent.trash_path)) {
            try {
                await fsOps.mkdir?.(path.dirname(intent.trash_path), { recursive: true });
                await movePath(intent.source_path, intent.trash_path, fsOps);
                updateIntent(database, intent.id, 'trashed');
            } catch (error) {
                updateIntent(database, intent.id, 'rename_failed', error);
                results.push({ projectId: intent.project_id, status: 'failed', error: error.message });
                continue;
            }
        }
        results.push({ projectId: intent.project_id, status: await finalizeDeletion(intent, { env, force, fsOps, database }) ? 'deleted' : 'unknown' });
    }
    return results;
}

export { reconcileProjectsWithDisk, autoRegisterDiscoveredProjects, rehydrateProjectStateFromDisk, rehydrateProjectChatHistoryFromDisk, rehydrateProjectLogsFromDisk };

export async function syncProjectsWithDisk(optionsOrEnv = process.env) {
    if (optionsOrEnv && typeof optionsOrEnv === 'object' && (optionsOrEnv.autoRegister !== undefined || optionsOrEnv.projectsRoot !== undefined || optionsOrEnv.database !== undefined)) {
        return await reconcileProjectsWithDisk(optionsOrEnv);
    }
    return await reconcileProjectsWithDisk({ env: optionsOrEnv });
}
