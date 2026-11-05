import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import crypto from 'crypto';
import { EventEmitter } from 'node:events';
import { verifyDependencies } from '../verification/packageVerifier.js';
import { verifyReadmeCommands } from '../verification/readmeVerifier.js';
import { verifyBuild } from '../verification/buildVerifier.js';
import { runVerificationChecks } from '../verification/runChecks.js';
import { normalizeWorkerCheckStatus, passingVerificationSourceNames } from '../verification/artifactVerifier.js';
import { verifyArtifact, prepareDependencies } from '../../execution/jobExecutor.js';

const { runAsyncTest, finish } = createTestHarness();
const tempDirs = [];
async function workspace(prefix = 'xfactor-p9-pipeline-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('P9.3: optional skipped worker checks are not failures', async () => {
        assert.strictEqual(normalizeWorkerCheckStatus('skipped', false), 'NOT_APPLICABLE');
        assert.strictEqual(normalizeWorkerCheckStatus('skipped', true), 'BLOCKED');
        assert.deepStrictEqual(passingVerificationSourceNames([
            { name: 'prisma_seed_accounts', status: 'skipped' },
            { name: 'typecheck', status: 'passed' }
        ]), ['detail:typecheck']);
    });
    await runAsyncTest('P9.3: computeDigest preserves evidence for empty command output', async () => {
        const expected = crypto.createHash('sha256').update('').digest('hex');
        const dir = await workspace();
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
        await fs.writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }));
        const result = await verifyDependencies(dir, {}, { adapter: { id: 'fixture', getCapabilities: () => ({ available: true, isolation: true }), execute: async () => ({ passed: true, exitCode: 0, stdout: '', stderr: '' }) } });
        for (const name of ['package_json', 'lockfile', 'ast_import_inventory']) {
            const staticCheck = result.checks.find(c => c.name === name);
            assert.ok(staticCheck.command, `${name} must identify its executed static check`);
            assert.strictEqual(staticCheck.exitCode, 0);
        }
        const check = result.checks.find(c => c.name === 'clean_install');
        assert.equal(check.stdoutDigest, expected);
        assert.equal(check.stderrDigest, expected);
    });

    await runAsyncTest('P9.3: null README input is a safe blocked result', async () => {
        const result = await verifyReadmeCommands({}, [{ path: 'package.json', content: '{"scripts":{"build":"echo ok"}}' }], null);
        assert.equal(typeof result.passed, 'boolean');
        assert.ok(Array.isArray(result.checks));
    });

    await runAsyncTest('P9.3: dependency count cannot falsely accept clean install', async () => {
        const dir = await workspace();
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
        await fs.writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }));
        await fs.mkdir(path.join(dir, 'node_modules'), { recursive: true });
        for (let i = 0; i < 25; i += 1) await fs.mkdir(path.join(dir, 'node_modules', `fake-${i}`));
        const result = await verifyDependencies(dir, {}, { adapter: { isAvailable: () => false } });
        const check = result.checks.find(c => c.name === 'clean_install');
        assert.equal(check.status, 'blocked');
        assert.equal(result.passed, false);
    });

    await runAsyncTest('P9.3: failed installation blocks build evidence', async () => {
        const dir = await workspace();
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { build: 'echo build' } }));
        await fs.writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }));
        const install = await verifyDependencies(dir, {}, { adapter: { isAvailable: () => true, execute: async () => ({ passed: false, exitCode: 1, stdout: '', stderr: 'network denied' }) } });
        assert.notEqual(install.checks.find(c => c.name === 'clean_install')?.status, 'passed');
        const build = await verifyBuild(dir, {}, { adapter: { isAvailable: () => true, execute: async () => ({ passed: true, exitCode: 0, stdout: '', stderr: '' }) }, dependencyResult: install });
        assert.equal(build.checks.find(c => c.name === 'framework_build')?.status, 'blocked');
    });

    await runAsyncTest('P9.3: missing lockfile is blocked, not repaired by final verification', async () => {
        const dir = await workspace();
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { build: 'echo build' } }));
        const result = await runVerificationChecks({ workspace: dir, contract: {}, requirementIds: ['dependencies'], adapter: { isAvailable: () => true },
            files: [{ path: 'package.json', content: await fs.readFile(path.join(dir, 'package.json'), 'utf8') }] });
        assert.equal(result.passed, false);
        assert.ok(result.checks.some(c => c.name === 'lockfile' && ['blocked', 'failed'].includes(c.status)));
        assert.equal(await fs.stat(path.join(dir, 'package.json')).then(() => true), true);
    });

    await runAsyncTest('P9.3: denied install network is blocked with command evidence', async () => {
        const dir = await workspace();
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
        await fs.writeFile(path.join(dir, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }));
        const result = await verifyDependencies(dir, {}, { adapter: { isAvailable: () => true, execute: async () => ({ passed: false, exitCode: 1, stdout: '', stderr: 'EAI_AGAIN registry.npmjs.org' }) } });
        const check = result.checks.find(c => c.name === 'clean_install');
        assert.ok(check);
        assert.notEqual(check.status, 'passed');
        assert.match(String(check.command || ''), /npm/);
        assert.ok('stderrDigest' in check || 'stderr' in check);
    });

    await runAsyncTest('P9.3: verification evidence carries caller runId and traceability', async () => {
        const runId = 'p9-run-evidence-1';
        const result = await runVerificationChecks({ workspace: await workspace(), contract: {}, requirementIds: ['req-1'], adapter: { isAvailable: () => false }, runId, files: [] });
        assert.equal(result.runId, runId);
        assert.ok(result.checks.every(check => check.runId === runId || check.evidence?.runId === runId || check.requirementIds?.includes('req-1')));
    });

    await runAsyncTest('P9.3: README summary uses executable static evidence when no detail checks exist', async () => {
        const result = await runVerificationChecks({ workspace: '/workspace', files: [], adapter: {}, runId: 'readme-static', verifiers: {
            dependencies: async () => ({ checks: [] }),
            build: async () => ({ checks: [] }),
            readme: async () => ({ passed: true, checks: [], issues: [] }),
            smoke: async () => ({ checks: [] })
        } });
        const check = result.checks.find(c => c.name === 'readme_check');
        assert.ok(check.command);
        assert.strictEqual(check.exitCode, 0);
        assert.notStrictEqual(check.evidence?.kind, 'derived_gate');
    });

    await runAsyncTest('P9.3: worker rejects archive digest mismatch before materialization', async () => {
        const result = await verifyArtifact({ archiveBase64: Buffer.from('archive').toString('base64'), archiveSha256: 'bad', job: { runId: 'archive-run' }, adapter: {} });
        assert.equal(result.passed, false);
        assert.equal(result.status, 'blocked');
    });

    await runAsyncTest('P9.3: prepare uses exact bytes, real lock command, and authoritative runId', async () => {
        const manifest = Buffer.from('{"name":"exact"}');
        const lock = Buffer.from('{"lockfileVersion":3}');
        const calls = [];
        const adapter = {
            async writeFile(target, bytes) { calls.push({ target, bytes: Buffer.from(bytes) }); },
            async execute(command, args) { calls.push({ command, args }); return { exitCode: 0, stdout: '' }; },
            async readFile() { return lock; }
        };
        const result = await prepareDependencies({ packageJsonBytes: manifest, adapter, runId: 'caller-run' });
        assert.deepEqual(calls[0].bytes, manifest);
        assert.equal(calls[1].command, 'npm');
        assert.deepEqual(calls[1].args.slice(0, 4), ['install', '--package-lock-only', '--ignore-scripts', '--no-audit']);
        assert.equal(result.runId, 'caller-run');
        assert.equal(result.packageLockBase64, lock.toString('base64'));
    });

    await runAsyncTest('P9.3: verify rejects oversized archive before adapter work', async () => {
        const archive = Buffer.alloc(24 * 1024 * 1024 + 1);
        const calls = [];
        const result = await verifyArtifact({
            archiveBase64: archive.toString('base64'),
            archiveSha256: crypto.createHash('sha256').update(archive).digest('hex'),
            job: { runId: 'oversize-run' },
            adapter: { execute: async () => { calls.push(true); }, writeFile: async () => { calls.push(true); } }
        });
        assert.equal(result.status, 'blocked');
        assert.equal(calls.length, 0);
    });

    await runAsyncTest('P9.3: verify transfers exact archive to fixed workspace with extraction limits', async () => {
        const { ARTIFACT_LIMITS } = await import('../artifactLimits.js');
        const archive = Buffer.from('zip-bytes');
        const calls = [];
        const result = await verifyArtifact({
            archiveBase64: archive.toString('base64'),
            archiveSha256: crypto.createHash('sha256').update(archive).digest('hex'),
            job: { runId: 'archive-contract-run', files: [] },
            adapter: {
                async writeFile(pathName, bytes) { calls.push({ pathName, bytes: Buffer.from(bytes) }); },
                async extractArchive(source, target, limits) { calls.push({ source, target, limits }); },
                async execute() { return { exitCode: 0, stdout: '' }; }
            }
        });
        assert.equal(calls[0].pathName, '/workspace/artifact.zip');
        assert.deepEqual(calls[0].bytes, archive);
        assert.equal(calls[1].source, '/workspace/artifact.zip');
        assert.equal(calls[1].target, '/workspace');
        assert.equal(calls[1].limits.maxFiles, 500);
        assert.equal(calls[1].limits.maxRatio, ARTIFACT_LIMITS.maxCompressionRatio);
        assert.equal(result.runId, 'archive-contract-run');
    });

    await runAsyncTest('P9.3: applicable dynamic verifiers use adapter and block without one', async () => {
        const { verifyDatabase } = await import('../verification/databaseVerifier.js');
        const { verifyAPIContract } = await import('../verification/apiVerifier.js');
        const { verifyBrowserJourney } = await import('../verification/browserVerifier.js');
        const { probeServiceHealth } = await import('../verification/healthProber.js');
        const { spawnService } = await import('../verification/processVerifier.js');
        const calls = [];
        const adapter = {
            id: 'focused-adapter',
            getCapabilities: () => ({ available: true, isolation: true }),
            async execute(input) { calls.push(['execute', input]); return { passed: true, exitCode: 0, stdout: JSON.stringify({ schemaExists: true, databaseExists: true }), stderr: '' }; },
            async request(input) { calls.push(['request', input]); return { statusCode: 200, rawBody: '<html><body>ok</body></html>', data: {} }; },
            async spawn(input) { calls.push(['spawn', input]); return { pid: 99, on() {}, stdout: { on() {} }, stderr: { on() {} } }; }
        };
        assert.equal((await verifyDatabase('/workspace', {}, {}, { adapter, workspace: '/workspace' })).checks.some(c => c.status === 'passed'), true);
        assert.equal((await verifyAPIContract('http://service', null, { domains: ['items'] }, { adapter })).checks.some(c => c.name === 'api_status_check'), true);
        assert.equal((await verifyBrowserJourney('http://frontend', { steps: [{ action: 'assert_element', selector: 'body' }] }, { adapter })).passed, true);
        assert.equal((await probeServiceHealth('http://service/health', 10, { adapter })).responsive, true);
        assert.equal((await spawnService('svc', { command: 'node' }, {}, { adapter })).pid, 99);
        assert.equal((await verifyDatabase('/workspace', {}, {}, {})).checks[0].status, 'blocked');
        assert.equal((await verifyAPIContract('http://service', null, {}, {})).checks[0].status, 'blocked');
        assert.equal((await verifyBrowserJourney('http://frontend', {}, {})).checks[0].status, 'blocked');
        assert.ok(calls.some(([kind]) => kind === 'request'));
    });

    await runAsyncTest('P9.3: simple inventory path avoids host workspace reads', async () => {
        const adapter = { id: 'inventory-adapter', getCapabilities: () => ({ available: true, isolation: true }),
            async spawn() { return Object.assign(new EventEmitter(), { pid: 101 }); }, async kill() {},
            async request() { return { statusCode: 200 }; },
            async execute() { return { passed: true, exitCode: 0, stdout: '', stderr: '' }; } };
        const result = await runVerificationChecks({ workspace: '/workspace', contract: {}, requirementIds: ['simple'], adapter, files: [
            { path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test test.js' } }) },
            { path: 'package-lock.json', content: '{}' },
            { path: 'service-manifest.json', content: JSON.stringify({ services: { api: {
                type: 'node', command: 'node', args: ['server.js'], port: 3000, healthEndpoint: '/health'
            } } }) }
        ] });
        assert.ok(result.checks.some(check => check.name === 'test_script_presence'));
        assert.ok(result.checks.every(check => !String(check.reason || '').includes('F:\\workspace')));
    });

    finish();
} finally {
    await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true })));
}
