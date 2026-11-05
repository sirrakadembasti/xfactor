import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
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
            getCapabilities() { return { available: true, isolation: true }; },
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
            getCapabilities() { return { available: true, isolation: true }; },
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

    await runAsyncTest('4. Prisma schemas without User do not require seeded accounts', async () => {
        const workspace = await createTempWorkspace();
        const commands = [];
        const adapter = {
            id: 'mock-sandbox',
            getCapabilities() { return { available: true, isolation: true }; },
            isAvailable() { return true; },
            async execute(request) {
                commands.push(`${request.command} ${(request.args || []).join(' ')}`);
                return { status: 'PASS', passed: true, exitCode: 0, stdout: 'ok', stderr: '' };
            }
        };
        const result = await verifyBuild(workspace, {}, {
            adapter,
            files: [
                { path: 'package.json', content: JSON.stringify({ scripts: { build: 'echo ok', 'prisma:seed': 'prisma db seed' }, prisma: { seed: 'tsx prisma/seed.ts' } }) },
                { path: 'prisma/schema.prisma', content: 'model Task { id String @id }' },
                { path: 'prisma/seed.ts', content: 'console.log("seed")' }
            ]
        });
        assert.strictEqual(result.checks.find(check => check.name === 'prisma_seed_accounts')?.status, 'skipped');
        assert.ok(!commands.some(command => command.includes('seed-account-count')));
    });

    await runAsyncTest('5. declared lint script must execute successfully', async () => {
        const adapter = {
            id: 'lint-failure', getCapabilities: () => ({ available: true, isolation: true }),
            async execute(request) {
                const lint = request.args?.join(' ') === 'run lint';
                return { passed: !lint, exitCode: lint ? 1 : 0, stdout: '', stderr: lint ? 'lint error' : '' };
            }
        };
        const result = await verifyBuild('/workspace', {}, {
            adapter, files: [{ path: 'package.json', content: JSON.stringify({ scripts: { build: 'echo ok', lint: 'eslint .' } }) }]
        });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'lint')?.status, 'failed');
    });

    await runAsyncTest('management seed receives fresh isolated credentials before the first account-count audit', async () => {
        const signal = new AbortController().signal;
        let seeded = false, seedRequest;
        const adapter = { id: 'demo-seed-protocol', getCapabilities: () => ({ available: true, isolation: true }),
            execute: async request => {
                if (request.input) {
                    seedRequest = request;
                    const credentials = JSON.parse(request.input);
                    assert.equal(request.env.NODE_ENV, 'test');
                    assert.equal(request.signal, signal);
                    assert.equal(Object.keys(credentials).length, 2);
                    assert.match(credentials.XFACTOR_DEMO_PASSWORD_ADMIN, /^[A-Za-z0-9_-]{32}$/);
                    assert.match(credentials.XFACTOR_DEMO_PASSWORD_WAREHOUSE_STAFF, /^[A-Za-z0-9_-]{32}$/);
                    assert.ok(!request.args.join(' ').includes(credentials.XFACTOR_DEMO_PASSWORD_ADMIN));
                    assert.ok(!Object.keys(request.env).some(key => key.startsWith('XFACTOR_DEMO_PASSWORD_')));
                    seeded = true;
                }
                return { passed: true, exitCode: 0, stdout: request.args?.join(' ').includes('prisma.user.count') ? JSON.stringify({ userCount: seeded ? 2 : 0 }) : 'ok', stderr: '' };
            } };
        const result = await verifyBuild('/workspace', { management: { needed: true, roles: [
            { name: 'admin', demoUser: { username: 'admin-demo' } }, { name: 'warehouse_staff', demoUser: { username: 'depo-demo' } }
        ] } }, { adapter, signal, env: { NODE_ENV: 'production' }, files: [
            { path: 'package.json', content: JSON.stringify({ scripts: { build: 'echo ok', 'prisma:seed': 'prisma db seed' }, prisma: { seed: 'tsx prisma/seed.ts' } }) },
            { path: 'prisma/schema.prisma', content: 'model User { id String @id }' },
            { path: 'prisma/seed.ts', content: 'const password=process.env.XFACTOR_DEMO_PASSWORD_ADMIN;' }
        ] });
        assert.equal(result.checks.find(check => check.name === 'prisma_seed_accounts').status, 'passed');
        assert.ok(seedRequest);assert.equal(result.checks.find(check => check.name === 'prisma_seed').command, `${seedRequest.command} ${seedRequest.args.join(' ')}`);
    });

    const prismaFiles = [
        { path: 'package.json', content: JSON.stringify({ scripts: { build: 'echo ok', 'prisma:seed': 'prisma db seed' }, prisma: { seed: 'tsx prisma/seed.ts' } }) },
        { path: 'prisma/schema.prisma', content: 'model Task { id String @id }' },
        { path: 'prisma/seed.ts', content: 'console.log("seed")' }
    ];
    const reset = 'request to https://binaries.prisma.sh/all_commits/hash/windows/schema-engine.exe.gz.sha256 failed, reason: read ECONNRESET';
    // Sanitized stderr from real verify job 8edfb443, prisma_validate. It contains no engine URL.
    const actualPrismaReset = "warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).\nFor more information, see: https://pris.ly/prisma-config\n\nnode:internal/process/promises:394\n    triggerUncaughtException(err, true /* fromPromise */);\n    ^\n\nError: aborted\n    at TLSSocket.socketCloseListener (node:_http_client:535:19)\n    at TLSSocket.emit (node:events:531:35)\n    at node:net:347:12\n    at TCP.done (node:internal/tls/wrap:748:7) {\n  code: 'ECONNRESET',\n  attemptNumber: 1,\n  retriesLeft: 2\n}\n\nNode.js v22.23.2\n";
    const success = { passed: true, exitCode: 0, stdout: 'schema valid', stderr: '' };
    const adapterFor = execute => ({ id: 'prisma-retry-fixture', getCapabilities: () => ({ available: true, isolation: true }), execute });

    await runAsyncTest('Prisma validate uses a five-minute overall phase while preserving explicit shorter limits and other default budgets', async () => {
        for (const timeoutMs of [undefined, 90000, 600000]) {
            const requests = [];
            await verifyBuild('/workspace', {}, { files: prismaFiles,
                ...(timeoutMs === undefined ? {} : { timeoutMs }),
                adapter: adapterFor(async request => { requests.push(request); return success; }) });
            const validate = requests.find(request => request.args.join(' ') === 'prisma validate');
            const expected = Math.min(timeoutMs ?? 300000, 300000);
            assert.ok(validate.timeoutMs <= expected && validate.timeoutMs >= expected - 1000);
            for (const args of ['prisma generate', 'prisma db push --skip-generate', 'prisma db seed']) {
                assert.equal(requests.find(request => request.args.join(' ') === args)?.timeoutMs, timeoutMs ?? 120000,
                    args + ' retains its existing independent default/operator budget');
            }
        }
    });

    await runAsyncTest('typecheck and framework failures retain adapter timeout output metadata and the actual observation interval', async () => {
        for (const [commandArgs, gate] of [['tsc --noEmit', 'typecheck'], ['run build', 'framework_build']]) {
            const retained = { passed: false, exitCode: null, timedOut: true,
                stdout: 'bounded stdout prefix', stderr: 'bounded stderr prefix', stdoutBytes: 1100000, stderrBytes: 1200000,
                stdoutTruncated: true, stderrTruncated: true,
                stdoutSha256: crypto.createHash('sha256').update('full stdout stream').digest('hex'),
                stderrSha256: crypto.createHash('sha256').update('full stderr stream').digest('hex') };
            const before = Date.now();
            const result = await verifyBuild('/workspace', {}, {
                files: [{ path: 'package.json', content: JSON.stringify({ scripts: { build: 'echo ok' } }) },
                    { path: 'tsconfig.json', content: '{}' }],
                adapter: adapterFor(async request => {
                    if (request.args.join(' ') === commandArgs) {
                        await new Promise(resolve => setTimeout(resolve, 5));
                        throw Object.assign(new Error('Command timed out'), { result: retained });
                    }
                    return success;
                }) });
            const after = Date.now(), check = result.checks.find(row => row.name === gate);
            assert.equal(check.status, 'failed'); assert.equal(check.exitCode, null); assert.equal(check.timedOut, true);
            for (const key of ['stdout', 'stderr', 'stdoutBytes', 'stderrBytes', 'stdoutTruncated', 'stderrTruncated']) {
                assert.equal(check[key], retained[key], gate + ': ' + key);
            }
            assert.equal(check.stdoutDigest, retained.stdoutSha256); assert.equal(check.stderrDigest, retained.stderrSha256);
            assert.equal(check.executionObservation.normalExit, false);
            assert.ok(Date.parse(check.startedAt) >= before && Date.parse(check.startedAt) <= Date.parse(check.endedAt)
                && Date.parse(check.endedAt) <= after, gate + ' retains its own real execution interval');
        }
    });

    await runAsyncTest('Prisma timeout preserves bounded adapter result provenance without inventing a process exit', async () => {
        const retained = {
            passed: false, exitCode: null, timedOut: true,
            stdout: 'partial engine download progress', stderr: 'partial engine diagnostic',
            stdoutBytes: 1048600, stderrBytes: 25,
            stdoutTruncated: true, stderrTruncated: false,
            stdoutSha256: crypto.createHash('sha256').update('complete observed stdout before timeout').digest('hex'),
            stderrSha256: crypto.createHash('sha256').update('partial engine diagnostic').digest('hex')
        };
        let validationCalls = 0;
        const before = Date.now();
        const result = await verifyBuild('/workspace', {}, { files: prismaFiles,
            adapter: adapterFor(async request => {
                if (request.args.join(' ') === 'prisma validate') {
                    validationCalls++;
                    await new Promise(resolve => setTimeout(resolve, 5));
                    throw Object.assign(new Error('Command timed out'), { result: retained });
                }
                return success;
            }) });
        const after = Date.now();
        const check = result.checks.find(row => row.name === 'prisma_validate');
        assert.equal(validationCalls, 1, 'a timed-out process must not be retried as a transport reset');
        assert.deepEqual({ status: check.status, exitCode: check.exitCode, timedOut: check.timedOut,
            stdout: check.stdout, stderr: check.stderr, stdoutBytes: check.stdoutBytes, stderrBytes: check.stderrBytes,
            stdoutTruncated: check.stdoutTruncated, stderrTruncated: check.stderrTruncated,
            stdoutDigest: check.stdoutDigest, stderrDigest: check.stderrDigest }, {
            status: 'failed', exitCode: null, timedOut: true,
            stdout: retained.stdout, stderr: retained.stderr, stdoutBytes: retained.stdoutBytes, stderrBytes: retained.stderrBytes,
            stdoutTruncated: true, stderrTruncated: false,
            stdoutDigest: retained.stdoutSha256, stderrDigest: retained.stderrSha256
        });
        assert.ok(Number.isFinite(Date.parse(check.startedAt)) && Number.isFinite(Date.parse(check.endedAt)), 'failed command needs its real observation interval');
        assert.ok(Date.parse(check.startedAt) >= before && Date.parse(check.startedAt) <= Date.parse(check.endedAt)
            && Date.parse(check.endedAt) <= after, 'failure timestamps must surround this command, not a fabricated instant');
        assert.match(check.reason, /timed out/i);
    });

    await runAsyncTest('Prisma retry classifier reads the actual engine reset from an adapter error.result', async () => {
        let validationCalls = 0;
        const result = await verifyBuild('/workspace', {}, { files: prismaFiles, timeoutMs: 200,
            adapter: adapterFor(async request => {
                if (request.args.join(' ') === 'prisma validate' && ++validationCalls === 1) {
                    throw Object.assign(new Error('Command failed with code 1'), {
                        result: { passed: false, exitCode: 1, timedOut: false, stdout: '', stderr: actualPrismaReset }
                    });
                }
                return success;
            }) });
        assert.equal(validationCalls, 2, 'the complete actual adapter stderr establishes the narrowly allowed engine reset retry');
        const check = result.checks.find(row => row.name === 'prisma_validate');
        assert.equal(check.status, 'passed');
        assert.deepEqual(check.advisory.priorTransientCodes, ['ECONNRESET']);
    });

    await runAsyncTest('Prisma error.result timeout remains non-retryable even when its partial stderr contains an engine reset', async () => {
        let validationCalls = 0;
        await verifyBuild('/workspace', {}, { files: prismaFiles, timeoutMs: 200,
            adapter: adapterFor(async request => {
                if (request.args.join(' ') === 'prisma validate') {
                    validationCalls++;
                    throw Object.assign(new Error('Command timed out'), {
                        result: { passed: false, exitCode: null, timedOut: true, stdout: '', stderr: actualPrismaReset }
                    });
                }
                return success;
            }) });
        assert.equal(validationCalls, 1);
    });

    await runAsyncTest('6. Prisma validation retries an engine reset once inside the same absolute phase budget', async () => {
        for (const thrown of [false, true]) {
            const requests = [];
            const result = await verifyBuild('/workspace', {}, { files: prismaFiles, timeoutMs: 200,
                adapter: adapterFor(async request => {
                    if (request.args.join(' ') === 'prisma validate') {
                        requests.push(request);
                        if (requests.length === 1) {
                            await new Promise(resolve => setTimeout(resolve, 25));
                            if (thrown) throw Object.assign(new Error(reset), { code: 'ECONNRESET', stderr: reset, exitCode: 1 });
                            return { passed: false, exitCode: 1, stdout: 'first attempt', stderr: reset };
                        }
                    }
                    return success;
                }) });
            assert.equal(requests.length, 2);
            assert.ok(requests[1].timeoutMs < requests[0].timeoutMs && requests[1].timeoutMs > 0);
            const check = result.checks.find(check => check.name === 'prisma_validate');
            assert.equal(check.status, 'passed'); assert.equal(check.exitCode, 0);
            assert.equal(check.stdout, success.stdout); assert.equal(check.stderr, '');
            assert.equal(check.stdoutDigest, crypto.createHash('sha256').update(success.stdout).digest('hex'));
            assert.equal(check.advisory.attemptCount, 2);
            assert.deepEqual(check.advisory.priorTransientCodes, ['ECONNRESET']);
            assert.equal(result.checks.find(check => check.name === 'prisma_generate').status, 'passed');
        }
    });

    await runAsyncTest('7. Prisma retry fails closed for schema TLS checksum auth cancellation and exhausted phase budgets', async () => {
        for (const suffix of [' P1012 schema validation error', ' certificate verification failed', ' ERR_TLS_CERT_ALTNAME_INVALID', ' checksum mismatch', ' Unauthorized 401', ' Forbidden 403', ' Job deadline exceeded', ' PAUSED', '']) {
            let calls = 0;
            const controller = new AbortController();
            const result = await verifyBuild('/workspace', {}, { files: prismaFiles, signal: controller.signal,
                adapter: adapterFor(async request => {
                    if (request.args.join(' ') === 'prisma validate') {
                        calls++; if (!suffix) controller.abort('PAUSED');
                        return { passed: false, exitCode: 1, stdout: '', stderr: reset + suffix };
                    }
                    return success;
                }) });
            assert.equal(calls, 1, suffix || 'abort signal');
            assert.equal(result.checks.find(check => check.name === 'prisma_validate').status, 'failed');
            assert.ok(!result.checks.some(check => check.name === 'prisma_generate' && check.status === 'passed'));
        }
        let calls = 0;
        const exhausted = await verifyBuild('/workspace', {}, { files: prismaFiles, timeoutMs: 5,
            adapter: adapterFor(async request => { if (request.args.join(' ') === 'prisma validate') {
                calls++; await new Promise(resolve => setTimeout(resolve, 15)); return { passed: false, exitCode: 1, stderr: reset };
            } return success; }) });
        assert.equal(calls, 1); assert.equal(exhausted.checks.find(check => check.name === 'prisma_validate').status, 'failed');
        calls = 0;
        await verifyBuild('/workspace', {}, { files: prismaFiles, adapter: adapterFor(async request => {
            if (request.args.join(' ') === 'prisma validate') { calls++; return { passed: false, exitCode: 1, stderr: 'read ECONNRESET' }; }
            return success;
        }) });
        assert.equal(calls, 1, 'an unrelated reset without engine download context is not retry evidence');
    });

    await runAsyncTest('8. repeated engine resets stop after two actual failures; other Prisma commands are not retried', async () => {
        let validates = 0, generated = 0;
        const result = await verifyBuild('/workspace', {}, { files: prismaFiles, adapter: adapterFor(async request => {
            if (request.args.join(' ') === 'prisma validate') {
                validates++; return { passed: false, exitCode: 7 + validates, stdout: `actual ${validates}`, stderr: reset };
            }
            if (request.args.join(' ') === 'prisma generate') generated++;
            return success;
        }) });
        const check = result.checks.find(check => check.name === 'prisma_validate');
        assert.equal(validates, 2); assert.equal(generated, 0);
        assert.equal(check.status, 'failed'); assert.equal(check.exitCode, 9); assert.equal(check.stdout, 'actual 2');
        assert.equal(check.stderrDigest, crypto.createHash('sha256').update(reset).digest('hex'));
        assert.equal(result.passed, false);
        generated = 0;
        await verifyBuild('/workspace', {}, { files: prismaFiles, adapter: adapterFor(async request => {
            if (request.args.join(' ') === 'prisma generate') { generated++; return { passed: false, exitCode: 1, stderr: reset }; }
            return success;
        }) });
        assert.equal(generated, 1, 'the transport retry is exclusive to prisma_validate');
    });

    await runAsyncTest('9. actual Prisma validate transport reset retries without mistaking TLSSocket or stream aborted for user cancellation', async () => {
        assert.ok(!actualPrismaReset.includes('binaries.prisma.sh'), 'the historical fixture must not fabricate engine URL proof');
        let calls = 0;
        const result = await verifyBuild('/workspace', {}, { files: prismaFiles, adapter: adapterFor(async request => {
            if (request.args.join(' ') === 'prisma validate' && ++calls === 1) return { passed: false, exitCode: 1, stdout: '', stderr: actualPrismaReset };
            return success;
        }) });
        assert.equal(calls, 2);
        assert.equal(result.checks.find(check => check.name === 'prisma_validate').status, 'passed');
        for (const terminal of ['\ncode: ABORT_ERR', '\ncode: ERR_TLS_CERT_ALTNAME_INVALID', '\ncode: ERR_SSL_CERTIFICATE_VERIFY_FAILED',
            '\ncode: UNABLE_TO_VERIFY_LEAF_SIGNATURE', '\ncode: DEPTH_ZERO_SELF_SIGNED_CERT', '\ncode: SELF_SIGNED_CERT_IN_CHAIN',
            '\nchecksum mismatch', '\nCancelled by user', '\nLEASE_LOST']) {
            let validates = 0;
            await verifyBuild('/workspace', {}, { files: prismaFiles, adapter: adapterFor(async request => {
                if (request.args.join(' ') === 'prisma validate') { validates++; return { passed: false, exitCode: 1, stderr: actualPrismaReset + terminal }; }
                return success;
            }) });
            assert.equal(validates, 1, terminal);
        }
        for (const incomplete of [actualPrismaReset.replace('TLSSocket.socketCloseListener', 'Socket.socketCloseListener'), actualPrismaReset.replace('attemptNumber: 1', ''), actualPrismaReset.replace('retriesLeft: 2', '')]) {
            let validates = 0;
            await verifyBuild('/workspace', {}, { files: prismaFiles, adapter: adapterFor(async request => {
                if (request.args.join(' ') === 'prisma validate') { validates++; return { passed: false, exitCode: 1, stderr: incomplete }; }
                return success;
            }) });
            assert.equal(validates, 1, 'unrelated or incomplete transport signatures are not retry proof');
        }
    });

    await runAsyncTest('verifyBuild preserves synthetic ephemeral auth env vars in sandbox execution and strips real secrets', async () => {
        let capturedEnv = null;
        const workspace = await createTempWorkspace();
        await fs.mkdir(path.join(workspace, 'node_modules'), { recursive: true });
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'mock-auth-build',
            scripts: { build: 'echo build' }
        }));

        const mockAdapter = {
            id: 'mock-auth-adapter',
            getCapabilities() { return { available: true, isolation: true }; },
            isAvailable() { return true; },
            async execute(req) {
                capturedEnv = req.env;
                return {
                    status: 'PASS',
                    passed: true,
                    exitCode: 0,
                    stdout: 'Build ok',
                    stderr: ''
                };
            }
        };

        await verifyBuild(workspace, { frontend: { framework: 'next' } }, {
            adapter: mockAdapter,
            env: {
                AUTH_SECRET: 'verification-only-ephemeral-secret-not-for-production',
                NEXTAUTH_SECRET: 'verification-only-ephemeral-secret-not-for-production',
                NEXTAUTH_URL: 'http://localhost:3000',
                REAL_PROD_SECRET: 'do-not-leak-this-secret',
                OPENAI_API_KEY: 'sk-should-be-scrubbed'
            }
        });

        assert.ok(capturedEnv, 'Sandbox adapter execute must have been called with env');
        assert.strictEqual(capturedEnv.AUTH_SECRET, 'verification-only-ephemeral-secret-not-for-production', 'Ephemeral AUTH_SECRET must be preserved');
        assert.strictEqual(capturedEnv.NEXTAUTH_SECRET, 'verification-only-ephemeral-secret-not-for-production', 'Ephemeral NEXTAUTH_SECRET must be preserved');
        assert.strictEqual(capturedEnv.NEXTAUTH_URL, 'http://localhost:3000', 'Ephemeral NEXTAUTH_URL must be preserved');
        assert.strictEqual(capturedEnv.REAL_PROD_SECRET, undefined, 'Real production secret must be scrubbed');
        assert.strictEqual(capturedEnv.OPENAI_API_KEY, undefined, 'OpenAI API key must be scrubbed');
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
