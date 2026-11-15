import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { verifyTestInfrastructure, TEST_SUITE_TIMEOUT_MS } from '../verification/testInfrastructureVerifier.js';

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

    await runAsyncTest('5b. the suite receives the run demo passwords through the ephemeral channel only', async () => {
        let received;
        const adapter = {
            id: 'env-suite', getCapabilities: () => ({ available: true, isolation: true }),
            async execute(request) { received = request.env; return { passed: true, exitCode: 0, stdout: 'TAP version 13\nok 1 - seeds demo users\n# tests 1\n# pass 1', stderr: '' }; }
        };
        const password = 'p'.repeat(32);
        const result = await verifyTestInfrastructure('/workspace', {}, {
            adapter, env: { DATABASE_URL: 'file:./dev.db', DB_PASSWORD: 'host-secret' },
            ephemeralEnv: { XFACTOR_DEMO_PASSWORD_ADMIN: password },
            files: [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test tests/*.test.js' } }) }]
        });
        assert.equal(result.passed, true);
        assert.deepEqual(received, { DATABASE_URL: 'file:./dev.db', XFACTOR_DEMO_PASSWORD_ADMIN: password });
    });

    await runAsyncTest('5d. a rejecting adapter keeps the failing suite output and never passes', async () => {
        const stdout = 'TAP version 13\nok 1 - seeds demo users\nnot ok 2 - creates a product\n  error: expected 201, got 500\n# tests 2\n# pass 1\n# fail 1';
        const adapter = {
            id: 'docker-like', getCapabilities: () => ({ available: true, isolation: true }),
            async execute() { throw Object.assign(new Error('Command failed with code 1: ...'), { result: { stdout, stderr: '', exitCode: 1, passed: false } }); }
        };
        const files = [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test tests/*.test.js' } }) }];
        const result = await verifyTestInfrastructure('/workspace', {}, { adapter, files });
        const check = result.checks.find(c => c.name === 'test_suite_execution');
        assert.equal(result.passed, false);
        assert.equal(check.status, 'failed');
        assert.equal(check.exitCode, 1);
        assert.match(check.stdout, /not ok 2 - creates a product/);
        assert.match(check.stdout, /expected 201, got 500/);

        const passingButRejected = { ...adapter, async execute() { throw Object.assign(new Error('Output exceeded fixed ceiling'), {
            result: { stdout: 'TAP version 13\nok 1 - real\n# tests 1\n# pass 1', stderr: '', exitCode: 0, passed: false } }); } };
        assert.equal((await verifyTestInfrastructure('/workspace', {}, { adapter: passingButRejected, files })).passed, false,
            'a rejected command can never authorize a pass, even with passing TAP');

        const noResult = { ...adapter, async execute() { throw new Error('spawn failed'); } };
        const bare = (await verifyTestInfrastructure('/workspace', {}, { adapter: noResult, files })).checks.find(c => c.name === 'test_suite_execution');
        assert.equal(bare.status, 'failed');
        assert.match(bare.reason, /Test execution sandbox error: spawn failed/);
    });

    await runAsyncTest('5c. the suite gets five minutes unless the caller sets its own limit', async () => {
        const seen = [];
        const adapter = {
            id: 'timeout-suite', getCapabilities: () => ({ available: true, isolation: true }),
            async execute(request) { seen.push(request.timeoutMs); return { passed: true, exitCode: 0, stdout: 'TAP version 13\nok 1 - real behaviour\n# tests 1\n# pass 1', stderr: '' }; }
        };
        const files = [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test tests/*.test.js' } }) }];
        await verifyTestInfrastructure('/workspace', {}, { adapter, files });
        await verifyTestInfrastructure('/workspace', {}, { adapter, files, timeoutMs: 45000 });
        assert.deepEqual(seen, [TEST_SUITE_TIMEOUT_MS, 45000]);
        assert.equal(TEST_SUITE_TIMEOUT_MS, 300000);
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

    await runAsyncTest('Node tests with the tsx loader require real TAP test cases', async () => {
        const files = [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --import tsx --test tests/*.test.js' } }) },
            { path: 'tests/system.test.js', content: '' }];
        for (const [name, expected] of [['tests/system.test.js', false], ['creates a real category', true]]) {
            const adapter = {
                id: 'tsx-suite', getCapabilities: () => ({ available: true, isolation: true }),
                async execute() { return { passed: true, exitCode: 0, stdout: `TAP version 13\nok 1 - ${name}\n# tests 1\n# pass 1`, stderr: '' }; }
            };
            const result = await verifyTestInfrastructure('/workspace', {}, { adapter, files });
            assert.equal(result.checks.find(check => check.name === 'test_script_presence')?.status, 'passed');
            assert.equal(result.passed, expected);
        }
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

    await runAsyncTest('npm version banner cannot disguise a nonempty TAP suite as zero tests', async () => {
        const adapter = { id: 'tap-fixture', getCapabilities: () => ({ available: true, isolation: true }),
            async execute() { return { passed: true, exitCode: 0, stdout: '> fixture@1.0.0 test\n> node --test\nTAP version 13\n# Subtest: real fixture assertion\nok 1 - real fixture assertion\n# tests 1\n# pass 1\n# fail 0\n', stderr: '' }; } };
        const result = await verifyTestInfrastructure('/workspace', {}, { adapter,
            files: [{ path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test' } }) }] });
        assert.equal(result.passed, true);
    });
    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
