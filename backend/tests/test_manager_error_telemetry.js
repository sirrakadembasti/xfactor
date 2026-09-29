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

    function buildTestApp(managerResponder) {
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
            wsHub: { broadcast() {}, publish() {} },
            managerResponder
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

    await runAsyncTest('2x. Manager telemetry selects the latest attempt by time, not random attempt ID', async () => {
        const project = await createProject({ title: 'Attempt Ordering Project' });
        const base = Date.now();
        db.prepare(`INSERT INTO workflow_attempts (id, project_id, status, lease_owner, started_at, started_epoch, error)
            VALUES (?, ?, 'failed', 'old-owner', ?, ?, 'old error')`).run('z-old', project.id, new Date(base - 1000).toISOString(), base - 1000);
        db.prepare(`INSERT INTO workflow_attempts (id, project_id, status, lease_owner, started_at, started_epoch, error)
            VALUES (?, ?, 'failed', 'new-owner', ?, ?, 'new error')`).run('a-new', project.id, new Date(base).toISOString(), base);
        const prompt = buildManagerChatSystemPrompt(await readProjectState(project.id), process.env.PROJECTS_ROOT);
        assert.match(prompt, /new error/);
        assert.doesNotMatch(prompt, /old error/);
    });

    await runAsyncTest('2a. Manager chat asks for proactive structured management assessment', async () => {
        const project = await createProject({ title: 'Asset workspace' });
        const prompt = buildManagerChatSystemPrompt(await readProjectState(project.id), process.env.PROJECTS_ROOT);
        assert.match(prompt, /management\.needed/);
        assert.match(prompt, /kullanıcı[^\n]*belirtmese/i);
    });

    await runAsyncTest('2aa. completion question uses canonical evidence instead of a hallucinated Manager answer', async () => {
        const project = await createProject({ title: 'Unfinished Management Project' });
        db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
        db.prepare("INSERT INTO project_logs (project_id, agent, action, message, node_id) VALUES (?, 'Tester', 'finish', 'Statik denetim geçti', 'tester-qa')").run(project.id);
        let responderCalls = 0;
        const server = http.createServer(buildTestApp(async () => {
            responderCalls += 1;
            return 'Uygulama tamamlandı, doğrulanmış ZIP indirilebilir.';
        }));
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'Uygulama bitti mi? Son Tester logunda FINISH yazıyor.' })
            });
            assert.equal(response.status, 200);
            const body = await response.json();
            const answer = body.chatHistory.at(-1).parts[0].text;
            assert.equal(responderCalls, 0);
            assert.match(answer, /tamamlanmadı|tamamlanmış değil/i);
            assert.match(answer, /doğrulama|ZIP/i);
            assert.doesNotMatch(answer, /doğrulanmış ZIP indirilebilir/i);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    await runAsyncTest('2b. unstructured plan marker cannot create an approvable contract', async () => {
        const project = await createProject({ title: 'Asset workspace' });
        const server = http.createServer(buildTestApp());
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/chat`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'başla' })
            });
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.notEqual(body.status, 'pending_approval');
            assert.equal(db.prepare('SELECT count(*) AS count FROM project_contracts WHERE project_id = ?').get(project.id).count, 0);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });

    await runAsyncTest('2c. structured management proposal is shown before approval', async () => {
        const project = await createProject({ title: 'Asset workspace' });
        const plan = {
            summary: 'Asset workspace with operational administration',
            talimatname: '# Asset workspace',
            domains: [{ name: 'app', prefix: 'app', description: 'App' }],
            requirements: [{ id: 'REQ-1', statement: 'Manage assets', mandatory: true }],
            browser: { roleJourneys: [
                { role: 'manager', kind: 'positive', steps: [{ action: 'submit', selector: '#create-asset' }], expectedOutcome: { kind: 'success', text: 'Asset created' } },
                { role: 'manager', kind: 'negative', steps: [{ action: 'click', selector: '#forbidden-action' }], expectedOutcome: { kind: 'denied', text: 'Access denied' } }
            ] },
            management: {
                needed: true,
                reason: 'Staff creates and updates asset records.',
                authentication: { login: '/login', apiLogin: { path: '/api/auth/login' }, accountProvisioning: 'Invite', publicRegistration: false },
                resources: [{ name: 'Asset', operations: ['create', 'read', 'update', 'delete'], readAccess: 'authenticated',
                    deletionPolicy: { relatedData: 'none', reason: 'No linked records in this example.' },
                    uiPath: '/admin/assets', apiPath: '/api/assets', verification: { itemPath: '/api/assets/{id}', updateMethod: 'PATCH', deleteExpectation: { kind: 'absent' } } }],
                roles: [{ name: 'manager', permissions: [{ resource: 'Asset', operations: ['create', 'read', 'update', 'delete'] }], demoUser: { username: 'manager-test', setup: 'isolated-test-seed' }, journeys: { positive: ['Create and see an asset'], negative: ['Anonymous create is denied'] } }]
            }
        };
        const server = http.createServer(buildTestApp(async () => JSON.stringify(plan)));
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${project.id}/chat`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'I need an asset catalog' })
            });
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.status, 'pending_approval');
            assert.equal(body.plan.management.resources[0].name, 'Asset');
            const modelText = body.chatHistory.at(-1).parts[0].text;
            assert.match(modelText, /Asset/);
            assert.match(modelText, /manager-test/);
            assert.equal(db.prepare('SELECT count(*) AS count FROM project_contracts WHERE project_id = ?').get(project.id).count, 1);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
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

    await runAsyncTest('5. Revisable states wait for a structured plan before pending approval', async () => {
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
            assert.strictEqual(bodyPaused.status, 'paused', 'A start request alone cannot approve an incomplete plan');
            assert.equal(db.prepare('SELECT count(*) AS count FROM project_contracts WHERE project_id = ?').get(pausedProject.id).count, 0);

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
            assert.strictEqual(bodyFailed.status, 'verification_failed', 'No revision is published without a structured plan');

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
            assert.strictEqual(bodyFinished.status, 'implementation_finished', 'No revision is published without a structured plan');
        } finally {
            await new Promise(r => server.close(r));
        }
    });

    await runAsyncTest('6. explicit start intent does not fabricate a remediation or approval', async () => {
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

            assert.strictEqual(body.status, 'paused', 'Explicit start intent needs a structured plan before approval');
            assert.strictEqual(body.remediation, null, 'Explicit start intent should not persist remediation');
        } finally {
            await new Promise(r => server.close(r));
        }
    });

    finish();
} finally {
    isolated.cleanup();
}
