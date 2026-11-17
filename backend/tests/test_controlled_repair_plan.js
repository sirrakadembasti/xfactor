import assert from 'node:assert/strict';
import { createTestHarness } from './testHarness.js';
import { inspectControlledRepairPlan } from '../engine/controlledRepairPlan.js';

const { runTest, finish } = createTestHarness();
const sha = char => char.repeat(64);
function fixture() {
    return {
        context: {
            projectId: 'repair-project',
            contract: { id: 'approved-contract', status: 'approved', revision: 3, contract_hash: sha('a'),
                contract_json: JSON.stringify({ requirements: [{ id: 'REQ-1', mandatory: true }, { id: 'REQ-2', mandatory: true }] }) },
            artifact: { id: 'baseline-artifact', project_id: 'repair-project', contract_id: 'approved-contract', sha256: sha('b'), verification_run_id: 'failed-run' },
            run: { id: 'failed-run', project_id: 'repair-project', contract_id: 'approved-contract', status: 'failed' },
            files: [{ path: 'src/app.ts', sha256: sha('c') }, { path: 'src/routes.ts', sha256: sha('d') }, { path: 'package.json', sha256: sha('e') }],
            checks: [{ id: 'cors-check', run_id: 'failed-run', contract_id: 'approved-contract', gate_name: 'security_baseline', status: 'FAIL', applicability: 'MANDATORY', reason: 'Wildcard CORS' },
                { id: 'test-check', run_id: 'failed-run', contract_id: 'approved-contract', gate_name: 'test_infrastructure', status: 'BLOCKED', applicability: 'MANDATORY', reason: 'No executed tests' }],
            projectedRequirementIds: ['REQ-1']
        },
        payload: { summary: 'Bağlantı iznini ve gerçek uygulama testini düzelt.', targets: [
            { path: 'src/app.ts', create: false, requirementIds: ['REQ-1'], checkIds: ['cors-check'], instructions: 'Onaylı ön yüz adresine izin ver.', referencePaths: ['src/routes.ts'] },
            { path: 'tests/app.test.js', create: true, requirementIds: ['REQ-2'], checkIds: ['test-check'], instructions: 'Gerçek API davranışını sına.', referencePaths: ['src/app.ts'] }
        ] }
    };
}
function inspect(change) { const f = fixture(); change?.(f); return inspectControlledRepairPlan(f.payload, f.context); }
function invalid(change, code = 'CONTROLLED_REPAIR_PLAN_INVALID') {
    assert.throws(() => inspect(change), error => error.code === code);
}

