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

export function invalidateDownstreamCheckpoints(projectId, rootTaskIds = [], allTasks = [], baseReason = 'Downstream invalidation') {
    const toInvalidate = new Set(rootTaskIds);
    const queue = [...rootTaskIds];

    // BFS ile DAG bağımlılıklarını aşağı doğru yinele
    while (queue.length > 0) {
        const currentId = queue.shift();
        for (const task of allTasks) {
            if (Array.isArray(task.dependencies) && task.dependencies.includes(currentId)) {
                if (!toInvalidate.has(task.id)) {
                    toInvalidate.add(task.id);
                    queue.push(task.id);
                }
            }
        }
    }

    const now = new Date().toISOString();
    const invalidatedList = Array.from(toInvalidate);

    db.exec('BEGIN IMMEDIATE;');
    try {
        for (const taskId of invalidatedList) {
            const isRoot = rootTaskIds.includes(taskId);
            const reason = isRoot ? baseReason : `Cascading dependency invalidation from upstream: ${rootTaskIds.join(', ')}`;
            db.prepare(`
                UPDATE task_checkpoints
                SET status = 'invalidated',
                    invalidated_at = ?,
                    invalidation_reason = ?
                WHERE project_id = ?
                  AND task_id = ?
                  AND invalidated_at IS NULL
            `).run(now, reason, projectId, taskId);
        }
        db.exec('COMMIT;');
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }

    return invalidatedList;
}

export function invalidateCheckpointsByRequirements(projectId, requirementIds = [], allTasks = [], reason = 'Requirement verification failed') {
    const reqSet = new Set(requirementIds);
    const directTaskIds = [];

    for (const task of allTasks) {
        const taskReqs = Array.isArray(task.requirementIds) ? task.requirementIds : (Array.isArray(task.requirements) ? task.requirements : []);
        if (taskReqs.some(r => reqSet.has(r))) {
            directTaskIds.push(task.id);
        }
    }

    if (directTaskIds.length === 0) {
        return [];
    }

    return invalidateDownstreamCheckpoints(projectId, directTaskIds, allTasks, reason);
}
