import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { verifyProjectSmoke } from '../verification/smokeVerifier.js';
const { runAsyncTest, finish } = createTestHarness();
const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-smoke-test-') { const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix)); tempDirs.push(dir); return dir; }
try {
    await runAsyncTest('1. verifyProjectSmoke executes adapter-only unified runtime validation', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({ version: '1.0', services: { backend: { type: 'express', port: 3000, healthEndpoint: '/health' } } }));
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ name: 'smoke-test-project', scripts: { test: 'node test.js' } }));
        const calls = [];
        const adapter = {
            id: 'mock-sandbox',
            getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
            async execute(request) { calls.push(['execute', request]); return { passed: true, exitCode: 0, stdout: JSON.stringify({ schemaExists: false, databaseExists: true }), stderr: '' }; },
            async request(request) { calls.push(['request', request]); return { statusCode: 200, rawBody: '<html><body><div id="app">Live App</div></body></html>', data: { success: true } }; }
        };
        const result = await verifyProjectSmoke(workspace, { domains: [{ name: 'users', prefix: 'users' }], database: { engine: 'sqlite' }, api: { baseUrl: 'http://service' } }, { adapter, skipSpawnForLiveServer: true, baseUrl: 'http://service' });
        assert.strictEqual(result.passed, true);
        assert.ok(result.checks.some(c => c.name === 'smoke_gate' && c.status === 'passed'));
        assert.ok(result.checks.some(c => c.name === 'database_connectivity' && c.status === 'passed'));
        assert.ok(calls.some(([kind]) => kind === 'request'));
    });
    await runAsyncTest('2. verifyProjectSmoke fails closed when manifest is missing', async () => { const result = await verifyProjectSmoke(await createTempWorkspace(), {}); assert.strictEqual(result.passed, false); });
    finish();
} finally { await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true }))); }
