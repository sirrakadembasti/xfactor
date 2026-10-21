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

    await runAsyncTest('3. a successful POST without GET readback is not mutation evidence', async () => {
        const server = http.createServer((_req, res) => {
            res.writeHead(_req.method === 'POST' ? 201 : 200, { 'content-type': 'application/json' });
            res.end(_req.method === 'POST' ? JSON.stringify({ id: 'discarded-1', name: 'discarded' }) : '[]');
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const result = await verifyAPIContract(`http://127.0.0.1:${server.address().port}`, null,
                { domains: [{ prefix: 'items' }] });
            assert.equal(result.passed, false);
            assert.equal(result.checks.find(check => check.name === 'database_mutation_assertion')?.status, 'failed');
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    await runAsyncTest('4. management mutation must reject an anonymous request', async () => {
        const requests = [];
        const adapter = { id: 'role-fixture', request: async ({ method, url, data }) => {
            requests.push({ method, url, data });
            if (method === 'GET') return { statusCode: 200, data: [{ id: '1', name: requests[0]?.data?.name }] };
            return { statusCode: 201, data: { id: '1', name: data?.name } };
        } };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true, resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create'] }] },
            domains: [{ prefix: 'assets' }]
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_anonymous_mutation_denied')?.status, 'failed');
    });
    await runAsyncTest('5. stale record with reused ID cannot count as created data', async () => {
        const adapter = { id: 'stale-record', request: async ({ method }) => method === 'POST'
            ? { statusCode: 201, data: { id: 'constant' } }
            : { statusCode: 200, data: [{ id: 'constant', name: 'old record' }] } };
        const result = await verifyAPIContract('http://service', null, { domains: [{ prefix: 'items' }] }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'database_mutation_assertion')?.status, 'failed');
    });
    await runAsyncTest('6. protected management create uses role identity and checks denied roles', async () => {
        const rows = [];
        const adapter = {
            id: 'role-aware-fixture',
            request: async ({ method }) => ({ statusCode: method === 'POST' ? 401 : 200, data: [] }),
            requestAsRole: async ({ role, method, data }) => {
                if (method === 'POST' && role === 'viewer') return { statusCode: 403, data: {} };
                if (method === 'POST' && role === 'manager') {
                    const row = { id: `item-${rows.length + 1}`, name: data.name };
                    rows.push(row);
                    return { statusCode: 201, data: row };
                }
                return { statusCode: 200, data: rows };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read'] }],
                roles: [
                    { name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read'] }] },
                    { name: 'viewer', permissions: [{ resource: 'assets', operations: ['read'] }] }
                ]
            },
            domains: [{ prefix: 'assets' }]
        }, { adapter });
        assert.equal(result.passed, true);
        assert.equal(result.checks.find(check => check.name === 'api_role_create_allowed')?.status, 'passed');
        assert.equal(result.checks.find(check => check.name === 'api_role_create_denied')?.status, 'passed');
        assert.equal(result.checks.find(check => check.name === 'database_mutation_assertion')?.status, 'passed');
    });
    await runAsyncTest('7. management verification blocks when no authenticated role adapter exists', async () => {
        const adapter = { id: 'anonymous-only', request: async () => ({ statusCode: 401, data: {} }) };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create'] }],
                roles: [{ name: 'manager', permissions: [{ resource: 'assets', operations: ['create'] }] }]
            }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_role_create_allowed')?.status, 'blocked');
    });
    await runAsyncTest('8. a forbidden role must not persist a record behind a 403 response', async () => {
        const rows = [];
        const adapter = {
            id: 'lying-denial',
            request: async () => ({ statusCode: 403, data: {} }),
            requestAsRole: async ({ role, method, data }) => {
                if (method === 'GET') return { statusCode: 200, data: rows };
                const row = { id: `item-${rows.length + 1}`, name: data.name };
                rows.push(row);
                return { statusCode: role === 'viewer' ? 403 : 201, data: row };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read'] }],
                roles: [
                    { name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read'] }] },
                    { name: 'viewer', permissions: [{ resource: 'assets', operations: ['read'] }] }
                ]
            }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_role_create_denied')?.status, 'failed');
    });
    await runAsyncTest('9. unverified update and delete operations cannot pass as complete CRUD', async () => {
        let created;
        const adapter = {
            id: 'create-only',
            request: async ({ method }) => ({ statusCode: method === 'POST' ? 403 : 200, data: created ? [created] : [] }),
            requestAsRole: async ({ role, method, data }) => {
                if (method === 'POST' && role === 'viewer') return { statusCode: 403, data: {} };
                if (method === 'POST') {
                    created = { id: 'one', name: data.name };
                    return { statusCode: 201, data: created };
                }
                return { statusCode: 200, data: [created] };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'update', 'delete'] }],
                roles: [
                    { name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'update', 'delete'] }] },
                    { name: 'viewer', permissions: [{ resource: 'assets', operations: ['read'] }] }
                ]
            }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.ok(result.checks.some(check => check.name === 'api_unverified_mutation_operation' && check.status === 'blocked'));
    });
    await runAsyncTest('10. declared CRUD fixture verifies update and delete with role denials and readback', async () => {
        const records = [];
        const adapter = {
            id: 'crud-fixture',
            request: async ({ method }) => ({ statusCode: method === 'GET' ? 200 : 403, data: {} }),
            requestAsRole: async ({ role, method, data }) => {
                if (method === 'GET') return { statusCode: 200, data: [...records] };
                if (role === 'viewer') return { statusCode: 403, data: {} };
                if (method === 'POST') {
                    const record = { id: 'asset-1', name: data.name };
                    records.push(record);
                    return { statusCode: 201, data: record };
                }
                if (method === 'PATCH') {
                    records[0].name = data.name;
                    return { statusCode: 200, data: records[0] };
                }
                if (method === 'DELETE') {
                    records.length = 0;
                    return { statusCode: 204, data: {} };
                }
                throw new Error(`Unexpected method ${method}`);
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{
                    name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'update', 'delete'],
                    verification: { itemPath: '/api/assets/{id}', updateMethod: 'PATCH', deleteExpectation: { kind: 'absent' } }
                }],
                roles: [
                    { name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'update', 'delete'] }] },
                    { name: 'viewer', permissions: [{ resource: 'assets', operations: ['read'] }] }
                ]
            }
        }, { adapter });
        assert.equal(result.passed, true, JSON.stringify(result.issues));
        for (const name of ['api_role_update_allowed', 'api_role_update_denied', 'api_update_persistence',
            'api_role_delete_allowed', 'api_role_delete_denied', 'api_delete_persistence']) {
            assert.equal(result.checks.find(check => check.name === name)?.status, 'passed', name);
        }
    });
    await runAsyncTest('11. custom resource field and payload templates work without name/title assumptions', async () => {
        let record;
        const adapter = {
            id: 'custom-field',
            request: async ({ method }) => ({ statusCode: method === 'GET' ? 200 : 403, data: {} }),
            requestAsRole: async ({ role, method, data }) => {
                if (method === 'GET') return { statusCode: 200, data: record ? [record] : [] };
                if (role === 'reader') return { statusCode: 403, data: {} };
                if (method === 'POST') {
                    record = { id: 'one', label: data.label };
                    return { statusCode: 201, data: record };
                }
                if (method === 'PUT') {
                    record = { ...record, label: data.label };
                    return { statusCode: 200, data: record };
                }
                throw new Error(`Unexpected ${method}`);
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{ name: 'widgets', apiPath: '/api/widgets', operations: ['create', 'read', 'update'],
                    verification: { itemPath: '/api/widgets/{id}', updateMethod: 'PUT', identityField: 'label',
                        createBody: { label: '{nonce}' }, updateBody: { label: '{nonce}' } } }],
                roles: [
                    { name: 'editor', permissions: [{ resource: 'widgets', operations: ['create', 'read', 'update'] }] },
                    { name: 'reader', permissions: [{ resource: 'widgets', operations: ['read'] }] }
                ]
            }
        }, { adapter });
        assert.equal(result.passed, true, JSON.stringify(result.issues));
        assert.equal(result.checks.find(check => check.name === 'api_update_persistence')?.status, 'passed');
    });
    await runAsyncTest('11b. a rejected update must not alter another record field', async () => {
        let record = null;
        const adapter = {
            id: 'denied-side-effect',
            request: async () => ({ statusCode: 403, data: {} }),
            requestAsRole: async ({ role, method, data }) => {
                if (method === 'GET') return { statusCode: 200, data: record ? [{ ...record }] : [] };
                if (method === 'POST') {
                    record = { id: 'one', name: data.name, status: 'active' };
                    return { statusCode: 201, data: { ...record } };
                }
                if (method === 'PATCH' && role === 'viewer') {
                    record.status = 'tampered';
                    return { statusCode: 403, data: {} };
                }
                if (method === 'PATCH') {
                    record.name = data.name;
                    return { statusCode: 200, data: { ...record } };
                }
                return { statusCode: 404, data: {} };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'update'],
                    verification: { itemPath: '/api/assets/{id}', updateMethod: 'PATCH' } }],
                roles: [
                    { name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'update'] }] },
                    { name: 'viewer', permissions: [{ resource: 'assets', operations: ['read'] }] }
                ]
            }
        }, { adapter });
        assert.equal(result.checks.find(check => check.name === 'api_update_denial_persistence')?.status, 'failed');
        assert.equal(result.passed, false);
    });
    await runAsyncTest('12. soft delete needs a state transition, not a preexisting expected field', async () => {
        let record;
        const adapter = {
            id: 'unchanged-soft-delete',
            request: async ({ method }) => ({ statusCode: method === 'DELETE' || method === 'POST' ? 403 : 200, data: {} }),
            requestAsRole: async ({ role, method, data }) => {
                if (method === 'GET') return { statusCode: 200, data: [record] };
                if (role === 'viewer') return { statusCode: 403, data: {} };
                if (method === 'POST') {
                    record = { id: 'one', name: data.name, status: 'archived' };
                    return { statusCode: 201, data: record };
                }
                return { statusCode: 204, data: {} };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: {
                needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'delete'],
                    verification: { itemPath: '/api/assets/{id}', deleteExpectation: { kind: 'field', field: 'status', equals: 'archived' } } }],
                roles: [
                    { name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'delete'] }] },
                    { name: 'viewer', permissions: [{ resource: 'assets', operations: ['read'] }] }
                ]
            }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_delete_persistence')?.status, 'failed');
    });

    await runAsyncTest('13. a protected resource fails when anonymous GET exposes its records', async () => {
        const adapter = {
            id: 'read-leak-fixture',
            request: async () => ({ statusCode: 200, data: [{ id: 'private-1', contact: 'private@example.test' }] }),
            requestAsRole: async () => ({ statusCode: 200, data: [{ id: 'private-1', contact: 'private@example.test' }] })
        };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'contacts', apiPath: '/api/contacts', operations: ['read'], readAccess: 'authenticated' }],
                roles: [{ name: 'staff', permissions: [{ resource: 'contacts', operations: ['read'] }] }] }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_anonymous_read_policy')?.status, 'failed');
    });

    await runAsyncTest('14. an explicitly public resource permits anonymous read', async () => {
        const adapter = {
            id: 'public-read-fixture',
            request: async () => ({ statusCode: 200, data: [{ id: 'public-1' }] }),
            requestAsRole: async () => ({ statusCode: 200, data: [{ id: 'public-1' }] })
        };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'catalog', apiPath: '/api/catalog', operations: ['read'], readAccess: 'public' }],
                roles: [{ name: 'reader', permissions: [{ resource: 'catalog', operations: ['read'] }] }] }
        }, { adapter });
        assert.equal(result.checks.find(check => check.name === 'api_anonymous_read_policy')?.status, 'passed');
        assert.equal(result.passed, true);
    });

    await runAsyncTest('15. a role without read permission cannot receive protected records', async () => {
        const adapter = {
            id: 'forbidden-read-fixture',
            request: async () => ({ statusCode: 401, data: {} }),
            requestAsRole: async ({ role }) => ({ statusCode: 200,
                data: [{ id: 'private-1', role }] })
        };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'contacts', apiPath: '/api/contacts', operations: ['read'], readAccess: 'authenticated' }],
                roles: [
                    { name: 'staff', permissions: [{ resource: 'contacts', operations: ['read'] }] },
                    { name: 'guest', permissions: [{ resource: 'contacts', operations: [] }] }
                ] }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_role_read_denied')?.status, 'failed');
    });

    await runAsyncTest('16. deleting a parent fails verification when declared retained history disappears', async () => {
        let parent = null;
        let related = null;
        const adapter = {
            id: 'history-loss-fixture',
            request: async () => ({ statusCode: 403, data: {} }),
            requestAsRole: async ({ url, method, data }) => {
                if (url.endsWith('/api/assets') && method === 'POST') {
                    parent = { id: 'asset-1', name: data.name };
                    return { statusCode: 201, data: parent };
                }
                if (url.endsWith('/api/assets') && method === 'GET') return { statusCode: 200, data: parent ? [parent] : [] };
                if (url.endsWith('/api/history') && method === 'POST') {
                    related = { id: 'history-1', parentId: data.parentId, note: data.note };
                    return { statusCode: 201, data: related };
                }
                if (url.endsWith('/api/history/history-1') && method === 'GET') {
                    return related ? { statusCode: 200, data: related } : { statusCode: 404, data: {} };
                }
                if (url.endsWith('/api/assets/asset-1') && method === 'DELETE') {
                    parent = null;
                    related = null;
                    return { statusCode: 200, data: {} };
                }
                return { statusCode: 404, data: {} };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'delete'],
                    deletionPolicy: { relatedData: 'preserve', reason: 'Keep activity history.' },
                    verification: { itemPath: '/api/assets/{id}', deleteExpectation: { kind: 'absent' },
                        retention: { createPath: '/api/history', itemPath: '/api/history/{id}', parentField: 'parentId',
                            createBody: { parentId: '{parentId}', note: '{nonce}' } } } }],
                roles: [{ name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'delete'] }] }] }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_delete_related_retention')?.status, 'failed');
    });

    await runAsyncTest('17. preserved related history passes after a parent is deleted', async () => {
        let parent = null;
        let history = null;
        const adapter = {
            id: 'history-preserved-fixture', request: async () => ({ statusCode: 403, data: {} }),
            requestAsRole: async ({ url, method, data }) => {
                if (url.endsWith('/api/assets') && method === 'POST') {
                    parent = { id: 'asset-1', name: data.name };
                    return { statusCode: 201, data: parent };
                }
                if (url.endsWith('/api/assets') && method === 'GET') return { statusCode: 200, data: parent ? [parent] : [] };
                if (url.endsWith('/api/history') && method === 'POST') {
                    history = { id: 'history-1', parentId: data.parentId, note: data.note };
                    return { statusCode: 201, data: history };
                }
                if (url.endsWith('/api/history/history-1') && method === 'GET') return { statusCode: 200, data: history };
                if (url.endsWith('/api/assets/asset-1') && method === 'DELETE') {
                    parent = null;
                    return { statusCode: 200, data: {} };
                }
                return { statusCode: 404, data: {} };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'delete'],
                    deletionPolicy: { relatedData: 'preserve', reason: 'Keep activity history.' },
                    verification: { itemPath: '/api/assets/{id}', deleteExpectation: { kind: 'absent' },
                        retention: { createPath: '/api/history', itemPath: '/api/history/{id}', parentField: 'parentId',
                            createBody: { parentId: '{parentId}', note: '{nonce}' } } } }],
                roles: [{ name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'delete'] }] }] }
        }, { adapter });
        assert.equal(result.checks.find(check => check.name === 'api_delete_related_retention')?.status, 'passed');
        assert.equal(result.passed, true);
    });

    await runAsyncTest('18. unrelated history cannot prove a preserve policy', async () => {
        let parent = null;
        const history = { id: 'history-1', parentId: 'someone-else' };
        const adapter = { id: 'unrelated-history', request: async () => ({ statusCode: 403, data: {} }),
            requestAsRole: async ({ url, method, data }) => {
                if (url.endsWith('/api/assets') && method === 'POST') {
                    parent = { id: 'asset-1', name: data.name };
                    return { statusCode: 201, data: parent };
                }
                if (url.endsWith('/api/assets') && method === 'GET') return { statusCode: 200, data: parent ? [parent] : [] };
                if (url.endsWith('/api/history') && method === 'POST') return { statusCode: 201, data: history };
                if (url.endsWith('/api/history/history-1') && method === 'GET') return { statusCode: 200, data: history };
                if (url.endsWith('/api/assets/asset-1') && method === 'DELETE') {
                    parent = null;
                    return { statusCode: 200, data: {} };
                }
                return { statusCode: 404, data: {} };
            } };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'delete'],
                    deletionPolicy: { relatedData: 'preserve', reason: 'Keep activity history.' },
                    verification: { itemPath: '/api/assets/{id}', deleteExpectation: { kind: 'absent' },
                        retention: { createPath: '/api/history', itemPath: '/api/history/{id}', parentField: 'parentId',
                            createBody: { parentId: '{parentId}' } } } }],
                roles: [{ name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'delete'] }] }] }
        }, { adapter });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'api_delete_related_retention')?.status, 'blocked');
    });

    await runAsyncTest('19. a declared return transition runs before deletion and preserves completed history', async () => {
        let parent = null;
        let history = null;
        const adapter = { id: 'returned-history', request: async () => ({ statusCode: 403, data: {} }),
            requestAsRole: async ({ url, method, data }) => {
                if (url.endsWith('/api/assets') && method === 'POST') {
                    parent = { id: 'asset-1', name: data.name };
                    return { statusCode: 201, data: parent };
                }
                if (url.endsWith('/api/assets') && method === 'GET') return { statusCode: 200, data: parent ? [parent] : [] };
                if (url.endsWith('/api/history') && method === 'POST') {
                    history = { id: 'history-1', parentId: data.parentId, state: 'active' };
                    return { statusCode: 201, data: history };
                }
                if (url.endsWith('/api/history/history-1') && method === 'GET') return { statusCode: 200, data: history };
                if (url.endsWith('/api/history/history-1/return') && method === 'POST') {
                    history.state = 'returned';
                    return { statusCode: 200, data: history };
                }
                if (url.endsWith('/api/assets/asset-1') && method === 'DELETE') {
                    if (history.state !== 'returned') return { statusCode: 409, data: {} };
                    parent = null;
                    return { statusCode: 200, data: {} };
                }
                return { statusCode: 404, data: {} };
            } };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read', 'delete'],
                    deletionPolicy: { relatedData: 'preserve', reason: 'Keep completed activity history.' },
                    verification: { itemPath: '/api/assets/{id}', deleteExpectation: { kind: 'absent' },
                        retention: { createPath: '/api/history', itemPath: '/api/history/{id}', parentField: 'parentId',
                            createBody: { parentId: '{parentId}' },
                            beforeDelete: { method: 'POST', path: '/api/history/{id}/return', expectedField: 'state', expectedValue: 'returned' } } } }],
                roles: [{ name: 'manager', permissions: [{ resource: 'assets', operations: ['create', 'read', 'delete'] }] }] }
        }, { adapter });
        assert.equal(result.checks.find(check => check.name === 'api_delete_related_retention')?.status, 'passed');
        assert.equal(result.passed, true);
    });

    await runAsyncTest('20. field soft-delete persistence reads the canonical item when default collections hide inactive records', async () => {
        let item = null;
        let itemReads = 0;
        const adapter = {
            id: 'filtered-soft-delete',
            request: async () => ({ statusCode: 403, data: {} }),
            requestAsRole: async ({ url, method, data }) => {
                if (url.endsWith('/api/guests') && method === 'POST') {
                    item = { id: 'guest-soft-delete', name: data.name, isVoid: false };
                    return { statusCode: 201, data: structuredClone(item) };
                }
                if (url.endsWith('/api/guests') && method === 'GET') {
                    return { statusCode: 200, data: item && !item.isVoid ? [structuredClone(item)] : [] };
                }
                if (url.endsWith('/api/guests/guest-soft-delete') && method === 'GET') {
                    itemReads++;
                    return { statusCode: 200, data: structuredClone(item) };
                }
                if (url.endsWith('/api/guests/guest-soft-delete') && method === 'DELETE') {
                    item.isVoid = true;
                    return { statusCode: 200, data: structuredClone(item) };
                }
                return { statusCode: 404, data: {} };
            }
        };
        const result = await verifyAPIContract('http://service', null, {
            management: { needed: true,
                resources: [{ name: 'Guest', apiPath: '/api/guests', operations: ['create', 'read', 'delete'],
                    deletionPolicy: { relatedData: 'none', reason: 'Isolated fixture has no linked records.' },
                    verification: { itemPath: '/api/guests/{id}', deleteExpectation: { kind: 'field', field: 'isVoid', equals: true } } }],
                roles: [{ name: 'admin', permissions: [{ resource: 'Guest', operations: ['create', 'read', 'delete'] }] }]
            }
        }, { adapter });
        assert.equal(result.passed, true, JSON.stringify(result));
        assert.equal(result.checks.find(check => check.name === 'api_delete_persistence')?.status, 'passed');
        assert.ok(itemReads > 0, 'canonical itemPath must corroborate the actual soft-deleted record');
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
