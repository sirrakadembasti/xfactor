import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';
const isolated = await setupIsolatedTestDb('project-action-chat-audit');
process.env.ALLOW_MOCK_FALLBACK = 'true';
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
const { db, getSchemaVersion } = await import('../db.js');
isolated.registerDatabase(db);
const {
    createProject,
    getProject,
    appendProjectActionMessages
} = await import('../projectRepository.js');
const { readProjectState, writeProjectState } = await import('../engine/index.js');
const { createProjectRouter } = await import('../routes/projectRoutes.js');
const { createContractRevision, approveContractRevision } = await import('../contracts/projectContract.js');
const { abortProjectExecution, registerProjectAbortController, getProjectAbortSignal, unregisterProjectAbortController } = await import('../engine/cancellation.js');
const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');
const { createArtifact } = await import('../repositories/artifactRepository.js');
const { runAsyncTest, finish } = createTestHarness();

const validPlan = {
    summary: 'Action audit workflow plan',
    management: { needed: false, reason: 'This route audit fixture has no managed resources.' },
    frontend: { framework: 'react' },
    backend: { framework: 'express' },
    database: { engine: 'sqlite' }
};

function seedApprovedResumeContract(projectId) {
    approveContractRevision(projectId, createContractRevision(projectId, validPlan, null));
}

const actionMessages = {
    approve: {
        user: '✅ Mimari planı onayladım. Uygulama üretimini başlat.',
        model: '🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.'
    },
    resume: {
        user: '▶️ Süreci kaldığı yerden devam ettir.',
        model: 'Süreç kaldığı görevden devam ettiriliyor.'
    },
    pause: {
        user: '⏸️ Üretim sürecini duraklat.',
        model: 'Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.'
    },
    sync: {
        user: '🔄 Diskteki projeleri uygulamayla senkronize ettim.',
        model: result => `Senkronizasyon tamamlandı: ${result.registered} yeni, ${result.missing} eksik, ${result.updated} güncellenen proje. ZIP envanteri: 0 eksik, 0 kayıt dışı dosya. Eksik klasörler otomatik silinmedi.`
    },
    pin: {
        user: '📌 Projeyi başa sabitledim.',
        model: 'Proje yan menünün üst sırasına taşındı.'
    },
    unpin: {
        user: '📌 Projenin sabitlemesini kaldırdım.',
        model: 'Proje normal sıralamaya döndürüldü.'
    },
    download: {
        user: '📥 Doğrulanmış proje ZIP paketini indirdim.',
        model: 'Doğrulanmış artefakt başarıyla indirildi.'
    }
};

