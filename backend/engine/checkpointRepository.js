import { db } from '../db.js';

export function saveCheckpoint({
    projectId,
    taskId,
    contractId,
    planHash,
    taskSpecHash,
    inputHash,
    outputHash,
    gateVersion = '1.0.0',
    status = 'completed',
    requirementIds = [],
    invalidationReason = null,
    revision = 1,
    createdAt = new Date().toISOString(),
    invalidatedAt = null
}) {
    const reqIdsJson = Array.isArray(requirementIds)
        ? JSON.stringify(requirementIds)
        : (typeof requirementIds === 'string' ? requirementIds : '[]');

    db.prepare(`
        INSERT INTO task_checkpoints (
            project_id, task_id, contract_id, plan_hash, task_spec_hash,
            input_hash, output_hash, gate_version, status, requirement_ids,
            invalidation_reason, revision, created_at, invalidated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        projectId,
        taskId,
        contractId,
        planHash,
        taskSpecHash,
        inputHash,
        outputHash,
        gateVersion,
        status,
        reqIdsJson,
        invalidationReason,
        revision,
        createdAt,
        invalidatedAt
    );

    return getCheckpoint({
        projectId,
        taskId,
        contractId,
        planHash,
        taskSpecHash,
        inputHash,
        outputHash,
        gateVersion
    });
}

export function getCheckpoint({
    projectId,
    taskId,
    contractId,
    planHash,
    taskSpecHash,
    inputHash,
    outputHash,
    gateVersion
}) {
    const row = db.prepare(`
        SELECT * FROM task_checkpoints
        WHERE project_id = ?
          AND task_id = ?
          AND contract_id = ?
          AND plan_hash = ?
          AND task_spec_hash = ?
          AND input_hash = ?
          AND output_hash = ?
          AND gate_version = ?
    `).get(
        projectId,
        taskId,
        contractId,
        planHash,
        taskSpecHash,
        inputHash,
        outputHash,
        gateVersion
    );
    return row || null;
}

export function getLatestCheckpoint(projectId, taskId) {
    const row = db.prepare(`
        SELECT * FROM task_checkpoints
        WHERE project_id = ? AND task_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(projectId, taskId);
    return row || null;
}

export function deleteCheckpoint({
    projectId,
    taskId,
    contractId,
    planHash,
    taskSpecHash,
    inputHash,
    outputHash,
    gateVersion
}) {
    const result = db.prepare(`
        DELETE FROM task_checkpoints
        WHERE project_id = ?
          AND task_id = ?
          AND contract_id = ?
          AND plan_hash = ?
          AND task_spec_hash = ?
          AND input_hash = ?
          AND output_hash = ?
          AND gate_version = ?
    `).run(
        projectId,
        taskId,
        contractId,
        planHash,
        taskSpecHash,
        inputHash,
        outputHash,
        gateVersion
    );

    return result.changes > 0;
}

export function invalidateCheckpoint({
    projectId,
    taskId,
    contractId,
    planHash,
    taskSpecHash,
    inputHash,
    outputHash,
    gateVersion
}, reason = 'Manual invalidation') {
    const now = new Date().toISOString();
    const result = db.prepare(`
        UPDATE task_checkpoints
        SET status = 'invalidated',
            invalidated_at = ?,
            invalidation_reason = ?
        WHERE project_id = ?
          AND task_id = ?
          AND contract_id = ?
          AND plan_hash = ?
          AND task_spec_hash = ?
          AND input_hash = ?
          AND output_hash = ?
          AND gate_version = ?
    `).run(
        now,
        reason,
        projectId,
        taskId,
        contractId,
        planHash,
        taskSpecHash,
        inputHash,
        outputHash,
        gateVersion
    );

    return result.changes > 0;
}
