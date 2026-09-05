import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p5-execution-boundary');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });
const { executeInSandbox } = await import('../verification/sandboxRunner.js');
const { spawnService } = await import('../verification/processVerifier.js');
const originalMode = process.env.XFACTOR_BUILD_SANDBOX;
process.env.XFACTOR_BUILD_SANDBOX = 'host';

try {
    let executeCalls = 0;
    const unavailable = {
        id: 'unavailable-test',
        getCapabilities: () => ({
            available: false,
            isolation: false,
            reason: 'no isolation capability'
        }),
        async execute() {
            executeCalls += 1;
            throw new Error('unavailable adapter must not execute');
        }
    };

    await assert.rejects(
        executeInSandbox(process.execPath, ['--version'], {
            adapter: unavailable,
            allowHostExecution: true
        }),
        error => error?.code === 'SANDBOX_UNAVAILABLE'
    );
    assert.strictEqual(executeCalls, 0, 'unavailable adapter must not execute');
    let unisolatedExecuteCalls = 0;
    const unisolated = {
        id: 'available-but-unisolated',
        getCapabilities: () => ({
            available: true,
            isolation: false,
            reason: 'isolation is not proven'
        }),
        async execute() {
            unisolatedExecuteCalls += 1;
            throw new Error('unisolated adapter must not execute');
        }
    };
    await assert.rejects(
        executeInSandbox(process.execPath, ['-e', 'process.exit(0)'], { adapter: unisolated }),
        error => error?.code === 'SANDBOX_UNAVAILABLE'
    );
    assert.strictEqual(unisolatedExecuteCalls, 0, 'available but unisolated adapter must not execute');

    let spawnCalls = 0;
    const unavailableServiceAdapter = {
        ...unavailable,
        async spawn() {
            spawnCalls += 1;
            throw new Error('unavailable adapter must not spawn');
        }
    };
    await assert.rejects(
        spawnService('p5-service', {
            command: process.execPath,
            args: ['-e', 'process.exit(0)'],
            cwd: process.env.PROJECTS_ROOT
        }, {}, {
            adapter: unavailableServiceAdapter,
            allowHostExecution: true
        }),
        /SANDBOX_UNAVAILABLE|no isolation capability/
    );
    assert.strictEqual(spawnCalls, 0, 'unavailable adapter must not spawn');
    let unisolatedSpawnCalls = 0;
    const unisolatedServiceAdapter = {
        ...unisolated,
        getCapabilities: () => ({
            available: true,
            isolation: false,
            serviceSpawn: true,
            reason: 'isolation is not proven'
        }),
        async spawn() {
            unisolatedSpawnCalls += 1;
            throw new Error('unisolated adapter must not spawn');
        }
    };
    await assert.rejects(
        spawnService('p5-unisolated-service', {
            command: process.execPath,
            args: ['-e', 'process.exit(0)'],
            cwd: process.env.PROJECTS_ROOT
        }, {}, { adapter: unisolatedServiceAdapter }),
        error => error?.code === 'SANDBOX_UNAVAILABLE'
    );
    assert.strictEqual(unisolatedSpawnCalls, 0, 'available but unisolated adapter must not spawn');

    let capableExecuteCalls = 0;
    let receivedInput = null;
    const capable = {
        id: 'isolated-test',
        getCapabilities: () => ({
            available: true,
            isolation: true,
            adapterId: 'isolated-test',
            envScrubbed: true
        }),
        async execute(input) {
            capableExecuteCalls += 1;
            receivedInput = input;
            return {
                status: 'PASS',
                passed: true,
                exitCode: 0,
                stdout: input.command,
                stderr: ''
            };
        }
    };
    const result = await executeInSandbox('node', ['--version'], {
        adapter: capable,
        env: { SAFE_VALUE: 'kept', API_KEY: 'must-not-pass' }
    });
    assert.strictEqual(result.passed, true);
    assert.strictEqual(receivedInput.env.SAFE_VALUE, 'kept');
    assert.strictEqual(receivedInput.env.API_KEY, undefined);
    assert.strictEqual(result.adapterId, 'isolated-test');
    assert.strictEqual(capableExecuteCalls, 1, 'capable adapter must execute exactly once');

    console.log('[PASS] P5 generated execution requires proven sandbox capability');
} finally {
    if (originalMode === undefined) {
        delete process.env.XFACTOR_BUILD_SANDBOX;
    } else {
        process.env.XFACTOR_BUILD_SANDBOX = originalMode;
    }
    await isolated.cleanup();
}
