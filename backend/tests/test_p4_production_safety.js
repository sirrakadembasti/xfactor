import assert from 'assert';
import { executeInSandbox } from '../verification/sandboxRunner.js';
import { WindowsSandboxAdapter } from '../verification/adapters/windowsSandbox.js';

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`[PASS] ${name}`);
    } catch (error) {
        console.error(`[FAIL] ${name}: ${error.message}`);
        throw error;
    }
}

await runAsyncTest('P4.2 blocks Windows adapter without proven OS isolation capabilities', async () => {
    const fakeAdapter = {
        id: 'windows',
        getCapabilities() {
            return {
                available: false,
                adapterId: 'windows',
                isolation: false,
                jobObject: false,
                resourceLimits: false,
                workspaceAcl: false,
                networkDenied: false,
                envScrubbed: true,
                reason: 'restricted token unavailable'
            };
        },
        isAvailable() { return true; },
        async execute() { throw new Error('must not execute without capabilities'); }
    };

    await assert.rejects(
        executeInSandbox('node', ['-e', 'console.log(1)'], { adapter: fakeAdapter, workspace: process.cwd() }),
        /SANDBOX_UNAVAILABLE|restricted token unavailable/
    );
});

await runAsyncTest('P4.2 Windows availability requires proven isolation, not platform identity', async () => {
    const adapter = new WindowsSandboxAdapter();
    const capabilities = adapter.getCapabilities();

    assert.strictEqual(capabilities.adapterId, 'windows');
    assert.strictEqual(capabilities.available, false);
    assert.strictEqual(capabilities.isolation, false);
    assert.strictEqual(capabilities.jobObject, false);
    assert.strictEqual(adapter.isAvailable(), capabilities.available);
});

await runAsyncTest('P4.2 returns capability metadata and scrubs secret environment keys', async () => {
    let receivedEnv;
    const capabilities = {
        available: true,
        adapterId: 'capable-test',
        isolation: true,
        jobObject: true,
        resourceLimits: true,
        workspaceAcl: true,
        networkDenied: true,
        envScrubbed: true,
        reason: null
    };
    const fakeAdapter = {
        id: 'capable-test',
        getCapabilities() { return capabilities; },
        async execute(options) {
            receivedEnv = options.env;
            return {
                status: 'PASS',
                passed: true,
                exitCode: 0,
                stdout: 'ok',
                stderr: '',
                timedOut: false,
                aborted: false
            };
        }
    };

    const result = await executeInSandbox('node', [], {
        adapter: fakeAdapter,
        workspace: process.cwd(),
        env: { SAFE_VALUE: 'kept', API_KEY: 'must-not-pass' }
    });

    assert.strictEqual(result.status, 'PASS');
    assert.strictEqual(result.adapterId, 'capable-test');
    assert.deepStrictEqual(result.capabilities, capabilities);
    assert.strictEqual(receivedEnv.SAFE_VALUE, 'kept');
    assert.strictEqual(receivedEnv.API_KEY, undefined);
});
