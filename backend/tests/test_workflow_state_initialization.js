import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const originalDbPath = process.env.DB_PATH;
const originalProjectsRoot = process.env.PROJECTS_ROOT;
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-state-init-'));
const tempDbPath = path.join(tempRoot, 'projects.db');
const tempProjectsRoot = path.join(tempRoot, 'projects');

process.env.DB_PATH = tempDbPath;
process.env.PROJECTS_ROOT = tempProjectsRoot;

try {
    const workflowModule = await import('../engine/workflow.js');
    const { normalizeWorkflowState } = workflowModule;

    console.log('1. normalizeWorkflowState(null) should return the empty workflow shape');
    const emptyState = normalizeWorkflowState(null);
    assert.deepStrictEqual(emptyState, {
        planHash: null,
        directorSpecs: {},
        teamleaderPlans: {}
    });

    console.log('2. normalizeWorkflowState should preserve existing workflow cache values');
    const directorSpecs = { frontend: { altTalimatname: 'Alt talimat' } };
    const teamleaderPlans = { 'frontend.tl': { tasks: [{ id: 't1', title: 'Task 1' }] } };
    const workflowState = {
        planHash: 'plan-hash-123',
        directorSpecs,
        teamleaderPlans
    };

    const normalized = normalizeWorkflowState(workflowState);
    assert.strictEqual(normalized.planHash, 'plan-hash-123');
    assert.strictEqual(normalized.directorSpecs, directorSpecs);
    assert.strictEqual(normalized.teamleaderPlans, teamleaderPlans);
    assert.deepStrictEqual(normalized, workflowState);

    console.log('3. normalizeWorkflowState should replace malformed arrays with empty maps');
    const malformed = normalizeWorkflowState({
        planHash: 'keep-me',
        directorSpecs: [],
        teamleaderPlans: []
    });
    assert.strictEqual(malformed.planHash, 'keep-me');
    assert.deepStrictEqual(malformed.directorSpecs, {});
    assert.deepStrictEqual(malformed.teamleaderPlans, {});

    console.log('workflow state initialization tests passed');
} finally {
    process.env.DB_PATH = originalDbPath;
    process.env.PROJECTS_ROOT = originalProjectsRoot;
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
