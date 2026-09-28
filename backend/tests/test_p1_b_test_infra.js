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
                test: 'node --test test.js'
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
                test: 'node --test test.js'
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

    await runAsyncTest('4. a passing placeholder script is not a test suite', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'placeholder-project', scripts: { test: 'echo "No tests specified" && exit 0' }
        }));
        const result = await verifyTestInfrastructure(workspace, {});
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'test_script_presence')?.status, 'failed');
    });

    await runAsyncTest('5. echo ok cannot satisfy the mandatory test gate', async () => {
        const adapter = {
            id: 'fake-success', getCapabilities: () => ({ available: true, isolation: true }),
            async execute() { return { passed: true, exitCode: 0, stdout: 'ok', stderr: '' }; }
        };
        const result = await verifyTestInfrastructure('/workspace', {}, {
            adapter, files: [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'echo ok' } }) }]
        });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'test_script_presence')?.status, 'failed');
    });

    await runAsyncTest('6. a runner that finds zero tests cannot pass', async () => {
        const adapter = {
            id: 'empty-suite', getCapabilities: () => ({ available: true, isolation: true }),
            async execute() { return { passed: true, exitCode: 0, stdout: '# tests 0\n# pass 0', stderr: '' }; }
        };
        const result = await verifyTestInfrastructure('/workspace', {}, {
            adapter, files: [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test' } }) }]
        });
        assert.equal(result.checks.find(check => check.name === 'test_suite_execution')?.status, 'failed');
        assert.equal(result.passed, false);
    });

    await runAsyncTest('7. a silent runner cannot prove any test executed', async () => {
        const adapter = {
            id: 'silent-suite', getCapabilities: () => ({ available: true, isolation: true }),
            async execute() { return { passed: true, exitCode: 0, stdout: '', stderr: '' }; }
        };
        const result = await verifyTestInfrastructure('/workspace', {}, {
            adapter, files: [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test tests/empty.test.js' } }) }]
        });
        assert.equal(result.checks.find(check => check.name === 'test_suite_execution')?.status, 'failed');
        assert.equal(result.passed, false);
    });

    await runAsyncTest('8. a chained echo cannot forge a passing test summary', async () => {
        const adapter = {
            id: 'forged-suite', getCapabilities: () => ({ available: true, isolation: true }),
            async execute() { return { passed: true, exitCode: 0, stdout: '# tests 1\n# pass 1', stderr: '' }; }
        };
        const result = await verifyTestInfrastructure('/workspace', {}, {
            adapter, files: [{ path: 'package.json', content: JSON.stringify({
                scripts: { test: "node --test tests/empty.test.js > /dev/null; echo '# tests 1'" }
            }) }]
        });
        assert.equal(result.checks.find(check => check.name === 'test_script_presence')?.status, 'failed');
        assert.equal(result.passed, false);
    });

    await runAsyncTest('9. a custom Node script cannot forge runner output', async () => {
        const result = await verifyTestInfrastructure('/workspace', {}, {
            files: [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node tests/fake.test.js' } }) }]
        });
        assert.equal(result.checks.find(check => check.name === 'test_script_presence')?.status, 'failed');
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
