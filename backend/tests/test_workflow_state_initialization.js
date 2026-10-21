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
    const { normalizeWorkflowState, restoreDirectorSpecFromDisk, buildExecutionDAG } = workflowModule;

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

    console.log('4. restoreDirectorSpecFromDisk reuses a matching teamleader plan and disk spec');
    const directorDir = path.join(tempRoot, 'manager', 'frontend.director');
    await fs.mkdir(path.join(directorDir, 'domain'), { recursive: true });
    await fs.writeFile(path.join(directorDir, 'domain', 'TODO.md'), '# existing tasks');
    const restored = restoreDirectorSpecFromDisk(
        { name: 'frontend', prefix: 'frontend' },
        '# Existing frontend architecture',
        directorDir,
        { 'frontend.domain': { tasks: [{ id: 'task-1' }] } }
    );
    assert.strictEqual(restored.altTalimatname, '# Existing frontend architecture');
    assert.deepStrictEqual(restored.teamleaders.map(tl => tl.prefix), ['domain']);

    console.log('5. cached canonical task obligations reach Coder fixtures and browser selectors through the execution DAG');
    const { normalizeTeamleaderTasks } = await import('../agents/schemas.js');
    const { formatManagementTaskDescription } = await import('../agents/director.js');
    const { restoreTaskTargetsFromProtocol } = await import('../services/reconciliationService.js');
    const contract = {
        requirements: [{ id: 'MGMT-RESOURCE-1', statement: 'Create rooms with persistent API results.' },
            { id: 'MGMT-ROLE-1', statement: 'Admin creates rooms using accessible controls.' }],
        management: {
            resources: [{ name: 'Room', verification: { identityField: 'roomNumber', createBody: { roomNumber: '{nonce}' } } }],
            roles: [{ name: 'admin' }], authentication: { apiLogin: { path: '/api/auth/login' } }
        },
        browser: { roleJourneys: [{ role: 'admin', kind: 'positive',
            steps: [{ action: 'click', selector: '#actual-create-room' }], expectedOutcome: { kind: 'success', text: 'Room saved' } }] }
    };
    const cachedPlan = normalizeTeamleaderTasks({ tasks: [
        { id: 'room-api', description: 'Implement room creation', targetFiles: ['src/routes/rooms.ts'],
            requirementIds: ['MGMT-RESOURCE-1'], managementCoverage: [{ requirementId: 'MGMT-RESOURCE-1', surface: 'api', operation: 'create' }] },
        { id: 'admin-room-ui', description: 'Implement admin create journey', dependencies: ['room-api'], targetFiles: ['src/components/Rooms.tsx'],
            requirementIds: ['MGMT-ROLE-1'], managementCoverage: [{ requirementId: 'MGMT-ROLE-1', journey: 'positive' }] }
    ] }, contract.requirements);
    const restoredTasks = restoreTaskTargetsFromProtocol(directorDir, cachedPlan.tasks);
    const executionDag = buildExecutionDAG(restoredTasks);
    assert.deepStrictEqual(executionDag.getTask('room-api').requirementIds, ['MGMT-RESOURCE-1']);
    assert.match(formatManagementTaskDescription(executionDag.getTask('room-api'), contract), /"roomNumber":"\{nonce\}"/);
    const uiDescription = formatManagementTaskDescription(executionDag.getTask('admin-room-ui'), contract);
    assert.match(uiDescription, /#actual-create-room/);
    assert.match(uiDescription, /\/api\/auth\/login/);
    assert.match(uiDescription, /Room saved/);
    assert.deepStrictEqual(executionDag.getExecutionOrder(), ['room-api', 'admin-room-ui']);

    console.log('6. legacy and revised planning caches cannot revive obsolete disk tasks');
    const { reconcilePlanningCache, computePlanHash } = workflowModule;
    const legacyCache = { planHash: '0123456789abcdef', directorSpecs, teamleaderPlans,
        dependencyPreparation: { status: 'completed' } };
    const migrated = reconcilePlanningCache(legacyCache, contract);
    assert.deepStrictEqual(migrated.directorSpecs, {});
    assert.deepStrictEqual(migrated.teamleaderPlans, {});
    assert.equal(migrated.dependencyPreparation, null);
    assert.equal(migrated.planHash, computePlanHash(contract));
    const unversioned = reconcilePlanningCache({ directorSpecs, teamleaderPlans }, contract);
    assert.deepStrictEqual(unversioned.teamleaderPlans, {});
    const currentCache = { ...legacyCache, planHash: computePlanHash(contract) };
    const retained = reconcilePlanningCache(currentCache, contract);
    assert.strictEqual(retained.directorSpecs, directorSpecs);
    assert.strictEqual(retained.teamleaderPlans, teamleaderPlans);
    const revised = structuredClone(contract);
    revised.management.resources[0].verification.createBody.capacity = 2;
    assert.deepStrictEqual(reconcilePlanningCache(currentCache, revised).teamleaderPlans, {});

    console.log('workflow state initialization tests passed');
} finally {
    process.env.DB_PATH = originalDbPath;
    process.env.PROJECTS_ROOT = originalProjectsRoot;
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
