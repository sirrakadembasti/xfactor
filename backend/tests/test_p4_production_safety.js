import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { executeInSandbox } from '../verification/sandboxRunner.js';
import { WindowsSandboxAdapter } from '../verification/adapters/windowsSandbox.js';

async function runAsyncTest(name, fn) {
    try { await fn(); console.log(`[PASS] ${name}`); }
    catch (error) { console.error(`[FAIL] ${name}: ${error.message}`); throw error; }
}

await runAsyncTest('P4.2 blocks Windows adapter without proven OS isolation capabilities', async () => {
    const fakeAdapter = { id: 'windows', getCapabilities: () => ({ available: false, reason: 'restricted token unavailable' }), isAvailable: () => true, async execute() { throw new Error('must not execute'); } };
    await assert.rejects(executeInSandbox('node', [], { adapter: fakeAdapter }), /SANDBOX_UNAVAILABLE|restricted token unavailable/);
});
await runAsyncTest('P4.2 Windows availability requires proven isolation', async () => {
    const adapter = new WindowsSandboxAdapter(); const capabilities = adapter.getCapabilities();
    assert.strictEqual(capabilities.available, false); assert.strictEqual(capabilities.isolation, false); assert.strictEqual(adapter.isAvailable(), false);
});
await runAsyncTest('P4.2 portable adapter reports structured capability metadata', async () => {
    const { PortableSandboxAdapter } = await import('../verification/adapters/portableSandbox.js');
    const capabilities = new PortableSandboxAdapter('bubblewrap').getCapabilities();
    for (const key of ['available', 'adapterId', 'isolation', 'jobObject', 'resourceLimits', 'workspaceAcl', 'networkDenied', 'envScrubbed', 'reason']) assert(Object.prototype.hasOwnProperty.call(capabilities, key));
    if (!capabilities.available) assert.match(capabilities.reason, /not available/i);
});
await runAsyncTest('P4.2 unsupported portable adapter fails closed', async () => {
    const { PortableSandboxAdapter } = await import('../verification/adapters/portableSandbox.js');
    const adapter = new PortableSandboxAdapter('bogus');
    const capabilities = adapter.getCapabilities();
    assert.strictEqual(adapter.isAvailable(), false);
    assert.strictEqual(capabilities.available, false);
    assert.match(capabilities.reason, /Unsupported/i);
    const result = await adapter.execute({ command: process.execPath });
    assert.strictEqual(result.status, 'BLOCKED');
});
await runAsyncTest('P4.2 returns complete capability metadata and scrubs secret environment keys', async () => {
    let receivedEnv;
    const capabilities = { available: true, adapterId: 'capable-test', isolation: true, jobObject: true, resourceLimits: true, workspaceAcl: true, networkDenied: true, envScrubbed: true, reason: null };
    const fakeAdapter = { id: 'capable-test', getCapabilities: () => capabilities, async execute(options) { receivedEnv = options.env; return { status: 'PASS', passed: true, exitCode: 0, stdout: 'ok', stderr: '' }; } };
    const result = await executeInSandbox('node', [], { adapter: fakeAdapter, env: { SAFE_VALUE: 'kept', API_KEY: 'must-not-pass' } });
    for (const key of ['adapterId', 'isolation', 'jobObject', 'resourceLimits', 'workspaceAcl', 'networkDenied', 'envScrubbed']) assert.strictEqual(result.capabilities[key], capabilities[key]);
    assert.strictEqual(result.adapterId, 'capable-test'); assert.strictEqual(receivedEnv.API_KEY, undefined);
});
await runAsyncTest('P4.3 rejects sandbox adapters without proven capabilities', async () => {
    const { spawnService } = await import('../verification/processVerifier.js');
    await assert.rejects(spawnService('backend', { command: process.execPath }, {}, { adapter: { id: 'unknown', isAvailable: () => true, spawn() { throw new Error('must not execute'); } } }), /SANDBOX_UNAVAILABLE|no proven capabilities|unavailable/);
});
await runAsyncTest('P4.3 service spawn uses sandbox boundary and blocks when sandbox unavailable', async () => {
    const { spawnService } = await import('../verification/processVerifier.js');
    const adapter = { id: 'fake-unavailable', getCapabilities: () => ({ available: false, reason: 'no job object' }), async execute() { throw new Error('must not execute service on host'); } };
    await assert.rejects(spawnService('backend', { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] }, {}, { adapter }), /SANDBOX_UNAVAILABLE|no job object/);
});
await runAsyncTest('P4.3 missing build script is BLOCKED not PASS for mandatory framework_build', async () => {
    const { validateProjectBuild } = await import('../engine/buildValidator.js'); const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'p4-no-build-'));
    try { await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ scripts: {} })); const result = await validateProjectBuild(tmp, { title: 'No Build Script' }, {}); assert.strictEqual(result.passed, false); assert(result.checks.some(c => c.name === 'framework_build' && c.status !== 'passed')); }
    finally { await fs.rm(tmp, { recursive: true, force: true }); }
});