const passThrough = (_req, _res, next) => next();
let leaseGate = null;
const lifecycle = {
    assertGenerationAllowed() {},
    begin() {
        return null;
    },
    async afterWorkflowLeaseAcquired({ projectId }) {
        if (!leaseGate || leaseGate.projectId !== projectId) return;
        leaseGate.acquiredResolve();
        await new Promise(resolve => {
            leaseGate.release = resolve;
        });
    }
};
let testUser = { id: 'action-audit-owner', isAdmin: true };
const app = express();
app.use(express.json());
app.use('/api/projects', createProjectRouter({
    requireAuth: (req, _res, next) => {
        req.user = { ...testUser };
        next();
    },
    projectAccess: () => passThrough,
    wsHub: { broadcast() {}, publish() {} },
    lifecycle
}));
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const actionUrl = action => `http://127.0.0.1:${server.address().port}/api/projects/${action.projectId}/${action.kind}`;
const postAction = async ({ projectId, kind, actionId }) => {
    const response = await fetch(actionUrl({ projectId, kind }), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(actionId ? { 'X-XFactor-Action-Id': actionId } : {})
        },
        body: '{}'
    });
    return { status: response.status, body: await response.json() };
};
const postSync = async ({ activeProjectId, actionId }) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/sync`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(actionId ? { 'X-XFactor-Action-Id': actionId } : {})
        },
        body: JSON.stringify(activeProjectId === undefined ? {} : { activeProjectId })
    });
    return { status: response.status, body: await response.json() };
};

const patchProject = async ({ projectId, body, actionId }) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
            'content-type': 'application/json',
            ...(actionId ? { 'X-XFactor-Action-Id': actionId } : {})
        },
        body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
};

await runAsyncTest('action message append persists an ordered user/model pair once', async () => {
    const project = await createProject({ title: 'Action Audit Pair' });
    const result = appendProjectActionMessages(project.id, {
        actionId: 'approve-action-1',
        userText: '✅ Mimari planı onayladım. Uygulama üretimini başlat.',
        modelText: '🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.'
    });

    assert.strictEqual(result.inserted, true);
    assert.strictEqual(result.messages.length, 2);
    assert.deepStrictEqual(result.messages.map(message => message.role), ['user', 'model']);
    assert.deepStrictEqual(result.messages.map(message => Object.keys(message).sort()), [
        ['created_at', 'id', 'parts', 'role'],
        ['created_at', 'id', 'parts', 'role']
    ]);
    assert.deepStrictEqual(result.messages.map(message => message.parts[0].text), [
        '✅ Mimari planı onayladım. Uygulama üretimini başlat.',
        '🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.'
    ]);

    const duplicate = appendProjectActionMessages(project.id, {
        actionId: 'approve-action-1',
        userText: 'ignored duplicate',
        modelText: 'ignored duplicate'
    });
    assert.strictEqual(duplicate.inserted, false);
    assert.deepStrictEqual(duplicate.messages.map(message => message.parts[0].text), result.messages.map(message => message.parts[0].text));

    const rows = db.prepare('SELECT role, text_content, action_key FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL ORDER BY id').all(project.id);
    assert.deepStrictEqual(rows.map(row => row.role), ['user', 'model']);
    assert.deepStrictEqual(rows.map(row => row.action_key), ['approve-action-1:user', 'approve-action-1:model']);
});

await runAsyncTest('same action identity appends independently for different projects', async () => {
    const firstProject = await createProject({ title: 'Action Audit Project A' });
    const secondProject = await createProject({ title: 'Action Audit Project B' });
    const first = appendProjectActionMessages(firstProject.id, {
        actionId: 'shared-action-1',
        userText: 'project A user',
        modelText: 'project A model'
    });
    const second = appendProjectActionMessages(secondProject.id, {
        actionId: 'shared-action-1',
        userText: 'project B user',
        modelText: 'project B model'
    });

    assert.strictEqual(first.inserted, true);
    assert.strictEqual(second.inserted, true);
    const rows = db.prepare(`
        SELECT project_id, action_key
        FROM chat_history
        WHERE action_key IN ('shared-action-1:user', 'shared-action-1:model')
        ORDER BY id
    `).all().map(row => ({ project_id: row.project_id, action_key: row.action_key }));
    assert.deepStrictEqual(rows, [
        { project_id: firstProject.id, action_key: 'shared-action-1:user' },
        { project_id: firstProject.id, action_key: 'shared-action-1:model' },
        { project_id: secondProject.id, action_key: 'shared-action-1:user' },
        { project_id: secondProject.id, action_key: 'shared-action-1:model' }
    ]);
});

await runAsyncTest('action message append rejects invalid action identities', async () => {
    const project = await createProject({ title: 'Action Audit Validation' });
    for (const actionId of ['', '   ', null, 'x'.repeat(129)]) {
        assert.throws(
            () => appendProjectActionMessages(project.id, { actionId, userText: 'user', modelText: 'model' }),
            /actionId/i,
            `actionId ${JSON.stringify(actionId)} should be rejected`
        );
    }
});

await runAsyncTest('action message append returns existing rows when either key already exists', async () => {
    const project = await createProject({ title: 'Action Audit Partial Pair' });
    const createdAt = '2026-09-19T12:00:00.000Z';
    db.prepare('INSERT INTO chat_history (project_id, role, text_content, action_key, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(project.id, 'user', 'already persisted', 'partial-action:user', createdAt);

    const result = appendProjectActionMessages(project.id, {
        actionId: 'partial-action',
        userText: 'ignored',
        modelText: 'ignored',
        createdAt: '2026-09-19T12:01:00.000Z'
    });

    assert.strictEqual(result.inserted, false);
    assert.strictEqual(result.messages.length, 1);
    assert.deepStrictEqual(result.messages[0], {
        id: result.messages[0].id,
        role: 'user',
        parts: [{ text: 'already persisted' }],
        created_at: createdAt
    });
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count, 1);
});

await runAsyncTest('approve appends exact canonical action pair and returns canonical state metadata', async () => {
    const project = await createProject({ title: 'Approve Action Route' });
    createContractRevision(project.id, validPlan, null);
    const pending = await readProjectState(project.id);
    pending.status = 'pending_approval';
    await writeProjectState(pending);

    const result = await postAction({
        projectId: project.id,
        kind: 'approve',
        actionId: 'approve-route-action'
    });
    try {
        assert.strictEqual(result.status, 200, JSON.stringify(result.body));
        assert.deepStrictEqual(result.body.chatHistory.slice(-2).map(message => ({
            role: message.role,
            text: message.parts[0].text
        })), [
            { role: 'user', text: actionMessages.approve.user },
            { role: 'model', text: actionMessages.approve.model }
        ]);
    } finally {
        abortProjectExecution(project.id);
    }
});

await runAsyncTest('resume and pause append exact canonical action pairs', async () => {
    const resumeProject = await createProject({ title: 'Resume Action Route' });
    seedApprovedResumeContract(resumeProject.id);
    const resumeState = await readProjectState(resumeProject.id);
    db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").run(resumeProject.id);
    resumeState.status = 'paused';
    const resumed = await postAction({
        projectId: resumeProject.id,
        kind: 'resume',
        actionId: 'resume-route-action'
    });
    try {
        assert.strictEqual(resumed.status, 200, JSON.stringify(resumed.body));
        assert.deepStrictEqual(resumed.body.chatHistory.slice(-2).map(message => message.parts[0].text), [
            actionMessages.resume.user,
            actionMessages.resume.model
        ]);
    } finally {
        abortProjectExecution(resumeProject.id);
    }

    const pauseProject = await createProject({ title: 'Pause Action Route' });
    const pauseState = await readProjectState(pauseProject.id);
    db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(pauseProject.id);
    pauseState.status = 'implementing';
    const paused = await postAction({
        projectId: pauseProject.id,
        kind: 'pause',
        actionId: 'pause-route-action'
    });
    assert.strictEqual(paused.status, 200, JSON.stringify(paused.body));
    const canonicalPause = getProject(pauseProject.id);
    const { reverification, repairPreparation, repairSemanticReview, pendingContract, ...canonicalBody } = paused.body;
    assert.strictEqual(pendingContract, null);
    assert.deepStrictEqual(reverification, { available: false, contractId: null, revision: null });
    assert.deepStrictEqual(repairPreparation, { available: false, contractId: null, revision: null, latestRunId: null });
    assert.deepStrictEqual(repairSemanticReview, {
        available: false,
        planHash: null,
        remainingReviews: 3,
        reason: 'Aynı onaylı sözleşmede tamamlanmış üretim ve duraklatılmış süreç gerekli.'
    });
    assert.deepStrictEqual(canonicalBody, canonicalPause);
    assert.deepStrictEqual(canonicalPause.chatHistory.slice(-2).map(message => message.parts[0].text), [
        actionMessages.pause.user,
        actionMessages.pause.model
    ]);
});

await runAsyncTest('sync appends canonical summary to the authorized active project only after success', async () => {
    const project = await createProject({ title: 'Sync Action Route' });
    const result = await postSync({ activeProjectId: project.id, actionId: 'sync-route-action' });
    assert.strictEqual(result.status, 200, JSON.stringify(result.body));
    assert.strictEqual(typeof result.body.updatedCount, 'number');
    const rows = db.prepare(`
        SELECT role, text_content, action_key
        FROM chat_history
        WHERE project_id = ? AND action_key LIKE 'sync-route-action:%'
        ORDER BY id
    `).all(project.id);
    assert.deepStrictEqual(rows.map(row => ({
        role: row.role,
        text: row.text_content,
        actionKey: row.action_key
    })), [
        {
            role: 'user',
            text: actionMessages.sync.user,
            actionKey: 'sync-route-action:user'
        },
        {
            role: 'model',
            text: actionMessages.sync.model({
                registered: result.body.autoRegistered.length,
                missing: result.body.missingOnDisk.length,
                updated: result.body.updatedCount
            }),
            actionKey: 'sync-route-action:model'
        }
    ]);
});

await runAsyncTest('sync without active project and failed patch/download produce no action rows', async () => {
    const project = await createProject({ title: 'Helper Failure Route' });
    const syncResult = await postSync({ actionId: 'sync-without-project' });
    assert.strictEqual(syncResult.status, 200, JSON.stringify(syncResult.body));
    const failedPatch = await patchProject({
        projectId: project.id,
        body: { title: '!!!' },
        actionId: 'failed-patch-action'
    });
    assert.strictEqual(failedPatch.status, 400, JSON.stringify(failedPatch.body));
    const failedDownload = await fetch(
        `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/contracts/missing-contract/artifacts/missing-artifact/download`,
        {
            headers: { 'X-XFactor-Action-Id': 'failed-download-action' }
        }
    );
    assert.ok(failedDownload.status >= 400, `unexpected download status ${failedDownload.status}`);
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count,
        0
    );
});

await runAsyncTest('pin and unpin append only their exact canonical pairs; rename does not', async () => {
    const project = await createProject({ title: 'Pin Action Route' });
    const pinned = await patchProject({
        projectId: project.id,
        body: { is_pinned: true },
        actionId: 'pin-route-action'
    });
    assert.strictEqual(pinned.status, 200, JSON.stringify(pinned.body));
    const renamed = await patchProject({
        projectId: project.id,
        body: { title: 'Renamed Pin Action' },
        actionId: 'rename-route-action'
    });
    assert.strictEqual(renamed.status, 200, JSON.stringify(renamed.body));
    const unpinned = await patchProject({
        projectId: project.id,
        body: { isPinned: false },
        actionId: 'unpin-route-action'
    });
    assert.strictEqual(unpinned.status, 200, JSON.stringify(unpinned.body));
    const rows = db.prepare(`
        SELECT text_content, action_key
        FROM chat_history
        WHERE project_id = ? AND action_key IS NOT NULL
        ORDER BY id
    `).all(project.id).map(row => ({
        text_content: row.text_content,
        action_key: row.action_key
    }));
    assert.deepStrictEqual(rows, [
        { text_content: actionMessages.pin.user, action_key: 'pin-route-action:user' },
        { text_content: actionMessages.pin.model, action_key: 'pin-route-action:model' },
        { text_content: actionMessages.unpin.user, action_key: 'unpin-route-action:user' },
        { text_content: actionMessages.unpin.model, action_key: 'unpin-route-action:model' }
    ]);
});

await runAsyncTest('delete remains message-free and does not create action-keyed rows', async () => {
    const project = await createProject({ title: 'Delete Action Route' });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/projects/${project.id}`, {
        method: 'DELETE'
    });
    assert.strictEqual(response.status, 200, await response.text());
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count,
        0
    );
});
await runAsyncTest('sync rejects non-admin users and failed admin sync remains message-free', async () => {
    const project = await createProject({ title: 'Unauthorized Sync Route' });
    testUser = { id: 'not-a-member', isAdmin: false };
    const unauthorized = await postSync({ activeProjectId: project.id, actionId: 'unauthorized-sync-action' });
    assert.strictEqual(unauthorized.status, 403, JSON.stringify(unauthorized.body));
    assert.match(unauthorized.body.error, /yönetici/i);
    testUser = { id: 'action-audit-owner', isAdmin: true };

    const previousRoot = process.env.PROJECTS_ROOT;
    process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'missing-project-root');
    try {
        const failed = await postSync({ activeProjectId: project.id, actionId: 'failed-sync-action' });
        assert.strictEqual(failed.status, 200, JSON.stringify(failed.body));
        assert.strictEqual(failed.body.success, false);
    } finally {
        process.env.PROJECTS_ROOT = previousRoot;
    }
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count,
        0
    );
});

