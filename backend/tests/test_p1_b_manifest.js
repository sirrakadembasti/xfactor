import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { verifyServiceManifest } from '../verification/serviceManifestVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-manifest-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. verifyServiceManifest should fail-closed when service-manifest.json is missing', async () => {
        const workspace = await createTempWorkspace();
        const res = await verifyServiceManifest(workspace, {});
        assert.strictEqual(res.passed, false);
        assert.ok(res.checks.some(c => c.name === 'manifest_presence' && c.status === 'failed'));
    });

    await runAsyncTest('2. verifyServiceManifest should validate valid service-manifest.json structure', async () => {
        const workspace = await createTempWorkspace();
        const manifest = {
            version: '1.0',
            services: {
                backend: {
                    type: 'express',
                    port: 4000,
                    healthEndpoint: '/health',
                    env: {
                        DATABASE_URL: 'file:./dev.db'
                    }
                },
                frontend: {
                    type: 'vite',
                    port: 3000,
                    proxy: {
                        '/api': 'http://localhost:4000'
                    }
                }
            }
        };

        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify(manifest, null, 2));

        const res = await verifyServiceManifest(workspace, {});
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.issues.length, 0);
        assert.ok(res.checks.some(c => c.name === 'manifest_presence' && c.status === 'passed'));
        assert.ok(res.checks.some(c => c.name === 'port_uniqueness' && c.status === 'passed'));
    });

    await runAsyncTest('3. verifyServiceManifest should detect port collisions between services', async () => {
        const workspace = await createTempWorkspace();
        const manifestWithCollision = {
            version: '1.0',
            services: {
                backend: { port: 3000 },
                frontend: { port: 3000 }
            }
        };

        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify(manifestWithCollision, null, 2));

        const res = await verifyServiceManifest(workspace, {});
        assert.strictEqual(res.passed, false);
        assert.ok(res.checks.some(c => c.name === 'port_uniqueness' && c.status === 'failed'));
        assert.ok(res.issues.some(i => i.toLowerCase().includes('port')));
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
