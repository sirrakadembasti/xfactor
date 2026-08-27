import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const exitCodes = [];
const harness = createTestHarness({
    log: () => {},
    error: () => {},
    setExitCode: code => exitCodes.push(code)
});

harness.runTest('passing sync test', () => {});
harness.runTest('failing sync test', () => {
    throw new Error('expected failure');
});
await harness.runAsyncTest('passing async test', async () => {});

assert.deepStrictEqual(harness.getCounts(), {
    passedTests: 2,
    failedTests: 1
});
assert.deepStrictEqual(harness.finish(), {
    passedTests: 2,
    failedTests: 1
});
assert.deepStrictEqual(exitCodes, [1]);

console.log('[PASS] test harness propagates assertion failures');