await runAsyncTest('pin response contains the canonical appended chat pair', async () => {
    const project = await createProject({ title: 'Pin Fresh State Route' });
    const response = await patchProject({
        projectId: project.id,
        body: { is_pinned: true },
        actionId: 'pin-fresh-state-action'
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.body));
    assert.deepStrictEqual(response.body.chatHistory.slice(-2).map(message => message.parts[0].text), [
        actionMessages.pin.user,
        actionMessages.pin.model
    ]);
});

await runAsyncTest('verified download appends its canonical pair after evidence authorization', async () => {
    const project = await createProject({ title: 'Download Action Route' });
    const contractId = `download-contract-${Date.now()}`;
    const artifactId = `download-artifact-${Date.now()}`;
    const runId = `download-run-${Date.now()}`;
    const artifactPath = path.join(path.dirname(isolated.dbPath), `${artifactId}.zip`);
    const timestamp = new Date().toISOString();
    const mandatoryGates = [
        'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
        'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
        'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
        'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
    ];
    await fs.writeFile(artifactPath, 'verified download artifact');
    const artifactHash = crypto.createHash('sha256').update(await fs.readFile(artifactPath)).digest('hex');
    db.prepare(`
        INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
        VALUES (?, ?, 1, 'approved', '{}', ?, ?)
    `).run(contractId, project.id, 'download-contract-hash', timestamp);
    db.prepare(`
        INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at)
        VALUES (?, ?, ?, 'verified', '2.0', ?, ?)
    `).run(runId, project.id, contractId, timestamp, timestamp);
    for (const gateName of mandatoryGates) {
        db.prepare(`
            INSERT INTO verification_checks
              (id, contract_id, run_id, gate_name, applicability, status, command, exit_code,
               started_at, ended_at, stdout_digest, stderr_digest, evidence_json)
            VALUES (?, ?, ?, ?, 'MANDATORY', 'PASS', 'node gate', 0, ?, ?, ?, ?, '{"ok":true}')
        `).run(`${runId}-${gateName}`, contractId, runId, gateName, timestamp, timestamp, `stdout-${gateName}`, `stderr-${gateName}`);
    }
    createArtifact({
        id: artifactId,
        projectId: project.id,
        contractId,
        kind: 'zip',
        path: artifactPath,
        sha256: artifactHash,
        size: (await fs.stat(artifactPath)).size,
        manifestJson: '[]',
        status: 'verified'
    });
    db.prepare('UPDATE artifacts SET verification_run_id = ? WHERE id = ?').run(runId, artifactId);
    const response = await fetch(
        `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/contracts/${contractId}/artifacts/${artifactId}/download`,
        { headers: { 'X-XFactor-Action-Id': 'download-route-action' } }
    );
    assert.strictEqual(response.status, 200, `download status ${response.status}`);
    await response.arrayBuffer();
    const rows = db.prepare(`
        SELECT role, text_content, action_key
        FROM chat_history
        WHERE project_id = ? AND action_key LIKE 'download-route-action:%'
        ORDER BY id
    `).all(project.id).map(row => ({ role: row.role, text: row.text_content, actionKey: row.action_key }));
    assert.deepStrictEqual(rows, [
        { role: 'user', text: actionMessages.download.user, actionKey: 'download-route-action:user' },
        { role: 'model', text: actionMessages.download.model, actionKey: 'download-route-action:model' }
    ]);
});

