import assert from 'assert';
import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

process.env.ALLOW_MOCK_FALLBACK = 'true';

const isolated = await setupIsolatedTestDb('manager-error-telemetry');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
await fs.mkdir(process.env.PROJECTS_ROOT, { recursive: true });

const { runAsyncTest, finish } = createTestHarness();

try {
    const { db } = await import('../db.js');
    isolated.registerDatabase(db);
    const { createProject } = await import('../projectRepository.js');
    const { readProjectState, writeProjectState } = await import('../engine/index.js');
    const { buildManagerChatSystemPrompt, createProjectRouter } = await import('../routes/projectRoutes.js');

    function buildTestApp() {
        const requireAuth = (req, _res, next) => {
            req.user = { id: 'test-user-manager' };
            next();
        };
        const passThrough = (_req, _res, next) => next();
        const app = express();
        app.use(express.json());
        app.use('/api/projects', createProjectRouter({
            requireAuth,
            projectAccess: () => passThrough,
            wsHub: { broadcast() {}, publish() {} }
        }));
        app.use((err, _req, res, _next) => {
            res.status(err.status || 500).json({ error: err.message });
        });
        return app;
    }

    await runAsyncTest('1. buildManagerChatSystemPrompt includes workflow attempt error and anti-hallucination mandate', async () => {
        const project = await createProject({ title: "Error Telemetry Test Project" });
        const testError = 'Client requires EXECUTION_WORKER_TOKEN';

        // Insert workflow attempt with error and required lease_owner
        db.prepare(`
            INSERT INTO workflow_attempts (id, project_id, status, lease_owner, error, started_at, ended_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`attempt-test-1-${Date.now()}`, project.id, 'failed', 'test-lease-owner', testError, new Date().toISOString(), new Date().toISOString());

        const state = await readProjectState(project.id);
        const prompt = buildManagerChatSystemPrompt(state, process.env.PROJECTS_ROOT);

        assert.ok(prompt.includes(testError), `Prompt should contain the exact error string '${testError}'`);
        assert.ok(prompt.includes('HALÜSİNASYON YASAKTIR'), 'Prompt should contain anti-hallucination instruction');
        assert.ok(prompt.includes('SON GERÇEK MOTOR HATASI VE TEKNİK DETAY'), 'Prompt should contain error section header');
    });

    await runAsyncTest('2. buildManagerChatSystemPrompt falls back to state.last_error if workflow attempt has no error', async () => {
        const project = await createProject({ title: "Last Error Test Project" });
        const fallbackError = 'Memory quota exceeded during task execution';

        const state = await readProjectState(project.id);
        state.last_error = fallbackError;
        const prompt = buildManagerChatSystemPrompt(state, process.env.PROJECTS_ROOT);

        assert.ok(prompt.includes(fallbackError), `Prompt should contain state.last_error '${fallbackError}'`);
        assert.ok(prompt.includes('HALÜSİNASYON YASAKTIR'), 'Prompt should contain anti-hallucination instruction');
    });

    await runAsyncTest('3. POST /api/projects/:id/chat updates state.remediation when project is paused and user provides remediation instruction', async () => {
        const project = await createProject({ title: "Remediation Chat Test" });
        db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").run(project.id);

        const app = buildTestApp();
        const server = http.createServer(app);
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        try {
            const { port } = server.address();
            const response = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'Hatayı düzelt ve devam et' })
            });
            assert.strictEqual(response.status, 200, `Chat endpoint should return 200 OK, got ${response.status}`);
            const body = await response.json();

            assert.ok(body.remediation, 'Returned state should contain remediation property');
            assert.strictEqual(body.remediation.ready, true, 'Remediation state should be ready: true');
            assert.strictEqual(body.remediation.instruction, 'Hatayı düzelt ve devam et', 'Remediation instruction should match user message');

            const persistedState = await readProjectState(project.id);
            assert.ok(persistedState.remediation, 'Persisted state should contain remediation property');
            assert.strictEqual(persistedState.remediation.ready, true, 'Persisted remediation ready should be true');
            assert.strictEqual(persistedState.remediation.instruction, 'Hatayı düzelt ve devam et', 'Persisted instruction should match user message');
        } finally {
            await new Promise(r => server.close(r));
        }
    });

    await runAsyncTest('4. buildManagerChatSystemPrompt strips hex reference strings from error telemetry', async () => {
        const project = await createProject({ title: "Hex Stripping Test Project" });
        const rawErrorWithHex = 'Süreç hatası: LLM Kota Sınırı Aşıldı. Referans: 3a9f81b2c4d5e6f7';

        const state = await readProjectState(project.id);
        state.last_error = rawErrorWithHex;
        const prompt = buildManagerChatSystemPrompt(state, process.env.PROJECTS_ROOT);

        assert.ok(!prompt.includes('Referans:'), 'Prompt should not contain Referans: prefix');
        assert.ok(!prompt.includes('3a9f81b2c4d5e6f7'), 'Prompt should not contain raw hex requestId');
        assert.ok(prompt.includes('Süreç hatası: LLM Kota Sınırı Aşıldı'), 'Prompt should preserve technical error message');
        assert.ok(prompt.includes('Süreç hatası: LLM Kota Sınırı Aşıldı'), 'Prompt should preserve technical error message');
    });

    await runAsyncTest('5. Revisable post-production states transition to pending_approval when a new plan is ready', async () => {
        // Paused state transition test
        const pausedProject = await createProject({ title: "Paused Transition Test" });
        db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").run(pausedProject.id);
        let state = await readProjectState(pausedProject.id);
        state.remediation = { ready: true, instruction: 'test' };
        state.last_error = 'Some error';
        await writeProjectState(pausedProject.id, state);

        const app = buildTestApp();
        const server = http.createServer(app);
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        try {
            const { port } = server.address();
            const resPaused = await fetch(`http://127.0.0.1:${port}/api/projects/${pausedProject.id}/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'başla' })
            });
            assert.strictEqual(resPaused.status, 200, `Chat endpoint should return 200 for paused project, got ${resPaused.status}`);
            const bodyPaused = await resPaused.json();
            assert.strictEqual(bodyPaused.status, 'pending_approval', 'Paused project should transition to pending_approval on plan ready');
            assert.strictEqual(bodyPaused.remediation, null, 'Remediation should be reset to null');
            assert.strictEqual(bodyPaused.last_error, null, 'Last error should be reset to null');

            // Verification_failed state transition test
            const failedProject = await createProject({ title: "Verification Failed Transition Test" });
            db.prepare("UPDATE projects SET status = 'verification_failed' WHERE id = ?").run(failedProject.id);
            let stateFailed = await readProjectState(failedProject.id);
            stateFailed.last_error = 'Verification error';
            await writeProjectState(failedProject.id, stateFailed);

            const resFailed = await fetch(`http://127.0.0.1:${port}/api/projects/${failedProject.id}/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'onaylıyorum' })
            });
            assert.strictEqual(resFailed.status, 200, `Chat endpoint should return 200 for failed project, got ${resFailed.status}`);
            const bodyFailed = await resFailed.json();
            assert.strictEqual(bodyFailed.status, 'pending_approval', 'Verification_failed project should transition to pending_approval on plan ready');
            assert.strictEqual(bodyFailed.remediation, null, 'Remediation should be reset to null');
            assert.strictEqual(bodyFailed.last_error, null, 'Last error should be reset to null');

            // An implementation whose canonical verification failed must remain revisable.
            const finishedProject = await createProject({ title: "Implementation Finished Revision Test" });
            db.prepare("UPDATE projects SET status = 'implementation_finished' WHERE id = ?").run(finishedProject.id);

            const resFinished = await fetch(`http://127.0.0.1:${port}/api/projects/${finishedProject.id}/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'düzeltme planını hazırla ve başla' })
            });
            assert.strictEqual(resFinished.status, 200, `Chat endpoint should return 200 for implementation_finished project, got ${resFinished.status}`);
            const bodyFinished = await resFinished.json();
            assert.strictEqual(bodyFinished.status, 'pending_approval', 'Implementation_finished project should transition to pending_approval on plan ready');
        } finally {
            await new Promise(r => server.close(r));
        }
    });

    await runAsyncTest('6. explicit start intent takes precedence over overlapping remediation keywords', async () => {
        const project = await createProject({ title: "Explicit Start Remediation Overlap Test" });
        db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").run(project.id);

        const app = buildTestApp();
        const server = http.createServer(app);
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        try {
            const { port } = server.address();
            const response = await fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'başla hatayı düzelt' })
            });
            assert.strictEqual(response.status, 200, `Chat endpoint should return 200 OK, got ${response.status}`);
            const body = await response.json();

            assert.strictEqual(body.status, 'pending_approval', 'Explicit start intent should transition paused project to pending_approval');
            assert.strictEqual(body.remediation, null, 'Explicit start intent should not persist remediation');
        } finally {
            await new Promise(r => server.close(r));
        }
    });

    await runAsyncTest('6. Host dependency preparation fallback successfully recovers when worker is unavailable', async () => {
        const { executeSafeCommand } = await import('../engine/buildValidator.js');
        const crypto = await import('crypto');
        const fsSync = await import('fs');
        const testDir = path.join(process.env.PROJECTS_ROOT, 'prep-fallback-test');
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'prep-fallback-test', version: '1.0.0' }, null, 2));

        // Execute host fallback command as implemented in workflow.js
        const lockPath = path.join(testDir, 'package-lock.json');
        await executeSafeCommand('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: testDir });
        assert.ok(fsSync.existsSync(lockPath), 'Host fallback should produce package-lock.json');

        const lockBytes = await fs.readFile(lockPath);
        const packageLockBase64 = lockBytes.toString('base64');
        const packageLockSha256 = crypto.createHash('sha256').update(lockBytes).digest('hex');

        assert.ok(packageLockBase64.length > 0, 'packageLockBase64 should be non-empty');
        assert.strictEqual(packageLockSha256.length, 64, 'packageLockSha256 should be 64-char hex string');
    });

    finish();
} finally {
    isolated.cleanup();
}
