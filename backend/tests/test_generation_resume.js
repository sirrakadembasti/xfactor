import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTestHarness } from './testHarness.js';
import * as resumeStage from '../engine/resumeStage.js';
import { computePlanHash, normalizeWorkflowState, reconcilePlanningCache, executeProjectTasks } from '../engine/workflow.js';
import { normalizeManagerPlan } from '../agents/schemas.js';
import { createProject, deleteProject, getProjectDir } from '../projectRepository.js';
import { acquireWorkflowLease } from '../workflowAttempts.js';
import { abortProjectExecution } from '../engine/cancellation.js';
import { readProjectState } from '../engine/index.js';
import { db } from '../db.js';
import * as workflowEngine from '../engine/workflow.js';

const { runAsyncTest, finish } = createTestHarness();
const hash = 'a'.repeat(64);
const planHash = 'b'.repeat(64);
const contract = { id: 'approved-contract', contract_hash: hash };
const marker = { stage: 'generation_finished', contractId: contract.id, contractHash: hash, planHash };

await runAsyncTest('execution without a durable attempt cannot displace a live controller or dispatch', async () => {
    const { registerProjectAbortController, unregisterProjectAbortController, getProjectAbortSignal } = await import('../engine/cancellation.js');
    const project = await createProject({ title: 'Missing execution attempt' });
    const controller = new AbortController();
    try {
        db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(project.id);
        const plan = JSON.stringify({ summary: 'Approved React frontend', domains: [{ name: 'frontend', prefix: 'frontend' }] });
        db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
            VALUES (?,?,1,'approved',?,?)`).run(`contract-${project.id}`, project.id, plan, crypto.createHash('sha256').update(plan).digest('hex'));
        const lease = acquireWorkflowLease(project.id, 'authorized-owner');
        registerProjectAbortController(project.id, controller, { attemptId: lease.attempt.id, leaseOwner: 'authorized-owner' });
        const before = db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
        const events = [];
        await assert.rejects(executeProjectTasks(project.id, { publish(event) {
            events.push(event);
            if (event.action === 'start') throw new Error('Unscoped workflow reached provider dispatch');
        } }), /attempt.*owner|durable.*attempt/i);
        assert.equal(getProjectAbortSignal(project.id), controller.signal);
        assert.equal(controller.signal.aborted, false);
        assert.equal(events.length, 0);
        assert.deepEqual(db.prepare('SELECT * FROM projects WHERE id=?').get(project.id), before);
        await assert.rejects(fs.stat(path.join(getProjectDir(project.id), 'package.json')), { code: 'ENOENT' });
    } finally { unregisterProjectAbortController(project.id, controller); await deleteProject(project.id); }
});

await runAsyncTest('a new durable resume ignores cancellation of its predecessor and reaches dispatch', async () => {
    const project = await createProject({ title: 'Immediate resume cancellation provenance' });
    const directory = getProjectDir(project.id);
    try {
        const plan = normalizeManagerPlan({ summary: 'Approved resume', talimatname: '# Approved resume',
            domains: [{ name: 'frontend', prefix: 'frontend' }], management: { needed: false, reason: 'Static fixture' } });
        const json = JSON.stringify(plan);
        db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
            VALUES (?,?,1,'approved',?,?)`).run(`contract-${project.id}`, project.id, json, crypto.createHash('sha256').update(json).digest('hex'));
        db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(project.id);
        const oldLease = acquireWorkflowLease(project.id, 'resume-predecessor');
        abortProjectExecution(project.id, 'PAUSED'); // No local registration: cancellation came to another server process.
        const lease = acquireWorkflowLease(project.id, 'resume-successor');
        assert.notEqual(lease.attempt.id, oldLease.attempt.id);
        const events = [];
        await executeProjectTasks(project.id, { publish(event) {
            events.push(event);
            if (event.action === 'start' && /director/i.test(event.agent || '')) abortProjectExecution(project.id, 'PAUSED');
        } }, lease.attempt.id, 'resume-successor');
        assert.ok(events.some(event => event.action === 'start' && /director/i.test(event.agent || '')),
            'explicit resume with a fresh approved attempt must reach generation dispatch');
        assert.ok(await fs.stat(path.join(directory, 'package.json')));
    } finally { await deleteProject(project.id); }
});

await runAsyncTest('old workflow cleanup cannot unregister its replacement controller', async () => {
    const { registerProjectAbortController, unregisterProjectAbortController, getProjectAbortSignal } = await import('../engine/cancellation.js');
    const { releaseWorkflowLease } = await import('../workflowAttempts.js');
    const project = await createProject({ title: 'Controller ownership replacement' });
    const first = new AbortController(), second = new AbortController();
    try {
        const a = acquireWorkflowLease(project.id, 'controller-a');
        registerProjectAbortController(project.id, first, { attemptId: a.attempt.id, leaseOwner: 'controller-a' });
        releaseWorkflowLease(a.attempt.id, 'paused', { leaseOwner: 'controller-a' });
        const b = acquireWorkflowLease(project.id, 'controller-b');
        registerProjectAbortController(project.id, second, { attemptId: b.attempt.id, leaseOwner: 'controller-b' });
        unregisterProjectAbortController(project.id, first);
        assert.equal(getProjectAbortSignal(project.id), second.signal);
        abortProjectExecution(project.id, 'PAUSED');
        assert.equal(second.signal.aborted, true);
    } finally { unregisterProjectAbortController(project.id, second); await deleteProject(project.id); }
});