await runAsyncTest('malformed action IDs are rejected before workflow mutation', async () => {
    for (const actionId of [' ', 'x'.repeat(129)]) {
        const project = await createProject({ title: `Malformed Action ${actionId.length}` });
        createContractRevision(project.id, validPlan, null);
        const pending = await readProjectState(project.id);
        pending.status = 'pending_approval';
        await writeProjectState(pending);
        const before = db.prepare('SELECT status, revision FROM projects WHERE id = ?').get(project.id);

        const result = await postAction({ projectId: project.id, kind: 'approve', actionId });

        assert.strictEqual(result.status, 400, JSON.stringify(result.body));
        assert.deepStrictEqual(
            db.prepare('SELECT status, revision FROM projects WHERE id = ?').get(project.id),
            before
        );
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id = ?').get(project.id).count,
            0
        );
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count,
            0
        );
    }
});

await runAsyncTest('invalid workflow transitions do not append action rows', async () => {
    const project = await createProject({ title: 'Invalid Action Route' });
    const result = await postAction({
        projectId: project.id,
        kind: 'pause',
        actionId: 'invalid-pause-action'
    });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count,
        0
    );
});

await runAsyncTest('repeated approve and resume action requests are idempotent and append once', async () => {
    const approveProject = await createProject({ title: 'Repeated Approve Route' });
    createContractRevision(approveProject.id, validPlan, null);
    const pending = await readProjectState(approveProject.id);
    pending.status = 'pending_approval';
    await writeProjectState(pending);
    const approveAction = { projectId: approveProject.id, kind: 'approve', actionId: 'approve-repeat-first' };
    const firstApprove = await postAction(approveAction);
    const secondApprove = await postAction({
        ...approveAction,
        actionId: 'approve-repeat-second'
    });
    try {
        assert.strictEqual(firstApprove.status, 200, JSON.stringify(firstApprove.body));
        assert.strictEqual(secondApprove.status, 200, JSON.stringify(secondApprove.body));
        assert.strictEqual(secondApprove.body.idempotent, true);
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key LIKE ?').get(approveProject.id, 'approve-repeat-first:%').count,
            2
        );
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key LIKE ?').get(approveProject.id, 'approve-repeat-second:%').count,
            0
        );
    } finally {
        abortProjectExecution(approveProject.id);
    }

    const resumeProject = await createProject({ title: 'Repeated Resume Route' });
    const paused = await readProjectState(resumeProject.id);
    db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").run(resumeProject.id);
    paused.status = 'paused';
    paused.plan = { ...validPlan, domains: [{ name: 'backend', prefix: 'backend' }] };
    await writeProjectState(paused);
    const resumeAction = { projectId: resumeProject.id, kind: 'resume', actionId: 'resume-repeat-first' };
    const firstResume = await postAction(resumeAction);
    const secondResume = await postAction({
        ...resumeAction,
        actionId: 'resume-repeat-second'
    });
    try {
        assert.strictEqual(firstResume.status, 200, JSON.stringify(firstResume.body));
        assert.strictEqual(secondResume.status, 200, JSON.stringify(secondResume.body));
        assert.strictEqual(secondResume.body.idempotent, true);
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key LIKE ?').get(resumeProject.id, 'resume-repeat-first:%').count,
            2
        );
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key LIKE ?').get(resumeProject.id, 'resume-repeat-second:%').count,
            0
        );
    } finally {
        abortProjectExecution(resumeProject.id);
    }
});
await runAsyncTest('concurrent approve requests elect one idempotent loser without duplicate audit rows', async () => {
    const project = await createProject({ title: 'Concurrent Approve Route' });
    createContractRevision(project.id, validPlan, null);
    const pending = await readProjectState(project.id);
    pending.status = 'pending_approval';
    await writeProjectState(pending);

    const responses = await Promise.all([
        postAction({
            projectId: project.id,
            kind: 'approve',
            actionId: 'approve-concurrent-a'
        }),
        postAction({
            projectId: project.id,
            kind: 'approve',
            actionId: 'approve-concurrent-b'
        })
    ]);
    try {
        assert.deepStrictEqual(responses.map(response => response.status).sort(), [200, 200]);
        assert.strictEqual(responses.filter(response => response.body.idempotent === true).length, 1);
        assert.ok(responses.every(response => response.body.status === 'implementing'));
        const rows = db.prepare(`
            SELECT action_key
            FROM chat_history
            WHERE project_id = ? AND action_key IS NOT NULL
            ORDER BY id
        `).all(project.id);
        const rowCounts = new Map([
            ['approve-concurrent-a', 0],
            ['approve-concurrent-b', 0]
        ]);
        for (const row of rows) {
            for (const actionId of rowCounts.keys()) {
                if (row.action_key.startsWith(`${actionId}:`)) {
                    rowCounts.set(actionId, rowCounts.get(actionId) + 1);
                }
            }
        }
        assert.deepStrictEqual([...rowCounts.values()].sort(), [0, 2]);
        assert.strictEqual(
            db.prepare("SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id = ? AND status = 'running'").get(project.id).count,
            1
        );
    } finally {
        abortProjectExecution(project.id);
    }
});


