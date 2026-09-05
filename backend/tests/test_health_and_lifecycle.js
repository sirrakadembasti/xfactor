import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '../server.js');

async function reservePort() {
    const probe = http.createServer();
    await new Promise((resolve, reject) => probe.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
    const { port } = probe.address();
    await new Promise(resolve => probe.close(resolve));
    return port;
}

function startServer(env) {
    return spawn(process.execPath, [serverPath], { env, stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitForStart(child) {
    let output = '';
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Server start timed out: ${output}`)), 10000);
        const onData = chunk => {
            output += chunk;
            if (output.includes('Backend hazır')) {
                clearTimeout(timer);
                resolve();
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.once('exit', code => {
            clearTimeout(timer);
            reject(new Error(`Server exited during startup (${code}): ${output}`));
        });
    });
}

async function waitForExit(child) {
    return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

async function request(port, pathname) {
    return fetch(`http://127.0.0.1:${port}${pathname}`, {
        headers: { 'x-forwarded-proto': 'https', accept: 'text/html' }
    });
}

async function runTests() {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-health-test-'));
    const dbPath = path.join(tempRoot, 'data', 'projects.db');
    const projectsRoot = path.join(tempRoot, 'projects');
    const artifactsRoot = path.join(tempRoot, 'artifacts');
    const frontendRoot = path.join(tempRoot, 'frontend-dist');
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.mkdir(projectsRoot, { recursive: true });
    await fs.mkdir(artifactsRoot, { recursive: true });
    await fs.mkdir(frontendRoot, { recursive: true });
    await fs.writeFile(path.join(frontendRoot, 'index.html'), '<!doctype html><main>ready SPA</main>');

    const commonEnv = {
        ...process.env,
        NODE_ENV: 'production',
        TRUST_PROXY: 'loopback',
        ALLOWED_ORIGINS: 'https://xfactor.example',
        DB_PATH: dbPath,
        PROJECTS_ROOT: projectsRoot,
        ARTIFACTS_ROOT: artifactsRoot,
        FRONTEND_DIST_ROOT: frontendRoot,
        HOST: '127.0.0.1'
    };
    let child;
    try {
        const port = await reservePort();
        child = startServer({ ...commonEnv, PORT: String(port) });
        await waitForStart(child);

        const health = await request(port, '/healthz');
        assert.equal(health.status, 200);
        assert.equal((await health.json()).status, 'ok');

        const ready = await request(port, '/readyz');
        assert.equal(ready.status, 200);
        assert.equal((await ready.json()).status, 'ready');

        const navigation = await request(port, '/projects/example');
        assert.equal(navigation.status, 200);
        assert.match(navigation.headers.get('cache-control'), /no-cache/);

        await fs.rm(artifactsRoot, { recursive: true, force: true });
        const unavailable = await request(port, '/readyz');
        assert.equal(unavailable.status, 503);

        child.kill('SIGTERM');
        const graceful = await waitForExit(child);
        assert.equal(
            graceful.code === 0 || graceful.signal === 'SIGTERM',
            true,
            `Expected clean SIGTERM shutdown, received ${JSON.stringify(graceful)}`
        );
        child = undefined;

        const missingFrontendPort = await reservePort();
        await fs.rm(path.join(frontendRoot, 'index.html'));
        const missingFrontend = startServer({ ...commonEnv, PORT: String(missingFrontendPort) });
        const failure = await waitForExit(missingFrontend);
        assert.notEqual(failure.code, 0, 'Production startup must fail without index.html');
        console.log('P6 health and lifecycle tests passed');
    } finally {
        if (child?.exitCode === null) child.kill('SIGKILL');
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
}

runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
