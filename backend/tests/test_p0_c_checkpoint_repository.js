import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-c-checkpoints');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. task_checkpoints table should have correct columns and composite primary key', async () => {
    const tableInfo = db.prepare('PRAGMA table_info(task_checkpoints)').all();
    const columnNames = tableInfo.map(c => c.name);

    const requiredColumns = [
        'project_id', 'task_id', 'contract_id', 'plan_hash', 'task_spec_hash',
        'input_hash', 'output_hash', 'gate_version', 'status', 'requirement_ids',
        'created_at', 'invalidated_at', 'invalidation_reason'
    ];

    for (const col of requiredColumns) {
        assert.ok(columnNames.includes(col), `Column ${col} is missing from task_checkpoints`);
    }

    const pkColumns = tableInfo.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
    assert.deepStrictEqual(pkColumns, [
        'project_id', 'task_id', 'contract_id', 'plan_hash', 'task_spec_hash',
        'input_hash', 'output_hash', 'gate_version'
    ]);

    const { saveCheckpoint, getCheckpoint, deleteCheckpoint } = await import('../engine/checkpointRepository.js');

    // Create project and contract fixtures
    db.prepare("INSERT INTO projects (id, title, status) VALUES ('cp-proj-1', 'CP Project', 'planning')").run();
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES ('cp-contract-1', 'cp-proj-1', 1, 'approved', '{}', 'hash-1')
    `).run();

    const sampleCheckpoint = {
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0',
        status: 'completed',
        requirementIds: ['REQ-1', 'REQ-2'],
        revision: 1
    };

    saveCheckpoint(sampleCheckpoint);

    const retrieved = getCheckpoint({
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0'
    });

    assert.ok(retrieved);
    assert.strictEqual(retrieved.status, 'completed');
    assert.deepStrictEqual(JSON.parse(retrieved.requirement_ids), ['REQ-1', 'REQ-2']);

    // Primary key constraint violation on duplicate insert
    assert.throws(() => {
        saveCheckpoint({
            ...sampleCheckpoint,
            status: 'invalidated'
        });
    }, /UNIQUE constraint failed|PRIMARY KEY/i);

    // Delete checkpoint
    deleteCheckpoint({
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0'
    });

    const afterDelete = getCheckpoint({
        projectId: 'cp-proj-1',
        taskId: 'task-1',
        contractId: 'cp-contract-1',
        planHash: 'ph-1234',
        taskSpecHash: 'sh-1234',
        inputHash: 'ih-1234',
        outputHash: 'oh-1234',
        gateVersion: '1.0.0'
    });

    assert.strictEqual(afterDelete, null);

    db.prepare("DELETE FROM projects WHERE id = 'cp-proj-1'").run();
});

await runAsyncTest('fenced checkpoints reject a superseded contract even while its lease stays current', async () => {
    const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    db.prepare("INSERT INTO projects (id,title,status) VALUES ('cp-fence','CP fence','implementing')").run();
    db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
        VALUES ('cp-fence-a','cp-fence',1,'approved','{}','hash-a')`).run();
    const lease = acquireWorkflowLease('cp-fence', 'cp-owner');
    db.prepare("UPDATE project_contracts SET status='superseded' WHERE id='cp-fence-a'").run();
    db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
        VALUES ('cp-fence-b','cp-fence',2,'approved','{}','hash-b')`).run();
    assert.throws(() => saveCheckpoint({ projectId: 'cp-fence', taskId: 'task-1', contractId: 'cp-fence-a',
        planHash: 'hash-a', expectedContractHash: 'hash-a', expectedContractRevision: 1,
        taskSpecHash: 'spec', inputHash: 'input', outputHash: 'output',
        attemptId: lease.attempt.id, leaseOwner: 'cp-owner' }), { code: 'WORKFLOW_LEASE_FENCED' });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM task_checkpoints WHERE project_id='cp-fence'").get().count, 0);
});

await runAsyncTest('a contract switch after reviewed source commit cannot reattribute its workflow checkpoint', async () => {
    const fs = (await import('node:fs/promises')).default;
    const path = (await import('node:path')).default;
    const crypto = (await import('node:crypto')).default;
    const { createProject, getProjectDir } = await import('../projectRepository.js');
    const { normalizeManagerPlan } = await import('../agents/schemas.js');
    const { executeProjectTasks, computePlanHash } = await import('../engine/workflow.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    const { AGENT_REGISTRY } = await import('../agents/index.js');
    const project = await createProject({ title: 'Checkpoint contract switch' });
    const directory = getProjectDir(project.id);
    const plan = normalizeManagerPlan({ summary: 'Vite React static fixture', talimatname: '# Static source',
        domains: [{ name: 'Frontend', prefix: 'frontend' }],
        requirements: [{ id: 'REQ-1', statement: 'One helper file' }],
        management: { needed: false, reason: 'Static fixture.' } });
    const hash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    const contractA = `contract-${crypto.randomUUID()}`;
    const contractB = `contract-${crypto.randomUUID()}`;
    db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
        VALUES (?,?,1,'approved',?,?)`).run(contractA, project.id, JSON.stringify(plan), hash);
    const task = { id: 'source-task', title: 'Source helper', description: 'Implement helper',
        targetFiles: ['src/entry.js'], dependencies: [], requirementIds: ['REQ-1'] };
    db.prepare("UPDATE projects SET status='implementing',workflow_state=? WHERE id=?").run(JSON.stringify({
        planHash: computePlanHash(plan), directorSpecs: { frontend: { domain: 'frontend', altTalimatname: '# Source',
            teamleaders: [{ name: 'Helper', prefix: 'helper', mission: 'Static helper' }] } },
        teamleaderPlans: { 'frontend.helper': { tasks: [task] } }
    }), project.id);
    await fs.mkdir(path.join(directory, 'src'), { recursive: true });
    for (const [name, content] of Object.entries({ 'package.json': '{"name":"cp-fixture","version":"1.0.0"}',
        'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
        'src/main.tsx': "import App from './App'; export default App;", 'src/App.tsx': 'export default function App(){return null;}',
        'src/entry.js': 'BEFORE' })) await fs.writeFile(path.join(directory, name), content);
    const savedEnv = Object.fromEntries(['AI_PROVIDER', 'GOOGLE_API_KEY', 'ALLOW_MOCK_FALLBACK', 'LLM_CONFIG_PATH'].map(key => [key, process.env[key]]));
    const originalFetch = globalThis.fetch, originalStat = fs.stat, originalPrompt = AGENT_REGISTRY.coder.buildPrompt;
    let switched = false, networkCalls = 0;
    process.env.AI_PROVIDER = 'google'; process.env.GOOGLE_API_KEY = ''; process.env.ALLOW_MOCK_FALLBACK = 'true';
    process.env.LLM_CONFIG_PATH = path.join(path.dirname(isolated.dbPath), 'empty-fixture-profiles.json');
    globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected fixture network'); };
    AGENT_REGISTRY.coder.buildPrompt = (...args) => `${originalPrompt(...args)}\nHedef Dosyalar: ${JSON.stringify(args[3])}`;
    fs.stat = async (...args) => {
        const result = await originalStat(...args);
        if (!switched && String(args[0]) === path.join(directory, 'src/entry.js')
            && await fs.readFile(args[0], 'utf8') !== 'BEFORE') {
            switched = true;
            db.prepare("UPDATE project_contracts SET status='superseded' WHERE id=?").run(contractA);
            db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
                VALUES (?,?,2,'approved',?,?)`).run(contractB, project.id, JSON.stringify(plan), 'b'.repeat(64));
        }
        return result;
    };
    try {
        const lease = acquireWorkflowLease(project.id, 'checkpoint-switch-owner');
        await executeProjectTasks(project.id, null, lease.attempt.id, 'checkpoint-switch-owner');
        assert.equal(switched, true, 'the actual workflow must reach reviewed source publication');
        assert.equal(networkCalls, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_checkpoints WHERE project_id=?').get(project.id).count, 0,
            'old reviewed source cannot be stamped with the newly approved identity');
    } finally {
        fs.stat = originalStat; AGENT_REGISTRY.coder.buildPrompt = originalPrompt; globalThis.fetch = originalFetch;
        for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});

await runAsyncTest('qualified owners with byte-identical local tasks persist and resume independently', async () => {
    const { saveCheckpoint, getLatestCheckpoint, invalidateDownstreamCheckpoints } = await import('../engine/checkpointRepository.js');
    const { computeTaskSpecHash, computeInputHash, computeOutputHash } = await import('../engine/checkpointHelper.js');
    const { isTaskCheckpointValid } = await import('../engine/fileProtocol.js');
    const fs = (await import('node:fs/promises')).default;
    const path = (await import('node:path')).default;
    const directory = path.join(path.dirname(isolated.dbPath), 'identity-source');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'shared.js'), 'export const shared = true;');
    db.prepare("INSERT INTO projects (id,title,status) VALUES ('identity-project','Identity','implementing')").run();
    for (const [id, revision] of [['identity-contract', 1], ['identity-other', 2]]) db.prepare(`INSERT INTO project_contracts
        (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,'identity-project',?,'approved','{}','plan')`).run(id, revision);
    const task = { id: 'same', description: 'Identical specification', targetFiles: ['shared.js'], dependencies: [], requirementIds: ['REQ-1'] };
    const common = { projectId: 'identity-project', contractId: 'identity-contract', taskId: task.id, planHash: 'plan',
        taskSpecHash: computeTaskSpecHash(task), inputHash: await computeInputHash(directory), outputHash: await computeOutputHash(directory, task.targetFiles) };
    const a = saveCheckpoint({ ...common, teamleaderId: 'frontend.lead' });
    const b = saveCheckpoint({ ...common, teamleaderId: 'backend.lead' });
    assert.notEqual(a.task_id, b.task_id);
    assert.equal(a.task_identity_version, 1);
    const opts = { contractId: common.contractId, teamleaderId: 'frontend.lead', planHash: 'plan' };
    assert.equal(await isTaskCheckpointValid(directory, common.projectId, task, opts), true);
    assert.equal(await isTaskCheckpointValid(directory, common.projectId, task, { ...opts, teamleaderId: 'frontend.other' }), false);
    saveCheckpoint({ ...common, contractId: 'identity-other', teamleaderId: 'frontend.lead', createdAt: '2999-01-01' });
    assert.equal(getLatestCheckpoint(common.projectId, task.id, opts).contract_id, common.contractId);
    const child = { ...task, id: 'child', dependencies: new Set(['same']) };
    for (const teamleaderId of ['frontend.lead', 'backend.lead']) saveCheckpoint({ ...common, taskId: child.id,
        taskSpecHash: computeTaskSpecHash(child), teamleaderId });
    invalidateDownstreamCheckpoints(common.projectId, ['same'], [task, child], 'A only', opts);
    assert.equal(getLatestCheckpoint(common.projectId, child.id, opts).status, 'invalidated');
    assert.equal(getLatestCheckpoint(common.projectId, child.id, { ...opts, teamleaderId: 'backend.lead' }).status, 'completed');
    assert.equal(getLatestCheckpoint(common.projectId, task.id, { ...opts, contractId: 'identity-other' }).status, 'completed');
    const { qualifiedTaskId } = await import('../engine/checkpointIdentity.js');
    const { getCheckpoint, deleteCheckpoint, invalidateCheckpoint } = await import('../engine/checkpointRepository.js');
    const shaped = { ...common, taskId: 'legacy-shaped' };
    const scopedShape = { ...shaped, teamleaderId: 'frontend.lead' };
    const historic = saveCheckpoint({ ...shaped, taskId: qualifiedTaskId({ contractId: common.contractId,
        teamleaderId: 'frontend.lead', localTaskId: shaped.taskId }) });
    assert.equal(historic.task_identity_version, 0, 'ID syntax alone never classifies old evidence');
    assert.equal(getCheckpoint({ ...scopedShape, gateVersion: '1.0.0' }), null);
    assert.equal(deleteCheckpoint({ ...scopedShape, gateVersion: '1.0.0' }), false);
    assert.equal(invalidateCheckpoint({ ...scopedShape, gateVersion: '1.0.0' }), false);
    assert.equal(getLatestCheckpoint(common.projectId, historic.task_id).status, 'completed');
    const beforeRefresh = getLatestCheckpoint(common.projectId, historic.task_id);
    assert.throws(() => saveCheckpoint({ ...scopedShape, refreshReviewed: true, createdAt: '2999-02-01' }),
        { code: 'CHECKPOINT_IDENTITY_CONFLICT' }, 'a newly reviewed save cannot relabel hash-shaped legacy evidence');
    assert.deepEqual(getLatestCheckpoint(common.projectId, historic.task_id), beforeRefresh,
        'conflict rejection must preserve every historical identity, evidence and timestamp column');
    const bChild = { ...common, taskId: child.id, taskSpecHash: computeTaskSpecHash(child), teamleaderId: 'backend.lead', gateVersion: '1.0.0' };
    assert.equal(deleteCheckpoint(bChild), true);
    assert.equal(getLatestCheckpoint(common.projectId, child.id, opts).status, 'invalidated');
});

await runAsyncTest('scoped invalidation canonicalizes one-shot dependency iterables before hashing and traversal', async () => {
    const { saveCheckpoint, getLatestCheckpoint, invalidateDownstreamCheckpoints } = await import('../engine/checkpointRepository.js');
    const { computeTaskSpecHash } = await import('../engine/checkpointHelper.js');
    db.prepare("INSERT INTO projects (id,title,status) VALUES ('generator-project','Generator','implementing')").run();
    db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
        VALUES ('generator-contract','generator-project',1,'approved','{}','generator-plan')`).run();
    const root = { id: 'root', description: 'Root task', dependencies: [], targetFiles: ['root.js'] };
    const child = { id: 'child', description: 'Dependent task', dependencies: ['root'], targetFiles: ['child.js'] };
    const scope = { contractId: 'generator-contract', teamleaderId: 'core.lead' };
    for (const task of [root, child]) saveCheckpoint({ ...scope, projectId: 'generator-project', taskId: task.id,
        planHash: 'generator-plan', taskSpecHash: computeTaskSpecHash(task), inputHash: 'input', outputHash: 'output' });
    function* dependencies() { yield 'root'; }
    const invalidated = invalidateDownstreamCheckpoints('generator-project', ['root'],
        [root, { ...child, dependencies: dependencies() }], 'Root rejected', scope);
    const row = getLatestCheckpoint('generator-project', 'child', scope);
    assert.ok(invalidated.includes(row.task_id));
    assert.equal(row.status, 'invalidated');
    assert.equal(row.task_spec_hash, computeTaskSpecHash(child), 'canonical array and one-shot iterable preserve spec semantics');
});

