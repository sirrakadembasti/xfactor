import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p7-files-api');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const { runAsyncTest, finish } = createTestHarness();

const MAX_TOTAL_FILES = 500;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

try {
    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { createProject, getProjectDir } = await import('../projectRepository.js');
    const { createProjectRouter } = await import('../routes/projectRoutes.js');

    function buildFilesApp() {
        const passThrough = (_req, _res, next) => next();
        const app = express();
        app.use(express.json());
        app.use('/api/projects', createProjectRouter({
            requireAuth: passThrough,
            projectAccess: () => passThrough,
            wsHub: { broadcast() {} }
        }));
        // eslint-disable-next-line no-unused-vars
        app.use((err, _req, res, _next) => {
            res.status(err.status || 500).json({ error: err.message });
        });
        return app;
    }

    async function getFilesViaHttp(projectId) {
        const app = buildFilesApp();
        const server = http.createServer(app);
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        try {
            const { port } = server.address();
            const response = await fetch(`http://127.0.0.1:${port}/api/projects/${projectId}/files`);
            const body = await response.json();
            return { status: response.status, body };
        } finally {
            await new Promise((r) => server.close(r));
        }
    }

    await runAsyncTest('1. Deeply nested directory with >500 files stops at exactly 500 globally', async () => {
        const project = await createProject({ title: 'P7 Files Limit' });
        const dir = getProjectDir(project.id);
        const folders = 5;
        const filesPerFolder = 120;
        for (let d = 0; d < folders; d++) {
            const sub = path.join(dir, `dir${d}`, 'nested');
            await fs.mkdir(sub, { recursive: true });
            for (let f = 0; f < filesPerFolder; f++) {
                await fs.writeFile(path.join(sub, `file${f}.js`), `console.log(${d * 1000 + f});\n`);
            }
        }
        const { status, body } = await getFilesViaHttp(project.id);
        assert.strictEqual(status, 200);
        assert.ok(Array.isArray(body), 'response must be an array');
        assert.strictEqual(body.length, MAX_TOTAL_FILES, `expected exactly ${MAX_TOTAL_FILES} files, got ${body.length}`);
    });

    await runAsyncTest('2. Files exceeding 20MB total stop at the byte ceiling', async () => {
        const project = await createProject({ title: 'P7 Files Bytes' });
        const dir = getProjectDir(project.id);
        const oneMb = 'x'.repeat(1024 * 1024);
        const fileCount = 30;
        for (let f = 0; f < fileCount; f++) {
            await fs.writeFile(path.join(dir, `big${f}.txt`), oneMb);
        }
        const { status, body } = await getFilesViaHttp(project.id);
        assert.strictEqual(status, 200);
        assert.ok(Array.isArray(body), 'response must be an array');
        assert.ok(body.length < fileCount, `expected truncation, got all ${body.length} files`);
        const totalBytes = body.reduce((sum, entry) => sum + entry.size, 0);
        assert.ok(totalBytes <= MAX_TOTAL_BYTES + 1024 * 1024, `total ${totalBytes} exceeds byte ceiling + slack`);
    });

    await runAsyncTest('3. Text files return utf8 encoding with matching content', async () => {
        const project = await createProject({ title: 'P7 Files Text' });
        const dir = getProjectDir(project.id);
        await fs.mkdir(path.join(dir, 'src'), { recursive: true });
        const appJsx = 'export default function App() { return <h1>Hello</h1>; }\n';
        const readme = '# Demo\nSome readme text.\n';
        await fs.writeFile(path.join(dir, 'src', 'App.jsx'), appJsx);
        await fs.writeFile(path.join(dir, 'README.md'), readme);
        const { status, body } = await getFilesViaHttp(project.id);
        assert.strictEqual(status, 200);
        const appEntry = body.find((e) => e.path === 'src/App.jsx');
        const readmeEntry = body.find((e) => e.path === 'README.md');
        assert.ok(appEntry, 'src/App.jsx must be listed');
        assert.ok(readmeEntry, 'README.md must be listed');
        assert.strictEqual(appEntry.encoding, 'utf8');
        assert.strictEqual(appEntry.content, appJsx);
        assert.strictEqual(readmeEntry.encoding, 'utf8');
        assert.strictEqual(readmeEntry.content, readme);
        assert.strictEqual(typeof appEntry.size, 'number');
    });

    await runAsyncTest('4. Binary files return base64 encoding decodable to original bytes', async () => {
        const project = await createProject({ title: 'P7 Files Binary' });
        const dir = getProjectDir(project.id);
        await fs.mkdir(path.join(dir, 'public'), { recursive: true });
        await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
        const icoBytes = crypto.randomBytes(1024);
        const pngBytes = crypto.randomBytes(2048);
        await fs.writeFile(path.join(dir, 'public', 'favicon.ico'), icoBytes);
        await fs.writeFile(path.join(dir, 'assets', 'logo.png'), pngBytes);
        const { status, body } = await getFilesViaHttp(project.id);
        assert.strictEqual(status, 200);
        const icoEntry = body.find((e) => e.path === 'public/favicon.ico');
        const pngEntry = body.find((e) => e.path === 'assets/logo.png');
        assert.ok(icoEntry, 'public/favicon.ico must be listed');
        assert.ok(pngEntry, 'assets/logo.png must be listed');
        assert.strictEqual(icoEntry.encoding, 'base64');
        assert.strictEqual(pngEntry.encoding, 'base64');
        assert.ok(Buffer.from(icoEntry.content, 'base64').equals(icoBytes), 'ico bytes must round-trip');
        assert.ok(Buffer.from(pngEntry.content, 'base64').equals(pngBytes), 'png bytes must round-trip');
    });

    finish();
} finally {
    await isolated.cleanup();
}
