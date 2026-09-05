import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mountProductionFrontend, assertProductionFrontendAvailable } from '../productionStatic.js';
import { validateRuntimeConfig } from '../config.js';

async function start(app) {
    const server = http.createServer(app);
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
    return server;
}

async function runTests() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-static-test-'));
    const distRoot = path.join(root, 'dist');
    await fs.mkdir(path.join(distRoot, 'assets'), { recursive: true });
    await fs.writeFile(path.join(distRoot, 'index.html'), '<!doctype html><main>SPA shell</main>');
    await fs.writeFile(path.join(distRoot, 'assets', 'app-abc123.js'), 'console.log("app")');
    await fs.writeFile(path.join(distRoot, 'assets', 'app-abc123.css'), 'body{}');

    const app = express();
    app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
    app.get('/readyz', (_req, res) => res.json({ status: 'ready' }));
    mountProductionFrontend(app, { production: true, distRoot });
    app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint bulunamadı.', code: 'NOT_FOUND', requestId: req.get('x-request-id') || 'test-request' }));

    const server = await start(app);
    const { port } = server.address();
    const request = (pathname, options) => fetch(`http://127.0.0.1:${port}${pathname}`, options);

    try {
        assert.equal((await request('/', { headers: { accept: 'text/html' } })).status, 200);
        assert.equal((await request('/projects/example', { headers: { accept: 'text/html' } })).status, 200);
        const navigation = await request('/projects/example', { headers: { accept: 'text/html' } });
        assert.match(navigation.headers.get('cache-control'), /no-cache/);
        assert.equal((await request('/assets/app-abc123.js')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
        assert.equal((await request('/missing.js', { headers: { accept: 'text/html' } })).status, 404);

        const api = await request('/api/does-not-exist', { headers: { accept: 'text/html', 'x-request-id': 'api-request' } });
        assert.equal(api.status, 404);
        assert.match(api.headers.get('content-type'), /json/);
        assert.deepEqual(await api.json(), { error: 'API endpoint bulunamadı.', code: 'NOT_FOUND', requestId: 'api-request' });

        for (const [pathname, options] of [
            ['/projects/example', { method: 'POST', headers: { accept: 'text/html' } }],
            ['/projects/example', { headers: { accept: 'application/json' } }],
            ['/ws/logs', { headers: { accept: 'text/html' } }],
            ['/healthz', { headers: { accept: 'text/html' } }],
            ['/readyz', { headers: { accept: 'text/html' } }]
        ]) {
            const response = await request(pathname, options);
            const body = await response.text();
            assert.notEqual(body, '<!doctype html><main>SPA shell</main>', `${options.method || 'GET'} ${pathname} must not receive the SPA shell`);
        }

        await assert.rejects(
            assertProductionFrontendAvailable({ production: true, distRoot: path.join(root, 'missing') }),
            /index\.html/
        );
        await assert.doesNotReject(assertProductionFrontendAvailable({ production: false, distRoot: path.join(root, 'missing') }));

        assert.throws(
            () => validateRuntimeConfig({
                NODE_ENV: 'production',
                TRUST_PROXY: 'loopback',
                ALLOWED_ORIGINS: 'https://xfactor.example'
            }),
            /ARTIFACTS_ROOT.*absolute|PROJECTS_ROOT.*absolute|DB_PATH.*absolute/
        );
        console.log('P6 static serving tests passed');
    } finally {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(root, { recursive: true, force: true });
    }
}

runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
