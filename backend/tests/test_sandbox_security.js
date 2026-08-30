import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import {
    executeInSandbox,
    getActiveSandboxAdapter,
    scrubEnvironmentVariables,
    SandboxInitializationError
} from '../verification/sandboxRunner.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Sandbox security: scrub sensitive API keys and credentials from environment', async () => {
    const rawEnv = {
        PATH: '/usr/bin',
        OPENAI_API_KEY: 'sk-secret-12345',
        ANTHROPIC_API_KEY: 'ant-secret-12345',
        GEMINI_API_KEY: 'gemini-secret-12345',
        DEEPSEEK_API_KEY: 'deepseek-secret',
        DB_PASSWORD: 'super-secret-password',
        XFACTOR_SECRET: 'top-secret',
        PUBLIC_VAR: 'hello-world'
    };

    const scrubbed = scrubEnvironmentVariables(rawEnv);
    assert.strictEqual(scrubbed.PUBLIC_VAR, 'hello-world');
    assert.strictEqual(scrubbed.PATH, '/usr/bin');
    assert.strictEqual(scrubbed.OPENAI_API_KEY, undefined);
    assert.strictEqual(scrubbed.ANTHROPIC_API_KEY, undefined);
    assert.strictEqual(scrubbed.GEMINI_API_KEY, undefined);
    assert.strictEqual(scrubbed.DEEPSEEK_API_KEY, undefined);
    assert.strictEqual(scrubbed.DB_PASSWORD, undefined);
    assert.strictEqual(scrubbed.XFACTOR_SECRET, undefined);
});

await runAsyncTest('2. Sandbox security: fail-closed when requested adapter is unrecognized or unavailable', async () => {
    assert.throws(
        () => getActiveSandboxAdapter('nonexistent-adapter'),
        error => error instanceof SandboxInitializationError && error.code === 'SANDBOX_UNAVAILABLE'
    );

    const unavailableAdapter = {
        id: 'fake-docker',
        isAvailable() { return false; },
        async execute() { return { passed: true }; }
    };

    await assert.rejects(
        executeInSandbox('node', ['-e', '0'], { adapter: unavailableAdapter }),
        error => error.code === 'SANDBOX_UNAVAILABLE'
    );
});

await runAsyncTest('3. Sandbox security: real active adapter executes command with scrubbed environment', async () => {
    const requested = process.env.XFACTOR_TEST_SANDBOX_ADAPTER || null;
    try {
        const adapter = getActiveSandboxAdapter(requested);
        if (adapter && adapter.isAvailable()) {
            const result = await executeInSandbox('node', ['-e', 'console.log(process.env.OPENAI_API_KEY || "CLEAN")'], {
                adapter,
                env: {
                    OPENAI_API_KEY: 'leaked-key-test',
                    TEST_PUBLIC: 'safe-value'
                },
                workspace: process.cwd(),
                timeoutMs: 5000
            });

            assert.strictEqual(result.passed, true);
            assert.ok(result.stdout.includes('CLEAN'), 'Sensitive environment variable must be scrubbed');
        }
    } catch (err) {
        assert.strictEqual(err.code, 'SANDBOX_UNAVAILABLE');
    }
});

finish();