await runAsyncTest('actual workflow skips only its qualified owner and independently checkpoints an identical second team', async () => {
    const fs = (await import('node:fs/promises')).default;
    const path = (await import('node:path')).default;
    const crypto = (await import('node:crypto')).default;
    const { createProject, getProjectDir } = await import('../projectRepository.js');
    const { normalizeManagerPlan } = await import('../agents/schemas.js');
    const { executeProjectTasks, computePlanHash } = await import('../engine/workflow.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    const { abortProjectExecution } = await import('../engine/cancellation.js');
    const { AGENT_REGISTRY } = await import('../agents/index.js');
    const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
    const { computeTaskSpecHash, computeInputHash, computeOutputHash } = await import('../engine/checkpointHelper.js');
    const project = await createProject({ title: 'Two team identity workflow' });
    const directory = getProjectDir(project.id);
    const plan = normalizeManagerPlan({ summary: 'Vite React static fixture', talimatname: '# Static source',
        domains: [{ name: 'Frontend', prefix: 'frontend' }], requirements: [{ id: 'REQ-1', statement: 'One helper file' }],
        management: { needed: false, reason: 'Static fixture.' } });
    const contractId = `contract-${crypto.randomUUID()}`, json = JSON.stringify(plan);
    const hash = crypto.createHash('sha256').update(json).digest('hex');
    db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
        VALUES (?,?,1,'approved',?,?)`).run(contractId, project.id, json, hash);
    const task = { id: 'source-task', title: 'Source helper', description: 'Implement helper',
        targetFiles: ['src/entry.js'], dependencies: [], requirementIds: ['REQ-1'] };
    db.prepare("UPDATE projects SET status='implementing',workflow_state=? WHERE id=?").run(JSON.stringify({
        planHash: computePlanHash(plan), directorSpecs: { frontend: { domain: 'frontend', altTalimatname: '# Source',
            teamleaders: [{ name: 'First Helper', prefix: 'a', mission: 'Static helper' }, { name: 'Second Helper', prefix: 'b', mission: 'Static helper' }] } },
        teamleaderPlans: { 'frontend.a': { tasks: [task] }, 'frontend.b': { tasks: [structuredClone(task)] } }
    }), project.id);
    await fs.mkdir(path.join(directory, 'src'), { recursive: true });
    for (const [name, content] of Object.entries({ 'package.json': '{"name":"identity-fixture","version":"1.0.0"}',
        'index.html': '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
        'src/main.tsx': "import App from './App'; export default App;", 'src/App.tsx': 'export default function App(){return null;}',
        'src/entry.js': '// Simüle Edilen LLM Yanıtı: Kod içeriği' })) await fs.writeFile(path.join(directory, name), content);
    const originalA = saveCheckpoint({ projectId: project.id, contractId, taskId: task.id, teamleaderId: 'frontend.a',
        planHash: hash, taskSpecHash: computeTaskSpecHash(task), inputHash: await computeInputHash(directory),
        outputHash: await computeOutputHash(directory, task.targetFiles) });
    const savedEnv = Object.fromEntries(['AI_PROVIDER', 'GOOGLE_API_KEY', 'ALLOW_MOCK_FALLBACK', 'LLM_CONFIG_PATH'].map(key => [key, process.env[key]]));
    const originalFetch = globalThis.fetch, originalPrompt = AGENT_REGISTRY.coder.buildPrompt;
    let networkCalls = 0;
    process.env.AI_PROVIDER = 'google'; process.env.GOOGLE_API_KEY = ''; process.env.ALLOW_MOCK_FALLBACK = 'true';
    process.env.LLM_CONFIG_PATH = path.join(path.dirname(isolated.dbPath), 'empty-identity-profiles.json');
    globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected fixture network'); };
    AGENT_REGISTRY.coder.buildPrompt = (...args) => `${originalPrompt(...args)}\nHedef Dosyalar: ${JSON.stringify(args[3])}`;
    const execute = async owner => {
        db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(project.id);
        const lease = acquireWorkflowLease(project.id, owner), events = [];
        await executeProjectTasks(project.id, { publish(event) {
            events.push(event);
            if (event.action === 'start' && /tester/i.test(event.agent || '')) abortProjectExecution(project.id, 'PAUSED');
        } }, lease.attempt.id, owner);
        return events;
    };
    try {
        const first = await execute('identity-first');
        assert.ok(first.some(event => event.action === 'start' && /tester/i.test(event.agent || '')), 'first workflow must finish the complete task loop');
        assert.equal(first.filter(event => event.action === 'delegate').length, 1, JSON.stringify(first));
        const rows = db.prepare('SELECT * FROM task_checkpoints WHERE project_id=? ORDER BY task_id').all(project.id);
        assert.equal(rows.length, 2, 'both identical team tasks must have independent durable evidence');
        assert.ok(rows.every(row => row.task_identity_version === 1));
        assert.deepEqual(rows.find(row => row.task_id === originalA.task_id), originalA, 'A resume cannot refresh reviewed evidence');
        const second = await execute('identity-repeat');
        assert.ok(second.some(event => event.action === 'start' && /tester/i.test(event.agent || '')), 'repeat workflow must reach acceptance after both cache reads');
        assert.equal(second.filter(event => event.action === 'delegate').length, 0, JSON.stringify(second));
        assert.deepEqual(db.prepare('SELECT * FROM task_checkpoints WHERE project_id=? ORDER BY task_id').all(project.id), rows);
        assert.equal(networkCalls, 0);
    } finally {
        AGENT_REGISTRY.coder.buildPrompt = originalPrompt; globalThis.fetch = originalFetch;
        for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});

finish();
await isolated.cleanup();
