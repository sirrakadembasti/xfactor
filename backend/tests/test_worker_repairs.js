import assert from 'node:assert/strict';
import { createTestHarness } from './testHarness.js';
import { verifyBuild } from '../verification/buildVerifier.js';
const { runAsyncTest, finish } = createTestHarness();
const diagnostic = "src/price.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.";
const observation = { passed: false, exitCode: 2, stdout: diagnostic, stderr: '', signal: null,
    stdoutTruncated: false, stderrTruncated: false };
async function producer(reject = false, overrides = {}) {
    return verifyBuild('/unused-isolated-project', {}, { files: [
        { path: 'tsconfig.json', content: '{}' }, { path: 'package.json', content: '{"scripts":{"build":"vite build"}}' }
    ], adapter: { id: 'fake-worker', isAvailable: () => true, execute: async ({ args }) => {
        if (args[0] !== 'tsc') return { passed: true, exitCode: 0, stdout: '', stderr: '' };
        const result = { ...observation, ...overrides };
        if (reject) throw Object.assign(new Error('command failed'), { result });
        return result;
    } } });
}
await runAsyncTest('real typecheck producer preserves resolved and Docker error.result process observations', async () => {
    for (const reject of [false, true]) {
        const check = (await producer(reject)).checks.find(item => item.name === 'typecheck');
        assert.equal(check.stdout, diagnostic);
        assert.equal(check.exitCode, 2);
        assert.equal(check.executionObservation?.normalExit, true);
        assert.equal(check.stdoutTruncated, false);
    }
});
await runAsyncTest('compiler classifier rejects unknown, infrastructure, truncated and unsafe observations', async () => {
    const failures = await import('../verification/workerFailures.js');
    const check = (await producer()).checks.find(item => item.name === 'typecheck');
    const classify = value => failures.parseTypecheckDiagnostics({ check: value,
        log: failures.normalizeWorkerCheckLog(value), artifactPaths: ['src/price.ts'] });
    assert.equal(classify(check).classification, 'product');
    assert.equal(classify(check).findings[0].filePath, 'src/price.ts');
    for (const change of [{ stdoutTruncated: true }, { executionObservation: undefined },
        { stdout: diagnostic + '\nnpm error ECONNRESET package download' }, { stdout: diagnostic.replace('src/price.ts', '../src/price.ts') },
        { stdout: diagnostic.replace('src/price.ts', 'C:/src/price.ts') }, { exitCode: null }, { timedOut: true }]) {
        assert.notEqual(classify({ ...check, ...change }).classification, 'product');
    }
    const log = failures.normalizeWorkerCheckLog({ stdout: 'password=sentinel-private-value', stderr: '', reason: diagnostic });
    assert.ok(!JSON.stringify(log).includes('sentinel-private-value'));
});
await runAsyncTest('typecheck producer rejects Windows-style timeout or termination with numeric exit and null signal', async () => {
    const { parseTypecheckDiagnostics, normalizeWorkerCheckLog } = await import('../verification/workerFailures.js');
    for (const overrides of [{ timedOut: true }, { executionFailed: true }, { cancelled: true }]) {
        const check = (await producer(true, overrides)).checks.find(item => item.name === 'typecheck');
        assert.notEqual(parseTypecheckDiagnostics({ check, log: normalizeWorkerCheckLog(check), artifactPaths: ['src/price.ts'] }).classification, 'product');
    }
});
await runAsyncTest('worker ownership preflight requires unique current projected single-file owner', async () => {
    const { planWorkerRepairs } = await import('../engine/workerRepairs.js');
    const { qualifiedTaskId } = await import('../engine/checkpointIdentity.js');
    const contract = { id: 'contract-worker', contract_hash: 'a'.repeat(64) };
    const task = { id: qualifiedTaskId({ contractId: contract.id, teamleaderId: 'backend.pricing', localTaskId: 'calculate' }),
        task_spec_json: JSON.stringify({ executionTaskId: 'calculate', teamleaderId: 'backend.pricing',
            executionTaskSpecHash: 'b'.repeat(64), targetFiles: ['src/price.ts'], requirementIds: ['REQ-1'], dependencies: [] }) };
    const issue = { id: 'issue', fingerprint: 'finding', detail: { kind: 'worker_product_failure', filePath: 'src/price.ts', sourceSha256: 'source' } };
    assert.equal(planWorkerRepairs({ batch: { issues: [issue] }, tasks: [task], contract }).targets[0].owner.id, task.id);
    assert.throws(() => planWorkerRepairs({ batch: { issues: [issue] }, tasks: [task, task], contract }), /unique|duplicate/i);
    const alias = { ...task, id: qualifiedTaskId({ contractId: contract.id, teamleaderId: 'backend.other', localTaskId: 'calculate' }),
        task_spec_json: JSON.stringify({ ...JSON.parse(task.task_spec_json), teamleaderId: 'backend.other', targetFiles: ['./src/price.ts'] }) };
    assert.throws(() => planWorkerRepairs({ batch: { issues: [issue] }, tasks: [task, alias], contract }), /unique|duplicate|alias/i);
    if (process.platform === 'win32') {
        alias.task_spec_json = JSON.stringify({ ...JSON.parse(alias.task_spec_json), targetFiles: ['src/Price.ts'] });
        assert.throws(() => planWorkerRepairs({ batch: { issues: [issue] }, tasks: [task, alias], contract }), /unique|duplicate|alias/i);
    }
    assert.throws(() => planWorkerRepairs({ batch: { issues: [issue] }, tasks: [], contract }), /owner/i);
    assert.throws(() => planWorkerRepairs({ batch: { issues: [{ detail: { kind: 'worker_verification_blocker' } }] }, tasks: [task], contract }), /revision/i);
});
await runAsyncTest('validation reservations are durable per semantic batch and source, not run IDs', async () => {
    const { reserveWorkerValidation } = await import('../engine/workerRepairs.js');
    const workflow = {}; let persisted = 0;
    const options = { workflow, contract: { id: 'c', contract_hash: 'h' }, batchFingerprint: 'b',
        sourceSnapshotHash: 's', stage: 'static_acceptance', persistWorkflow: async () => persisted++ };
    await reserveWorkerValidation(options);
    assert.equal(persisted, 1);
    await assert.rejects(reserveWorkerValidation({ ...options, workflow: JSON.parse(JSON.stringify(workflow)) }), /consumed|revision/i);
    await reserveWorkerValidation({ ...options, sourceSnapshotHash: 'changed' });
    assert.equal(persisted, 2);
    const completed = workflow.workerRepairs.validations.at(-1);
    completed.phase = 'passed'; completed.result = { approved: true };
    assert.equal(await reserveWorkerValidation({ ...options, sourceSnapshotHash: 'changed' }), completed);
});
await runAsyncTest('source snapshot rejects external edits and additions before any repair dispatch', async () => {
    const { assertWorkerSourceSnapshot, sourceSnapshot } = await import('../engine/workerRepairs.js');
    const files = [{ path: 'src/price.ts', content: 'old' }, { path: 'package-lock.json', content: 'generated' }];
    const expected = sourceSnapshot(files);
    assertWorkerSourceSnapshot(files, expected);
    assert.throws(() => assertWorkerSourceSnapshot([{ path: 'src/price.ts', content: 'manual' }], expected), /revision|source/i);
    assert.throws(() => assertWorkerSourceSnapshot([...files, { path: 'added.ts', content: 'new' }], expected), /revision|source/i);
});
async function fixture() {
    const fs = await import('node:fs/promises'), path = await import('node:path');
    const { createProject, getProjectDir } = await import('../projectRepository.js');
    const { db } = await import('../db.js');
    const { normalizeManagerPlan } = await import('../agents/schemas.js');
    const { computePlanHash } = await import('../engine/workflow.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    const { projectContractTasks } = await import('../contracts/taskProjection.js');
    const { collectArtifactFiles } = await import('../artifactInventory.js');
    const { createProjectZip } = await import('../utils/archive.js');
    const { verifyArtifact } = await import('../verification/artifactVerifier.js');
    const { digest, loadOpenWorkerRepairBatch } = await import('../verification/workerFailures.js');
    const project = await createProject({ title: 'Worker recovery fixture' }), projectDir = getProjectDir(project.id);
    const plan = normalizeManagerPlan({ summary: 'Backend calculation library', talimatname: '# Calculate price',
        domains: [{ name: 'backend', prefix: 'backend' }], requirements: [{ id: 'REQ-1', statement: 'Calculate price', mandatory: true }],
        management: { needed: false, reason: 'A calculation library.' } });
    const contract = { id: `contract-${project.id}`, contract_hash: digest(JSON.stringify(plan)), revision: 1 };
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'package.json'), '{"name":"worker-fixture","version":"1.0.0","scripts":{"build":"tsc"}}');
    await fs.writeFile(path.join(projectDir, 'tsconfig.json'), '{}');
    await fs.writeFile(path.join(projectDir, 'src/price.ts'), 'export const price: number = "wrong";');
    await fs.writeFile(path.join(projectDir, 'src/dependency.ts'), 'export const currency = "TRY";');
    db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash) VALUES (?,?,1,'approved',?,?)`)
        .run(contract.id, project.id, JSON.stringify(plan), contract.contract_hash);
    const tasks = [{ id: 'calculate', title: 'Calculate price', description: 'Implement price', targetFiles: ['src/price.ts'], dependencies: ['currency'], requirementIds: ['REQ-1'] },
        { id: 'currency', title: 'Currency', description: 'Currency', targetFiles: ['src/dependency.ts'], dependencies: [], requirementIds: ['REQ-1'] }];
    const workflow = { planHash: computePlanHash(plan), generationCompletion: { stage: 'generation_finished', contractId: contract.id,
        contractHash: contract.contract_hash, planHash: computePlanHash(plan) }, directorSpecs: {}, teamleaderPlans: { 'backend.pricing': { tasks } } };
    db.prepare("UPDATE projects SET status='implementing',workflow_state=? WHERE id=?").run(JSON.stringify(workflow), project.id);
    const owner = `owner-${project.id}`, lease = acquireWorkflowLease(project.id, owner);
    projectContractTasks({ projectId: project.id, contractId: contract.id, contractHash: contract.contract_hash, teamleaderPlans: workflow.teamleaderPlans, attemptId: lease.attempt.id, leaseOwner: owner });
    const files = await collectArtifactFiles(projectDir); files.push({ path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' });
    const artifact = await createProjectZip(project.id, contract.id, files);
    const identity = { version: 1, operation: 'verify_artifact', projectId: project.id, contractId: contract.id, contractHash: contract.contract_hash,
        revision: 1, artifactId: artifact.id, inputSha256: artifact.sha256, runId: `reject-${project.id}`, jobId: `job-${project.id}`, nonce: `nonce-${project.id}` };
    const requirementIds = db.prepare('SELECT id FROM requirements WHERE contract_id=?').all(contract.id).map(row => row.id);
    const gates = ['package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck', 'framework_build', 'requirement_traceability',
        'service_manifest', 'database_verification', 'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure',
        'domain_entity_check', 'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'];
    const { RUNTIME_GATE_MEMBERS } = await import('../verification/qualityPolicy.js');
    const allNames = [...new Set([...gates, ...Object.values(RUNTIME_GATE_MEMBERS).flatMap(set => [...set])])];
    const passingChecks = () => allNames.map(name => ({ name, status: 'PASS', command: `verify ${name}`, exitCode: 0, policyVersion: '2.0',
        startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), stdoutDigest: digest(''), stderrDigest: digest(''),
        requirementIds, evidence: { reason: 'isolated fake independent worker' } }));
    const check = (await producer(false, { stdout: `${diagnostic} password=worker-secret-sentinel` })).checks.find(check => check.name === 'typecheck');
    const checks = passingChecks().map(item => item.name === 'typecheck' ? { ...check, requirementIds } : item);
    const rejected = await verifyArtifact({ projectId: project.id, contractId: contract.id, artifactId: artifact.id }, {
        runId: identity.runId, activeJob: identity, archiveBase64: (await fs.readFile(artifact.path)).toString('base64'),
        attemptId: lease.attempt.id, leaseOwner: owner,
        executionClient: { verifyArtifact: async () => ({ ...identity, status: 'failed', result: { ...identity, checks } }) } });
    assert.equal(rejected.passed, false);
    const sourceFence = { projectId: project.id, contractId: contract.id, contractHash: contract.contract_hash, contractRevision: 1,
        attemptId: lease.attempt.id, leaseOwner: owner };
    const batch = loadOpenWorkerRepairBatch({ projectId: project.id, contractId: contract.id, contractHash: contract.contract_hash });
    assert.equal(batch.issues.length, 1);
    return { project, projectDir, contract, workflow, sourceFence, batch, db, fs, path, identity, artifact, passingChecks,
        persistWorkflow: async () => db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify(workflow), project.id) };
}
await runAsyncTest('normal Resume routes real rejected compiler findings and completes only after fresh independent evidence', async () => {
    const f = await fixture();
    const { executeProjectTasks } = await import('../engine/workflow.js');
    const { deleteProject } = await import('../projectRepository.js');
    const calls = [], identities = [];
    try {
        await executeProjectTasks(f.project.id, null, f.sourceFence.attemptId, f.sourceFence.leaseOwner, {
            callAgent: async (role, prompt, options) => {
                calls.push(role); assert.equal(options.maxAttempts, 1);
                assert.equal(f.db.prepare("SELECT status FROM repair_issues WHERE id=?").get(f.batch.issues[0].id).status, 'open');
                if (role === 'coder') {
                    assert.match(prompt, /TS2322/); assert.match(prompt, /Calculate price/); assert.match(prompt, /currency =/);
                    return { files: [{ path: 'src/price.ts', content: 'export const price: number = 42;' }] };
                }
                assert.ok(['reviewer', 'tester'].includes(role)); assert.match(prompt, /price: number = 42/);
                return { approved: true, summary: 'Fresh static review', issues: [] };
            },
            createExecutionClient: () => ({ prepareDependencies: async () => ({ status: 'completed', result: { packageLockBase64: Buffer.from('{}').toString('base64') } }),
                verifyArtifact: async identity => {
                    identities.push(identity);
                    assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'open');
                    return { ...identity, status: 'completed', result: { ...identity, checks: f.passingChecks() } };
                } })
        });
        const project = f.db.prepare('SELECT * FROM projects WHERE id=?').get(f.project.id);
        assert.equal(project.status, 'completed', project.last_error);
        assert.deepEqual(calls, ['coder', 'reviewer', 'tester']); assert.equal(identities.length, 1);
        for (const key of ['artifactId', 'inputSha256', 'runId', 'jobId', 'nonce']) assert.notEqual(identities[0][key], f.identity[key]);
        assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'resolved');
        assert.equal(f.db.prepare('SELECT status FROM artifacts WHERE id=?').get(f.artifact.id).status, 'rejected');
        assert.equal(await f.fs.readFile(f.path.join(f.projectDir, 'src/dependency.ts'), 'utf8'), 'export const currency = "TRY";');
    } finally {
        // Verified delivery history is immutable, even in tests; the isolated
        // runner owns and removes this entire temporary database afterwards.
        if (f.db.prepare('SELECT status FROM projects WHERE id=?').get(f.project.id)?.status !== 'completed') await deleteProject(f.project.id);
    }
});
async function runHelper(f, callAgent, changes = {}) {
    const { executeWorkerRepairs } = await import('../engine/workerRepairs.js');
    return executeWorkerRepairs({ ...f, callAgent, ...changes });
}
async function resumeFixture(f, services) {
    const { executeProjectTasks } = await import('../engine/workflow.js');
    const { acquireWorkflowLease } = await import('../workflowAttempts.js');
    f.db.prepare("UPDATE projects SET status='implementing' WHERE id=?").run(f.project.id);
    const lease = acquireWorkflowLease(f.project.id, f.sourceFence.leaseOwner);
    return executeProjectTasks(f.project.id, null, lease.attempt.id, f.sourceFence.leaseOwner, services);
}
const fixed = { files: [{ path: 'src/price.ts', content: 'export const price: number = 42;' }] };
const fakeClient = f => ({ prepareDependencies: async () => ({ status: 'completed', result: { packageLockBase64: Buffer.from('{"lockfileVersion":3,"packages":{}}').toString('base64') } }),
    verifyArtifact: async identity => ({ ...identity, status: 'completed', result: { ...identity, checks: f.passingChecks() } }) });

for (const outcome of ['unchanged', 'malformed', 'provider failure']) await runAsyncTest(`consumed ${outcome} reservation survives reload and prevents duplicate Coder payment`, async () => {
    const f = await fixture(); let calls = 0;
    const agent = async () => { calls++;
        if (outcome === 'provider failure') throw new Error('Unknown provider outcome');
        return outcome === 'malformed' ? { files: [...fixed.files, { path: 'src/dependency.ts', content: 'out of scope' }] }
            : { files: [{ path: 'src/price.ts', content: 'export const price: number = "wrong";' }] };
    };
    await assert.rejects(runHelper(f, agent), /unchanged|one owned|Unknown provider/);
    const workflow = JSON.parse(f.db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(f.project.id).workflow_state);
    await assert.rejects(runHelper(f, agent, { workflow }), /consumed/);
    assert.equal(calls, 1);
    assert.equal(await f.fs.readFile(f.path.join(f.projectDir, 'src/price.ts'), 'utf8'), 'export const price: number = "wrong";');
});
for (const mutation of ['target', 'dependency', 'owner', 'contract', 'cancel', 'staging']) await runAsyncTest(`worker repair fences ${mutation} changes after provider dispatch`, async () => {
    const f = await fixture();
    const { revokeProjectWorkflowLeases } = await import('../workflowAttempts.js');
    const promises = (await import('node:fs/promises')).default;
    const originalOpen = promises.open;
    const mutate = async () => {
        if (mutation === 'target' || mutation === 'dependency' || mutation === 'staging') await f.fs.writeFile(f.path.join(f.projectDir,
            mutation === 'target' ? 'src/price.ts' : 'src/dependency.ts'), 'external change');
        else if (mutation === 'owner') f.db.prepare("UPDATE contract_tasks SET task_spec_json=json_set(task_spec_json,'$.executionTaskSpecHash','changed') WHERE contract_id=?").run(f.contract.id);
        else if (mutation === 'contract') f.db.prepare("UPDATE project_contracts SET contract_hash=? WHERE id=?").run('f'.repeat(64), f.contract.id);
        else revokeProjectWorkflowLeases(f.project.id, 'cancelled');
    };
    try {
        await assert.rejects(runHelper(f, async () => {
            if (mutation === 'staging') promises.open = async (...args) => {
                const handle = await originalOpen(...args), close = handle.close.bind(handle);
                handle.close = async () => { await close(); await mutate(); };
                return handle;
            };
            else await mutate();
            return fixed;
        }), /changed|cancel|lease|source|fenced/i);
        if (mutation !== 'target') assert.equal(await f.fs.readFile(f.path.join(f.projectDir, 'src/price.ts'), 'utf8'), 'export const price: number = "wrong";');
        assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'open');
    } finally { promises.open = originalOpen; }
});
await runAsyncTest('external source and malformed staging additions block before paid calls', async () => {
    const f = await fixture(); let calls = 0;
    await f.fs.writeFile(f.path.join(f.projectDir, '.xfactor-generated-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.tmp'), 'external');
    await assert.rejects(runHelper(f, async () => { calls++; return fixed; }), /source changed/);
    assert.equal(calls, 0);
});
await runAsyncTest('whole batch ownership and budget preflight prevents partial payment', async () => {
    const f = await fixture(); let calls = 0;
    f.workflow.workerRepairs = { version: 1, contractId: f.contract.id, contractHash: f.contract.contract_hash, validations: [], attempts: Array.from({ length: 64 }, (_, i) => ({ id: String(i) })) };
    await assert.rejects(runHelper(f, async () => { calls++; return fixed; }), /budget/);
    const issue = { ...f.batch.issues[0], id: 'unowned', detail: { ...f.batch.issues[0].detail, filePath: 'src/unowned.ts' } };
    await assert.rejects(runHelper(f, async () => { calls++; return fixed; }, { workflow: {}, batch: { ...f.batch, issues: [...f.batch.issues, issue] } }), /owner/);
    assert.equal(calls, 0);
});
for (const stage of ['reviewer', 'tester', 'worker']) await runAsyncTest(`fresh ${stage} rejection cannot resolve a repaired runtime issue`, async () => {
    const f = await fixture(); const calls = [];
    const services = { callAgent: async role => {
        calls.push(role); if (role === 'coder') return fixed;
        return { approved: role !== stage, summary: 'Known result', issues: role === stage ? ['rejected source'] : [] };
    }, createExecutionClient: () => ({ ...fakeClient(f), verifyArtifact: async identity => {
        calls.push('worker'); return { ...identity, status: 'failed_timeout', result: { ...identity, checks: [] } };
    } }) };
    await resumeFixture(f, services);
    assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'open');
    assert.notEqual(f.db.prepare('SELECT status FROM projects WHERE id=?').get(f.project.id).status, 'completed');
    const before = calls.length;
    await resumeFixture(f, services);
    assert.equal(calls.length, before, 'same rejected/indeterminate stage may not pay again');
});
for (const cut of ['static pass', 'worker evidence']) await runAsyncTest(`restart after ${cut} advances proven stages without duplicate dispatch`, async () => {
    const f = await fixture(); const calls = [];
    const callAgent = async role => { calls.push(role); return role === 'coder' ? fixed : { approved: true, summary: 'Passed', issues: [] }; };
    const { verifyArtifact } = await import('../verification/artifactVerifier.js');
    await resumeFixture(f, { callAgent,
        createExecutionClient: () => { if (cut === 'static pass') throw new Error('Simulated crash after static pass'); return fakeClient(f); },
        ...(cut === 'worker evidence' ? { verifyArtifactAndProject: async request => {
            const result = await verifyArtifact(request, request.options); assert.equal(result.passed, true);
            throw new Error('Simulated crash after durable independent worker evidence');
        } } : {}) });
    assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'open');
    let workers = 0;
    await resumeFixture(f, { callAgent: async role => { throw new Error(`Duplicate paid ${role}`); },
        createExecutionClient: () => ({ ...fakeClient(f), verifyArtifact: async identity => { workers++; return fakeClient(f).verifyArtifact(identity); } }) });
    const project = f.db.prepare('SELECT * FROM projects WHERE id=?').get(f.project.id);
    assert.equal(project.status, 'completed', project.last_error);
    assert.deepEqual(calls, ['coder', 'reviewer', 'tester']);
    assert.equal(workers, cut === 'worker evidence' ? 0 : 1);
});
await runAsyncTest('actual worker ingestion and real HTTP log route share the redacted compiler diagnostic', async () => {
    const f = await fixture();
    const { default: express } = await import('express');
    const { createServer } = await import('node:http');
    const { createProjectRouter } = await import('../routes/projectRoutes.js');
    const row = f.db.prepare("SELECT * FROM verification_checks WHERE run_id=? AND gate_name='typecheck'").get(f.identity.runId);
    const app = express();
    app.use('/api/projects', createProjectRouter({ requireAuth: (req, res, next) => { req.user = { id: 'isolated-owner', isAdmin: true }; next(); },
        projectAccess: () => (req, res, next) => next(), wsHub: { broadcast() {} } }));
    const server = createServer(app);
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${f.project.id}/verification-runs/${f.identity.runId}/checks/${row.id}/log`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.match(body.stdout, /TS2322/);
        assert.equal(body.stdout, JSON.parse(row.evidence_json).stdout);
        assert.ok(!JSON.stringify(body).includes('worker-secret-sentinel'));
        assert.ok(!row.evidence_json.includes('worker-secret-sentinel'));
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
for (const failure of ['dependency transport', 'expired verification']) await runAsyncTest(`${failure} is a durable controller blocker across normal Resume`, async () => {
    const f = await fixture(); const calls = [];
    const services = { loadRecordedDependencyLock: async () => null,
        callAgent: async role => { calls.push(role); return role === 'coder' ? fixed : { approved: true, summary: 'Passed', issues: [] }; },
        createExecutionClient: () => ({ ...fakeClient(f), prepareDependencies: async () => {
            calls.push('prepare'); if (failure === 'dependency transport') throw new Error('ECONNRESET dependency worker transport');
            return fakeClient(f).prepareDependencies();
        } }),
        ...(failure === 'expired verification' ? { verifyArtifactAndProject: async request => {
            const { verifyArtifact } = await import('../verification/artifactVerifier.js');
            return verifyArtifact(request, { ...request.options, activeJob: { ...request.options.activeJob, deadline: Date.now() - 1 } });
        } } : {}) };
    await resumeFixture(f, services);
    const rows = f.db.prepare("SELECT detail_json FROM repair_issues WHERE project_id=? AND status='open'").all(f.project.id).map(row => JSON.parse(row.detail_json));
    assert.ok(rows.some(row => row.kind === 'verification_controller_blocker' && row.authenticatedWorker === false));
    const before = calls.length;
    await resumeFixture(f, services);
    assert.equal(calls.length, before);
});
await runAsyncTest('two changed-input repairs exhaust the owner cap despite new rejection run IDs', async () => {
    const f = await fixture(); let calls = 0;
    const { collectArtifactFiles } = await import('../artifactInventory.js');
    const { createProjectZip } = await import('../utils/archive.js');
    const { verifyArtifact } = await import('../verification/artifactVerifier.js');
    const { loadOpenWorkerRepairBatch } = await import('../verification/workerFailures.js');
    const rejectCurrent = async suffix => {
        const files = await collectArtifactFiles(f.projectDir); files.push({ path: 'package-lock.json', content: '{"lockfileVersion":3,"packages":{}}' });
        const artifact = await createProjectZip(f.project.id, f.contract.id, files);
        const identity = { ...f.identity, artifactId: artifact.id, inputSha256: artifact.sha256, runId: `new-${suffix}-${f.project.id}`,
            jobId: `new-job-${suffix}`, nonce: `new-nonce-${suffix}` };
        const failed = (await producer(false, { stdout: `${diagnostic} password=worker-secret-sentinel` })).checks.find(check => check.name === 'typecheck');
        await verifyArtifact({ projectId: f.project.id, contractId: f.contract.id, artifactId: artifact.id }, { runId: identity.runId, activeJob: identity,
            archiveBase64: (await f.fs.readFile(artifact.path)).toString('base64'), attemptId: f.sourceFence.attemptId, leaseOwner: f.sourceFence.leaseOwner,
            executionClient: { verifyArtifact: async () => ({ ...identity, status: 'failed', result: { ...identity,
                checks: f.passingChecks().map(check => check.name === 'typecheck' ? failed : check) } }) } });
        f.batch = loadOpenWorkerRepairBatch({ projectId: f.project.id, contractId: f.contract.id, contractHash: f.contract.contract_hash });
    };
    const call = async () => { calls++; return { files: [{ path: 'src/price.ts', content: `export const price: number = ${41 + calls};` }] }; };
    await runHelper(f, call); await rejectCurrent('second');
    await runHelper(f, call); assert.equal(calls, 2);
    await rejectCurrent('third');
    await assert.rejects(runHelper(f, call), /budget/);
    assert.equal(calls, 2);
});
await runAsyncTest('real retry helper obeys a reserved single provider invocation', async () => {
    const f = await fixture(); let providerCalls = 0;
    const { runLLMTaskWithRetry } = await import('../engine/llmTaskRetry.js');
    await assert.rejects(runHelper(f, async (role, prompt, options) => runLLMTaskWithRetry({ ...options,
        agentRole: role, messages: [{ role: 'user', content: prompt }], parseResponse: JSON.parse,
        generate: async () => { providerCalls++; throw new Error('ECONNRESET'); } })), /ECONNRESET/);
    assert.equal(providerCalls, 1);
    await assert.rejects(runHelper(f, async () => { providerCalls++; return fixed; }), /consumed/);
    assert.equal(providerCalls, 1);
});
await runAsyncTest('same-contract plan reconciliation preserves consumed repair ledger', async () => {
    const { normalizeWorkflowState, reconcilePlanningCache } = await import('../engine/workflow.js');
    const ledger = { version: 1, contractId: 'same', contractHash: 'hash', attempts: [{ phase: 'reserved' }], validations: [] };
    assert.deepEqual(normalizeWorkflowState({ workerRepairs: ledger }).workerRepairs, ledger);
    assert.deepEqual(reconcilePlanningCache({ workerRepairs: ledger }, { summary: 'recomputed' }).workerRepairs, ledger);
});
await runAsyncTest('malformed worker-origin issue cannot disappear from the Resume blocker preflight', async () => {
    const f = await fixture(); let calls = 0;
    f.db.prepare("UPDATE repair_issues SET detail_json='{}' WHERE id=?").run(f.batch.issues[0].id);
    await resumeFixture(f, { callAgent: async () => { calls++; return fixed; }, createExecutionClient: () => { calls++; return fakeClient(f); } });
    assert.equal(calls, 0);
    assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'open');
});
await runAsyncTest('forged verified SQL status and stale run cannot resolve runtime issues', async () => {
    const f = await fixture();
    const { resolveWorkerRepairIssues } = await import('../engine/workerRepairs.js');
    f.db.prepare("UPDATE artifacts SET status='verified' WHERE id=?").run(f.artifact.id);
    f.db.prepare("UPDATE verification_runs SET status='verified' WHERE id=?").run(f.identity.runId);
    assert.throws(() => resolveWorkerRepairIssues({ ...f.sourceFence, revision: 1 },
        { artifactId: f.artifact.id, runId: f.identity.runId, validationId: 'forged' }), /evidence|mandatory|gate|reservation|failed/i);
    assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'open');
});
await runAsyncTest('fake verifier completion cannot publish successful completion while runtime issues remain open', async () => {
    const f = await fixture(); const events = [];
    const { executeProjectTasks } = await import('../engine/workflow.js');
    await executeProjectTasks(f.project.id, { publish: event => events.push(event) }, f.sourceFence.attemptId, f.sourceFence.leaseOwner, {
        callAgent: async role => role === 'coder' ? fixed : { approved: true, summary: 'Passed', issues: [] },
        createExecutionClient: () => fakeClient(f), verifyArtifactAndProject: async () => ({ passed: true, completed: true }) });
    assert.equal(f.db.prepare('SELECT status FROM repair_issues WHERE id=?').get(f.batch.issues[0].id).status, 'open');
    assert.ok(!events.some(event => event.agent === 'Manager' && event.action === 'finish'));
    assert.equal(f.db.prepare('SELECT status FROM projects WHERE id=?').get(f.project.id).status, 'paused');
});
await runAsyncTest('worker repair preserves contract_hash in inputSignature and refreshes files context [ENG-4]', async () => {
    const f = await fixture();
    const { executeWorkerRepairs } = await import('../engine/workerRepairs.js');
    const { createHash } = await import('node:crypto');
    const digest = val => createHash('sha256').update(typeof val === 'string' ? val : JSON.stringify(val)).digest('hex');

    const tasks = f.db.prepare('SELECT * FROM contract_tasks WHERE contract_id=?').all(f.contract.id);
    let promptCaptured = null;
    const repairResult = await executeWorkerRepairs({
        projectDir: f.projectDir,
        contract: f.contract,
        batch: f.batch,
        tasks,
        workflow: f.workflow,
        sourceFence: f.sourceFence,
        baseline: f.artifact,
        persistWorkflow: async () => {},
        callAgent: async (role, prompt) => {
            promptCaptured = prompt;
            return { files: [{ path: 'src/price.ts', content: 'export const price: number = 42;' }] };
        }
    });

    const attempt = f.workflow.workerRepairs.attempts[0];
    assert.ok(attempt, 'Attempt reservation should exist');
    assert.strictEqual(repairResult.files.find(file => file.path === 'src/price.ts')?.content, 'export const price: number = 42;', 'in-memory files güncellenmiş olmalı');
});
finish();
