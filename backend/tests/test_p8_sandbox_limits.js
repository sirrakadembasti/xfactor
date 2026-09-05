import assert from 'assert';
import { execFileSync } from 'child_process';
import { createTestHarness } from './testHarness.js';
import {
    DEFAULT_SANDBOX_LIMITS,
    PortableSandboxAdapter,
    buildDockerIsolationArgs
} from '../verification/adapters/portableSandbox.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('P8.1 Docker isolation arguments enforce exact limits and loopback binding', async () => {
    const args = buildDockerIsolationArgs({ port: 5173 });
    assert.deepStrictEqual(DEFAULT_SANDBOX_LIMITS, {
        cpus: '2.0',
        memory: '1g',
        memorySwap: '1g',
        pids: '100',
        tmpfs: '/tmp:rw,noexec,nosuid,size=64m'
    });
    for (const expected of [
        '--cpus', '2.0',
        '--memory', '1g',
        '--memory-swap', '1g',
        '--pids-limit', '100',
        '--security-opt', 'no-new-privileges:true',
        '--cap-drop', 'ALL',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
        '-p', '127.0.0.1:5173:5173'
    ]) assert.ok(args.includes(expected), `missing Docker isolation argument: ${expected}`);
    assert.ok(!args.some(value => /(^|:)0\.0\.0\.0/.test(value) || value.includes('0.0.0.0:')),
        'Docker port binding must not wildcard-bind');
});

await runAsyncTest('P8.2 Docker capability probing is OS-independent and fail-closed', async () => {
    const availableOnWindows = new PortableSandboxAdapter('docker', {
        platform: () => 'win32',
        dockerProbe: () => true
    });
    const availableCapabilities = availableOnWindows.getCapabilities();
    assert.strictEqual(availableCapabilities.available, true);
    assert.strictEqual(availableCapabilities.resourceLimits, true);

    const unavailableOnWindows = new PortableSandboxAdapter('docker', {
        platform: () => 'win32',
        dockerProbe: () => { throw new Error('Docker unavailable'); }
    });
    const unavailableCapabilities = unavailableOnWindows.getCapabilities();
    assert.strictEqual(unavailableCapabilities.available, false);
    assert.strictEqual(unavailableCapabilities.resourceLimits, false);
    const blocked = await unavailableOnWindows.execute({ command: 'node', args: ['--version'] });
    assert.strictEqual(blocked.status, 'BLOCKED');
    assert.strictEqual(blocked.passed, false);
});

await runAsyncTest('P8.3 Docker cgroups enforce memory, PID, and CPU limits', async () => {
    const adapter = new PortableSandboxAdapter('docker');
    if (!adapter.getCapabilities().available) {
        console.log('[SKIP] P8.3 Docker is unavailable; CI requires a real Docker run.');
        return;
    }

    const containerName = `xfactor-p8-limits-${process.pid}-${Date.now()}`;
    try {
        const result = await adapter.execute({
            command: 'node',
            args: ['-e', [
                "const fs = require('fs');",
                "for (const name of ['memory.max', 'pids.max', 'cpu.max']) console.log(`${name}=${fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim()}`);"
            ].join(' ')],
            containerName,
            timeoutMs: 120000
        });
        assert.strictEqual(result.status, 'PASS', result.stderr);
        const values = Object.fromEntries(result.stdout.trim().split(/\r?\n/).map(line => line.split('=')));
        const memory = Number(values['memory.max']);
        const pids = Number(values['pids.max']);
        const [quota, period] = values['cpu.max'].split(/\s+/).map(Number);
        assert.ok(Number.isFinite(memory) && memory <= 1024 ** 3, `memory.max=${values['memory.max']}`);
        assert.strictEqual(pids, 100, `pids.max=${values['pids.max']}`);
        assert.ok(Number.isFinite(quota) && Number.isFinite(period) && quota / period <= 2,
            `cpu.max=${values['cpu.max']}`);
        console.log(`[CGROUP] memory.max=${memory} pids.max=${pids} cpu.max=${quota} ${period}`);
    } finally {
        try {
            execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
        } catch {}
    }
});

finish();
