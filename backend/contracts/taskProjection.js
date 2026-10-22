import crypto from 'node:crypto';
import { db } from '../db.js';
import { assertWorkflowLease } from '../workflowAttempts.js';
import { collectDownstreamTaskIds } from '../observability.js';
import { computeTaskSpecHash } from '../engine/checkpointHelper.js';

const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,256}$/.test(value);
const scopedId = (kind, ...parts) => `${kind}-${crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;

/**
 * Rebuild the current approved contract's mutable task/link projection from the
 * complete current teamleader plan map. Requirements come only from approved
 * contract JSON; existing requirement IDs (and their evidence links) survive.
 * Checkpoints, verification evidence, artifacts and older contracts are untouched.
 */
export function projectContractTasks({
    projectId, contractId, contractHash = null, teamleaderPlans,
    attemptId, leaseOwner, database = db
} = {}) {
    database.exec('BEGIN IMMEDIATE;');
    try {
        const leaseOptions = { projectId, database };
        if (!projectId || !contractId) throw new Error('Project and approved contract are required for task projection.');
        assertWorkflowLease(attemptId, leaseOwner, leaseOptions);
        const approved = database.prepare(`SELECT id, contract_hash, contract_json FROM project_contracts
            WHERE project_id = ? AND status = 'approved' ORDER BY revision DESC LIMIT 1`).get(projectId);
        if (!approved || approved.id !== contractId) throw new Error('Task projection requires the current approved project contract.');
        if (contractHash !== null && approved.contract_hash !== contractHash) throw new Error('Approved contract hash changed before task projection.');
        const contract = JSON.parse(approved.contract_json);
        if (!Array.isArray(contract.requirements)) throw new Error('Approved contract requirements are missing.');
        const requirements = new Map();
        for (const entry of contract.requirements) {
            const requirement = typeof entry === 'string' ? { id: entry, statement: entry } : entry;
            if (!requirement || !identifier(requirement.id) || requirements.has(requirement.id)) {
                throw new Error('Approved contract contains an invalid or duplicate requirement.');
            }
            requirements.set(requirement.id, requirement);
        }
        if (!teamleaderPlans || typeof teamleaderPlans !== 'object' || Array.isArray(teamleaderPlans)) {
            throw new Error('A complete teamleader plan map is required.');
        }
        const projected = [];
        for (const [teamleaderId, plan] of Object.entries(teamleaderPlans).sort(([a], [b]) => a.localeCompare(b))) {
            if (!identifier(teamleaderId) || !Array.isArray(plan?.tasks) || plan.tasks.length === 0) {
                throw new Error('Invalid teamleader task projection.');
            }
            const taskIds = new Set();
            for (const task of plan.tasks) {
                if (!task || !identifier(task.id) || taskIds.has(task.id)) throw new Error('Invalid or duplicate task ID.');
                taskIds.add(task.id);
            }
            for (const task of plan.tasks) {
                if (!Array.isArray(task.requirementIds) || task.requirementIds.length === 0
                    || task.requirementIds.some(id => !requirements.has(id))) {
                    throw new Error(`Task ${teamleaderId}/${task.id} has missing or unknown requirement scope.`);
                }
                if (!Array.isArray(task.dependencies) || task.dependencies.some(id => !taskIds.has(id))) {
                    throw new Error(`Task ${teamleaderId}/${task.id} has an invalid dependency.`);
                }
                if (!Array.isArray(task.targetFiles) || task.targetFiles.length !== 1
                    || typeof task.targetFiles[0] !== 'string' || !task.targetFiles[0].trim()) {
                    throw new Error('Task projection requires exactly one target file.');
                }
                const id = scopedId('task', contractId, teamleaderId, task.id);
                const stableKey = `${teamleaderId}/${task.id}`;
                const spec = { ...task, id, executionTaskId: task.id, executionTaskSpecHash: computeTaskSpecHash(task), teamleaderId,
                    dependencies: [...new Set(task.dependencies)].sort().map(dependency => scopedId('task', contractId, teamleaderId, dependency)),
                    requirementIds: [...new Set(task.requirementIds)].sort() };
                projected.push({ id, stableKey, teamleaderId, taskId: task.id, spec });
            }
        }
        if (!projected.length) throw new Error('Task projection cannot replace a contract with an empty task list.');
        // Reuse preview's actual graph validator so persisted dependency IDs have
        // the exact identity and DAG semantics that impact traversal consumes.
        collectDownstreamTaskIds(projected.map(task => ({ id: task.id, task_spec_json: task.spec })), []);

        const existingRequirements = new Map(database.prepare('SELECT id, stable_key FROM requirements WHERE contract_id = ?')
            .all(contractId).map(row => [row.stable_key, row.id]));
        const insertRequirement = database.prepare(`INSERT INTO requirements
            (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')`);
        for (const [stableKey, requirement] of requirements) {
            if (existingRequirements.has(stableKey)) continue;
            const id = scopedId('requirement', contractId, stableKey);
            insertRequirement.run(id, contractId, stableKey, requirement.statement || requirement.title || stableKey,
                requirement.kind || 'functional', requirement.priority || 'normal', requirement.mandatory === false ? 0 : 1);
            existingRequirements.set(stableKey, id);
        }
        const wanted = new Map(projected.map(task => [task.stableKey, task.id]));
        const previous = database.prepare('SELECT id, stable_key FROM contract_tasks WHERE contract_id = ?').all(contractId);
        const removeTask = database.prepare('DELETE FROM contract_tasks WHERE contract_id = ? AND id = ?');
        for (const row of previous) {
            if (wanted.get(row.stable_key) !== row.id) removeTask.run(contractId, row.id);
        }
        const upsertTask = database.prepare(`INSERT INTO contract_tasks (id, contract_id, stable_key, task_spec_json)
            VALUES (?, ?, ?, ?) ON CONFLICT(contract_id, stable_key) DO UPDATE SET task_spec_json = excluded.task_spec_json`);
        const insertLink = database.prepare('INSERT INTO requirement_task_links (contract_id, requirement_id, task_id) VALUES (?, ?, ?)');
        database.prepare('DELETE FROM requirement_task_links WHERE contract_id = ?').run(contractId);
        let linkCount = 0;
        for (const task of projected) {
            upsertTask.run(task.id, contractId, task.stableKey, JSON.stringify(task.spec));
            for (const stableKey of task.spec.requirementIds) {
                insertLink.run(contractId, existingRequirements.get(stableKey), task.id);
                linkCount++;
            }
        }
        assertWorkflowLease(attemptId, leaseOwner, leaseOptions);
        database.exec('COMMIT;');
        return { tasks: projected.map(({ spec, ...task }) => task).sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
            taskCount: projected.length, linkCount };
    } catch (error) {
        database.exec('ROLLBACK;');
        throw error;
    }
}
