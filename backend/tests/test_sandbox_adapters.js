import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { executeInSandbox } from '../verification/sandboxRunner.js';
import { spawnService, killService } from '../verification/processVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Sandbox runner should route execution to injected adapter', async () => {
    const calls = [];
    const fixtureAdapter = {
        id: 'fixture',
        getCapabilities: () => ({ available: true }),
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

await runAsyncTest('3. Process services use adapter-provided sandbox lifecycle', async () => {
    const adapter = {
        id: 'fixture',
        getCapabilities: () => ({ available: true, serviceSpawn: true }),
        async spawn() {
            const { spawn } = await import('child_process');
            return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'pipe', 'pipe'] });
        },
        killProcessTree(pid) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    };
    const handle = await spawnService('fixture', { command: 'ignored', cwd: process.cwd() }, {}, { adapter });
    assert.ok(handle.pid > 0);
    await killService(handle.processTreeHandle);
});

await runAsyncTest('4. Service spawning blocks adapters without a sandbox lifecycle', async () => {
    await assert.rejects(
        spawnService('blocked', {}, {}, { adapter: { id: 'execute-only', getCapabilities: () => ({ available: true }), execute: async () => ({}) } }),
        /long-running process boundary/
    );
});

finish();
