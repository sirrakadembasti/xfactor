import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRoleSessionAdapter, prepareManagementDemoUsers } from '../verification/roleSessionAdapter.js';

const records = [];
const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/auth/login' && req.method === 'POST') {
        const credentials = JSON.parse(body);
        if (credentials.password !== 'ephemeral-secret' || !['manager-fixture', 'viewer-fixture'].includes(credentials.username)) {
            res.writeHead(401).end('{}'); return;
        }
        res.setHeader('set-cookie', `session=${credentials.username}; HttpOnly; SameSite=Lax`);
        res.writeHead(200).end(JSON.stringify({ ok: true })); return;
    }
    if (req.url === '/api/assets') {
        const role = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
        if (req.method === 'POST' && role !== 'manager-fixture') { res.writeHead(role ? 403 : 401).end('{}'); return; }
        if (req.method === 'POST') {
            const item = { id: String(records.length + 1), name: JSON.parse(body).name };
            records.push(item);
            res.writeHead(201).end(JSON.stringify(item)); return;
        }
        if (req.method === 'GET' && role) { res.writeHead(200).end(JSON.stringify(records)); return; }
    }
    res.writeHead(404).end('{}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const calls = [];
const sandboxAdapter = {
    id: 'test-sandbox',
    execute: async ({ command, args, env, input }) => {
        assert.equal(command, 'node');
        calls.push({ args, env, input });
        const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.stdin.end(input || '');
        const exitCode = await new Promise(resolve => child.on('close', resolve));
        return { exitCode, stdout, stderr };
    }
};

try {
    const setupCalls = [];
    const passwords = await prepareManagementDemoUsers({
        execute: async request => {
            setupCalls.push(request);
            return { exitCode: 0, passed: true, stdout: 'seeded', stderr: '' };
        }
    }, {
        roles: [
            { name: 'manager', demoUser: { username: 'manager-fixture' } },
            { name: 'viewer', demoUser: { username: 'viewer-fixture' } }
        ]
    }, { DATABASE_URL: 'file:./dev.db' });
    assert.equal(setupCalls.length, 1);
    assert.equal(setupCalls[0].command, 'node');
    assert.ok(setupCalls[0].args.join(' ').includes('xfactor:test:setup'));
    assert.ok(passwords.manager && passwords.viewer && passwords.manager !== passwords.viewer);
    assert.equal(JSON.parse(setupCalls[0].input).XFACTOR_DEMO_PASSWORD_MANAGER, passwords.manager);
    assert.ok(!JSON.stringify(setupCalls[0].args).includes(passwords.manager));
    assert.ok(!JSON.stringify(setupCalls[0].env).includes(passwords.manager));
    const adapter = createRoleSessionAdapter(sandboxAdapter, baseUrl, {
        authentication: { apiLogin: { path: '/api/auth/login', identityField: 'username' } },
        roles: [
            { name: 'manager', demoUser: { username: 'manager-fixture' } },
            { name: 'viewer', demoUser: { username: 'viewer-fixture' } }
        ]
    }, { manager: 'ephemeral-secret', viewer: 'ephemeral-secret' });
    const created = await adapter.requestAsRole({ role: 'manager', method: 'POST', url: `${baseUrl}/api/assets`, data: { name: 'probe-one' } });
    assert.equal(created.statusCode, 201);
    assert.equal(created.data.name, 'probe-one');
    const denied = await adapter.requestAsRole({ role: 'viewer', method: 'POST', url: `${baseUrl}/api/assets`, data: { name: 'forbidden' } });
    assert.equal(denied.statusCode, 403);
    const listed = await adapter.requestAsRole({ role: 'manager', method: 'GET', url: `${baseUrl}/api/assets` });
    assert.deepEqual(listed.data, [{ id: '1', name: 'probe-one' }]);
    assert.ok(calls.every(call => !JSON.stringify(call.args).includes('ephemeral-secret')),
        'credentials must not appear in command arguments');
    assert.ok(calls.every(call => !JSON.stringify(call.env || {}).includes('ephemeral-secret')),
        'credentials must not appear in docker exec environment arguments');
    await assert.rejects(() => adapter.requestAsRole({ role: 'unknown', method: 'GET', url: `${baseUrl}/api/assets` }), /role/i);
    await assert.rejects(() => adapter.requestAsRole({ role: 'manager', method: 'GET', url: 'http://external.example/api/assets' }), /origin|local/i);
    console.log('Role session adapter passed');
} finally {
    await new Promise(resolve => server.close(resolve));
}
