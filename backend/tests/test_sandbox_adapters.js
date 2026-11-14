import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { executeInSandbox } from '../verification/sandboxRunner.js';
import { spawnService, killService } from '../verification/processVerifier.js';
import { PortableSandboxAdapter } from '../verification/adapters/portableSandbox.js';

const { runAsyncTest, finish } = createTestHarness();
await runAsyncTest('0. Docker service command uses constrained loopback isolation', async () => {
    const adapter = new PortableSandboxAdapter('docker', {
        platform: () => 'win32',
        dockerProbe: () => true
    });
    const command = adapter.buildServiceCommand({
        command: 'node',
        args: ['server.js'],
        workspace: 'test-workspace',
        port: 5173
    });
    assert.strictEqual(command.command, 'docker');
    assert.deepStrictEqual(command.args.slice(0, 2), ['run', '--rm']);
    assert.ok(command.args.includes('--cpus') && command.args.includes('2.0'));
    assert.ok(command.args.includes('--memory') && command.args.includes('1g'));
    assert.ok(command.args.includes('--memory-swap') && command.args.includes('1g'));
    assert.ok(command.args.includes('--pids-limit') && command.args.includes('100'));
    assert.ok(command.args.includes('--security-opt') && command.args.includes('no-new-privileges:true'));
    assert.ok(command.args.includes('--cap-drop') && command.args.includes('ALL'));
    assert.ok(command.args.includes('--tmpfs') && command.args.includes('/tmp:rw,noexec,nosuid,size=64m'));
    assert.ok(command.args.includes('-p') && command.args.includes('127.0.0.1:5173:5173'));
    assert.ok(!command.args.some(value => value.includes('0.0.0.0:')));
    assert.ok(command.args.includes('node:22.23.2-alpine'));
});

await runAsyncTest('1. Sandbox runner should route execution to injected adapter', async () => {
    const calls = [];
    const fixtureAdapter = {
        id: 'fixture',
        getCapabilities: () => ({ available: true, isolation: true }),
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
        executeInSandbox('node', ['-e', '0'], {
            adapter: new PortableSandboxAdapter('bubblewrap', { platform: () => 'unsupported-host' }),
            workspace: 'test-workspace'
        }),
        error => error.code === 'SANDBOX_UNAVAILABLE'
    );
});

await runAsyncTest('3. Process services use adapter-provided sandbox lifecycle', async () => {
    const adapter = {
        id: 'fixture',
        getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
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
