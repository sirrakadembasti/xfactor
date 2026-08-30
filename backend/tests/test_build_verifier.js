import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { verifyBuild } from '../verification/buildVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-build-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. verifyBuild should block gates when node_modules is missing', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'mock-no-modules',
            scripts: { build: 'echo build' }
        }));

        const result = await verifyBuild(workspace, { frontend: { framework: 'react' } });
        assert.strictEqual(result.passed, false);
        const buildCheck = result.checks.find(c => c.name === 'framework_build');
        assert.ok(buildCheck);
        assert.strictEqual(buildCheck.status, 'blocked');
    });

    await runAsyncTest('2. verifyBuild should run typecheck and build gates via sandbox when dependencies are present', async () => {
        const workspace = await createTempWorkspace();
        await fs.mkdir(path.join(workspace, 'node_modules'), { recursive: true });
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'mock-valid-build',
            scripts: { build: 'tsc' }
        }));
        await fs.writeFile(path.join(workspace, 'tsconfig.json'), JSON.stringify({
            compilerOptions: { noEmit: true }
        }));

        const mockSandboxAdapter = {
            id: 'mock-sandbox',
            isAvailable() { return true; },
            async execute(req) {
                return {
                    status: 'PASS',
                    passed: true,
                    exitCode: 0,
                    stdout: 'Compilation successful',
                    stderr: ''
                };
            }
        };

        const result = await verifyBuild(workspace, {
            frontend: { framework: 'react' },
            backend: { framework: 'express' }
        }, { adapter: mockSandboxAdapter });

        assert.strictEqual(result.passed, true);
        assert.ok(result.checks.some(c => c.name === 'typecheck' && c.status === 'passed'));
        assert.ok(result.checks.some(c => c.name === 'framework_build' && c.status === 'passed'));
    });

    await runAsyncTest('3. verifyBuild should report compiler failure when sandbox command fails', async () => {
        const workspace = await createTempWorkspace();
        await fs.mkdir(path.join(workspace, 'node_modules'), { recursive: true });
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'mock-failing-build',
            scripts: { build: 'tsc' }
        }));

        const mockFailingAdapter = {
            id: 'mock-sandbox',
            isAvailable() { return true; },
            async execute(req) {
                return {
                    status: 'FAIL',
                    passed: false,
                    exitCode: 1,
                    stdout: '',
                    stderr: 'TS2304: Cannot find name "invalid"'
                };
            }
        };

        const result = await verifyBuild(workspace, {}, { adapter: mockFailingAdapter });
        assert.strictEqual(result.passed, false);
        const buildCheck = result.checks.find(c => c.name === 'framework_build');
        assert.ok(buildCheck);
        assert.strictEqual(buildCheck.status, 'failed');
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
