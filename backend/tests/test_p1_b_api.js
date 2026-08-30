import assert from 'assert';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DatabaseSync } from 'node:sqlite';
import { createTestHarness } from './testHarness.js';
import { verifyAPIContract } from '../verification/apiVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-api-verif-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. verifyAPIContract should verify HTTP responses and physical DB state mutations', async () => {
        const workspace = await createTempWorkspace();
        const dbPath = path.join(workspace, 'api_test.db');

        // Setup SQLite database
        const sqliteDb = new DatabaseSync(dbPath);
        sqliteDb.exec(`
            CREATE TABLE items (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Setup mock HTTP server that writes to SQLite on POST and reads on GET
        const server = http.createServer(async (req, res) => {
            if (req.method === 'POST' && req.url === '/api/items') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        const id = `item-${Date.now()}`;
                        sqliteDb.prepare('INSERT INTO items (id, name) VALUES (?, ?)').run(id, parsed.name || 'Sample');
                        res.writeHead(201, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ id, name: parsed.name || 'Sample' }));
                    } catch (err) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            } else if (req.method === 'GET' && req.url === '/api/items') {
                const rows = sqliteDb.prepare('SELECT * FROM items').all();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(rows));
            } else {
                res.writeHead(404);
                res.end();
            }
        });

        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const port = server.address().port;
        const apiBaseUrl = `http://127.0.0.1:${port}`;

        try {
            const contract = {
                domains: [
                    { name: 'items', prefix: 'items' }
                ]
            };

            const result = await verifyAPIContract(apiBaseUrl, dbPath, contract);
            assert.strictEqual(result.passed, true);
            assert.ok(result.checks.some(c => c.name === 'api_status_check' && c.status === 'passed'));
            assert.ok(result.checks.some(c => c.name === 'database_mutation_assertion' && c.status === 'passed'));

            // Assert DB really has the mutation
            const count = sqliteDb.prepare('SELECT COUNT(*) as c FROM items').get().c;
            assert.ok(count > 0, 'Database must have records written by API verifier');
        } finally {
            await new Promise(r => server.close(r));
            sqliteDb.close();
        }
    });

    await runAsyncTest('2. verifyAPIContract should fail-closed when server is unreachable or DB path invalid', async () => {
        const result = await verifyAPIContract('http://127.0.0.1:49991', '/invalid/db/path.db', {});
        assert.strictEqual(result.passed, false);
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