for (const status of ['planning', 'pending_approval']) {
    await runAsyncTest(`execution rejects persisted ${status} state without changing it or dispatching`, async () => {
        const project = await createProject({ title: `Ineligible execution ${status}` });
        try {
            const plan = normalizeManagerPlan({ summary: 'Approved fixture', domains: [{ name: 'frontend', prefix: 'frontend' }],
                management: { needed: false, reason: 'Static fixture' } });
            const json = JSON.stringify(plan);
            db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
                VALUES (?,?,1,'approved',?,?)`).run(`contract-${project.id}`, project.id, json, crypto.createHash('sha256').update(json).digest('hex'));
            db.prepare('UPDATE projects SET status=? WHERE id=?').run(status, project.id);
            const before = db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
            const lease = acquireWorkflowLease(project.id, 'ineligible-execution');
            const events = [];
            await assert.rejects(executeProjectTasks(project.id, { publish(event) {
                events.push(event);
                if (event.action === 'start') throw new Error('Ineligible execution reached dispatch');
            } }, lease.attempt.id, 'ineligible-execution'), /execution.*status|execution.*state/i);
            assert.deepEqual(db.prepare('SELECT * FROM projects WHERE id=?').get(project.id), before);
            assert.equal(events.length, 0);
            await assert.rejects(fs.stat(path.join(getProjectDir(project.id), 'package.json')), { code: 'ENOENT' });
        } finally { await deleteProject(project.id); }
    });
}

for (const contractStatus of ['missing', 'pending_approval', 'legacy plan only']) {
    await runAsyncTest(`workflow with ${contractStatus} contract stops before provider dispatch or source generation`, async () => {
        const project = await createProject({ title: `Unapproved execution denied ${contractStatus}` });
        try {
            if (contractStatus === 'pending_approval') db.prepare(`INSERT INTO project_contracts
                (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,1,'pending_approval','{}','draft-hash')`)
                .run(`draft-${project.id}`, project.id);
            if (contractStatus === 'legacy plan only') db.prepare('UPDATE projects SET plan=? WHERE id=?')
                .run(JSON.stringify({ summary: 'Unapproved legacy React plan', domains: [{ name: 'frontend', prefix: 'frontend' }] }), project.id);
            db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(project.id);
            const lease = acquireWorkflowLease(project.id, 'unapproved-execution');
            const before = db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
            const events = [];
            await assert.rejects(executeProjectTasks(project.id, { publish(event) {
                events.push(event);
                // Bound the old implementation before any paid provider can run.
                if (event.action === 'start') throw new Error('Unapproved workflow reached provider dispatch');
            } }, lease.attempt.id, 'unapproved-execution'), /approved contract|approval.*required/i);
            assert.deepEqual(db.prepare('SELECT * FROM projects WHERE id=?').get(project.id), before);
            assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project_contracts WHERE project_id=? AND status='approved'").get(project.id).count, 0,
                'failure handling must never import a legacy plan as approved');
            assert.equal(events.some(event => event.action === 'start'), false);
            await assert.rejects(fs.stat(path.join(getProjectDir(project.id), 'package.json')), { code: 'ENOENT' });
            for (const table of ['task_checkpoints', 'artifacts', 'completion_receipts']) {
                assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id=?`).get(project.id).count, 0);
            }
        } finally { await deleteProject(project.id); }
    });
}

for (const boundary of ['state commit', 'provider failure']) {
    await runAsyncTest(`superseded execution cannot overwrite replacement workflow on ${boundary}`, async () => {
        const project = await createProject({ title: `Superseded workflow ${boundary}` });
        try {
            const plan = normalizeManagerPlan({ summary: 'Approved React frontend', talimatname: '# Approved React frontend',
                domains: [{ name: 'frontend', prefix: 'frontend' }], management: { needed: false, reason: 'Static fixture' } });
            const contractId = `contract-${project.id}`;
            const json = JSON.stringify(plan), contractHash = crypto.createHash('sha256').update(json).digest('hex');
            db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
                VALUES (?,?,1,'approved',?,?)`).run(contractId, project.id, json, contractHash);
            db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(project.id);
            const lease = acquireWorkflowLease(project.id, 'superseded-owner');
            let replacementState, replacementChats;
            await executeProjectTasks(project.id, { publish(event) {
                const target = boundary === 'state commit' ? event.agent === 'Manager' : /director/i.test(event.agent || '');
                if (event.action !== 'start' || !target) return;
                db.prepare("UPDATE project_contracts SET status='superseded' WHERE id=?").run(contractId);
                db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
                    VALUES (?,?,2,'approved',?,?)`).run(`new-${contractId}`, project.id, json, 'replacement-hash');
                db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run('{"replacementCache":true}', project.id);
                replacementState = db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
                replacementChats = db.prepare('SELECT * FROM chat_history WHERE project_id=?').all(project.id);
                if (boundary === 'provider failure') throw new Error('Old provider returned after replacement');
            } }, lease.attempt.id, 'superseded-owner');
            assert.ok(replacementState, 'fixture must reach the intended real workflow boundary');
            assert.deepEqual(db.prepare('SELECT * FROM projects WHERE id=?').get(project.id), replacementState);
            assert.deepEqual(db.prepare('SELECT * FROM chat_history WHERE project_id=?').all(project.id), replacementChats);
            assert.equal(db.prepare('SELECT COUNT(*) AS count FROM completion_receipts WHERE project_id=?').get(project.id).count, 0);
        } finally { await deleteProject(project.id); }
    });
}