await runAsyncTest('losing approve waits for winner publication before returning canonical state', async () => {
    const project = await createProject({ title: 'Barrier Approve Route' });
    createContractRevision(project.id, validPlan, null);
    const pending = await readProjectState(project.id);
    pending.status = 'pending_approval';
    await writeProjectState(pending);

    let acquiredResolve;
    const acquired = new Promise(resolve => {
        acquiredResolve = resolve;
    });
    leaseGate = { projectId: project.id, acquiredResolve, release: null };
    const winnerPromise = postAction({
        projectId: project.id,
        kind: 'approve',
        actionId: 'approve-barrier-winner'
    });
    await acquired;

    let loserSettled = false;
    const loserPromise = postAction({
        projectId: project.id,
        kind: 'approve',
        actionId: 'approve-barrier-loser'
    }).then(result => {
        loserSettled = true;
        return result;
    });
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.strictEqual(loserSettled, false, 'loser must wait for winner publication');
    leaseGate.release();
    leaseGate = null;

    const [winner, loser] = await Promise.all([winnerPromise, loserPromise]);
    try {
        assert.strictEqual(winner.status, 200, JSON.stringify(winner.body));
        assert.strictEqual(loser.status, 200, JSON.stringify(loser.body));
        assert.strictEqual(winner.body.idempotent, undefined);
        assert.strictEqual(loser.body.idempotent, true);
        assert.strictEqual(winner.body.status, 'implementing');
        assert.strictEqual(loser.body.status, 'implementing');
        assert.deepStrictEqual(
            loser.body.chatHistory.slice(-2).map(message => message.parts[0].text),
            [actionMessages.approve.user, actionMessages.approve.model]
        );
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key LIKE ?').get(project.id, 'approve-barrier-winner:%').count,
            2
        );
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key LIKE ?').get(project.id, 'approve-barrier-loser:%').count,
            0
        );
    } finally {
        abortProjectExecution(project.id);
    }
});

