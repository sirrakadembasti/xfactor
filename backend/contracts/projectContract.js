import crypto from 'crypto';
import { db } from '../db.js';
import { canTransitionProject, PROJECT_STATUS } from '../engine/stateMachine.js';

// P0-A owns the capability registry. Later units may extend it only with a
// matching generator adapter.
export const SUPPORTED_STACKS = {
    frontends: ['react', 'vite'],
    backends: ['express', 'node'],
    databases: ['sqlite']
};

export function validateContractCapabilities(contractJson) {
    const contract = typeof contractJson === 'string'
        ? JSON.parse(contractJson)
        : contractJson;
    const frontendFramework = contract.frontend?.framework?.toLowerCase();
    const backendFramework = contract.backend?.framework?.toLowerCase();
    const databaseEngine = contract.database?.engine?.toLowerCase();
    const errors = [];

    if (frontendFramework && !SUPPORTED_STACKS.frontends.includes(frontendFramework)) {
        errors.push(`Frontend framework "${frontendFramework}" is not supported.`);
    }
    if (backendFramework && !SUPPORTED_STACKS.backends.includes(backendFramework)) {
        errors.push(`Backend framework "${backendFramework}" is not supported.`);
    }
    if (databaseEngine && !SUPPORTED_STACKS.databases.includes(databaseEngine)) {
        errors.push(`Database engine "${databaseEngine}" is not supported.`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

export function createContractRevision(projectId, plan, sourceMessageId) {
    const planJson = typeof plan === 'string' ? plan : JSON.stringify(plan);
    const hash = crypto.createHash('sha256').update(planJson).digest('hex');

    db.exec('BEGIN IMMEDIATE;');
    try {
        db.prepare(`
            UPDATE project_contracts
            SET status = 'superseded'
            WHERE project_id = ? AND status = 'pending_approval'
        `).run(projectId);

        const latest = db.prepare(
            'SELECT MAX(revision) as rev FROM project_contracts WHERE project_id = ?'
        ).get(projectId);
        const nextRevision = (latest?.rev || 0) + 1;
        const id = `contract-${crypto.randomUUID()}`;

        db.prepare(`
            INSERT INTO project_contracts (
                id, project_id, revision, status, contract_json,
                contract_hash, source_message_id, supersedes_revision
            ) VALUES (?, ?, ?, 'pending_approval', ?, ?, ?, ?)
        `).run(
            id,
            projectId,
            nextRevision,
            planJson,
            hash,
            sourceMessageId,
            latest?.rev || null
        );

        db.exec('COMMIT;');
        return nextRevision;
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
}

export function approveContractRevision(projectId, revision) {
    db.exec('BEGIN IMMEDIATE;');
    try {
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
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
}

export function getLatestRevision(projectId) {
    return db.prepare(`
        SELECT * FROM project_contracts
        WHERE project_id = ?
        ORDER BY revision DESC
        LIMIT 1
    `).get(projectId);
}

export function rejectContractForCapabilities({
    projectId,
    revision,
    expectedProjectRevision,
    errors
}) {
    const expectedRevision = Number(expectedProjectRevision || 1);
    const nextRevision = expectedRevision + 1;
    const rejectionErrors = Array.isArray(errors) ? errors.map(String) : [];
    const explanation = [
        'Project blocked because its architecture stack is unsupported.',
        ...rejectionErrors.map(error => `- ${error}`)
    ].join('\n');

    db.exec('BEGIN IMMEDIATE;');
    try {
        const persistedProject = db.prepare(
            'SELECT status, revision FROM projects WHERE id = ?'
        ).get(projectId);
        if (!persistedProject) {
            throw new Error(`Project ${projectId} does not exist`);
        }
        if (persistedProject.revision !== expectedRevision) {
            throw new Error(`CAS Revision conflict on project ${projectId}`);
        }
        if (!canTransitionProject(
            persistedProject.status,
            PROJECT_STATUS.CAPABILITY_BLOCKED
        )) {
            throw new Error(
                `Illegal project transition: ${persistedProject.status} -> ${PROJECT_STATUS.CAPABILITY_BLOCKED}`
            );
        }

        const contractResult = db.prepare(`
            UPDATE project_contracts
            SET status = 'rejected'
            WHERE project_id = ? AND revision = ? AND status = 'pending_approval'
        `).run(projectId, revision);
        if (contractResult.changes !== 1) {
            throw new Error(`Revision ${revision} is not pending approval or does not exist.`);
        }

        const projectResult = db.prepare(`
            UPDATE projects
            SET status = ?, revision = ?
            WHERE id = ? AND revision = ? AND status = ?
        `).run(
            PROJECT_STATUS.CAPABILITY_BLOCKED,
            nextRevision,
            projectId,
            expectedRevision,
            persistedProject.status
        );
        if (projectResult.changes !== 1) {
            throw new Error(`CAS Revision conflict on project ${projectId}`);
        }

        db.prepare(`
            INSERT INTO chat_history (project_id, role, text_content, created_at)
            VALUES (?, 'model', ?, ?)
        `).run(projectId, explanation, new Date().toISOString());

        const blockedProject = db.prepare(
            'SELECT id, title, status, revision, plan, workflow_state, created_at FROM projects WHERE id = ?'
        ).get(projectId);
        db.exec('COMMIT;');
        return blockedProject;
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
}
