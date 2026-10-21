import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { spawnService, killService } from '../verification/processVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. spawnService should spawn background service and killService should terminate process tree', async () => {
    const handle = await spawnService(
        'mock-api-service',
        {
            command: process.execPath,
            args: ['-e', 'setInterval(() => {}, 1000)']
        },
        { TEST_CUSTOM_PORT: '5555' },
        { timeoutMs: 10000 }
    );

    assert.ok(handle);
    assert.ok(typeof handle.pid === 'number' && handle.pid > 0);
    assert.ok(handle.processTreeHandle);

    await killService(handle.processTreeHandle);
});

await runAsyncTest('2. spawnService should scrub host secrets from subprocess environment', async () => {
    process.env.TEST_LEAK_SECRET_KEY = 'super_secret_value_12345';

    const handle = await spawnService(
        'mock-secret-inspector',
        {
            command: process.execPath,
            args: ['-e', 'console.log(JSON.stringify({ secret: process.env.TEST_LEAK_SECRET_KEY }))']
        },
        {},
        {}
    );

    assert.ok(handle.pid > 0);
    const exitResult = await handle.exitCodePromise;
    assert.strictEqual(exitResult.exitCode, 0);

    const parsed = JSON.parse(exitResult.stdout || '{}');
    assert.strictEqual(parsed.secret, undefined, 'Host secret must be scrubbed from subprocess');

    delete process.env.TEST_LEAK_SECRET_KEY;
    await killService(handle.processTreeHandle);
});

await runAsyncTest('3. only a valid explicit test secret crosses the scrubbed service boundary', async () => {
    const supplied = { AUTH_SECRET: 'host-secret', JWT_SECRET: 'host-jwt', NEXTAUTH_SECRET: 'host-session' };
    for (const secret of [undefined, 'invalid', 'a'.repeat(64)]) {
        let received;
        const adapter = { id: 'fixture', getCapabilities: () => ({ available: true, isolation: true }),
            async spawn(request) { received = request.env; return { pid: 1 }; }, async kill() {} };
        await spawnService('fixture', { command: 'node', args: [] }, supplied,
            { adapter, applicationTestSecret: secret });
        for (const key of Object.keys(supplied)) {
            assert.equal(received[key], secret?.length === 64 ? secret : undefined);
        }
    }
});

finish();
