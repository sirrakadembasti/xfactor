import assert from 'assert';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { createProjectWebSocketHub } from '../websocketHub.js';

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';
const APP_ORIGIN = 'http://127.0.0.1:5173';
const csrfHeaders = { origin: APP_ORIGIN, 'x-xfactor-csrf': '1' };
const cookiePair = response => response.headers.get('set-cookie')?.split(';', 1)[0] || '';

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve(server.address().port);
        });
    });
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
}

function closeWebSocketServer(wss) {
    return new Promise((resolve, reject) => {
        wss.close(error => error ? reject(error) : resolve());
    });
}

function connect(url, {
    cookie,
    origin = 'http://127.0.0.1:5173',
    protocols,
    headers: extraHeaders = {}
} = {}) {
    return new Promise((resolve, reject) => {
        const headers = { Origin: origin, ...extraHeaders };
        if (cookie) headers.Cookie = cookie;
        const socket = protocols
            ? new WebSocket(url, protocols, { headers })
            : new WebSocket(url, { headers });
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

function expectUpgradeRejection(url, options = {}) {
    return new Promise((resolve, reject) => {
        const headers = { Origin: options.origin || 'http://127.0.0.1:5173' };
        if (options.cookie) headers.Cookie = options.cookie;
        if (options.authorization) headers.Authorization = options.authorization;
        const socket = options.protocols
            ? new WebSocket(url, options.protocols, { headers })
            : new WebSocket(url, { headers });
        socket.once('open', () => {
            socket.terminate();
            reject(new Error('WebSocket upgrade was unexpectedly accepted'));
        });
        socket.once('unexpected-response', (_request, response) => {
            socket.terminate();
            resolve(response.statusCode);
        });
        socket.once('error', reject);
    });
}

function nextJson(socket, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off('message', onMessage);
            reject(new Error('Timed out waiting for WebSocket message'));
        }, timeoutMs);
        const onMessage = data => {
            clearTimeout(timer);
            resolve(JSON.parse(data.toString()));
        };
        socket.once('message', onMessage);
    });
}

async function sendAndRead(socket, payload) {
    const response = nextJson(socket);
    socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    return response;
}

async function expectNoMessage(socket, action, timeoutMs = 150) {
    let received = false;
    const listener = () => { received = true; };
    socket.on('message', listener);
    await action();
    await new Promise(resolve => setTimeout(resolve, timeoutMs));
    socket.off('message', listener);
    assert.strictEqual(received, false);
}

function closeSocket(socket) {
    if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise(resolve => {
        socket.once('close', resolve);
        socket.close();
    });
}

const roles = new Map([
    [`user-a:${PROJECT_A}`, 'owner'],
    [`user-b:${PROJECT_B}`, 'owner']
]);
const sessions = new Map([
    ['session-a', {
        id: 'session-a',
        user: { id: 'user-a', username: 'owner-a', isAdmin: false }
    }],
    ['session-b', {
        id: 'session-b',
        user: { id: 'user-b', username: 'owner-b', isAdmin: false }
    }]
]);
const hub = createProjectWebSocketHub({
    getProjectRole: (userId, projectId) => roles.get(`${userId}:${projectId}`) || null,
    verifySessionId: sessionId => sessions.get(sessionId) || null
});
const server = http.createServer();
const wss = new WebSocketServer({ server, path: '/ws/logs' });
wss.on('connection', (socket, req) => {
    req.authSessionId = req.headers['x-test-session'];
    hub.handleConnection(socket, req);
});

let socketA;
let socketB;

