import assert from 'node:assert/strict';
import test from 'node:test';

async function evaluate(input) {
    const module = await import('../verification/requirementCoverage.js');
    assert.equal(typeof module.evaluateRequirementCoverage, 'function', 'explicit requirement ownership evaluator is missing');
    return module.evaluateRequirementCoverage(input);
}
const concrete = (overrides = {}) => ({ id: 'api-create', name: 'api_create_assertion', status: 'PASS', exitCode: 0, requirementIds: ['db-req-1'], ...overrides });

test('only concrete passing checks with explicit own IDs cover authoritative requirements', async () => {
    const result = await evaluate({ mandatoryRequirementIds: ['db-req-1', 'db-req-2'], checks: [concrete(), concrete({id:'browser-journey', name:'browser_journey_steps', requirementIds:['db-req-2'], status:'passed'})] });
    assert.equal(result.status, 'PASS');
    assert.equal(result.passed, true);
    assert.deepEqual(result.coveredRequirementIds, ['db-req-1', 'db-req-2']);
    assert.deepEqual(result.missingRequirementIds, []);
    assert.deepEqual(result.unknownRequirementIds, []);
    assert.deepEqual(result.sources, [{requirementId:'db-req-1',checkIds:['api-create']},{requirementId:'db-req-2',checkIds:['browser-journey']}]);
});

test('missing, empty, duplicate and malformed authoritative scope stays blocked', async () => {
    for (const mandatoryRequirementIds of [undefined, [], ['db-req-1','db-req-1'], [''], [4], 'db-req-1']) {
        const result = await evaluate({mandatoryRequirementIds, checks:[concrete()]});
        assert.equal(result.status, 'BLOCKED');
        assert.equal(result.passed, false);
        assert.ok(result.issues.length > 0);
    }
});

test('failed, skipped, blocked, timed out, contradictory exit status and anonymous checks supply no ownership', async () => {
    for (const overrides of [{status:'FAIL'}, {status:'NOT_APPLICABLE'}, {status:'BLOCKED'}, {timedOut:true}, {exitCode:1}, {id:undefined}, {name:undefined}]) {
        const result = await evaluate({mandatoryRequirementIds:['db-req-1'], checks:[concrete(overrides)]});
        assert.equal(result.passed, false);
        assert.deepEqual(result.missingRequirementIds, ['db-req-1']);
        assert.deepEqual(result.sources, []);
    }
});

test('traceability, smoke and marked aggregate evidence cannot create ownership', async () => {
    for (const overrides of [
        {name:'requirement_traceability'}, {name:'smoke_gate'},
        {evidence:{kind:'derived_gate'}}, {evidence:{producer:'aggregate-verification'}},
        {evidenceJson:{evidence:{kind:'derived_gate'}}},
        {evidence:{sourceCheckIds:['other-check']}}, {evidence:{kind:'aggregate'}},
        {kind:'derived_gate'}, {aggregate:true}
    ]) {
        const result = await evaluate({mandatoryRequirementIds:['db-req-1'], checks:[concrete(overrides)]});
        assert.equal(result.passed, false);
        assert.deepEqual(result.coveredRequirementIds, []);
    }
});

test('malformed check inventories and opaque serialized evidence remain blocked', async () => {
    for (const checks of [undefined, {}, [null], [3], [concrete({evidenceJson:'{"kind":"derived_gate"}'})]]) {
        const result = await evaluate({mandatoryRequirementIds:['db-req-1'],checks});
        assert.equal(result.passed,false);
        assert.deepEqual(result.missingRequirementIds,['db-req-1']);
    }
});

test('unknown, malformed or duplicate claims and duplicate check IDs block even alongside real coverage', async () => {
    for (const extra of [
        concrete({id:'other',requirementIds:['other-contract-id']}),
        concrete({id:'other',requirementIds:['db-req-1','db-req-1']}),
        concrete({id:'other',requirementIds:'db-req-1'}),
        concrete({id:'other',requirementIds:[null]}), concrete()
    ]) {
        const result = await evaluate({mandatoryRequirementIds:['db-req-1'],checks:[concrete(),extra]});
        assert.equal(result.passed, false);
        assert.ok(result.issues.length > 0);
    }
    const unknown = await evaluate({mandatoryRequirementIds:['db-req-1'],checks:[concrete(),concrete({id:'unknown',status:'FAIL',requirementIds:['other-contract-id']})]});
    assert.deepEqual(unknown.unknownRequirementIds,['other-contract-id']);
});

test('ownership stays local, unclaimed checks do not inherit scope, input is unchanged', async () => {
    const input = {mandatoryRequirementIds:['db-req-1','db-req-2'],checks:[concrete(),{id:'build',name:'framework_build',status:'PASS'}]};
    const before = JSON.stringify(input);
    const result = await evaluate(input);
    assert.equal(result.passed,false);
    assert.deepEqual(result.coveredRequirementIds,['db-req-1']);
    assert.deepEqual(result.missingRequirementIds,['db-req-2']);
    assert.equal(JSON.stringify(input),before);
    assert.deepEqual(result.sources,[{requirementId:'db-req-1',checkIds:['api-create']}]);
});

test('all evidence aliases reject present opaque or malformed evidence at every supported nesting', async () => {
    for (const alias of ['evidence', 'evidenceJson', 'evidence_json']) {
        for (const opaque of [undefined, null, 0, false, 'serialized', '{"kind":"derived_gate"}', []]) {
            for (const value of [opaque, {evidence:opaque}, {evidenceJson:opaque}, {evidence_json:opaque}, {evidence:{evidence:opaque}}]) {
                const check = {id:'c',gate_name:'framework_build',status:'PASS',exit_code:0,requirementIds:['r'],[alias]:value};
                const result = await evaluate({mandatoryRequirementIds:['r'],checks:[check]});
                assert.equal(result.passed,false,`${alias}: ${JSON.stringify(value)}`);
                assert.deepEqual(result.coveredRequirementIds,[]);
            }
        }
        const nestedDerived = await evaluate({mandatoryRequirementIds:['r'],checks:[concrete({requirementIds:['r'],[alias]:{evidence_json:{kind:'derived_gate'}}})]});
        assert.equal(nestedDerived.passed,false);
    }
});