await runAsyncTest('stale approve after resume is rejected without approval audit rows', async () => {
    const project = await createProject({ title: 'Stale Approve Route' });
    seedApprovedResumeContract(project.id);
    db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").run(project.id);
    const resumed = await postAction({
        projectId: project.id,
        kind: 'resume',
        actionId: 'resume-before-stale-approve'
    });
    try {
        assert.strictEqual(resumed.status, 200, JSON.stringify(resumed.body));
        const approve = await postAction({
            projectId: project.id,
            kind: 'approve',
            actionId: 'stale-approve-action'
        });
        assert.strictEqual(approve.status, 400, JSON.stringify(approve.body));
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key LIKE ?').get(project.id, 'stale-approve-action:%').count,
            0
        );
    } finally {
        abortProjectExecution(project.id);
    }
});

await runAsyncTest('workflow transitions and audit pairs roll back together on audit failure', async () => {
    db.exec(`
        CREATE TRIGGER fail_workflow_action_model_insert
        BEFORE INSERT ON chat_history
        WHEN NEW.action_key LIKE '%:model'
        BEGIN
            SELECT RAISE(ABORT, 'workflow audit model insert blocked');
        END;
    `);
    try {
        const approveProject = await createProject({ title: 'Atomic Approve Route' });
        createContractRevision(approveProject.id, validPlan, null);
        const approveState = await readProjectState(approveProject.id);
        approveState.status = 'pending_approval';
        await writeProjectState(approveState);
        const approve = await postAction({ projectId: approveProject.id, kind: 'approve', actionId: 'atomic-approve-action' });
        assert.strictEqual(approve.status, 500, JSON.stringify(approve.body));
        assert.strictEqual(db.prepare('SELECT status FROM projects WHERE id = ?').get(approveProject.id).status, 'pending_approval');
        assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(approveProject.id).count, 0);
        assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id = ? AND status = 'running'").get(approveProject.id).count, 0);

        const resumeProject = await createProject({ title: 'Atomic Resume Route' });
        seedApprovedResumeContract(resumeProject.id);
        db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").run(resumeProject.id);
        const resume = await postAction({ projectId: resumeProject.id, kind: 'resume', actionId: 'atomic-resume-action' });
        assert.strictEqual(resume.status, 500, JSON.stringify(resume.body));
        assert.strictEqual(db.prepare('SELECT status FROM projects WHERE id = ?').get(resumeProject.id).status, 'paused');
        assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(resumeProject.id).count, 0);
        abortProjectExecution(resumeProject.id);

        const pauseProject = await createProject({ title: 'Atomic Pause Route' });
        db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(pauseProject.id);
        const pause = await postAction({ projectId: pauseProject.id, kind: 'pause', actionId: 'atomic-pause-action' });
        assert.strictEqual(pause.status, 500, JSON.stringify(pause.body));
        assert.strictEqual(db.prepare('SELECT status FROM projects WHERE id = ?').get(pauseProject.id).status, 'implementing');
        assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(pauseProject.id).count, 0);
    } finally {
        db.exec('DROP TRIGGER fail_workflow_action_model_insert');
    }
});

