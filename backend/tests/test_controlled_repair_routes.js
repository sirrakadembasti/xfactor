import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { registerProjectRepairRoutes, buildRepairSourceFacts } from '../routes/projectRepairRoutes.js';
import { inspectControlledRepairPlan } from '../engine/controlledRepairPlan.js';
import { buildManagerChatContext, buildManagerChatSystemPrompt } from '../routes/projectRoutes.js';
import { createTestHarness } from './testHarness.js';
const { runAsyncTest, finish } = createTestHarness();
const hash = 'a'.repeat(64);
const fixture = () => ({ projectId: 'p', contract: { id: 'c', status: 'approved', revision: 3,
    contract_hash: hash, contract_json: JSON.stringify({ requirements: [{ id: 'REQ-1' }] }) },
    artifact: { id: 'a', project_id: 'p', contract_id: 'c', sha256: hash, verification_run_id: 'r' },
    run: { id: 'r', project_id: 'p', contract_id: 'c', status: 'failed' },
    files: [{ path: 'src/app.ts', sha256: hash, content: Buffer.from('current source') }], projectedRequirementIds: [],
    checks: [{ id: 'check', run_id: 'r', contract_id: 'c', gate_name: 'lint', applicability: 'MANDATORY', status: 'FAIL', reason: 'Actual lint failure' }] });
const payload = { summary: 'Mevcut çalışmanın hatasını düzelt.', targets: [{ path: 'src/app.ts', create: false,
    requirementIds: ['REQ-1'], checkIds: ['check'], instructions: 'Davranışı koruyarak lint hatasını düzelt.', referencePaths: [] }] };
