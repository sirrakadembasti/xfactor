import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { registerProjectRepairRoutes, buildRepairSourceFacts, failedCheckSourcePaths, repairProposalTimeoutMs, failingTapBlocks,
    REPAIR_PROPOSAL_MIN_TIMEOUT_MS, REPAIR_PROPOSAL_CORRECTION_ROUNDS } from '../routes/projectRepairRoutes.js';
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
        contextOverflow: async () => [],
        contextBase: async path => ({ bytes: 196000, paths: [path, 'package.json'] }),
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
let supplied, conversations = [];
await runAsyncTest('a target whose context exceeds the Coder budget is rejected after bounded corrections and never published', () => exercise(async f => {
    const response = await f.request(); const body = await response.json();
    assert.equal(response.status, 400); assert.equal(body.code, 'CONTROLLED_REPAIR_PLAN_INVALID');
    assert.match(body.error, /src\/app\.ts/); assert.equal(f.published.length, 0); assert.equal(f.activeRequests.size, 0);
    assert.deepEqual(supplied.files, [{ path: 'src/app.ts', sha256: hash, bytes: Buffer.byteLength('current source') }]);
    assert.equal(conversations.length, 1 + REPAIR_PROPOSAL_CORRECTION_ROUNDS);
    const correction = conversations.at(-1).at(-1);
    assert.equal(correction.role, 'user'); assert.match(correction.content, /Coder bağlam sınırını/);
    // The model sees what the Coder context really holds: the automatic baseline and the room left for references.
    assert.match(correction.content, /src\/app\.ts: hedef ve otomatik eklenen proje dosyaları \(src\/app\.ts, package\.json\) zaten 196000 bayt/);
    assert.match(correction.content, /yaklaşık 608 bayt kalıyor/);
}, { contextOverflow: async targets => targets.map(target => target.path),
    managerResponder: async messages => { conversations.push(messages); supplied = JSON.parse(messages.find(m => m.role === 'user').content); return JSON.stringify(payload); } }));
await runAsyncTest('a rejected plan goes back to the model with its reason and its corrected plan is published', () => {
    const answers = [JSON.stringify({ ...payload, targets: [{ ...payload.targets[0], checkIds: [] }] }), JSON.stringify(payload)];
    conversations = [];
    return exercise(async f => {
        const response = await f.request(); assert.equal(response.status, 200, await response.clone().text());
        assert.equal(f.published.length, 1); assert.equal(conversations.length, 2);
        const [system, user, previous, correction] = conversations[1];
        assert.equal(system.role, 'system'); assert.equal(user.role, 'user');
        assert.deepEqual(previous, { role: 'assistant', content: answers[0] });
        assert.match(correction.content, /src\/app\.ts checkIds: boş/);
    }, { managerResponder: async messages => { conversations.push(messages); return answers[conversations.length - 1]; } });
});
await runAsyncTest('a later correction keeps the earlier rejection reasons so the model does not trade one violation for another', () => {
    const answers = [JSON.stringify({ ...payload, targets: [{ ...payload.targets[0], checkIds: [] }] }), JSON.stringify(payload), JSON.stringify(payload)];
    let overflowChecks = 0;
    conversations = [];
    return exercise(async f => {
        const response = await f.request(); assert.equal(response.status, 200, await response.clone().text());
        assert.equal(f.published.length, 1); assert.equal(conversations.length, 3);
        const first = conversations[1].at(-1).content, second = conversations[2].at(-1).content;
        assert.doesNotMatch(first, /Önceki turların ret nedenleri/);
        assert.match(second, /Coder bağlam sınırını/); assert.match(second, /referanslar için yaklaşık \d+ bayt kalıyor/);
        assert.match(second, /Önceki turların ret nedenleri de hâlâ geçerli.*\(1\).*src\/app\.ts checkIds: boş/);
    }, { contextOverflow: async targets => (++overflowChecks === 1 ? targets.map(target => target.path) : []),
        managerResponder: async messages => { conversations.push(messages); return answers[conversations.length - 1]; } });
});
await runAsyncTest('an unverifiable repair history is a clear 409 and the proposal is not saved', () => exercise(async f => {
    const response = await f.request(); const body = await response.json();
    assert.equal(response.status, 409); assert.equal(body.code, 'CONTROLLED_REPAIR_LINEAGE_BLOCKED');
    assert.match(body.error, /^Onarım geçmişi doğrulanamadığı için öneri kaydedilmedi; kaynaklar değişmedi\./);
    assert.equal(f.activeRequests.size, 0);
}, { publishProposal: async () => { throw Object.assign(new Error('Controlled repair lineage blocked: history entry changed before compaction'),
    { code: 'CONTROLLED_REPAIR_LINEAGE_BLOCKED' }); } }));
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
await runAsyncTest('failing TAP subtests reach the proposal even when the excerpt drops the middle', async () => {
    const tap = ['TAP version 13', '# Subtest: first', 'ok 1 - first', '  ---', '  ...', '# Subtest: build',
        'not ok 2 - REQ-7 build succeeds', '  ---', "  error: |-", '    Expected values to be strictly equal:', "    + '⚠ React 18 support is deprecated'", "    - ''",
        "  stack: |-", '    TestContext.<anonymous> (/workspace/tests/system.test.js:563:10)', '  ...',
        '# Subtest: third', 'ok 3 - third', '1..3', '# tests 3', '# pass 2', '# fail 1'].join('\n');
    const blocks = failingTapBlocks(tap);
    assert.equal(blocks.length, 1);
    assert.match(blocks[0], /^not ok 2 - REQ-7 build succeeds/);
    assert.match(blocks[0], /React 18 support is deprecated/);
    assert.match(blocks[0], /system\.test\.js:563/);
    assert.doesNotMatch(blocks[0], /ok 3 - third/);
    assert.deepEqual(failingTapBlocks('ok 1 - fine\n# pass 1'), []);
    assert.deepEqual(failingTapBlocks(null), []);
    const many = Array.from({ length: 20 }, (_, i) => `not ok ${i + 1} - t${i}\n  error: ${'x'.repeat(900)}`).join('\n');
    const bounded = failingTapBlocks(many);
    assert.ok(bounded.length >= 1 && bounded.join('').length <= 6000, 'the total stays bounded');

    let supplied;
    await exercise(async f => { assert.equal((await f.request()).status, 200); }, {
        loadContext: async () => ({ ...fixture(), checks: [{ id: 'suite', run_id: 'r', contract_id: 'c', gate_name: 'test_suite_execution',
            applicability: 'MANDATORY', status: 'FAIL', reason: 'Suite failed', stdout: 'x'.repeat(5000) + '\n' + tap + '\n' + 'y'.repeat(5000) }] }),
        managerResponder: async messages => { supplied = messages; return JSON.stringify({ ...payload, targets: [{ ...payload.targets[0], checkIds: ['suite'] }] }); }
    });
    const suite = JSON.parse(supplied.find(message => message.role === 'user').content).checks.find(check => check.id === 'suite');
    assert.doesNotMatch(suite.stdout, /not ok 2/, 'the head/tail excerpt alone would hide the failure');
    assert.match(suite.failingTests[0], /system\.test\.js:563/);
});