await runAsyncTest('pause audit failure preserves active worker and does not signal abort', async () => {
    const project = await createProject({ title: 'Pause Atomic Failure Active Worker' });
    db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
    const lease = acquireWorkflowLease(project.id, 'test-pause-active-worker');
    const controller = new AbortController();
    registerProjectAbortController(project.id, controller);
    db.exec(`
        CREATE TRIGGER fail_pause_model_insert
        BEFORE INSERT ON chat_history
        WHEN NEW.action_key LIKE 'pause-failure-action:model'
        BEGIN
            SELECT RAISE(ABORT, 'pause audit model insert blocked');
        END;
    `);
    try {
        const response = await postAction({
            projectId: project.id,
            kind: 'pause',
            actionId: 'pause-failure-action'
        });
        assert.strictEqual(response.status, 500, JSON.stringify(response.body));
        assert.strictEqual(db.prepare('SELECT status FROM projects WHERE id = ?').get(project.id).status, 'implementing');
        assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM workflow_attempts WHERE id = ? AND status = 'running'").get(lease.attempt.id).count, 1);
        assert.strictEqual(getProjectAbortSignal(project.id)?.aborted, false);
    } finally {
        db.exec('DROP TRIGGER fail_pause_model_insert');
        unregisterProjectAbortController(project.id);
        releaseWorkflowLease(lease.attempt.id, 'failed', { error: 'test cleanup', leaseOwner: 'test-pause-active-worker' });
    }
});