async function exercise(test, overrides = {}) {
    const context = fixture(), state = { id: 'p', revision: 7, status: 'paused', workflow: { preserved: true } };
    const published = [], activeRequests = new Set(); let calls = 0, unhandled = 0;
    const deps = { requireAuth: (req, _res, next) => { req.user = { id: 'owner' }; next(); },
        projectAccess: level => (_req, _res, next) => { assert.equal(level, 'owner'); next(); },
        loadContext: async () => structuredClone(context), readState: async () => structuredClone(state),
        isBusy: () => false, activeRequests, managerResponder: async () => { calls++; return JSON.stringify(payload); },
        publishProposal: async value => { published.push(value); return { ...state, workflow: { ...state.workflow, controlledRepair: value.proposal } }; },
        ...overrides };
    const router = Router(); registerProjectRepairRoutes(router, deps);
    // Exercise the real router/middleware in process: no socket capability is needed.
    const request = (body = { contractId: 'c' }) => new Promise((resolve, reject) => {
        const req = { method: 'POST', url: '/p/repair-proposal', body, headers: {} };
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) {
            const result = { status: this.statusCode, json: async () => value, text: async () => JSON.stringify(value) };
            result.clone = () => result; resolve(result);
        } };
        router.handle(req, res, error => { unhandled++; return error ? res.status(error.status || 500).json({ code: error.code, error: error.message }) : reject(new Error('Route not found')); });
    });
    await test({ request, context, state, published, activeRequests, get calls() { return calls; }, get unhandled() { return unhandled; } });
}
await runAsyncTest('prepare publishes an inspected proposal without approval, execution or replacing the workflow cache', () => exercise(async f => {
    const response = await f.request(); assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json(); assert.equal(result.workflow.controlledRepair.contractId, 'c');
    assert.equal(result.workflow.preserved, true); assert.equal(result.status, 'paused');
    assert.equal(f.published[0].expectedRevision, 7); assert.equal(f.calls, 1); assert.equal(f.activeRequests.size, 0);
}));
await runAsyncTest('stale contract and active attempt never dispatch a model', async () => {
    await exercise(async f => { assert.equal((await f.request({ contractId: 'old' })).status, 409); assert.equal(f.calls, 0); });
    await exercise(async f => { assert.equal((await f.request()).status, 409); assert.equal(f.calls, 0); }, { isBusy: () => true });
});
await runAsyncTest('a promise in prose is not a repair plan and is never published', () => exercise(async f => {
    assert.equal((await f.request()).status, 400); assert.equal(f.published.length, 0); assert.equal(f.activeRequests.size, 0);
}, { managerResponder: async () => 'Eksikleri düzelteceğim, tamamlandı.' }));
await runAsyncTest('source changes during the model request discard the proposal', () => exercise(async f => {
    const pending = f.request(); const response = await pending; assert.equal(response.status, 409); assert.equal(f.published.length, 0);
}, { loadContext: (() => { let reads = 0; return async () => { const c = fixture(); if (++reads > 1) c.files[0].sha256 = 'b'.repeat(64); return c; }; })() }));
await runAsyncTest('a chat already in progress blocks the proposal request', () => exercise(async f => {
    f.activeRequests.add('p'); assert.equal((await f.request()).status, 409); assert.equal(f.calls, 0);
}));
await runAsyncTest('owner access is required before any project data is read', () => exercise(async f => {
    assert.equal((await f.request()).status, 403); assert.equal(f.calls, 0);
}, { projectAccess: () => (_req, res) => res.status(403).json({ error: 'Forbidden' }), loadContext: async () => { throw new Error('Must not read'); } }));
await runAsyncTest('a project revision change during preparation is rejected rather than overwriting concurrent changes', () => exercise(async f => {
    assert.equal((await f.request()).status, 409); assert.equal(f.published.length, 0);
}, { readState: (() => { let reads = 0; return async () => ({ id: 'p', revision: ++reads === 1 ? 7 : 8, status: 'paused' }); })() }));
await runAsyncTest('Manager receives structural assertion diagnostics for the current artifact', () => exercise(async f => {
    assert.equal((await f.request()).status, 200);
}, {
    loadContext: async () => {
        const context = fixture();
        context.checks[0].gate_name = 'requirement_assertions';
        context.files.push({ path: 'tests/system.test.js', sha256: hash, content: Buffer.from("const test = require('node:test');") });
        for (const file of context.files) file.sha256 = createHash('sha256').update(file.content).digest('hex');
        return context;
    },
    managerResponder: async messages => {
        const { assertionScan, sourceFacts } = JSON.parse(messages.find(message => message.role === 'user').content);
        assert.equal(assertionScan.candidateCount, 0);
        assert.equal(assertionScan.diagnostics[0].testFile, 'tests/system.test.js');
        assert.equal(sourceFacts.files[0].path, 'tests/system.test.js');
        assert.match(sourceFacts.files[0].content, /node:test/);
        return JSON.stringify(payload);
    }
}));
await runAsyncTest('Manager sees the proposal action and its actual unapplied phase without gaining authority from project text', async () => {
    const state = { status: 'paused', repairPreparation: { available: true, revision: 3, contractId: 'c' },
        workflow: { controlledRepair: { phase: 'proposed', proposal: { ...payload, contractId: 'c', ready: true, planHash: hash } } } };
    const raw = buildManagerChatContext(state, null), context = JSON.parse(raw.slice(raw.indexOf('\n') + 1));
    assert.equal(context.repairPreparation.available, true); assert.equal(context.controlledRepair.phase, 'proposed');
    assert.equal(context.controlledRepair.applied, false); assert.equal(context.recoveryAction, 'prepare_controlled_repair');
    assert.match(buildManagerChatSystemPrompt(), /repairPreparation.available=true/);
    assert.ok(!buildManagerChatSystemPrompt().includes(payload.summary));
});
await runAsyncTest('Manager cannot present an outdated proposal as ready', async () => {
    const raw = buildManagerChatContext({ id: 'missing-project', status: 'paused', workflow: {
        controlledRepair: { phase: 'proposed', proposal: { ...payload, contractId: 'c', baselineRunId: 'old-run', ready: true, planHash: hash } }
    } }, null);
    const { controlledRepair } = JSON.parse(raw.slice(raw.indexOf('\n') + 1));
    assert.equal(controlledRepair.stale, true);
    assert.equal(controlledRepair.ready, false);
    assert.deepEqual(controlledRepair.targets, []);
});
await runAsyncTest('proposal source facts include bounded current runtime wiring, never secrets files or partial code presented as complete', async () => {
    const facts = buildRepairSourceFacts([
        { path: 'service-manifest.json', content: Buffer.from('{"services":{"web":{"port":3000}}}') },
        { path: 'package.json', content: Buffer.from('x'.repeat(40000)) },
        { path: 'src/routes/product.routes.ts', content: Buffer.from('/*'+'x'.repeat(20000)+'*/ export const router = true;') },
        { path: '.env', content: Buffer.from('SECRET=private-value') },
        { path: 'src/app.ts', content: Buffer.from('export const app = true;') }
    ]);
    assert.ok(facts.files.some(file => file.path === 'service-manifest.json' && file.content.includes('3000')));
    assert.ok(facts.files.some(file => file.path === 'package.json' && file.omitted === true && file.content === undefined));
    assert.ok(facts.files.some(file => file.path === 'src/routes/product.routes.ts' && file.content?.endsWith('export const router = true;') && !file.omitted));
    assert.ok(!JSON.stringify(facts).includes('private-value'));assert.equal(facts.truncated,true);
});
await runAsyncTest('model timeout is actionable and releases the request without publishing or changing sources', () => exercise(async f => {
    const response = await f.request(); const result = await response.json();
    assert.equal(response.status, 503); assert.equal(result.code, 'LLM_PROVIDER_ERROR');
    assert.match(result.error, /kaynaklar değiştirilmedi/i);
    assert.ok(!JSON.stringify(result).includes('private-provider-detail'));
    assert.equal(f.published.length, 0); assert.equal(f.activeRequests.size, 0);
    assert.equal(f.unhandled, 0, 'Known safe provider errors must not become generic global 500 responses');
}, { managerResponder: async () => { throw Object.assign(new Error('private-provider-detail'), { name: 'TimeoutError' }); } }));
await runAsyncTest('Manager receives explicit requirements lacking historical task ownership rather than fabricated links', async () => {
    let supplied;
    await exercise(async f => {
        assert.equal((await f.request()).status, 200);
        assert.deepEqual(supplied.unprojectedMandatoryRequirements.map(r => r.id), ['REQ-1']);
        assert.deepEqual(supplied.projectedRequirementIds, []);
        assert.deepEqual(supplied.requiredFailedChecks.map(c => c.id), ['check']);
        assert.equal(supplied.previousProposal, null, 'No proposal may be invented when there is no current baseline');
    }, { managerResponder: async messages => {
        const system = messages.filter(message => message.role === 'system');
        assert.equal(system.length, 1);
        assert.match(system[0].content, /requiredFailedChecks/);
        assert.match(system[0].content, /Router \.handle/);
        supplied = JSON.parse(messages.find(m => m.role === 'user').content);
        return JSON.stringify(payload);
    } });
});
await runAsyncTest('Manager receives current successful behavior separately so missing ownership never implies a broken seed', async()=>{
    let supplied;
    const context=fixture();context.checks.push({id:'seed-pass',run_id:'r',contract_id:'c',gate_name:'prisma_seed_accounts',status:'PASS',applicability:'MANDATORY',reason:'Two isolated accounts verified.'});
    await exercise(async f=>{
        assert.equal((await f.request()).status,200);
        assert.deepEqual(supplied.successfulChecks,[{id:'seed-pass',gate:'prisma_seed_accounts',status:'PASS',reason:'Two isolated accounts verified.'}]);
        assert.deepEqual(supplied.requiredFailedChecks.map(c=>c.id),['check']);
    },{loadContext:async()=>structuredClone(context),managerResponder:async messages=>{supplied=JSON.parse(messages.find(m=>m.role==='user').content);return JSON.stringify(payload);}});
});
await runAsyncTest('proposal feedback is only reused for the exact contract, run and source inventory', async () => {
    const baseline = inspectControlledRepairPlan(payload, fixture());
    for (const delta of [{}, { contractId: 'old-contract' }, { baselineRunId: 'old-run' }, { baselineSourceHash: 'b'.repeat(64) }]) {
        let supplied;
        const previous = { ...baseline, ...delta };
        await exercise(async f => {
            assert.equal((await f.request()).status, 200);
            assert.deepEqual(supplied.previousProposal, Object.keys(delta).length ? null : previous);
        }, {
            readState: async () => ({ id: 'p', revision: 7, status: 'paused', workflow: { controlledRepair: { proposal: previous } } }),
            managerResponder: async messages => { supplied = JSON.parse(messages.find(m => m.role === 'user').content); return JSON.stringify(payload); }
        });
    }
});
await runAsyncTest('a proposal invalid under current behavior-reference policy is never reused as Manager guidance',async()=>{
    const baseline=inspectControlledRepairPlan(payload,fixture());
    const previous={...baseline,targets:[...baseline.targets,{path:'tests/unit.test.js',create:true,requirementIds:['REQ-1'],checkIds:['check'],instructions:'Real tests',referencePaths:[]}]};
    let supplied;
    await exercise(async f=>{assert.equal((await f.request()).status,200);assert.equal(supplied.previousProposal,null);}, {
        readState:async()=>({id:'p',revision:7,status:'paused',workflow:{controlledRepair:{proposal:previous}}}),
        managerResponder:async messages=>{supplied=JSON.parse(messages.find(m=>m.role==='user').content);return JSON.stringify(payload);}
    });
});
finish();