runTest('repair proposal pins the same approved contract, failed artifact and exact target bytes without mutating inputs', () => {
    const f = fixture(), before = structuredClone(f);
    const plan = inspectControlledRepairPlan(f.payload, f.context);
    assert.equal(plan.contractId, 'approved-contract');
    assert.equal(plan.contractRevision, 3);
    assert.equal(plan.baselineArtifactId, 'baseline-artifact');
    assert.equal(plan.baselineRunId, 'failed-run');
    assert.equal(plan.targets[0].sourceSha256, sha('c'));
    assert.equal(plan.targets[1].sourceSha256, null);
    assert.deepEqual(plan.uncoveredRequirementIds, []);
    assert.match(plan.planHash, /^[a-f0-9]{64}$/);
    assert.equal(plan.planHash, inspectControlledRepairPlan(f.payload, f.context).planHash);
    assert.deepEqual(f, before);
});
runTest('rejection reasons name the target, the wrong ids and the valid failing checks so a model can correct them', () => {
    assert.throws(() => inspect(f => { f.payload.targets[0].checkIds = ['cors-check', 'old-check']; }),
        error => error.code === 'CONTROLLED_REPAIR_PLAN_INVALID' && error.message.includes('src/app.ts: old-check')
            && error.message.includes('Geçerli kimlikler: cors-check, test-check.'));
    assert.throws(() => inspect(f => { f.payload.targets[0].requirementIds = ['REQ-9']; }), /src\/app\.ts: REQ-9/);
    assert.throws(() => inspect(f => { f.payload.targets[0].checkIds = []; }), /src\/app\.ts checkIds: boş/);
    assert.throws(() => inspect(f => { f.payload.targets[1].referencePaths = ['package.json']; }), /\(tests\/app\.test\.js\)\. Test dışı bir uygulama kaynağı/);
});
runTest('changing exact repair instructions changes the approval hash', () => {
    assert.notEqual(inspect().planHash, inspect(f => { f.payload.targets[0].instructions += ' Günlükleri koru.'; }).planHash);
});
runTest('a lint gate reference does not cover omitted files with observed lint locations', () => {
    invalid(f => {
        f.context.checks[0].gate_name = 'lint';
        f.context.checks[0].stdout = '/workspace/src/routes.ts:42:5\n';
    });
});
runTest('behavior test proposals require actual application subject references rather than package metadata',()=>{
    invalid(f=>{f.payload.targets[1].referencePaths=['package.json'];});
    invalid(f=>{f.payload.targets[1].referencePaths=[];});
});
runTest('clean installation timeout is an environment blocker and cannot authorize generated source repair',()=>{
 invalid(f=>{f.context.checks[0].gate_name='clean_install';f.context.checks[0].reason='Clean install sandbox error: Command timed out';});
});
runTest('a passing seed cannot be rewritten merely to supply missing historical requirement ownership',()=>{
    const f=fixture();f.context.files.push({path:'prisma/seed.ts',sha256:sha('f')});
    f.context.checks.push({id:'seed-ok',run_id:'failed-run',contract_id:'approved-contract',gate_name:'prisma_seed_accounts',status:'PASS',applicability:'MANDATORY'});
    f.payload.targets[0].path='prisma/seed.ts';
    assert.throws(()=>inspectControlledRepairPlan(f.payload,f.context),/seed/i);
    f.context.checks.push({id:'seed-fail',run_id:'failed-run',contract_id:'approved-contract',gate_name:'prisma_seed',status:'FAIL',applicability:'MANDATORY'});
    f.payload.targets[0].checkIds.push('seed-fail');
    assert.equal(inspectControlledRepairPlan(f.payload,f.context).ready,true);
});
runTest('source inventory changes invalidate the proposal approval hash', () => {
    assert.notEqual(inspect().planHash, inspect(f => { f.context.files[0].sha256 = sha('f'); }).planHash);
});
runTest('source lockfile addition, removal and changes are bound by the complete inventory hash', () => {
    const added = inspect(f => { f.context.files.push({ path: 'package-lock.json', sha256: sha('a') }); });
    const changed = inspect(f => { f.context.files.push({ path: 'package-lock.json', sha256: sha('b') }); });
    assert.notEqual(inspect().planHash, added.planHash);
    assert.notEqual(added.planHash, changed.planHash);
});
runTest('a draft contract or another artifact/run cannot authorize repair', () => {
    invalid(f => { f.context.contract.status = 'pending_approval'; }, 'CONTROLLED_REPAIR_STALE');
    invalid(f => { f.context.artifact.contract_id = 'other-contract'; }, 'CONTROLLED_REPAIR_STALE');
    invalid(f => { f.context.run.id = 'another-run'; }, 'CONTROLLED_REPAIR_STALE');
    invalid(f => { f.context.run.status = 'running'; }, 'CONTROLLED_REPAIR_STALE');
    invalid(f => { f.context.artifact.project_id = 'foreign-project'; }, 'CONTROLLED_REPAIR_STALE');
    invalid(f => { delete f.context.run.id; delete f.context.artifact.verification_run_id; }, 'CONTROLLED_REPAIR_STALE');
});
runTest('checks must belong to the exact failed run and approved contract', () => {
    invalid(f => { f.context.checks[0].run_id = 'older-run'; }, 'CONTROLLED_REPAIR_STALE');
    invalid(f => { f.context.checks[0].contract_id = 'other-contract'; }, 'CONTROLLED_REPAIR_STALE');
});
runTest('payload cannot replace business scope or approve another plan', () => {
    invalid(f => { f.payload.requirements = []; });
    invalid(f => { f.payload.approve = true; });
});
runTest('target requirement and check identifiers must come from the pinned evidence', () => {
    invalid(f => { f.payload.targets[0].requirementIds = ['REQ-UNKNOWN']; });
    invalid(f => { f.payload.targets[0].checkIds = ['unknown-check']; });
    invalid(f => { f.context.checks[0].status = 'PASS'; });
});
runTest('failed mandatory checks must have an explicit repair target', () => {
    invalid(f => { f.payload.targets.pop(); });
    assert.throws(() => inspect(f => { f.payload.targets.pop(); }), error =>
        error.code === 'CONTROLLED_REPAIR_PLAN_INVALID' && /test_infrastructure/.test(error.message));
});
runTest('a missing mandatory requirement ownership link stays visible and is not invented', () => {
    const plan = inspect(f => { f.context.contract.contract_json = JSON.stringify({ requirements: [
        { id: 'REQ-1', mandatory: true }, { id: 'REQ-2', mandatory: true }, { id: 'REQ-3', mandatory: true }
    ] }); });
    assert.deepEqual(plan.uncoveredRequirementIds, ['REQ-3']);
    assert.equal(plan.ready, false);
});
runTest('existing and new targets must describe the baseline honestly', () => {
    invalid(f => { f.payload.targets[0].create = true; });
    invalid(f => { f.payload.targets[1].create = false; });
    invalid(f => { f.payload.targets[0].sourceSha256 = sha('f'); });
});
runTest('path escapes, Windows aliases, secrets and orchestration files are rejected', () => {
    for (const path of ['../outside.ts', 'C:/outside.ts', '/absolute.ts', 'src/../app.ts', '.env', '.npmrc',
        'package-lock.json', 'manager/TODO.md', 'RAPOR.md', 'node_modules/hook.js', 'eslint.config.mjs', 'tsconfig.json']) {
        invalid(f => { f.payload.targets[0].path = path; });
    }
    invalid(f => { f.payload.targets[1].path = 'SRC/APP.TS'; f.payload.targets[1].create = false; });
});
runTest('Windows trailing-component aliases, device names and invalid filename characters are rejected', () => {
    for (const path of ['manager./hook.js', 'manager /hook.js', 'src./app.ts', 'src/CON.ts', 'src/AUX.js', 'src/LPT1.ts', 'src/a?.ts']) {
        invalid(f => { f.payload.targets[1].path = path; });
        invalid(f => { f.context.files.push({ path, sha256: sha('f') }); });
    }
});
runTest('package-manager lockfiles are not repair targets or references', () => {
    for (const path of ['npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb']) {
        invalid(f => { f.payload.targets[1].path = path; });
    }
});
runTest('reference files are read-only and must be in baseline or an earlier declared new target', () => {
    invalid(f => { f.payload.targets[0].referencePaths = ['missing.ts']; });
    invalid(f => { f.payload.targets[0].referencePaths = ['.env']; });
    invalid(f => { f.payload.targets[0].referencePaths = ['tests/app.test.js']; });
    const plan = inspect(f => { f.payload.targets.push({ path: 'tests/second.test.js', create: true,
        requirementIds: ['REQ-2'], checkIds: ['test-check'], instructions: 'Önceki test yardımcılarını kullan.', referencePaths: ['tests/app.test.js'] }); });
    assert.equal(plan.targets.length, 3);
});
runTest('infrastructure launch failures cannot become a source repair approval', () => {
    invalid(f => { f.context.checks[0].reason = 'spawn UNKNOWN'; });
    for (const reason of ['spawn npm ENOENT', 'spawn C:\\worker\\helper.exe EACCES', 'spawn /usr/bin/docker ENOENT']) {
        invalid(f => { f.context.checks[0].reason = reason; });
    }
    invalid(f => { f.context.checks[0].reason = 'LOCAL_HOST_UNAVAILABLE'; });
});
runTest('empty, oversized and malformed proposals fail closed', () => {
    invalid(f => { f.payload.targets = []; });
    invalid(f => { f.payload.targets[0].instructions = 'x'.repeat(4097); });
    invalid(f => { f.payload.targets[0].requirementIds = []; });
    invalid(f => { f.payload.targets[0].referencePaths = 'src/app.ts'; });
    invalid(f => { f.context.files[0].sha256 = 'invalid'; });
    invalid(f => { f.payload.targets = Array.from({ length: 13 }, (_, i) => ({ ...f.payload.targets[1], path: `tests/${i}.test.js` })); });
});
finish();
