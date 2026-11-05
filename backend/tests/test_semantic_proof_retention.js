import test from 'node:test';
import assert from 'node:assert/strict';
import { retainSemanticEvidence } from '../verification/workerFailures.js';
test('semantic proof keeps bounded complete TAP and locale entries without changing their bytes', () => {
    const stdout = 'TAP version 13\r\n' + '# diagnostic\r\n'.repeat(2000);
    const value = { assertionExecution: { stdout }, inventory: { snapshots: [{ entries: Array.from({length: 400}, (_,i) => ({kind:'text',text:`Etiket ${i}`})) }] } };
    const before = JSON.stringify(value);
    const retained = retainSemanticEvidence(value);
    assert.equal(retained.assertionExecution.stdout, stdout);
    assert.equal(retained.inventory.snapshots[0].entries.length, 400);
    assert.equal(JSON.stringify(value), before);
    assert.deepEqual(retained, value);
});
test('sensitive, oversized and excessive-depth proof is rejected rather than silently rewritten', () => {
    assert.throws(() => retainSemanticEvidence({ stdout: 'password=private-secret-sentinel' }), /sensitive/i);
    assert.throws(() => retainSemanticEvidence({ stdout: 'x'.repeat(131073) }), /limit/i);
    let nested = {}; for(let i=0;i<40;i++) nested={nested};
    assert.throws(() => retainSemanticEvidence(nested), /limit/i);
});