try {
    const port = await listen(server);
    const wsUrl = `ws://127.0.0.1:${port}/ws/logs`;
    socketA = await connect(wsUrl, { headers: { 'X-Test-Session': 'session-a' } });
    socketB = await connect(wsUrl, { headers: { 'X-Test-Session': 'session-b' } });

    await expectNoMessage(socketA, () => hub.publish({ projectId: PROJECT_A, message: 'unsubscribed' }));
    assert.deepStrictEqual(
        await sendAndRead(socketA, { type: 'subscribe', projectId: PROJECT_A }),
        { type: 'subscribed', projectId: PROJECT_A }
    );

    const eventA = { projectId: PROJECT_A, message: 'authorized-a' };
    const eventAResponse = nextJson(socketA);
    await expectNoMessage(socketB, () => hub.publish(eventA));
    assert.deepStrictEqual(await eventAResponse, eventA);

    assert.deepStrictEqual(
        await sendAndRead(socketA, { type: 'subscribe', projectId: PROJECT_B }),
        { type: 'error', code: 'PROJECT_FORBIDDEN', projectId: PROJECT_B }
    );
    assert.deepStrictEqual(
        await sendAndRead(socketA, '{'),
        { type: 'error', code: 'INVALID_MESSAGE' }
    );

    const preservedEvent = { projectId: PROJECT_A, message: 'preserved-subscription' };
    const preservedResponse = nextJson(socketA);
    hub.publish(preservedEvent);
    assert.deepStrictEqual(await preservedResponse, preservedEvent);

    roles.set(`user-a:${PROJECT_B}`, 'viewer');
    assert.deepStrictEqual(
        await sendAndRead(socketA, { type: 'subscribe', projectId: PROJECT_B }),
        { type: 'subscribed', projectId: PROJECT_B }
    );
    await expectNoMessage(socketA, () => hub.publish({ projectId: PROJECT_A, message: 'old-project' }));

    roles.delete(`user-a:${PROJECT_B}`);
    await expectNoMessage(socketA, () => hub.publish({ projectId: PROJECT_B, message: 'revoked' }));

    const closedForRevocation = new Promise(resolve => {
        socketA.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    sessions.delete('session-a');
    hub.publish({ projectId: PROJECT_B, message: 'session-revoked' });
    assert.deepStrictEqual(
        await closedForRevocation,
        { code: 1008, reason: 'SESSION_INVALID' },
        'Open sockets must stop after server-session revocation'
    );
} finally {
    await Promise.all([closeSocket(socketA), closeSocket(socketB)]);
    await closeWebSocketServer(wss);
    await closeServer(server);
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-websocket-'));
let productionSocketA;
let productionSocketB;
let runtime;
let productionDb;

async function request(baseUrl, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: {
            'content-type': 'application/json',
            ...(options.headers || {})
        }
    });
    return { response, body: await response.json() };
}

try {
    const reservation = http.createServer();
    const productionPort = await listen(reservation);
    await closeServer(reservation);

    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASS;
    Object.assign(process.env, {
        PORT: String(productionPort),
        DB_PATH: path.join(tempDir, 'projects.db'),
        PROJECTS_ROOT: path.join(tempDir, 'projects'),
        ALLOWED_ORIGINS: APP_ORIGIN,
        ALLOW_MOCK_FALLBACK: 'false'
    });

    const authModule = await import('../auth.js');
    authModule.createUser('ws-owner-a', 'WebSocketOwnerA!2026');
    authModule.createUser('ws-owner-b', 'WebSocketOwnerB!2026');
    productionDb = (await import('../db.js')).db;

    runtime = await import('../server.js');
    assert.ok(runtime.server, 'server.js must export the HTTP server');
    assert.ok(runtime.wss, 'server.js must export the WebSocket server');
    assert.ok(runtime.wsHub, 'server.js must export the authorized WebSocket hub');
    if (!runtime.server.listening) {
        await new Promise(resolve => runtime.server.once('listening', resolve));
    }

    const apiUrl = `http://127.0.0.1:${productionPort}/api`;
    const loginA = await request(apiUrl, '/login', {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({ username: 'ws-owner-a', password: 'WebSocketOwnerA!2026' })
    });
    const loginB = await request(apiUrl, '/login', {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({ username: 'ws-owner-b', password: 'WebSocketOwnerB!2026' })
    });
    assert.strictEqual(loginA.response.status, 200);
    assert.strictEqual(loginB.response.status, 200);
    const cookieA = cookiePair(loginA.response);
    const cookieB = cookiePair(loginB.response);

    const projectA = await request(apiUrl, '/projects', {
        method: 'POST',
        headers: { ...csrfHeaders, cookie: cookieA },
        body: JSON.stringify({ title: 'WebSocket Owner A Project' })
    });
    await new Promise(resolve => setTimeout(resolve, 2));
    const projectB = await request(apiUrl, '/projects', {
        method: 'POST',
        headers: { ...csrfHeaders, cookie: cookieB },
        body: JSON.stringify({ title: 'WebSocket Owner B Project' })
    });
    assert.strictEqual(projectA.response.status, 200);
    assert.strictEqual(projectB.response.status, 200);

    const productionWsUrl = `ws://127.0.0.1:${productionPort}/ws/logs`;
    assert.strictEqual(await expectUpgradeRejection(productionWsUrl), 401);
    assert.strictEqual(await expectUpgradeRejection(productionWsUrl, {
        cookie: cookieA,
        origin: 'http://evil.example'
    }), 403);
    assert.strictEqual(await expectUpgradeRejection(productionWsUrl, {
        authorization: 'Bearer obsolete'
    }), 401);
    assert.strictEqual(await expectUpgradeRejection(productionWsUrl, {
        protocols: ['xfactor-auth.obsolete']
    }), 400);

    productionSocketA = await connect(productionWsUrl, { cookie: cookieA });
    productionSocketB = await connect(productionWsUrl, { cookie: cookieB });

    await expectNoMessage(productionSocketA, () => runtime.wsHub.publish({
        projectId: projectA.body.id,
        message: 'production-unsubscribed'
    }));
    assert.deepStrictEqual(
        await sendAndRead(productionSocketA, { type: 'subscribe', projectId: projectA.body.id }),
        { type: 'subscribed', projectId: projectA.body.id }
    );
    assert.deepStrictEqual(
        await sendAndRead(productionSocketA, { type: 'subscribe', projectId: projectB.body.id }),
        { type: 'error', code: 'PROJECT_FORBIDDEN', projectId: projectB.body.id }
    );
    assert.deepStrictEqual(
        await sendAndRead(productionSocketB, { type: 'subscribe', projectId: projectB.body.id }),
        { type: 'subscribed', projectId: projectB.body.id }
    );

    const productionEventA = { projectId: projectA.body.id, message: 'production-authorized-a' };
    const productionResponseA = nextJson(productionSocketA);
    await expectNoMessage(productionSocketB, () => runtime.wsHub.publish(productionEventA));
    assert.deepStrictEqual(await productionResponseA, productionEventA);

    productionDb.prepare('UPDATE projects SET owner_id = NULL WHERE id = ?').run(projectA.body.id);
    productionDb.prepare('DELETE FROM project_owners WHERE project_id = ? AND user_id = ?')
        .run(projectA.body.id, loginA.body.user.id);
    await expectNoMessage(productionSocketA, () => runtime.wsHub.publish({
        projectId: projectA.body.id,
        message: 'production-membership-revoked'
    }));

    const closedAfterLogout = new Promise(resolve => {
        productionSocketA.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    const logoutA = await request(apiUrl, '/logout', {
        method: 'POST',
        headers: { ...csrfHeaders, cookie: cookieA }
    });
    assert.strictEqual(logoutA.response.status, 200);
    runtime.wsHub.publish({ projectId: projectA.body.id, message: 'production-session-revoked' });
    assert.deepStrictEqual(await closedAfterLogout, { code: 1008, reason: 'SESSION_INVALID' });
} finally {
    await Promise.all([closeSocket(productionSocketA), closeSocket(productionSocketB)]);
    if (runtime?.wss) await closeWebSocketServer(runtime.wss);
    if (runtime?.server) await closeServer(runtime.server);
    if (productionDb?.close) productionDb.close();
    await fs.rm(tempDir, { recursive: true, force: true });
}
