import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { verifyTestInfrastructure } from '../verification/testInfrastructureVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-test-infra-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. verifyTestInfrastructure should fail when no test script is declared', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'no-tests-project',
            scripts: {}
        }));

        const result = await verifyTestInfrastructure(workspace, {});
        assert.strictEqual(result.passed, false);
        assert.ok(result.checks.some(c => c.name === 'test_script_presence' && c.status === 'failed'));
    });

    await runAsyncTest('2. verifyTestInfrastructure should pass when test script succeeds in sandbox', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'valid-test-project',
            scripts: {
                test: 'node test.js'
            }
        }));

        const mockSandboxAdapter = {
            id: 'mock-sandbox',
            isAvailable() { return true; },
            async execute() {
                return {
                    status: 'PASS',
                    passed: true,
                    exitCode: 0,
                    stdout: '1 passing (20ms)',
                    stderr: ''
                };
            }
        };

        const result = await verifyTestInfrastructure(workspace, {}, { adapter: mockSandboxAdapter });
        assert.strictEqual(result.passed, true);
        assert.ok(result.checks.some(c => c.name === 'test_suite_execution' && c.status === 'passed'));
    });

    await runAsyncTest('3. verifyTestInfrastructure should fail when test suite execution fails', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'failing-test-project',
            scripts: {
                test: 'node test.js'
            }
        }));

        const mockFailingAdapter = {
            id: 'mock-sandbox',
            isAvailable() { return true; },
            async execute() {
                return {
                    status: 'FAIL',
                    passed: false,
                    exitCode: 1,
                    stdout: '',
                    stderr: 'AssertionError [ERR_ASSERTION]: Expected true to equal false'
                };
            }
        };

        const result = await verifyTestInfrastructure(workspace, {}, { adapter: mockFailingAdapter });
        assert.strictEqual(result.passed, false);
        assert.ok(result.checks.some(c => c.name === 'test_suite_execution' && c.status === 'failed'));
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
