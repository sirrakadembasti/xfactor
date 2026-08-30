import assert from 'assert';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const APP_ORIGIN = 'https://xfactor.example';
const csrfHeaders = { origin: APP_ORIGIN, 'x-xfactor-csrf': '1' };
const cookiePair = response => response.headers.get('set-cookie')?.split(';', 1)[0] || '';
const sessionHeaders = cookie => ({ ...csrfHeaders, cookie });

async function reservePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return port;
}

async function waitForReady(child) {
    await new Promise((resolve, reject) => {
        let stderr = '';
        const timer = setTimeout(() => reject(new Error(`Backend readiness timeout: ${stderr}`)), 25_000);
        const cleanup = () => {
            clearTimeout(timer);
            child.stdout.off('data', onData);
            child.stderr.off('data', onStderr);
            child.off('close', onClose);
            child.off('error', onError);
        };
        const onData = chunk => {
            if (String(chunk).includes('Backend hazır:')) {
                cleanup();
                resolve();
            }
        };
        const onStderr = chunk => {
            stderr += String(chunk);
        };
        const onClose = code => {
            cleanup();
            reject(new Error(`Backend closed before readiness: ${code}: ${stderr}`));
        };
        const onError = error => {
            cleanup();
            reject(error);
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onStderr);
        child.once('close', onClose);
        child.once('error', onError);
    });
}

async function request(baseUrl, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: {
            'content-type': 'application/json',
            'x-forwarded-proto': 'https',
            ...(options.headers || {})
        }
    });
    const body = await response.json();
    return { response, body };
}

async function expectWebSocketRejection(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { headers });
        const timer = setTimeout(() => {
            socket.terminate();
            reject(new Error('Insecure WebSocket rejection timeout'));
        }, 5_000);
        socket.once('open', () => {
            clearTimeout(timer);
            socket.terminate();
            reject(new Error('Insecure WebSocket connection was accepted'));
        });
        socket.once('unexpected-response', (_request, response) => {
            clearTimeout(timer);
            socket.terminate();
            resolve(response.statusCode);
        });
        socket.once('error', error => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
async function snapshotTree(rootDir) {
    const entries = [];

    async function visit(currentDir, relativeDir = '') {
        const list = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of list) {
            const relPath = path.posix.join(relativeDir, entry.name);
            entries.push(relPath);
            if (entry.isDirectory()) {
                await visit(path.join(currentDir, entry.name), relPath);
            }
        }
    }

    await visit(rootDir);
    return entries.sort();
}