await runAsyncTest('generation resume requires an exact complete approved-contract marker', async () => {
    assert.equal(typeof resumeStage.resolveGenerationResume, 'function');
    assert.equal(resumeStage.resolveGenerationResume(marker, contract, planHash), true);
    for (const invalid of [null, [], {}, { ...marker, stage: 'generation' }, { ...marker, contractId: 'old' },
        { ...marker, contractHash: 'old' }, { ...marker, planHash: 'old' }]) {
        assert.equal(resumeStage.resolveGenerationResume(invalid, contract, planHash), false);
    }
    assert.equal(resumeStage.resolveGenerationResume(marker, null, planHash), false);
    assert.equal(resumeStage.resolveGenerationResume(marker, { ...contract, contract_hash: 'c'.repeat(64) }, planHash), false);
    assert.equal(resumeStage.resolveGenerationResume(marker, contract, 'd'.repeat(64)), false);
});

await runAsyncTest('normalization preserves generation completion but a revised plan clears it', async () => {
    const plan = { summary: 'Approved generation' };
    const completion = { ...marker, planHash: computePlanHash(plan) };
    const workflow = { planHash: completion.planHash, generationCompletion: completion };
    assert.deepEqual(normalizeWorkflowState(workflow).generationCompletion, completion);
    assert.deepEqual(reconcilePlanningCache(workflow, plan).generationCompletion, completion);
    assert.ok(!reconcilePlanningCache(workflow, { summary: 'Revised generation' }).generationCompletion);
});

