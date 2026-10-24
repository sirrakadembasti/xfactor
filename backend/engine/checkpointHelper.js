import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { canonicalizeTaskDependencies } from './dag.js';

function canonicalizeFilePaths(filePaths) {
    if (filePaths === null || filePaths === undefined || typeof filePaths === 'string') {
        return [];
    }
    if (typeof filePaths[Symbol.iterator] !== 'function') {
        return [];
    }

    const canonical = new Set();
    for (const filePath of filePaths) {
        if (typeof filePath === 'string' && filePath.length > 0) {
            canonical.add(filePath);
        }
    }
    return [...canonical].sort();
}

function canonicalizeCoverageValue(value) {
    if (Array.isArray(value)) return value.map(canonicalizeCoverageValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalizeCoverageValue(value[key])]));
    }
    return value;
}

// Obligation fields intentionally migrate legacy task hashes, including empty
// assignments. Old checkpoints need fresh acceptance; their hashes must not be
// rewritten to reuse evidence produced for an unbound requirement assignment.
export function computeTaskSpecHash(task) {
    if (!task || typeof task !== 'object') return '0'.repeat(64);

    const canonicalSpec = {
        id: task.id || '',
        name: task.name || '',
        description: task.description || '',
        targetFiles: canonicalizeFilePaths(task.targetFiles),
        dependencies: canonicalizeTaskDependencies(task.dependencies || []),
        domain: task.domain || '',
        requirementIds: [...new Set(Array.isArray(task.requirementIds) ? task.requirementIds : [])].sort(),
        managementCoverage: (Array.isArray(task.managementCoverage) ? task.managementCoverage : [])
            .map(entry => JSON.stringify(canonicalizeCoverageValue(entry))).sort()
    };

    return crypto.createHash('sha256')
        .update(JSON.stringify(canonicalSpec))
        .digest('hex');
}

export async function computeInputHash(projectDir, dependencyTargetFiles = []) {
    const sortedFiles = canonicalizeFilePaths(dependencyTargetFiles);

    if (sortedFiles.length === 0) {
        return crypto.createHash('sha256').update('EMPTY_INPUT').digest('hex');
    }

    const hash = crypto.createHash('sha256');
    for (const relFile of sortedFiles) {
        if (!relFile || typeof relFile !== 'string') continue;
        const fullPath = path.join(projectDir, relFile);
        try {
            const content = await fs.readFile(fullPath);
            hash.update(`FILE:${relFile}:SIZE:${content.length}:DATA:`);
            hash.update(content);
        } catch {
            hash.update(`MISSING:${relFile}:`);
        }
    }

    return hash.digest('hex');
}

export async function computeOutputHash(projectDir, targetFiles = []) {
    const sortedFiles = canonicalizeFilePaths(targetFiles);

    if (sortedFiles.length === 0) {
        return crypto.createHash('sha256').update('EMPTY_OUTPUT').digest('hex');
    }

    const hash = crypto.createHash('sha256');
    for (const relFile of sortedFiles) {
        if (!relFile || typeof relFile !== 'string') continue;
        const fullPath = path.join(projectDir, relFile);
        try {
            const stat = await fs.stat(fullPath);
            if (stat.size === 0) {
                hash.update(`EMPTY:${relFile}:`);
            } else {
                const content = await fs.readFile(fullPath);
                hash.update(`FILE:${relFile}:SIZE:${stat.size}:DATA:`);
                hash.update(content);
            }
        } catch {
            hash.update(`MISSING:${relFile}:`);
        }
    }

    return hash.digest('hex');
}

export async function verifyTaskCheckpoint({
    projectDir,
    checkpoint,
    task,
    planHash,
    dependencyTargetFiles = [],
    expectedIdentity = null,
    gateVersion = '1.0.0'
}) {
    if (!checkpoint || typeof checkpoint !== 'object') {
        return false;
    }
    if (expectedIdentity && (checkpoint.project_id !== expectedIdentity.projectId
        || checkpoint.contract_id !== expectedIdentity.contractId
        || !expectedIdentity.taskIds.includes(checkpoint.task_id))) return false;

    if (checkpoint.status !== 'completed' || checkpoint.invalidated_at !== null) {
        return false;
    }

    if (planHash && checkpoint.plan_hash !== planHash) {
        return false;
    }

    if (gateVersion && checkpoint.gate_version !== gateVersion) {
        return false;
    }

    const currentSpecHash = computeTaskSpecHash(task);
    if (checkpoint.task_spec_hash !== currentSpecHash) {
        return false;
    }

    const currentInputHash = await computeInputHash(projectDir, dependencyTargetFiles);
    if (checkpoint.input_hash !== currentInputHash) {
        return false;
    }

    const targetFiles = canonicalizeFilePaths(task?.targetFiles);
    if (targetFiles.length === 0) {
        return false;
    }

    const currentOutputHash = await computeOutputHash(projectDir, targetFiles);
    if (checkpoint.output_hash !== currentOutputHash) {
        return false;
    }

    for (const relFile of targetFiles) {
        try {
            const stat = await fs.stat(path.join(projectDir, relFile));
            if (!stat.isFile() || stat.size === 0) {
                return false;
            }
        } catch {
            return false;
        }
    }

    return true;
}
