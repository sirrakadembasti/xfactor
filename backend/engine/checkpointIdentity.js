import crypto from 'node:crypto';
import { computeTaskSpecHash } from './checkpointHelper.js';

// Same identity as contract_tasks.id. Domain and team are the two normalized
// dot-free prefixes in teamleaderId; local execution/DAG IDs stay unchanged.
export function qualifiedTaskId({ contractId, teamleaderId, localTaskId }) {
    if (![contractId, teamleaderId, localTaskId].every(value => typeof value === 'string' && value.length > 0)
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(teamleaderId)) {
        throw new Error('Checkpoint identity requires contract, domain.team and local task ID.');
    }
    return `task-${crypto.createHash('sha256').update(JSON.stringify([contractId, teamleaderId, localTaskId])).digest('hex')}`;
}

export function workflowCheckpointInventory({ contractId, domains, directorSpecs, teamleaderPlans } = {}) {
    const owners = [], expected = new Set();
    let complete = Boolean(contractId && Array.isArray(domains) && domains.length);
    for (const domain of domains || []) {
        const prefix = typeof domain === 'string' ? domain : domain.prefix;
        const teams = directorSpecs?.[prefix]?.teamleaders;
        if (!Array.isArray(teams) || !teams.length) { complete = false; continue; }
        for (const team of teams) expected.add(`${prefix}.${team.prefix}`);
    }
    for (const teamleaderId of expected) {
        const tasks = teamleaderPlans?.[teamleaderId]?.tasks;
        if (!Array.isArray(tasks) || !tasks.length) { complete = false; continue; }
        for (const task of tasks) {
            if (!task?.id) { complete = false; continue; }
            owners.push({ id: qualifiedTaskId({ contractId, teamleaderId, localTaskId: task.id }),
                localTaskId: task.id, specHash: computeTaskSpecHash(task) });
        }
    }
    if (Object.keys(teamleaderPlans || {}).some(team => !expected.has(team))) complete = false;
    return { complete, owners };
}

export function uniquelyOwnsLegacy(inventory, { id, localTaskId, specHash }) {
    if (inventory?.complete !== true) return false;
    const candidates = inventory.owners.filter(owner => owner.localTaskId === localTaskId
        && (owner.specHash === null || owner.specHash === specHash));
    return candidates.length === 1 && candidates[0].id === id;
}

export function projectedCheckpointInventory(taskRows, complete = false) {
    return { complete, owners: taskRows.map(row => {
        const spec = typeof row.task_spec_json === 'string' ? JSON.parse(row.task_spec_json) : row.task_spec_json;
        return { id: row.id, localTaskId: spec?.executionTaskId || row.id,
            specHash: spec?.executionTaskSpecHash || null };
    }) };
}
