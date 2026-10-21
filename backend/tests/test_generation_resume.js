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

const { runAsyncTest, finish } = createTestHarness();
const hash = 'a'.repeat(64);
const planHash = 'b'.repeat(64);
const contract = { id: 'approved-contract', contract_hash: hash };
const marker = { stage: 'generation_finished', contractId: contract.id, contractHash: hash, planHash };

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

finish();