async function stopChild(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    const waitForEnd = () => new Promise(resolve => {
        const timer = setTimeout(() => finish('timeout'), 5_000);
        const cleanup = () => {
            clearTimeout(timer);
            child.off('close', onClose);
            child.off('error', onError);
        };
        const finish = value => {
            cleanup();
            resolve(value);
        };
        const onClose = () => finish('close');
        const onError = () => finish('error');
        child.once('close', onClose);
        child.once('error', onError);
    });

    child.kill('SIGTERM');
    if ((await waitForEnd()) === 'timeout' && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await waitForEnd();
    }
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-http-'));

let child;

try {
    const dbPath = path.join(tempDir, 'projects.db');
    const projectsRoot = path.join(tempDir, 'projects');
    const port = await reservePort();
    const env = {
        ...process.env,
        PORT: String(port),
        DB_PATH: dbPath,
        PROJECTS_ROOT: projectsRoot,
        NODE_ENV: 'production',
        TRUST_PROXY: 'loopback',
        ALLOWED_ORIGINS: APP_ORIGIN,
        ALLOW_MOCK_FALLBACK: 'false',
        LLM_PROVIDER: 'google',
        GOOGLE_API_KEY: '',
        GEMINI_API_KEY: ''
    };

    const authUrl = pathToFileURL(path.join(backendDir, 'auth.js')).href;
    const seedSource = `
    import { createUser, promoteUserToAdmin } from ${JSON.stringify(authUrl)};
    createUser('route-owner-a', 'RouteOwnerA!2026');
    createUser('route-owner-b', 'RouteOwnerB!2026');
    promoteUserToAdmin('integration-admin', 'IntegrationAdmin!2026');
`;

    const seeded = spawnSync('bun', ['--eval', seedSource], {
        cwd: backendDir,
        env,
        encoding: 'utf8'
    });
    assert.strictEqual(seeded.status, 0, seeded.stderr);

    child = spawn('bun', ['server.js'], {
        cwd: backendDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    await waitForReady(child);
    const baseUrl = `http://127.0.0.1:${port}/api`;

    const insecureHttpResponse = await fetch(`${baseUrl}/projects`);
    const insecureHttpBody = await insecureHttpResponse.json();
    assert.strictEqual(insecureHttpResponse.status, 426, 'production plaintext HTTP must be rejected');
    assert.strictEqual(insecureHttpBody.code, 'HTTPS_REQUIRED');
    assert.strictEqual(insecureHttpBody.error, 'HTTPS bağlantısı gerekli.');
    assert.strictEqual(insecureHttpBody.requestId, insecureHttpResponse.headers.get('x-request-id'));

    const rejectedLogin = await request(baseUrl, '/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'route-owner-a', password: 'RouteOwnerA!2026' })
    });
    assert.strictEqual(rejectedLogin.response.status, 403, 'Login must require CSRF proof');
    assert.strictEqual(rejectedLogin.body.code, 'CSRF_REJECTED');
    const crossOriginLogin = await request(baseUrl, '/login', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'x-xfactor-csrf': '1' },
        body: JSON.stringify({ username: 'route-owner-a', password: 'RouteOwnerA!2026' })
    });
    assert.strictEqual(crossOriginLogin.response.status, 403);
    assert.strictEqual(crossOriginLogin.body.code, 'CSRF_REJECTED');


    const loginA = await request(baseUrl, '/login', {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({ username: 'route-owner-a', password: 'RouteOwnerA!2026' })
    });
    assert.strictEqual(loginA.response.status, 200);
    assert.strictEqual('token' in loginA.body, false, 'Login JSON must not expose a session token');
    assert.deepStrictEqual(loginA.body.user, {
        id: loginA.body.user.id,
        username: 'route-owner-a',
        isAdmin: false
    });
    const cookieA = cookiePair(loginA.response);
    const setCookieA = loginA.response.headers.get('set-cookie');
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Max-Age=86400']) {
        assert.ok(setCookieA.includes(attribute), `Login cookie must include ${attribute}`);
    }

    const sessionA = await request(baseUrl, '/session', {
        headers: { cookie: cookieA }
    });
    assert.strictEqual(sessionA.response.status, 200);
    assert.deepStrictEqual(sessionA.body.user, loginA.body.user);

    const bearerOnly = await request(baseUrl, '/projects', {
        headers: { authorization: 'Bearer obsolete' }
    });
    assert.strictEqual(bearerOnly.response.status, 401, 'Bearer-only auth must be rejected');

    const noCsrfProject = await request(baseUrl, '/projects', {
        method: 'POST',
        headers: { cookie: cookieA },
        body: JSON.stringify({ title: 'Rejected Project' })
    });
    assert.strictEqual(noCsrfProject.response.status, 403);
    assert.strictEqual(noCsrfProject.body.code, 'CSRF_REJECTED');

    const webSocketUrl = `ws://127.0.0.1:${port}/ws/logs`;
    const insecureWebSocketStatus = await expectWebSocketRejection(webSocketUrl);
    assert.notStrictEqual(insecureWebSocketStatus, 101, 'production plaintext WebSocket upgrades must be rejected');

    const loginB = await request(baseUrl, '/login', {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({ username: 'route-owner-b', password: 'RouteOwnerB!2026' })
    });
    assert.strictEqual(loginB.response.status, 200);
    const cookieB = cookiePair(loginB.response);
    const authA = sessionHeaders(cookieA);
    const authB = sessionHeaders(cookieB);

    const projectA = await request(baseUrl, '/projects', {
        method: 'POST',
        headers: authA,
        body: JSON.stringify({ title: 'Owner A Project' })
    });
    assert.strictEqual(projectA.response.status, 200);

    const projectB = await request(baseUrl, '/projects', {
        method: 'POST',
        headers: authB,
        body: JSON.stringify({ title: 'Owner B Project' })
    });
    assert.strictEqual(projectB.response.status, 200);

    const failedChat = await request(baseUrl, `/projects/${projectA.body.id}/chat`, {
        method: 'POST',
        headers: authA,
        body: JSON.stringify({ message: 'Güvenli hata yanıtını doğrula' })
    });
    assert.strictEqual(failedChat.response.status, 500);
    assert.deepStrictEqual(Object.keys(failedChat.body).sort(), ['code', 'error', 'requestId']);
    assert.strictEqual(failedChat.body.code, 'INTERNAL_ERROR');
    assert.strictEqual(failedChat.body.error, 'İşlem başarısız oldu.');
    assert.ok(/^[a-f0-9]{16}$/.test(failedChat.body.requestId));
    assert.ok(!JSON.stringify(failedChat.body).includes('API key'));

    const listA = await request(baseUrl, '/projects', { headers: authA });
    assert.strictEqual(listA.response.status, 200);
    assert.deepStrictEqual(listA.body.map(project => project.id), [projectA.body.id]);
    assert.strictEqual(listA.body.some(project => project.id === projectB.body.id), false);

    const visibleProjectIdsBeforeSync = listA.body.map(project => project.id);
    const adminLogin = await request(baseUrl, '/login', {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({
            username: 'integration-admin',
            password: 'IntegrationAdmin!2026'
        })
    });
    assert.strictEqual(adminLogin.response.status, 200);
    assert.strictEqual(adminLogin.body.user.isAdmin, true);
    const adminCookie = cookiePair(adminLogin.response);
    const adminList = await request(baseUrl, '/projects', {
        headers: { cookie: adminCookie }
    });
    const adminProjectIds = new Set(adminList.body.map(project => project.id));
    assert.strictEqual(adminProjectIds.has(projectA.body.id), true);
    assert.strictEqual(adminProjectIds.has(projectB.body.id), true);

    const normalSyncResponse = await fetch(`${baseUrl}/projects/sync`, {
        method: 'POST',
        headers: { ...authA, 'x-forwarded-proto': 'https' }
    });
    const adminSyncResponse = await fetch(`${baseUrl}/projects/sync`, {
        method: 'POST',
        headers: {
            ...sessionHeaders(adminCookie),
            'x-forwarded-proto': 'https'
        }
    });
    assert.strictEqual(normalSyncResponse.status, 404);
    assert.strictEqual(adminSyncResponse.status, 404);

    const listAfterRemovedSync = await request(baseUrl, '/projects', { headers: authA });
    assert.deepStrictEqual(listAfterRemovedSync.body.map(project => project.id), visibleProjectIdsBeforeSync);

    const secondLoginA = await request(baseUrl, '/login', {
        method: 'POST',
        headers: csrfHeaders,
        body: JSON.stringify({ username: 'route-owner-a', password: 'RouteOwnerA!2026' })
    });
    const secondCookieA = cookiePair(secondLoginA.response);
    const logoutA = await request(baseUrl, '/logout', {
        method: 'POST',
        headers: sessionHeaders(cookieA)
    });
    assert.strictEqual(logoutA.response.status, 200);
    assert.ok(logoutA.response.headers.get('set-cookie').includes('Max-Age=0'));
    assert.strictEqual(
        (await request(baseUrl, '/session', { headers: { cookie: cookieA } })).response.status,
        401,
        'Logged-out cookie must not replay'
    );
    assert.strictEqual(
        (await request(baseUrl, '/session', { headers: { cookie: secondCookieA } })).response.status,
        200,
        'Logout must preserve a separate session'
    );
    const projectADir = path.join(projectsRoot, projectA.body.id);
    await fs.mkdir(projectADir, { recursive: true });
    await fs.writeFile(path.join(projectADir, '.env'), 'TEST_ONLY_SECRET=route-sentinel\n', 'utf8');
    await fs.writeFile(path.join(projectADir, '.env.example'), 'TEST_ONLY_SECRET=example-placeholder\n', 'utf8');
    await fs.writeFile(path.join(projectADir, '.gitignore'), '.env\n', 'utf8');

    const treeBefore = await snapshotTree(projectADir);
    const filesA = await request(baseUrl, `/projects/${projectA.body.id}/files`, {
        headers: sessionHeaders(secondCookieA)
    });
    assert.strictEqual(filesA.response.status, 200);
    assert.strictEqual(filesA.body.some(entry => entry.path === '.env'), false, 'GET /files must not expose real .env');
    assert.strictEqual(filesA.body.some(entry => entry.path === '.env.example'), true, '.env.example should stay visible');
    assert.strictEqual(filesA.body.some(entry => entry.path === '.gitignore'), true, '.gitignore should stay visible');
    assert.deepStrictEqual(await snapshotTree(projectADir), treeBefore, 'GET /files must not mutate project tree');

} finally {
    await stopChild(child);
    await fs.rm(tempDir, { recursive: true, force: true });
}

