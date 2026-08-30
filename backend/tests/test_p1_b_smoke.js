import assert from 'assert';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DatabaseSync } from 'node:sqlite';
import { createTestHarness } from './testHarness.js';
import { verifyProjectSmoke } from '../verification/smokeVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-smoke-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. verifyProjectSmoke should execute unified runtime smoke validation pipeline', async () => {
        const workspace = await createTempWorkspace();
        const dbPath = path.join(workspace, 'dev.db');

        // 1. Setup SQLite DB
        const sqliteDb = new DatabaseSync(dbPath);
        sqliteDb.exec(`
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );
        `);
        sqliteDb.close();

        // 2. Setup mock server
        const server = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
            } else if (req.method === 'POST' && req.url === '/api/users') {
                let body = '';
                req.on('data', c => { body += c; });
                req.on('end', () => {
                    const parsed = JSON.parse(body || '{}');
                    const db = new DatabaseSync(dbPath);
                    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(`u-${Date.now()}`, parsed.name || 'User');
                    db.close();
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                });
            } else if (req.method === 'GET' && req.url === '/api/users') {
                const db = new DatabaseSync(dbPath);
                const rows = db.prepare('SELECT * FROM users').all();
                db.close();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(rows));
            } else if (req.url === '/' || req.url === '/index.html') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<!DOCTYPE html><html><body><div id="app"><h1>Live App</h1></div></body></html>');
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const livePort = server.address().port;

        // 3. Setup workspace files
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({
            version: '1.0',
            services: {
                backend: {
                    type: 'express',
                    port: livePort,
                    healthEndpoint: '/health'
                }
            }
        }));

        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'smoke-test-project',
            scripts: { test: 'node test.js' }
        }));

        const mockSandboxAdapter = {
            id: 'mock-sandbox',
            isAvailable() { return true; },
            async execute() {
                return { status: 'PASS', passed: true, exitCode: 0, stdout: 'Test pass', stderr: '' };
            }
        };

        try {
            const smokeResult = await verifyProjectSmoke(workspace, {
                domains: [{ name: 'users', prefix: 'users' }],
                database: { engine: 'sqlite' }
            }, {
                baseUrl: `http://127.0.0.1:${livePort}`,
                adapter: mockSandboxAdapter,
                skipSpawnForLiveServer: true
            });

            assert.strictEqual(smokeResult.passed, true);
            assert.ok(smokeResult.checks.some(c => c.name === 'smoke_gate' && c.status === 'passed'));
            assert.ok(smokeResult.checks.some(c => c.name === 'manifest_presence' && c.status === 'passed'));
            assert.ok(smokeResult.checks.some(c => c.name === 'database_connectivity' && c.status === 'passed'));
        } finally {
            await new Promise(r => server.close(r));
        }
    });

    await runAsyncTest('2. verifyProjectSmoke should fail-closed when manifest is missing', async () => {
        const workspace = await createTempWorkspace();
        const res = await verifyProjectSmoke(workspace, {});
        assert.strictEqual(res.passed, false);
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
