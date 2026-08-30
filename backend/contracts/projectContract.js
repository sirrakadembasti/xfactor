import crypto from 'crypto';
import { db } from '../db.js';

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
