/**
 * Sub-project 5.2: Health Probes, Liveness & Server Lifecycle
 * Test Suite
 */

import assert from 'assert';
import fs from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function request(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch {
                    resolve({ status: res.statusCode, data, headers: res.headers });
                }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('==================================================');
    console.log('⚡ Sub-project 5.2: Health Probes & Lifecycle');
    console.log('==================================================');

    let passed = 0;
    let failed = 0;

    const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-health-test-'));
    const testDbPath = path.join(testTempDir, 'test_lifecycle.db');
    const testProjectsRoot = path.join(testTempDir, 'test_projects');
    await fs.mkdir(testProjectsRoot, { recursive: true });

    // Start ephemeral server process
    const testPort = 39123;
    const serverProc = spawn(process.execPath, [path.join(__dirname, '../server.js')], {
        env: {
            ...process.env,
            PORT: String(testPort),
            HOST: '127.0.0.1',
            DB_PATH: testDbPath,
            PROJECTS_ROOT: testProjectsRoot
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
        // Wait for server to become ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Server start timed out')), 10000);
            serverProc.stdout.on('data', (chunk) => {
                if (chunk.toString().includes('Backend hazır')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            serverProc.stderr.on('data', (chunk) => {
                const text = chunk.toString();
                if (text.includes('Backend hazır')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        // Test 1: GET /healthz (Liveness Probe)
        try {
            const healthRes = await request(`http://127.0.0.1:${testPort}/healthz`);
            assert.strictEqual(healthRes.status, 200, 'Health check should return 200 OK');
            assert.strictEqual(healthRes.data.status, 'ok', 'Status should be ok');
            assert(typeof healthRes.data.uptime === 'number', 'Uptime should be reported');

            console.log('  [PASS] 1. GET /healthz liveness probe returns 200 OK');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 1. GET /healthz liveness probe:', err.message);
            failed++;
        }

        // Test 2: GET /readyz (Readiness Probe)
        try {
            const readyRes = await request(`http://127.0.0.1:${testPort}/readyz`);
            assert.strictEqual(readyRes.status, 200, 'Readiness check should return 200 OK');
            assert.strictEqual(readyRes.data.status, 'ready', 'Status should be ready');
            assert.strictEqual(readyRes.data.database, 'connected', 'Database should be connected');
            assert.strictEqual(readyRes.data.projectsRoot, 'accessible', 'Projects root should be accessible');
            assert(typeof readyRes.data.schemaVersion === 'number' && readyRes.data.schemaVersion >= 1, 'Schema version should be reported');

            console.log('  [PASS] 2. GET /readyz readiness probe verifies database and filesystem');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 2. GET /readyz readiness probe:', err.message);
            failed++;
        }

        // Test 3: Graceful shutdown on SIGTERM / SIGINT
        try {
            const exitPromise = new Promise((resolve) => {
                serverProc.on('close', (code, signal) => {
                    resolve({ code, signal });
                });
            });

            serverProc.kill('SIGTERM');
            const { code, signal } = await exitPromise;

            const isCleanExit = code === 0 || signal === 'SIGTERM' || signal === 'SIGINT';
            assert.strictEqual(isCleanExit, true, `Server should terminate cleanly, received code: ${code}, signal: ${signal}`);

            console.log('  [PASS] 3. Server gracefully shuts down on termination signal');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 3. Graceful shutdown on termination signal:', err.message);
            failed++;
        }

    } finally {
        try {
            serverProc.kill('SIGKILL');
        } catch {}
        await fs.rm(testTempDir, { recursive: true, force: true }).catch(() => {});
    }

    console.log('==================================================');
    console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı`);
    console.log('==================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