await runAsyncTest('failed checks name only whole known source paths, never secrets or passing output', async () => {
    const files = ['tests/test-helper.ts', 'src/app.ts', 'src/app.tsx', 'src/services/product.service.ts', '.env', 'tests/unused.ts']
        .map(path => ({ path }));
    const checks = [
        { status: 'FAIL', stderr: "tests/test-helper.ts(68,54): error TS2345: Argument is not assignable.\nsrc/app.tsx(3,1): warning" },
        { status: 'BLOCKED', reason: 'Missing value in /tmp/job-1/.env and C:\\work\\job\\src\\services\\product.service.ts' },
        { status: 'PASS', stdout: 'tests/unused.ts passed' }
    ];
    assert.deepEqual(failedCheckSourcePaths(checks, files), ['tests/test-helper.ts', 'src/app.tsx']);
    assert.deepEqual(failedCheckSourcePaths([{ status: 'FAIL', reason: 'see src/services/product.service.ts:12' }], files),
        ['src/services/product.service.ts']);
    assert.deepEqual(failedCheckSourcePaths([], files), []);
});
await runAsyncTest('source facts spend the budget on named failures and tested behaviour before routers', async () => {
    const file = (path, bytes) => ({ path, content: Buffer.from(`// ${path}\n` + 'x'.repeat(bytes)) });
    const files = [
        file('src/routes/product.routes.ts', 3000),
        file('src/routes/category.routes.ts', 3000),
        file('src/controllers/product.controller.ts', 1000),
        file('src/services/product.service.ts', 1000),
        file('src/validations/product.validation.ts', 1000),
        file('package.json', 200),
        file('tests/test-helper.ts', 1500),
        file('tests/unrelated-helper.ts', 100)
    ];
    const facts = buildRepairSourceFacts(files, 6000, [], ['tests/test-helper.ts']);
    const included = facts.files.filter(entry => !entry.omitted).map(entry => entry.path);
    assert.deepEqual(included.slice(0, 4), ['tests/test-helper.ts', 'src/services/product.service.ts',
        'src/validations/product.validation.ts', 'package.json']);
    assert.ok(included.includes('src/controllers/product.controller.ts'));
    assert.ok(facts.files.some(entry => entry.path === 'src/routes/product.routes.ts' && entry.omitted), 'routers yield the remaining budget');
    assert.ok(!facts.files.some(entry => entry.path === 'tests/unrelated-helper.ts'), 'an unnamed helper is not source context');
    assert.equal(facts.truncated, true);
    const unnamed = buildRepairSourceFacts(files, 6000, [], ['.env']);
    assert.ok(!unnamed.files.some(entry => entry.path === 'tests/test-helper.ts'), 'a helper enters only when a failure names it');
});
await runAsyncTest('proposal waits at least four minutes, follows a longer profile and stays within the LLM limit', async () => {
    assert.equal(repairProposalTimeoutMs(120000), REPAIR_PROPOSAL_MIN_TIMEOUT_MS);
    assert.equal(repairProposalTimeoutMs(null), REPAIR_PROPOSAL_MIN_TIMEOUT_MS);
    assert.equal(repairProposalTimeoutMs('not-a-number'), REPAIR_PROPOSAL_MIN_TIMEOUT_MS);
    assert.equal(repairProposalTimeoutMs(280000), 280000);
    assert.equal(repairProposalTimeoutMs(900000), 300000);
    let options;
    await exercise(async f => { assert.equal((await f.request()).status, 200); }, {
        activeProfileTimeoutMs: () => 270000,
        managerResponder: async (_messages, supplied) => { options = supplied; return JSON.stringify(payload); }
    });
    assert.equal(options.timeoutMs, 270000);
    assert.equal(options.maxOutputTokens, 32768);
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