await runAsyncTest('marked normal workflow resume keeps repaired source and reaches fresh Tester without replaying generation', async () => {
    for (const mode of ['marked', 'malformed', 'generation-finishes']) {
    const validMarker = mode === 'marked';
    const project = await createProject({ title: `${mode} generation resume fixture` });
    const directory = getProjectDir(project.id);
    try {
        const plan = normalizeManagerPlan({ summary: 'Vite React static fixture', talimatname: '# Static fixture',
            domains: [{ name: 'frontend', prefix: 'frontend' }],
            requirements: [{ id: 'REQ-1', statement: 'Keep the source implementation', mandatory: true }],
            management: { needed: false, reason: 'Static fixture has no managed data.' } });
        const contractId = `contract-${crypto.randomUUID()}`;
        const json = JSON.stringify(plan);
        const contractHash = crypto.createHash('sha256').update(json).digest('hex');
        const planHash = computePlanHash(plan);
        await fs.mkdir(path.join(directory, 'src'), { recursive: true });
        await fs.writeFile(path.join(directory, 'package.json'), '{"name":"generation-resume","version":"1.0.0"}');
        const repairedSource = 'export const manuallyRepairedValue = 42;\n';
        await fs.writeFile(path.join(directory, 'src/entry.js'), repairedSource);
        // The completed frontend fixture includes its actual runnable roots.
        await fs.writeFile(path.join(directory, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
        await fs.writeFile(path.join(directory, 'src/main.tsx'), "import App from './App'; export default App;");
        await fs.writeFile(path.join(directory, 'src/App.tsx'), 'export default function App() { return null; }');
        const { collectArtifactFiles } = await import('../artifactInventory.js');
        const artifactHash = resumeStage.fingerprintArtifactFiles(await collectArtifactFiles(directory));
        db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
            VALUES (?,?,1,'approved',?,?)`).run(contractId, project.id, json, contractHash);
        const workflow = mode === 'generation-finishes' ? { planHash,
            directorSpecs: { frontend: { domain: 'frontend', altTalimatname: '# Frontend source',
                teamleaders: [{ name: 'Frontend helper', prefix: 'helper', mission: 'Implement the static helper' }] } },
            teamleaderPlans: { 'frontend.helper': { tasks: [{ id: 'source-task', title: 'Source task', description: 'Implement the source helper',
                targetFiles: ['src/entry.js'], dependencies: [], requirementIds: ['REQ-1'] }] } }
        } : { planHash, generationCompletion: { stage: validMarker ? 'generation_finished' : 'malformed', contractId, contractHash, planHash },
            // A valid old dependency marker must not bypass the fresh quality pass.
            dependencyPreparation: { stage: 'dependency_preparation', contractId, contractHash, artifactHash } };
        if (mode === 'generation-finishes') {
            const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
            const { computeTaskSpecHash, computeInputHash, computeOutputHash } = await import('../engine/checkpointHelper.js');
            const task = workflow.teamleaderPlans['frontend.helper'].tasks[0];
            saveCheckpoint({ projectId: project.id, contractId, taskId: task.id, planHash: contractHash,
                taskSpecHash: computeTaskSpecHash(task), inputHash: await computeInputHash(directory, []),
                outputHash: await computeOutputHash(directory, task.targetFiles) });
        }
        db.prepare(`UPDATE projects SET status='implementing', workflow_state=? WHERE id=?`).run(JSON.stringify(workflow), project.id);
        const owner = 'generation-resume-test';
        const lease = acquireWorkflowLease(project.id, owner);
        const events = [];
        await executeProjectTasks(project.id, { publish(event) {
            events.push(event);
            // Stop at the next agent boundary; this test never calls a provider.
            if (event.action === 'start' && /director|teamleader|coder|tester/i.test(event.agent || '')) {
                abortProjectExecution(project.id, 'PAUSED');
            }
        } }, lease.attempt.id, owner);
        if (validMarker || mode === 'generation-finishes') {
            assert.ok(events.some(event => event.action === 'start' && /tester/i.test(event.agent || '')),
                JSON.stringify(events.map(event => ({ agent: event.agent, action: event.action, message: event.message }))));
            assert.ok(!events.some(event => /director|teamleader|coder/i.test(event.agent || '') && event.action === 'start'),
                'completed generation must not invoke a generation agent');
            const persisted = JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(project.id).workflow_state);
            assert.deepEqual(persisted.generationCompletion, { stage: 'generation_finished', contractId, contractHash, planHash },
                'the normal completed DAG must persist the marker before acceptance begins');
            if (mode === 'generation-finishes') {
                const projected = db.prepare(`SELECT ct.task_spec_json, r.stable_key AS requirementKey
                    FROM contract_tasks ct JOIN requirement_task_links rtl
                      ON rtl.contract_id = ct.contract_id AND rtl.task_id = ct.id
                    JOIN requirements r ON r.contract_id = rtl.contract_id AND r.id = rtl.requirement_id
                    WHERE ct.contract_id = ?`).all(contractId);
                assert.ok(projected.some(row => JSON.parse(row.task_spec_json).executionTaskId === 'source-task'
                    && row.requirementKey === 'REQ-1'), 'real generation must project its execution task and requirement link');
            }
        } else {
            assert.ok(events.some(event => event.action === 'start' && /director/i.test(event.agent || '')),
                'a malformed generation marker must use the normal DAG path: ' + JSON.stringify(events.map(event => ({ agent: event.agent, action: event.action, message: event.message }))));
            assert.ok(!events.some(event => event.action === 'resume'), 'malformed generation cannot use an older dependency shortcut');
        }
        assert.equal(await fs.readFile(path.join(directory, 'src/entry.js'), 'utf8'), repairedSource);
    } finally {
        await deleteProject(project.id);
    }
    }
});

await runAsyncTest('normal workflow invalidates only incomplete frontend TL cache and preserves 25 backend checkpoints', async () => {
    const project = await createProject({ title: 'Scoped frontend runtime replan fixture' });
    const directory = getProjectDir(project.id);
    try {
        const plan = normalizeManagerPlan({ summary: 'Vite React frontend with existing backend', talimatname: '# React Vite',
            domains: [{ name: 'Backend', prefix: 'backend' }, { name: 'Frontend', prefix: 'frontend' }],
            requirements: [{ id: 'REQ-1', statement: 'Implement the approved application', mandatory: true }],
            management: { needed: false, reason: 'Isolated runtime planning fixture.' } });
        const contractId = `contract-${crypto.randomUUID()}`;
        const json = JSON.stringify(plan);
        const contractHash = crypto.createHash('sha256').update(json).digest('hex');
        await fs.mkdir(path.join(directory, 'src/backend'), { recursive: true });
        await fs.writeFile(path.join(directory, 'package.json'), '{"name":"scoped-runtime","version":"1.0.0"}');
        const backend = { tasks: Array.from({ length: 25 }, (_, index) => ({ id: `backend-${index}`, title: `Backend ${index}`,
            description: 'Existing approved backend implementation', targetFiles: [`src/backend/task${index}.ts`],
            dependencies: [], requirementIds: ['REQ-1'] })) };
        const workflow = { planHash: computePlanHash(plan), directorSpecs: {}, teamleaderPlans: {
            'backend.domain': backend, 'frontend.domain': { tasks: [{ id: 'fragment', title: 'Fragment', description: 'Resource fragment',
                targetFiles: ['src/components/Fragment.tsx'], dependencies: [], requirementIds: ['REQ-1'] }] }
        } };
        for (const domain of ['backend', 'frontend']) workflow.directorSpecs[domain] = { domain, altTalimatname: '# Approved domain',
            teamleaders: [{ name: `${domain} leader`, prefix: 'domain', mission: `Implement ${domain}` }] };
        db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
            VALUES (?,?,1,'approved',?,?)`).run(contractId, project.id, json, contractHash);
        const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
        const { computeTaskSpecHash, computeInputHash, computeOutputHash } = await import('../engine/checkpointHelper.js');
        for (const task of backend.tasks) {
            await fs.writeFile(path.join(directory, task.targetFiles[0]), `export const value${task.id.replace('-', '')} = 42;\n`);
            saveCheckpoint({ projectId: project.id, contractId, taskId: task.id, planHash: contractHash,
                taskSpecHash: computeTaskSpecHash(task), inputHash: await computeInputHash(directory, []),
                outputHash: await computeOutputHash(directory, task.targetFiles) });
        }
        const checkpointsBefore = db.prepare('SELECT * FROM task_checkpoints WHERE project_id=? ORDER BY task_id').all(project.id);
        db.prepare("UPDATE projects SET status='implementing', workflow_state=? WHERE id=?").run(JSON.stringify(workflow), project.id);
        const owner = 'frontend-runtime-replan-test';
        const lease = acquireWorkflowLease(project.id, owner);
        const events = [];
        await executeProjectTasks(project.id, { publish(event) {
            events.push(event);
            // Abort before provider access. The invalidation must already be persisted.
            if (event.action === 'start' && /director|teamleader|coder|tester/i.test(event.agent || '')) abortProjectExecution(project.id, 'PAUSED');
        } }, lease.attempt.id, owner);
        assert.ok(events.some(event => event.agent === 'Teamleader' && event.action === 'start'), JSON.stringify(events));
        assert.ok(!events.some(event => event.action === 'delegate'), 'all 25 valid backend checkpoints must skip generation');
        const persisted = JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(project.id).workflow_state);
        assert.deepEqual(persisted.teamleaderPlans['backend.domain'], backend);
        assert.ok(!persisted.teamleaderPlans['frontend.domain'], 'only the invalid frontend cache must be removed before planning');
        assert.deepEqual(persisted.directorSpecs, workflow.directorSpecs);
        assert.equal(persisted.planHash, workflow.planHash);
        assert.deepEqual(db.prepare('SELECT * FROM task_checkpoints WHERE project_id=? ORDER BY task_id').all(project.id), checkpointsBefore);
        assert.equal(db.prepare('SELECT contract_hash FROM project_contracts WHERE id=?').get(contractId).contract_hash, contractHash);
    } finally { await deleteProject(project.id); }
});

await runAsyncTest('normal workflow rejects cached backend infrastructure-only coverage before any Coder delegation', async () => {
    for (const malformedCache of [false, true]) {
    const project = await createProject({ title: `Backend domain coverage replan fixture ${malformedCache ? 'malformed' : 'infrastructure'}` });
    const directory = getProjectDir(project.id);
    try {
        const plan = normalizeManagerPlan({ summary: 'React Vite with Express backend', talimatname: '# Backend API',
            domains: [{ name: 'Backend', prefix: 'backend' }], requirements: [{ id: 'REQ-1', statement: 'Backend foundation', mandatory: true }],
            management: { needed: true, reason: 'Managed inventory', authentication: { login: '/login', apiLogin: { path: '/api/login' }, accountProvisioning: 'Admin invitation', publicRegistration: false },
                resources: [{ name: 'Room', operations: ['read'], readAccess: 'authenticated', uiPath: '/rooms', apiPath: '/api/rooms' }],
                roles: [{ name: 'admin', permissions: [{ resource: 'Room', operations: ['read'] }], demoUser: { username: 'admin-fixture', setup: 'isolated-test-seed' },
                    journeys: { positive: ['Read rooms'], negative: ['Deny anonymous access'] } }] },
            browser: { roleJourneys: ['positive', 'negative'].map(kind => ({ role: 'admin', kind, authState: kind === 'positive' ? 'authenticated' : 'anonymous',
                steps: [{ action: 'click', selector: '#rooms' }], expectedOutcome: { kind: kind === 'positive' ? 'success' : 'denied', text: kind === 'positive' ? 'Rooms' : 'Access denied' } })) } });
        const json = JSON.stringify(plan), contractId = `contract-${crypto.randomUUID()}`;
        const contractHash = crypto.createHash('sha256').update(json).digest('hex');
        const infrastructure = { tasks: ['prisma/schema.prisma', 'src/lib/prisma.ts'].map((target, index) => ({ id: `infra${index}`, title: 'Existing infrastructure',
            description: 'Existing implementation', targetFiles: [target], dependencies: [], requirementIds: ['REQ-1'] })) };
        const otherPlan = { tasks: [{ id: 'unrelated', title: 'Unrelated', targetFiles: ['src/pages/Other.tsx'], requirementIds: ['REQ-1'] }] };
        if (malformedCache) infrastructure.tasks = [null];
        const workflow = { planHash: computePlanHash(plan), directorSpecs: { backend: { domain: 'backend', altTalimatname: '# Backend',
            teamleaders: [{ name: 'Backend leader', prefix: 'lead', mission: 'Implement the API' }] } }, teamleaderPlans: { 'backend.lead': infrastructure, 'frontend.other': otherPlan } };
        await fs.mkdir(path.join(directory, 'src/routes'), { recursive: true });
        await fs.writeFile(path.join(directory, 'src/routes/rooms.ts'), 'export const rooms = [];\n');
        db.prepare("INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,1,'approved',?,?)").run(contractId, project.id, json, contractHash);
        db.prepare("UPDATE projects SET status='implementing', workflow_state=? WHERE id=?").run(JSON.stringify(workflow), project.id);
        const owner = 'backend-domain-coverage-test', lease = acquireWorkflowLease(project.id, owner), events = [];
        const { getAgent } = await import('../agents/index.js');
        const agent = getAgent('teamleader'), originalBuildPrompt = agent.buildPrompt;
        let planningContext;
        agent.buildPrompt = (...args) => { planningContext = args[4]; return originalBuildPrompt(...args); };
        try {
        await executeProjectTasks(project.id, { publish(event) {
            events.push(event);
            if (event.action === 'start' && /director|teamleader|coder|tester/i.test(event.agent || '')) abortProjectExecution(project.id, 'PAUSED');
        } }, lease.attempt.id, owner);
        } finally { agent.buildPrompt = originalBuildPrompt; }
        assert.ok(planningContext, 'malformed cache must still construct the real Teamleader prompt');
        if (malformedCache) assert.deepEqual(planningContext.previousTasks, []);
        assert.ok(events.some(event => event.agent === 'Teamleader' && event.action === 'start'), JSON.stringify(events) + JSON.stringify((await readProjectState(project.id)).last_error));
        assert.ok(!events.some(event => event.action === 'delegate'), 'the missing API coverage must be detected before expensive Coder work');
        const persisted = JSON.parse(db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(project.id).workflow_state);
        assert.ok(!persisted.teamleaderPlans['backend.lead']);
        assert.deepEqual(persisted.teamleaderPlans['frontend.other'], otherPlan);
        assert.deepEqual(persisted.directorSpecs, workflow.directorSpecs);
        assert.equal(persisted.planHash, workflow.planHash);
        assert.equal(db.prepare('SELECT contract_hash FROM project_contracts WHERE id=?').get(contractId).contract_hash, contractHash);
        assert.ok(!events.some(event => /Cannot read properties of null|\.map is not a function/.test(event.message || '')),
            'malformed cached tasks must not crash planning hint construction');
    } finally { await deleteProject(project.id); }
    }
});

await runAsyncTest('Tester advisory resume repairs only its mapped source and records its paid attempt before calling Coder', async () => {
    assert.equal(typeof workflowEngine.executeTesterAdvisoryRepairs, 'function');
    const project = await createProject({ title: 'Mapped advisory repair fixture' });
    const directory = getProjectDir(project.id);
    try {
        await fs.mkdir(path.join(directory, 'src'), { recursive: true });
        await fs.writeFile(path.join(directory, 'src/price.js'), 'export const price = 100;');
        await fs.writeFile(path.join(directory, 'src/untouched.js'), 'export const untouched = true;');
        const files = [{ path: 'package.json', content: '{"name":"advisory-fixture"}' },
            { path: 'src/price.js', content: 'export const price = 100;' },
            { path: 'src/untouched.js', content: 'export const untouched = true;' }];
        const completion = { ...marker };
        const workflow = { generationCompletion: completion, teamleaderPlans: { unchanged: { tasks: [] } } };
        let calls = 0, saved = 0;
        const result = await workflowEngine.executeTesterAdvisoryRepairs({
            projectDir: directory, contractId: contract.id, contractHash: hash, workflow,
            repairIssues: [{ id: 'old-issue', detail_json: JSON.stringify({ issue: '`src/price.js`: apply the approved discount.' }) }],
            generatedProjectFiles: files, repairTargetFiles: ['src/price.js'],
            persistWorkflow: async () => { saved++; },
            callAgent: async (role, prompt) => {
                calls++;
                assert.equal(role, 'coder');
                assert.equal(saved, 1, 'consume the durable retry budget before a paid call');
                assert.match(prompt, /apply the approved discount/);
                assert.match(prompt, /price = 100/);
                return { files: [{ path: 'src/price.js', content: 'export const price = 90;' }] };
            }
        });
        assert.equal(calls, 1);
        assert.equal(result.requiresFreshAcceptance, true, 'a write must not resolve a semantic Tester finding');
        assert.equal(await fs.readFile(path.join(directory, 'src/price.js'), 'utf8'), 'export const price = 90;');
        assert.equal(await fs.readFile(path.join(directory, 'src/untouched.js'), 'utf8'), 'export const untouched = true;');
        assert.deepEqual(workflow.generationCompletion, completion);
        assert.deepEqual(normalizeWorkflowState(workflow).testerAdvisoryRepairs, workflow.testerAdvisoryRepairs);
    } finally { await deleteProject(project.id); }
});

await runAsyncTest('Tester advisory pause after provider response never writes its returned patch', async () => {
    const project = await createProject({ title: 'Cancelled advisory repair fixture' });
    const directory = getProjectDir(project.id);
    try {
        await fs.mkdir(path.join(directory, 'src'), { recursive: true });
        const source = 'export const price = 100;';
        await fs.writeFile(path.join(directory, 'src/price.js'), source);
        const controller = new AbortController();
        const workflow = {};
        await assert.rejects(workflowEngine.executeTesterAdvisoryRepairs({
            projectDir: directory, contractId: contract.id, contractHash: hash, workflow,
            repairIssues: [{ detail_json: JSON.stringify({ issue: 'src/price.js: apply discount.' }) }],
            generatedProjectFiles: [{ path: 'src/price.js', content: source }], repairTargetFiles: ['src/price.js'],
            persistWorkflow: async () => {}, signal: controller.signal,
            callAgent: async () => {
                controller.abort('PAUSED');
                return { files: [{ path: 'src/price.js', content: 'export const price = 90;' }] };
            }
        }), /iptal|abort/i);
        assert.equal(await fs.readFile(path.join(directory, 'src/price.js'), 'utf8'), source);
        assert.equal(workflow.testerAdvisoryRepairs.length, 1, 'already-paid calls retain their retry record');
    } finally { await deleteProject(project.id); }
});

await runAsyncTest('Tester advisory resume stops unchanged paid retries and never expands an ambiguous or unknown target', async () => {
    assert.equal(typeof workflowEngine.executeTesterAdvisoryRepairs, 'function');
    const project = await createProject({ title: 'Bounded advisory repair fixture' });
    const directory = getProjectDir(project.id);
    try {
        await fs.mkdir(path.join(directory, 'src'), { recursive: true });
        await fs.writeFile(path.join(directory, 'src/a.js'), 'export const a = 1;');
        await fs.writeFile(path.join(directory, 'src/b.js'), 'export const b = 2;');
        const files = [{ path: 'src/a.js', content: 'export const a = 1;' }, { path: 'src/b.js', content: 'export const b = 2;' }];
        let calls = 0;
        const workflow = {};
        const base = { projectDir: directory, contractId: contract.id, contractHash: hash, workflow,
            generatedProjectFiles: files, repairTargetFiles: ['src/a.js', 'src/b.js'], persistWorkflow: async () => {},
            callAgent: async () => { calls++; return { files: [{ path: 'src/a.js', content: 'export const a = 1;' }] }; } };
        const issue = { detail_json: JSON.stringify({ issue: 'src/a.js: implement the approved calculation.' }) };
        await assert.rejects(workflowEngine.executeTesterAdvisoryRepairs({ ...base, repairIssues: [issue] }), /revision|revizyon|değiş/i);
        assert.equal(calls, 1);
        await assert.rejects(workflowEngine.executeTesterAdvisoryRepairs({ ...base, repairIssues: [{ ...issue, id: 'duplicate-row-new-id' }] }), /revision|revizyon|tekrar/i);
        assert.equal(calls, 1, 'same issue and input must never pay twice even with a new database row id');
        for (const text of ['No concrete file was identified.', 'src/a.js and src/b.js disagree.', '../outside.js: modify this.', 'src/unknown.js: missing behavior.']) {
            await assert.rejects(workflowEngine.executeTesterAdvisoryRepairs({ ...base,
                repairIssues: [{ detail_json: JSON.stringify({ issue: text }) }] }), /revision|revizyon|hedef/i);
        }
        assert.equal(calls, 1, 'unsafe or ambiguous reports must stop before Coder');
        assert.equal(await fs.readFile(path.join(directory, 'src/a.js'), 'utf8'), 'export const a = 1;');
        let cappedCalls = 0, cappedPersists = 0;
        const cappedWorkflow = { testerAdvisoryRepairs: Array.from({ length: 63 }, (_, index) => ({ issueFingerprint: `prior-${index}` })) };
        await assert.rejects(workflowEngine.executeTesterAdvisoryRepairs({ ...base, workflow: cappedWorkflow,
            repairIssues: ['src/a.js: correct its calculation.', 'src/b.js: correct its calculation.']
                .map(issue => ({ detail_json: JSON.stringify({ issue }) })),
            persistWorkflow: async () => { cappedPersists++; },
            callAgent: async () => { cappedCalls++; throw new Error('budget preflight must prevent provider access'); }
        }), /revizyon|bütçe/i);
        assert.equal(cappedCalls, 0, 'the complete two-target repair must fit before any paid call');
        assert.equal(cappedPersists, 0, 'a rejected batch must not consume partial retry records');
        assert.equal(cappedWorkflow.testerAdvisoryRepairs.length, 63);
        assert.equal(await fs.readFile(path.join(directory, 'src/a.js'), 'utf8'), 'export const a = 1;');
        assert.equal(await fs.readFile(path.join(directory, 'src/b.js'), 'utf8'), 'export const b = 2;');
        let currentCalls = 0;
        const revisedWorkflow = { testerAdvisoryRepairs: Array.from({ length: 63 }, (_, index) => ({
            contractId: 'superseded-contract', issueFingerprint: `historical-${index}`
        })) };
        const currentResult = await workflowEngine.executeTesterAdvisoryRepairs({ ...base, workflow: revisedWorkflow,
            generatedProjectFiles: files.map(file => ({ ...file })),
            repairIssues: ['src/a.js: correct its calculation.', 'src/b.js: correct its calculation.']
                .map(issue => ({ detail_json: JSON.stringify({ issue }) })),
            callAgent: async (_role, prompt) => {
                currentCalls++;
                const target = prompt.includes('"src/a.js"') ? 'src/a.js' : 'src/b.js';
                return { files: [{ path: target, content: target === 'src/a.js' ? 'export const a = 3;' : 'export const b = 4;' }] };
            }
        });
        assert.equal(currentCalls, 2, 'superseded-contract attempts must not consume current contract budget');
        assert.equal(currentResult.requiresFreshAcceptance, true);
        assert.equal(revisedWorkflow.testerAdvisoryRepairs.length, 2);
        assert.ok(revisedWorkflow.testerAdvisoryRepairs.every(entry => entry.contractId === contract.id));
        assert.equal(await fs.readFile(path.join(directory, 'src/a.js'), 'utf8'), 'export const a = 3;');
        assert.equal(await fs.readFile(path.join(directory, 'src/b.js'), 'utf8'), 'export const b = 4;');
    } finally { await deleteProject(project.id); }
});

await runAsyncTest('same-contract unmappable Tester veto stops before another Tester call while old-contract issues are ignored', async () => {
    for (const sameContract of [true, false]) {
        const project = await createProject({ title: `Advisory routing fixture ${sameContract}` });
        const directory = getProjectDir(project.id);
        try {
            const plan = normalizeManagerPlan({ summary: 'Vite React static fixture', talimatname: '# Static fixture',
                domains: [{ name: 'frontend', prefix: 'frontend' }], requirements: [{ id: 'REQ-1', statement: 'Static fixture', mandatory: true }],
                management: { needed: false, reason: 'No managed data.' } });
            const contractId = `contract-${crypto.randomUUID()}`, oldId = `old-${crypto.randomUUID()}`;
            const json = JSON.stringify(plan), contractHash = crypto.createHash('sha256').update(json).digest('hex');
            for (const [id, revision, status] of [[oldId, 1, 'superseded'], [contractId, 2, 'approved']]) {
                db.prepare('INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,?,?,?,?)')
                    .run(id, project.id, revision, status, json, contractHash);
            }
            await fs.mkdir(path.join(directory, 'src'), { recursive: true });
            await fs.writeFile(path.join(directory, 'package.json'), '{"name":"advisory-routing"}');
            await fs.writeFile(path.join(directory, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
            await fs.writeFile(path.join(directory, 'src/main.tsx'), "import App from './App'; export default App;");
            await fs.writeFile(path.join(directory, 'src/App.tsx'), 'export default function App() { return null; }');
            const generationCompletion = { stage: 'generation_finished', contractId, contractHash, planHash: computePlanHash(plan) };
            db.prepare("UPDATE projects SET status='implementing', workflow_state=? WHERE id=?")
                .run(JSON.stringify({ planHash: computePlanHash(plan), generationCompletion }), project.id);
            const owner = 'advisory-routing', lease = acquireWorkflowLease(project.id, owner);
            db.prepare(`INSERT INTO repair_issues (id,project_id,contract_id,run_id,fingerprint,severity,status,detail_json,attempt_id,origin)
                VALUES (?,?,?,NULL,?,'critical','open',?,?,'static_audit')`).run(`repair-${crypto.randomUUID()}`, project.id,
                    sameContract ? contractId : oldId, 'semantic-no-path', JSON.stringify({ issue: 'The required journey is incomplete; identify its file in a revision.' }), lease.attempt.id);
            const events = [];
            await executeProjectTasks(project.id, { publish(event) {
                events.push(event);
                if (event.action === 'start' && /tester|coder|director|teamleader/i.test(event.agent || '')) abortProjectExecution(project.id, 'PAUSED');
            } }, lease.attempt.id, owner);
            assert.equal(events.some(event => event.action === 'start' && event.agent === 'Tester'), !sameContract,
                'only same-contract pending veto must stop the blind Tester retry');
            const persisted = await readProjectState(project.id);
            if (sameContract) assert.match(persisted.last_error, /revizyon|hedef/i);
            assert.deepEqual(persisted.workflow.generationCompletion, generationCompletion);
            assert.equal(await fs.readFile(path.join(directory, 'src/App.tsx'), 'utf8'), 'export default function App() { return null; }');
        } finally { await deleteProject(project.id); }
    }
});

finish();
