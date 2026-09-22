import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import http from 'http';
import express from 'express';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-7-task1-routes');
process.env.DB_PATH = isolated.dbPath;

const { runAsyncTest, finish } = createTestHarness();

try {
    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { createProjectRouter } = await import('../routes/projectRoutes.js');
    const { createProject } = await import('../projectRepository.js');
    const { getProjectsRoot } = await import('../projectPaths.js');

    const app = express();
    app.use(express.json());

    const requireAuth = (req, res, next) => {
        req.user = { id: 'test-user-1', isAdmin: req.get('x-test-admin') === 'true' };
        next();
    };

    app.use('/api/projects', createProjectRouter({
        requireAuth,
        projectAccess: () => (req, res, next) => next(),
        wsHub: { broadcast() {} }
    }));

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        await runAsyncTest('1. GET /api/projects enriches projects with existsOnDisk and missingOnDisk', async () => {
            const proj1 = await createProject({ title: 'Disk Proj 1' });
            const proj2Id = `missing-proj-${Date.now()}`;

            db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Missing On Disk', 'planning')").run(proj2Id);

            const res = await fetch(`${baseUrl}/api/projects`, { headers: { 'x-test-admin': 'true' } });
            assert.strictEqual(res.status, 200);
            const data = await res.json();

            const p1 = data.find(p => p.id === proj1.id);
            assert.ok(p1);
            assert.strictEqual(p1.existsOnDisk, true);
            assert.strictEqual(p1.missingOnDisk, undefined);

            const p2 = data.find(p => p.id === proj2Id);
            assert.ok(p2);
            assert.strictEqual(p2.existsOnDisk, false);
            assert.strictEqual(p2.missingOnDisk, true);
        });

        await runAsyncTest('2. POST /api/projects/sync rejects non-admin users before reconciliation', async () => {
            const root = getProjectsRoot(process.env);
            const discoveredId = `proj-non-admin-${Date.now()}`;
            const discoveredDir = path.join(root, discoveredId);
            await fs.mkdir(discoveredDir, { recursive: true });
            await fs.writeFile(path.join(discoveredDir, 'package.json'), JSON.stringify({ name: 'Must Not Be Registered' }));

            try {
                const res = await fetch(`${baseUrl}/api/projects/sync`, { method: 'POST' });
                assert.strictEqual(res.status, 403);
                assert.match((await res.json()).error, /yönetici/i);
                assert.strictEqual(db.prepare('SELECT id FROM projects WHERE id = ?').get(discoveredId), undefined);
            } finally {
                await fs.rm(discoveredDir, { recursive: true, force: true }).catch(() => {});
            }
        });

        await runAsyncTest('3. POST /api/projects/sync triggers disk reconciliation and auto-registration for administrators', async () => {
            const root = getProjectsRoot(process.env);
            const discoveredId = `proj-discovered-${Date.now()}`;
            const discoveredDir = path.join(root, discoveredId);
            await fs.mkdir(discoveredDir, { recursive: true });
            await fs.writeFile(path.join(discoveredDir, 'package.json'), JSON.stringify({ name: 'Discovered Via Endpoint' }));

            try {
                const res = await fetch(`${baseUrl}/api/projects/sync`, {
                    method: 'POST',
                    headers: { 'x-test-admin': 'true' }
                });
                assert.strictEqual(res.status, 200);
                const syncData = await res.json();
                assert.strictEqual(syncData.success, true);
                assert.ok(syncData.autoRegistered.some(p => p.id === discoveredId));

                const listRes = await fetch(`${baseUrl}/api/projects`, { headers: { 'x-test-admin': 'true' } });
                const listData = await listRes.json();
                const found = listData.find(p => p.id === discoveredId);
                assert.ok(found);
                assert.strictEqual(found.title, 'Discovered Via Endpoint');
                assert.strictEqual(found.existsOnDisk, true);
            } finally {
                await fs.rm(discoveredDir, { recursive: true, force: true }).catch(() => {});
            }
        });
    } finally {
        server.close();
    }

    finish();
} finally {
    await isolated.cleanup();
}
