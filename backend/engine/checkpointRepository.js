import { canonicalizeTaskDependencies } from './dag.js';
import { db } from '../db.js';
import { assertWorkflowLease } from '../workflowAttempts.js';
import { qualifiedTaskId, uniquelyOwnsLegacy } from './checkpointIdentity.js';
import { computeTaskSpecHash } from './checkpointHelper.js';


export function saveCheckpoint({
    projectId,
    taskId,
    teamleaderId = null,
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
    invalidatedAt = null,
    attemptId = null,
    leaseOwner = null,
    expectedContractHash = null,
    expectedContractRevision = null,
    signal = null,
    refreshReviewed = false
}) {
    const taskIdentityVersion = teamleaderId ? 1 : 0;
    if (teamleaderId) taskId = qualifiedTaskId({ contractId, teamleaderId, localTaskId: taskId });
    // Only a fresh successful review may renew identical CAS evidence. Resume
    // reads never call this path and cannot revive an invalidated checkpoint.
    if (refreshReviewed && (status !== 'completed' || invalidatedAt !== null || invalidationReason !== null)) {
        throw new Error('Only newly reviewed completed checkpoints may be refreshed.');
    }
    const reqIdsJson = Array.isArray(requirementIds)
        ? JSON.stringify(requirementIds)
        : (typeof requirementIds === 'string' ? requirementIds : '[]');

    db.exec('BEGIN IMMEDIATE;');
    try {
        if (attemptId !== null || leaseOwner !== null) {
            if (!attemptId || !leaseOwner) {
                throw new Error('attemptId and leaseOwner are required for fenced workflow mutations.');
            }
            assertWorkflowLease(attemptId, leaseOwner, { projectId });
            const approved = db.prepare(`SELECT id, contract_hash, revision FROM project_contracts
                WHERE project_id = ? AND status = 'approved' ORDER BY revision DESC, id ASC LIMIT 1`).get(projectId);
            if (signal?.aborted || !approved || approved.id !== contractId
                || (expectedContractHash !== null && approved.contract_hash !== expectedContractHash)
                || (expectedContractRevision !== null && approved.revision !== expectedContractRevision)) {
                throw Object.assign(new Error('Checkpoint contract changed or execution was cancelled before commit.'),
                    { code: 'WORKFLOW_LEASE_FENCED' });
            }
        }
        const result = db.prepare(`
            INSERT INTO task_checkpoints (
                project_id, task_id, contract_id, plan_hash, task_spec_hash,
                input_hash, output_hash, gate_version, status, requirement_ids,
                invalidation_reason, revision, created_at, invalidated_at, attempt_id, lease_owner, task_identity_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ${refreshReviewed ? `ON CONFLICT (
                project_id, task_id, contract_id, plan_hash, task_spec_hash,
                input_hash, output_hash, gate_version
            ) DO UPDATE SET
                status = excluded.status,
                requirement_ids = excluded.requirement_ids,
                invalidation_reason = excluded.invalidation_reason,
                invalidated_at = excluded.invalidated_at,
                revision = task_checkpoints.revision + 1,
                created_at = excluded.created_at,
                attempt_id = excluded.attempt_id,
                lease_owner = excluded.lease_owner,
                task_identity_version = excluded.task_identity_version
            WHERE task_checkpoints.task_identity_version = excluded.task_identity_version` : ''}
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
            invalidatedAt,
            attemptId,
            leaseOwner,
            taskIdentityVersion
        );
        if (refreshReviewed && result.changes === 0) {
            throw Object.assign(new Error('Checkpoint identity version conflicts with historical evidence.'),
                { code: 'CHECKPOINT_IDENTITY_CONFLICT' });
        }
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }

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
    teamleaderId = null,
    contractId,
    planHash,
    taskSpecHash,
    inputHash,
    outputHash,
    gateVersion
}) {
    if (teamleaderId) taskId = qualifiedTaskId({ contractId, teamleaderId, localTaskId: taskId });
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
          ${teamleaderId ? 'AND task_identity_version = 1' : ''}
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

// Omitted scope is deliberate standalone/historical compatibility only.
// Workflow always supplies contract + owner; a qualified history blocks legacy
// fallback even when its newest row is invalidated or from a different spec.
export function getLatestCheckpoint(projectId, taskId, options = {}) {
    if (options.teamleaderId) {
        const id = qualifiedTaskId({ contractId: options.contractId, teamleaderId: options.teamleaderId, localTaskId: taskId });
        const row = db.prepare(`SELECT * FROM task_checkpoints WHERE project_id=? AND contract_id=?
            AND task_id=? AND task_identity_version=1 ORDER BY created_at DESC, rowid DESC LIMIT 1`)
            .get(projectId, options.contractId, id);
        if (row) return row;
        if (!uniquelyOwnsLegacy(options.ownershipInventory, { id, localTaskId: taskId, specHash: options.taskSpecHash })) return null;
        return db.prepare(`SELECT * FROM task_checkpoints WHERE project_id=? AND contract_id=? AND task_id=?
            AND task_spec_hash=? AND task_identity_version=0 ORDER BY created_at DESC, rowid DESC LIMIT 1`)
            .get(projectId, options.contractId, taskId, options.taskSpecHash) || null;
    }
    const row = db.prepare(`
        SELECT * FROM task_checkpoints
        WHERE project_id = ? AND task_id = ? ${options.contractId ? 'AND contract_id = ?' : ''}
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
    `).get(projectId, taskId, ...(options.contractId ? [options.contractId] : []));
    return row || null;
}

export function deleteCheckpoint({
    projectId,
    taskId,
    teamleaderId = null,
    contractId,
    planHash,
    taskSpecHash,
    inputHash,
    outputHash,
    gateVersion
}) {
    if (teamleaderId) taskId = qualifiedTaskId({ contractId, teamleaderId, localTaskId: taskId });
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
          ${teamleaderId ? 'AND task_identity_version = 1' : ''}
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
    teamleaderId = null,
    contractId,
    planHash,
    taskSpecHash,
    inputHash,
    outputHash,
    gateVersion
}, reason = 'Manual invalidation') {
    if (teamleaderId) taskId = qualifiedTaskId({ contractId, teamleaderId, localTaskId: taskId });
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
          ${teamleaderId ? 'AND task_identity_version = 1' : ''}
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

export function invalidateDownstreamCheckpoints(projectId, rootTaskIds = [], allTasks = [], baseReason = 'Downstream invalidation', options = {}) {
    if (options.teamleaderId) {
        const localIds = new Set(allTasks.map(task => task.id));
        if (localIds.size !== allTasks.length || rootTaskIds.some(id => !localIds.has(id))) {
            throw new Error('Scoped invalidation requires one complete local task DAG with known root IDs.');
        }
        const qualified = localTaskId => qualifiedTaskId({ contractId: options.contractId, teamleaderId: options.teamleaderId, localTaskId });
        return invalidateScopedDownstream(projectId, rootTaskIds.map(qualified), allTasks.map(task => {
            const dependencies = canonicalizeTaskDependencies(task.dependencies || []);
            return { ...task, id: qualified(task.id), localTaskId: task.id,
                specHash: computeTaskSpecHash({ ...task, dependencies }), dependencies: dependencies.map(qualified) };
        }), baseReason, options);
    }
    // Explicit standalone compatibility for older repository consumers.
    return invalidateScopedDownstream(projectId, rootTaskIds, allTasks, baseReason, options);
}

function invalidateScopedDownstream(projectId, rootTaskIds, allTasks, baseReason, options) {
    const toInvalidate = new Set(rootTaskIds);
    const queue = [...rootTaskIds];

    // BFS ile DAG bağımlılıklarını aşağı doğru yinele
    while (queue.length > 0) {
        const currentId = queue.shift();
        for (const task of allTasks) {
            const dependencies = canonicalizeTaskDependencies(task?.dependencies || []);
            if (dependencies.includes(currentId)) {
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
                  AND invalidated_at IS NULL ${options.contractId ? 'AND contract_id = ?' : ''}
                  ${options.teamleaderId ? 'AND task_identity_version = 1' : ''}
            `).run(now, reason, projectId, taskId, ...(options.contractId ? [options.contractId] : []));
            const task = allTasks.find(candidate => candidate.id === taskId);
            if (options.teamleaderId && task && uniquelyOwnsLegacy(options.ownershipInventory, {
                id: task.id, localTaskId: task.localTaskId, specHash: task.specHash
            })) {
                db.prepare(`UPDATE task_checkpoints SET status='invalidated', invalidated_at=?, invalidation_reason=?
                    WHERE project_id=? AND contract_id=? AND task_id=? AND task_spec_hash=? AND task_identity_version=0
                    AND invalidated_at IS NULL`).run(now, reason, projectId, options.contractId, task.localTaskId, task.specHash);
            } else if (options.teamleaderId && task) {
                const legacy = db.prepare(`SELECT 1 FROM task_checkpoints WHERE project_id=? AND contract_id=?
                    AND task_id=? AND task_spec_hash=? AND task_identity_version=0 AND invalidated_at IS NULL LIMIT 1`)
                    .get(projectId, options.contractId, task.localTaskId, task.specHash);
                if (legacy) throw Object.assign(new Error('Legacy checkpoint ownership is ambiguous or incomplete; contract-wide invalidation required.'),
                    { code: 'CHECKPOINT_OWNERSHIP_AMBIGUOUS' });
            }
        }
        db.exec('COMMIT;');
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }

    return invalidatedList;
}

export function invalidateCheckpointsByRequirements(projectId, requirementIds = [], allTasks = [], reason = 'Requirement verification failed', options = {}) {
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

    return invalidateDownstreamCheckpoints(projectId, directTaskIds, allTasks, reason, options);
}