await runAsyncTest('successful pause commits audit before signaling active worker abort', async () => {
    const project = await createProject({ title: 'Pause Atomic Success Active Worker' });
    db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
    const lease = acquireWorkflowLease(project.id, 'test-pause-success-worker');
    const controller = new AbortController();
    registerProjectAbortController(project.id, controller);
    try {
        const response = await postAction({
            projectId: project.id,
            kind: 'pause',
            actionId: 'pause-success-action'
        });
        assert.strictEqual(response.status, 200, JSON.stringify(response.body));
        assert.strictEqual(response.body.status, 'paused');
        assert.deepStrictEqual(response.body.chatHistory.slice(-2).map(message => message.parts[0].text), [
            actionMessages.pause.user,
            actionMessages.pause.model
        ]);
        assert.strictEqual(controller.signal.aborted, true);
        assert.strictEqual(db.prepare('SELECT status FROM projects WHERE id = ?').get(project.id).status, 'paused');
    } finally {
        unregisterProjectAbortController(project.id);
        releaseWorkflowLease(lease.attempt.id, 'paused', { error: 'test cleanup', leaseOwner: 'test-pause-success-worker' });
    }
});

await new Promise(resolve => server.close(resolve));

await runAsyncTest('action message append rolls back the user row when the model insert fails', async () => {
    const project = await createProject({ title: 'Action Audit Atomicity' });
    db.exec(`
        CREATE TRIGGER fail_action_audit_model_insert
        BEFORE INSERT ON chat_history
        WHEN NEW.action_key LIKE '%:model'
        BEGIN
            SELECT RAISE(ABORT, 'model insert blocked');
        END;
    `);

    assert.throws(() => appendProjectActionMessages(project.id, {
        actionId: 'atomic-action',
        userText: 'user should roll back',
        modelText: 'model should fail'
    }), /model insert blocked/);
    assert.strictEqual(
        db.prepare('SELECT COUNT(*) AS count FROM chat_history WHERE project_id = ? AND action_key IS NOT NULL').get(project.id).count,
        0
    );
});

const { MIGRATIONS } = await import('../db/migrations.js');
assert.strictEqual(getSchemaVersion(), Math.max(...MIGRATIONS.map(migration => migration.version)));
assert.ok(db.prepare('PRAGMA table_info(task_checkpoints)').all().some(column => column.name === 'task_identity_version' && column.notnull === 1 && column.dflt_value === '0'));
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='artifact_maintenance'").get());
finish();
await isolated.cleanup();
