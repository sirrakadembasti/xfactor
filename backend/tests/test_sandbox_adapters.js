import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { executeInSandbox } from '../verification/sandboxRunner.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Sandbox runner should route execution to injected adapter', async () => {
    const calls = [];
    const fixtureAdapter = {
        id: 'fixture',
        async execute(request) {
            calls.push(request);
            return { status: 'PASS', passed: true, exitCode: 0, stdout: 'hello', stderr: '' };
        }
    };

    const result = await executeInSandbox('node', ['-e', 'console.log("hello")'], {
        adapter: fixtureAdapter,
        workspace: 'test-workspace'
    });

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].command, 'node');
    assert.deepStrictEqual(calls[0].args, ['-e', 'console.log("hello")']);
    assert.strictEqual(calls[0].workspace, 'test-workspace');
});

await runAsyncTest('2. Sandbox runner should fail-closed with SANDBOX_UNAVAILABLE when no valid adapter is available', async () => {
    await assert.rejects(
        executeInSandbox('node', ['-e', '0'], { adapter: null, workspace: 'test-workspace' }),
        error => error.code === 'SANDBOX_UNAVAILABLE'
    );
});

finish();
