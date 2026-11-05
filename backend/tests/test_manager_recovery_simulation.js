import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createTestHarness } from './testHarness.js';
import { createProject } from '../projectRepository.js';
import { db } from '../db.js';
import { readProjectState } from '../engine/index.js';
import { createContractRevision, getLatestRevision } from '../contracts/projectContract.js';
import { createRun, createCheck, updateRunStatus } from '../repositories/verificationRepository.js';
import { buildManagerChatContext, buildProjectStatusAnswer, createProjectRouter, isProjectStatusQuestion } from '../routes/projectRoutes.js';
import { workflowRecoveryAdvice } from '../engine/recoveryAdvice.js';

// Source-derived redacted stok-takip contract: real resource fixtures, roles and
// browser journeys; prose shortened. No live project, provider, or DB is accessed.
const approvedFixture = {"summary":"Stok Takip Sistemi; ürünler, kategoriler, tedarikçiler ve gerçek zamanlı giriş/çıkış stok hareketlerinin izlenmesini sağlayan modern ve modüler bir yönetim platformudur. Sistem, Express.js REST API ve React/Tailwind ön yüz mimarisiyle inşa edilecek olup, rol bazlı yetkilendirme ve denetim izi sunar.","talimatname":"# Stok Takip: Express API, React, Prisma SQLite; admin ve warehouse_staff.","domains":[{"name":"backend","prefix":"backend","description":"Express.js REST API, SQLite veritabanı, Prisma ORM, JWT yetkilendirme ve iş mantığı servisleri"},{"name":"frontend","prefix":"frontend","description":"React, Tailwind CSS ve TypeScript tabanlı responsive yönetim ve stok takip arayüzü"}],"requirements":[{"id":"REQ-1","statement":"Prisma SQLite üzerinde Category, Product, StockMovement ve User veri modellerinin oluşturulması","mandatory":true,"kind":"functional","priority":"high"},{"id":"REQ-2","statement":"JWT tabanlı kullanıcı girişi, oturum kontrolü ve rol denetimi (admin / warehouse_staff) mekanizmasının kurulması","mandatory":true,"kind":"functional","priority":"high"},{"id":"REQ-3","statement":"Kategori ve ürün CRUD işlemlerinin API ve UI üzerinde filtrelenebilir listelerle sunulması","mandatory":true,"kind":"functional","priority":"high"},{"id":"REQ-4","statement":"Giriş ve çıkış stok hareketlerinin kaydedilmesi, ürün stok miktarının otomatik güncellenmesi ve hareket geçmişi raporu","mandatory":true,"kind":"functional","priority":"high"},{"id":"REQ-5","statement":"Kritik stok seviyesindeki ürünler ve son hareketler için gösterge paneli (dashboard) bileşeni","mandatory":true,"kind":"functional","priority":"medium"}],"management":{"needed":true,"reason":"Depo operasyonları, ürün kataloğu, stok giriş/çıkış fişleri ve kritik seviye alarmları yetkilendirilmiş roller tarafından yönetilmelidir.","authentication":{"login":"/login","apiLogin":{"path":"/api/auth/login","identityField":"username","passwordField":"password"},"accountProvisioning":"Yönetici tanımlı ve izole test seed kullanıcıları","publicRegistration":false},"resources":[{"name":"Category","operations":["create","read","update","delete"],"readAccess":"authenticated","deletionPolicy":{"relatedData":"preserve","reason":"Kategori silinse bile altındaki ürünlerin envanter ve stok geçmişi korunmalıdır.","retentionRule":"Kategori silindiğinde bağlı ürünlerin categoryId referansı sıfırlanır, ürün ve stok verileri korunur."},"uiPath":"/categories","apiPath":"/api/categories","verification":{"identityField":"name","createBody":{"name":"Kategori-{nonce}","description":"Depo kategorisi"},"updateBody":{"name":"Kategori-Güncel-{nonce}","description":"Güncellenmiş açıklama"},"itemPath":"/api/categories/{id}","updateMethod":"PATCH","deleteExpectation":{"kind":"absent"},"retention":{"createPath":"/api/products","createBody":{"name":"KategoriBağlıÜrün-{nonce}","sku":"SKUCAT-{nonce}","categoryId":"{parentId}","quantity":20,"minQuantity":5,"unitPrice":120},"parentField":"categoryId","itemPath":"/api/products/{id}"}}},{"name":"Product","operations":["create","read","update","delete"],"readAccess":"authenticated","deletionPolicy":{"relatedData":"preserve","reason":"Ürün silinse bile geçmiş stok giriş-çıkış hareketleri mali denetim izi amacıyla saklanmalıdır.","retentionRule":"Ürüne ait stok hareketleri ve denetim kayıtları veri tabanında süresiz muhafaza edilir."},"uiPath":"/products","apiPath":"/api/products","verification":{"identityField":"sku","setup":[{"name":"baseCat","resource":"Category","role":"admin","createPath":"/api/categories","createBody":{"name":"SetupCat-{nonce}","description":"Setup kategorisi"}}],"createBody":{"name":"Ürün-{nonce}","sku":"SKU-{nonce}","categoryId":"{fixture:baseCat.id}","quantity":100,"minQuantity":10,"unitPrice":250},"updateBody":{"name":"Ürün-Güncel-{nonce}","sku":"SKU-UP-{nonce}","categoryId":"{fixture:baseCat.id}","quantity":120,"minQuantity":15,"unitPrice":275},"itemPath":"/api/products/{id}","updateMethod":"PATCH","deleteExpectation":{"kind":"absent"},"retention":{"createPath":"/api/stock-movements","createBody":{"productId":"{parentId}","type":"IN","quantity":30,"note":"Hareket-{nonce}"},"parentField":"productId","itemPath":"/api/stock-movements/{id}"}}},{"name":"StockMovement","operations":["create","read"],"readAccess":"authenticated","deletionPolicy":{"relatedData":"none","reason":"Stok hareket kayıtları resmi envanter kaydıdır ve doğrudan silinmez."},"uiPath":"/stock-movements","apiPath":"/api/stock-movements","verification":{"identityField":"note","setup":[{"name":"moveProd","resource":"Product","role":"admin","createPath":"/api/products","createBody":{"name":"HareketİçinÜrün-{nonce}","sku":"SKUMOV-{nonce}","quantity":50,"minQuantity":5,"unitPrice":80}}],"createBody":{"productId":"{fixture:moveProd.id}","type":"IN","quantity":25,"note":"StokFişi-{nonce}"},"itemPath":"/api/stock-movements/{id}"}}],"roles":[{"name":"admin","permissions":[{"resource":"Category","operations":["create","read","update","delete"]},{"resource":"Product","operations":["create","read","update","delete"]},{"resource":"StockMovement","operations":["create","read"]}],"demoUser":{"username":"admin-demo","setup":"isolated-test-seed"},"journeys":{"positive":["Yönetici girişi yapar, yeni ürün ve kategori tanımlar, stok hareketlerini yönetir."],"negative":["Giriş yapmadan korumalı ürün yönetimi uç noktalarına erişemez."]}},{"name":"warehouse_staff","permissions":[{"resource":"Category","operations":["read"]},{"resource":"Product","operations":["read"]},{"resource":"StockMovement","operations":["create","read"]}],"demoUser":{"username":"depo-demo","setup":"isolated-test-seed"},"journeys":{"positive":["Depo görevlisi girişi yapar, mevcut envanteri inceler ve stok giriş/çıkış fişi keser."],"negative":["Depo görevlisi ürün veya kategori silmeye çalıştığında yetki engeli ile karşılaşır."]}}]},"browser":{"roleJourneys":[{"role":"admin","kind":"positive","steps":[{"action":"fill","selector":"#username","value":"admin-demo"},{"action":"fill","selector":"#password","value":"AdminPass123!"},{"action":"submit","selector":"#login-form"},{"action":"click","selector":"#nav-products"},{"action":"click","selector":"#btn-create-product"},{"action":"fill","selector":"#product-name","value":"Örnek Barkodlu Ürün"},{"action":"fill","selector":"#product-sku","value":"SKU-AUTO-01"},{"action":"fill","selector":"#product-quantity","value":"50"},{"action":"submit","selector":"#form-product"}],"expectedOutcome":{"kind":"success","text":"Ürün başarıyla oluşturuldu"}},{"role":"admin","kind":"negative","authState":"anonymous","steps":[{"action":"click","selector":"#nav-products"}],"expectedOutcome":{"kind":"denied","text":"Giriş yapmanız gerekmektedir"}},{"role":"warehouse_staff","kind":"positive","steps":[{"action":"fill","selector":"#username","value":"depo-demo"},{"action":"fill","selector":"#password","value":"DepoPass123!"},{"action":"submit","selector":"#login-form"},{"action":"click","selector":"#nav-stock-movements"},{"action":"click","selector":"#btn-new-movement"},{"action":"fill","selector":"#movement-quantity","value":"15"},{"action":"submit","selector":"#form-movement"}],"expectedOutcome":{"kind":"success","text":"Stok hareketi işlendi"}},{"role":"warehouse_staff","kind":"negative","steps":[{"action":"click","selector":"#btn-delete-product"}],"expectedOutcome":{"kind":"denied","text":"Bu işlem için yetkiniz bulunmamaktadır"}}]}};
const { runAsyncTest, finish } = createTestHarness();
const project = await createProject({ title: 'Stok recovery isolated simulation' });
createContractRevision(project.id, approvedFixture, null);
const approved = getLatestRevision(project.id);
db.prepare("UPDATE project_contracts SET status='approved' WHERE id=?").run(approved.id);
const blocker = 'Worker repair requires Manager revision: Mandatory management evidence missing: management_demo_seed.; No safely routable product findings.; Additional unrepairable gate framework_build: FAIL.; Additional unrepairable gate lint: FAIL.';
db.prepare("UPDATE projects SET status='paused', plan=? WHERE id=?").run(JSON.stringify(approvedFixture), project.id);
db.prepare(`INSERT INTO workflow_attempts (id, project_id, status, lease_owner, error, started_at, ended_at)
    VALUES (?, ?, 'failed', 'simulation-owner', ?, ?, ?)`)
    .run('stok-recovery-attempt', project.id, blocker, new Date().toISOString(), new Date().toISOString());
createRun({ id: 'stok-recovery-run', projectId: project.id, contractId: approved.id });
updateRunStatus('stok-recovery-run', 'running');
for (const [gateName, status, reason, stdout] of [
    ['management_demo_seed', 'BLOCKED', 'Management verification requires a declared API login path and API base URL.', ''],
    ['framework_build', 'FAIL', 'Framework build failed during prerender /categories.', 'useAuth must be used within AuthProvider'],
    ['lint', 'FAIL', 'Lint failed', 'src/contexts/auth-context.tsx:132:5 react-hooks/preserve-manual-memoization']
]) createCheck({ id: 'stok-' + gateName, projectId: project.id, contractId: approved.id,
    runId: 'stok-recovery-run', gateName, status, evidenceJson: { reason, stdout, stderr: '' } });
updateRunStatus('stok-recovery-run', 'failed');
const state = await readProjectState(project.id);

await runAsyncTest('paused Manager context includes structured approved scope and exact check failures', async () => {
    const raw = buildManagerChatContext(state, path.join(process.env.PROJECTS_ROOT, project.id));
    const context = JSON.parse(raw.slice(raw.indexOf('\n') + 1));
    assert.ok(context.approvedPlan, 'Manager must receive approved plan, not only summary and base hash');
    assert.deepEqual(context.approvedPlan.management.resources.map(resource => resource.name), ['Category', 'Product', 'StockMovement']);
    assert.ok(Array.isArray(context.verificationFailures), 'Manager needs latest failed verification evidence');
    const failures = JSON.stringify(context.verificationFailures);
    assert.match(failures, /useAuth must be used within AuthProvider/);
    assert.match(failures, /react-hooks\/preserve-manual-memoization/);
    assert.match(failures, /declared API login path and API base URL/);
    assert.ok(raw.length < 33000, 'expanded recovery context must remain bounded');
});

await runAsyncTest('Manager revision blocker gives actionable revision advice without another Resume loop', async () => {
    const answer = buildProjectStatusAnswer(state);
    assert.match(answer, /onarım|düzeltme/i);
    assert.doesNotMatch(answer, /Devam Et \(Resume\) ile sürdürülebilir/);
});

await runAsyncTest('recovery advice warns before approving a source-regenerating revision', async () => {
    const advice = workflowRecoveryAdvice(blocker);
    assert.match(advice, /yeniden üretilmesine yol açabilir/i);
    assert.match(advice, /Yalnız Yeniden Doğrula.*hataları onarmaz/i);
    assert.doesNotMatch(advice, /revizyonu isteyin ve planı onaylayın/i);
});

await runAsyncTest('ordinary stop and next-step questions use recorded status while repair requests still reach Manager', async () => {
    for (const message of [
        'Son kontrolde neden durdu, mevcut çalışmamı kaybetmeden nasıl ilerleyebiliriz? Şimdilik yeni üretim başlatma.',
        'Uygulamam neden durdu?', 'Kontrol neden başarısız oldu?', 'Mevcut çalışmamı kaybetmeden nasıl ilerleriz?'
    ]) assert.equal(isProjectStatusQuestion(message), true, message);
    for (const message of ['Neden durdu? Hataları düzelt.', 'Mevcut çalışmayı onarmak için plan hazırla.'])
        assert.equal(isProjectStatusQuestion(message), false, message);
});

await runAsyncTest('oversized untrusted approved scope remains bounded parseable context', async () => {
    const large = await createProject({ title: 'Large untrusted recovery fixture' });
    const plan = structuredClone(approvedFixture);
    plan.talimatname = 'UNTRUSTED_SCOPE_DATA '.repeat(10000);
    plan.requirements.push(...Array.from({ length: 100 }, (_, index) => ({
        id: `LARGE-${index}`, statement: 'Long untrusted requirement '.repeat(100), mandatory: true
    })));
    createContractRevision(large.id, plan, null);
    db.prepare("UPDATE project_contracts SET status='approved' WHERE project_id=?").run(large.id);
    const largeState = { ...(await readProjectState(large.id)), title: 'x'.repeat(100000),
        status: 'paused', last_error: 'Worker repair requires Manager revision: fixture failure' };
    const raw = buildManagerChatContext(largeState, path.join(process.env.PROJECTS_ROOT, large.id));
    assert.ok(raw.length < 33000);
    const context = JSON.parse(raw.slice(raw.indexOf('\n') + 1));
    assert.equal(context.status, 'paused');
    assert.match(context.error, /Manager revision/);
});

await runAsyncTest('actual stok contract size preserves structured revision scope', async () => {
    const actualSize = await createProject({ title: 'Actual stok contract size boundary' });
    const plan = structuredClone(approvedFixture);
    // The exact redacted live contract measures 16,732 serialized characters.
    plan.talimatname += ' '.repeat(16732 - JSON.stringify(plan).length);
    assert.equal(JSON.stringify(plan).length, 16732);
    createContractRevision(actualSize.id, plan, null);
    db.prepare("UPDATE project_contracts SET status='approved' WHERE project_id=?").run(actualSize.id);
    const raw = buildManagerChatContext(await readProjectState(actualSize.id), path.join(process.env.PROJECTS_ROOT, actualSize.id));
    const context = JSON.parse(raw.slice(raw.indexOf('\n') + 1));
    assert.equal(context.approvedPlanTruncated, false);
    assert.deepEqual(context.approvedPlan.management.resources.map(resource => resource.name), ['Category', 'Product', 'StockMovement']);
    assert.equal(context.approvedPlan.browser.roleJourneys.length, 4);
    assert.ok(raw.length < 33000);
});

await runAsyncTest('JSON escaping cannot expand recovery context beyond its budget', async () => {
    const escaped = await createProject({ title: 'Escaped recovery context' });
    const plan = structuredClone(approvedFixture);
    plan.talimatname += 'x'.repeat(20000 - JSON.stringify(plan).length);
    createContractRevision(escaped.id, plan, null);
    db.prepare("UPDATE project_contracts SET status='approved' WHERE project_id=?").run(escaped.id);
    const state = { ...(await readProjectState(escaped.id)), title: '\\'.repeat(4000),
        last_error: '\\'.repeat(10000), status: 'paused', plan: { summary: '\\'.repeat(4000) } };
    const raw = buildManagerChatContext(state, path.join(process.env.PROJECTS_ROOT, escaped.id));
    assert.ok(raw.length < 33000);
    assert.equal(JSON.parse(raw.slice(raw.indexOf('\n') + 1)).approvedPlanTruncated, false);
});

await runAsyncTest('Manager distinguishes a historical failed run from the current time and sees successful gates too', async () => {
    const historical = await createProject({ title: 'Historical evidence is not a fresh execution' });
    createContractRevision(historical.id, structuredClone(approvedFixture), null);
    const contract = getLatestRevision(historical.id);
    db.prepare("UPDATE project_contracts SET status='approved' WHERE id=?").run(contract.id);
    createRun({ id: 'historical-run', projectId: historical.id, contractId: contract.id, startedAt: '2026-10-30T08:34:51.588Z' });
    updateRunStatus('historical-run', 'running');
    createCheck({ id: 'historical-build-pass', projectId: historical.id, contractId: contract.id, runId: 'historical-run',
        gateName: 'framework_build', status: 'PASS', command: 'fixture build', exitCode: 0,
        startedAt: '2026-10-30T08:40:00.000Z', endedAt: '2026-10-30T08:41:00.000Z',
        stdoutDigest: 'a'.repeat(64), stderrDigest: 'b'.repeat(64), policyVersion: '2.0' });
    createCheck({ id: 'historical-lint-fail', projectId: historical.id, contractId: contract.id, runId: 'historical-run',
        gateName: 'lint', status: 'FAIL', evidenceJson: { reason: 'Fixture lint failure; build succeeded independently.' } });
    updateRunStatus('historical-run', 'failed', '2026-10-30T08:48:44.216Z');
    const raw = buildManagerChatContext({ ...(await readProjectState(historical.id)), status: 'paused' }, null);
    const context = JSON.parse(raw.slice(raw.indexOf('\n') + 1));
    assert.ok(Number.isFinite(Date.parse(context.observedAt)), 'the model needs the current observation time');
    assert.equal(context.verificationRun.startedAt, '2026-10-30T08:34:51.588Z');
    assert.equal(context.verificationRun.endedAt, '2026-10-30T08:48:44.216Z');
    assert.ok(context.verificationPassedGateNames.includes('framework_build'));
    assert.ok(!context.verificationFailures.some(check => check.gate === 'framework_build'));
    const answer = buildProjectStatusAnswer({ ...(await readProjectState(historical.id)), status: 'paused' });
    assert.match(answer, /30 Ekim 2026/);
    assert.match(answer, /derlenebiliyor/);
    assert.doesNotMatch(answer, /Prisma|seed|lint|fixture|paused|gate|Coder|Reviewer|az önce/);
});

await runAsyncTest('Manager does not call an unstarted command a source-code finding', async () => {
    const project = await createProject({ title: 'Worker launch failure' });
    createContractRevision(project.id, structuredClone(approvedFixture), null);
    const contract = getLatestRevision(project.id);
    db.prepare("UPDATE project_contracts SET status='approved' WHERE id=?").run(contract.id);
    createRun({ id: 'launch-failure-run', projectId: project.id, contractId: contract.id });
    updateRunStatus('launch-failure-run', 'running');
    for (const gateName of ['lint', 'framework_build']) createCheck({ id: `launch-${gateName}`, projectId: project.id,
        contractId: contract.id, runId: 'launch-failure-run', gateName, status: 'FAIL',
        evidenceJson: { reason: 'Execution error: spawn UNKNOWN' } });
    updateRunStatus('launch-failure-run', 'failed');
    const answer = buildProjectStatusAnswer({ ...(await readProjectState(project.id)), status: 'paused' });
    assert.match(answer, /kontrol komutları başlatılamamış/i);
    assert.doesNotMatch(answer, /kod denetimi hata bulmuş|derlemesi geçmemiş/);
});

let calls = 0;
let executions = 0;
let responder = async () => 'Yeni revizyon için seed ve derleme hatalarını değerlendireceğim.';
const app = express();
app.use(express.json());
app.use('/api/projects', createProjectRouter({
    requireAuth: (req, _res, next) => { req.user = { id: 'simulation-owner', isAdmin: true }; next(); },
    projectAccess: () => (_req, _res, next) => next(),
    managerResponder: async (...args) => { calls++; return responder(...args); },
    projectExecutor: async () => {
        executions++;
    }
}));
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
    const url = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/chat`;
    await runAsyncTest('mixed status and corrective request reaches Manager instead of status shortcut', async () => {
        const before = calls;
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: 'Proje ilerlemiyor; hatayı düzeltmek için yeni revizyon planı hazırla, henüz başlatma.' }) });
        assert.equal(response.status, 200);
        assert.equal(calls, before + 1, 'corrective intent must not be swallowed by status words');
        assert.equal((await readProjectState(project.id)).status, 'paused');
        assert.notEqual((await readProjectState(project.id)).remediation?.ready, true,
            'prose alone cannot authorize retrying a Manager-revision blocker');
        assert.equal(getLatestRevision(project.id).id, approved.id);
    });
    await runAsyncTest('plain completion question remains deterministic without provider calls', async () => {
        const before = calls;
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: 'Uygulama bitti mi?' }) });
        assert.equal(response.status, 200);
        assert.equal(calls, before);
    });
    await runAsyncTest('a plain user asks about missing work and last check without model, plan or execution dispatch', async () => {
        const before = calls;
        const contractCount = db.prepare('SELECT count(*) AS n FROM project_contracts WHERE project_id=?').get(project.id).n;
        const attemptCount = db.prepare('SELECT count(*) AS n FROM workflow_attempts WHERE project_id=?').get(project.id).n;
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            message: 'Son kontrolde neden durdu, mevcut çalışmamı kaybetmeden nasıl ilerleyebiliriz? Şimdilik yeni üretim başlatma.'
        }) });
        assert.equal(response.status, 200);
        const answer = (await response.json()).chatHistory.at(-1).parts[0].text;
        assert.match(answer, /Son kayıtlı kontrol/);
        assert.doesNotMatch(answer, /seed|lint|Prisma|fixture|Coder|Reviewer|az önce|kesinlikle geçecek/);
        assert.equal(calls, before);
        assert.equal(executions, 0);
        assert.equal(db.prepare('SELECT count(*) AS n FROM project_contracts WHERE project_id=?').get(project.id).n, contractCount);
        assert.equal(db.prepare('SELECT count(*) AS n FROM workflow_attempts WHERE project_id=?').get(project.id).n, attemptCount);
    });

    await runAsyncTest('blocked Resume creates no new attempt and dispatches no execution', async () => {
        const attempts = db.prepare('SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id=?').get(project.id).count;
        const response = await fetch(url.replace(/\/chat$/, '/resume'), { method: 'POST' });
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, 'MANAGER_REVISION_REQUIRED');
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id=?').get(project.id).count, attempts);
        assert.equal(executions, 0);
        assert.equal((await readProjectState(project.id)).status, 'paused');
    });
    await runAsyncTest('validated repair revision waits for explicit approval then dispatches only the stub once', async () => {
        const revised = structuredClone(approvedFixture);
        revised.summary = 'Vite React ve Express stok takip: doğrulama hataları için onay bekleyen revizyon';
        revised.talimatname = '# Vite React + Express + Prisma SQLite\nAuthProvider tüm useAuth kullanıcılarını sarmalar. Lint hook bağımlılıkları ve effect yüklemesi düzeltilir. Prisma seed admin ve warehouse_staff hesaplarını oluşturur. CORS yalnız izin verilen kökenleri kabul eder.';
        revised.requirements.push(...[
            ['FIX-AUTH', 'AuthProvider uygulama kökünde tüm useAuth tüketicilerini kapsar.'],
            ['FIX-LINT', 'ESLint react-hooks/set-state-in-effect ve preserve-manual-memoization hataları giderilir.'],
            ['FIX-SEED', 'Prisma seed admin ve warehouse_staff izole demo hesaplarını oluşturur.'],
            ['FIX-CORS', 'Express CORS izin listesi kullanır; wildcard kökeni reddeder.']
        ].map(([id, statement]) => ({ id, statement, mandatory: true })));
        responder = async () => JSON.stringify(revised);
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: 'Yeni revizyon planını hazırla; henüz başlatma.' }) });
        assert.equal(response.status, 200);
        const draft = await response.json();
        assert.equal(draft.status, 'pending_approval');
        assert.equal(executions, 0);
        assert.deepEqual(draft.plan.management.resources, approvedFixture.management.resources);
        assert.equal(getLatestRevision(project.id).revision, approved.revision + 1);
        const beforeApprovalCalls = calls;
        responder = async () => { throw new Error('Approval must reuse validated revision'); };
        for (let index = 0; index < 2; index++) {
            const approval = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: 'planı onaylıyorum' }) });
            assert.equal(approval.status, 200);
        }
        assert.equal(calls, beforeApprovalCalls);
        assert.equal(executions, 1);
        assert.equal(getLatestRevision(project.id).status, 'approved');
        assert.equal((await readProjectState(project.id)).status, 'implementing');
    });
    const createScopeFixture = async title => {
        const fixture = await createProject({ title });
        createContractRevision(fixture.id, approvedFixture, null);
        const contract = getLatestRevision(fixture.id);
        db.prepare("UPDATE project_contracts SET status='approved' WHERE id=?").run(contract.id);
        db.prepare("UPDATE projects SET status='paused', plan=?, workflow_state=? WHERE id=?")
            .run(JSON.stringify(approvedFixture), JSON.stringify({ last_error: blocker }), fixture.id);
        return { project: fixture, approved: contract, url: url.replace(project.id, fixture.id) };
    };
    const postScopeChat = async (fixture, message) => {
        const response = await fetch(fixture.url, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message }) });
        return { response, state: await response.json() };
    };
    const lostScope = structuredClone(approvedFixture);
    lostScope.requirements = lostScope.requirements.map(requirement => requirement.id === 'REQ-5'
        ? { ...requirement, statement: 'Global AuthProvider entegrasyonu ile istemci tarafı rota koruması ve Next.js hatasız statik derleme uyumu' }
        : requirement);
    await runAsyncTest('new plan cannot silently replace an approved dashboard requirement with an implementation repair', async () => {
        const fixture = await createScopeFixture('Rejected stok scope loss simulation');
        const beforeExecutions = executions;
        let attempts = 0;
        responder = async () => { attempts++; return JSON.stringify(lostScope); };
        const result = await postScopeChat(fixture, 'yeni bir plan hazırla');
        assert.equal(result.response.status, 200);
        assert.equal(attempts, 2, 'scope loss gets one bounded corrective turn');
        assert.equal(result.state.status, 'paused', 'unrepaired scope loss cannot become an approvable draft');
        assert.equal(getLatestRevision(fixture.project.id).id, fixture.approved.id);
        assert.match(result.state.chatHistory.at(-1).parts[0].text, /kapsam|REQ-5|gereksinim/i);
        assert.equal(executions, beforeExecutions);
    });
    await runAsyncTest('bounded Manager correction restores original business scope and adds repair under a fresh requirement ID', async () => {
        const fixture = await createScopeFixture('Corrected stok scope loss simulation');
        const restored = structuredClone(approvedFixture);
        restored.requirements.push({ id: 'FIX-AUTH', statement: lostScope.requirements.find(requirement => requirement.id === 'REQ-5').statement, mandatory: true });
        let attempts = 0;
        responder = async messages => {
            attempts++;
            if (attempts === 1) return JSON.stringify(lostScope);
            assert.ok(JSON.stringify(messages).includes(approvedFixture.requirements.find(requirement => requirement.id === 'REQ-5').statement),
                'scope correction must receive the original mandatory dashboard requirement');
            return JSON.stringify(restored);
        };
        const beforeExecutions = executions;
        const result = await postScopeChat(fixture, 'yeni bir plan hazırla');
        assert.equal(result.response.status, 200);
        assert.equal(attempts, 2);
        assert.equal(result.state.status, 'pending_approval');
        for (const original of approvedFixture.requirements) assert.equal(
            result.state.plan.requirements.find(requirement => requirement.id === original.id)?.statement, original.statement);
        assert.ok(result.state.plan.requirements.some(requirement => requirement.id === 'FIX-AUTH'));
        assert.equal(getLatestRevision(fixture.project.id).status, 'pending_approval');
        assert.equal(executions, beforeExecutions);
    });
    await runAsyncTest('user followup restores missing critical-stock dashboard while retaining approved scope and waiting for approval', async () => {
        const fixture = await createScopeFixture('User restored stok scope simulation');
        const reportPath = path.join(process.env.PROJECTS_ROOT, fixture.project.id, 'RAPOR.md');
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, 'SIMULATION_REPORT_PRESERVE_SENTINEL', 'utf8');
        // Simulate an already-published old draft, as seen in the read-only live audit.
        createContractRevision(fixture.project.id, lostScope, null);
        db.prepare("UPDATE projects SET status='pending_approval', plan=? WHERE id=?").run(JSON.stringify(lostScope), fixture.project.id);
        const restored = structuredClone(approvedFixture);
        restored.requirements.push({ id: 'FIX-AUTH', statement: 'Global AuthProvider bütün useAuth tüketicilerini kapsar.', mandatory: true });
        responder = async () => JSON.stringify(restored);
        const beforeExecutions = executions;
        const result = await postScopeChat(fixture,
            'Eksik kritik stok seviyesi ve son hareketler gösterge panelini geri ekle. Onaylı iş gereksinimlerini ve yönetim fixture kapsamını koru; henüz başlatma.');
        assert.equal(result.response.status, 200);
        assert.equal(result.state.status, 'pending_approval');
        assert.equal(result.state.plan.requirements.find(requirement => requirement.id === 'REQ-5').statement,
            approvedFixture.requirements.find(requirement => requirement.id === 'REQ-5').statement);
        assert.deepEqual(result.state.plan.management.resources, approvedFixture.management.resources);
        assert.equal(getLatestRevision(fixture.project.id).revision, fixture.approved.revision + 2);
        assert.equal(executions, beforeExecutions);
        assert.equal(await fs.readFile(reportPath, 'utf8'), 'SIMULATION_REPORT_PRESERVE_SENTINEL',
            'publishing a plan revision must preserve existing report evidence');
    });
    for (const [label, change] of [
        ['management needed true to false', plan => {
            plan.management = { needed: false, reason: 'Static revised inventory overview' };
            delete plan.browser;
        }],
        ['existing resource delete operation removal', plan => {
            plan.management.resources.find(resource => resource.name === 'Product').operations = ['create', 'read', 'update'];
            plan.management.roles.find(role => role.name === 'admin').permissions
                .find(permission => permission.resource === 'Product').operations = ['create', 'read', 'update'];
        }],
        ['existing role permission removal', plan => {
            const role = plan.management.roles.find(role => role.name === 'warehouse_staff');
            role.permissions = role.permissions.filter(permission => permission.resource !== 'Category');
        }],
        ['existing authenticated read access becomes public', plan => {
            plan.management.resources.find(resource => resource.name === 'Product').readAccess = 'public';
        }],
        ['existing related-data preservation policy removal', plan => {
            const resource = plan.management.resources.find(resource => resource.name === 'Product');
            resource.deletionPolicy = { relatedData: 'none', reason: 'No related retention required in changed draft.' };
        }]
    ]) await runAsyncTest(`repair revision rejects ${label} while business requirements remain intact`, async () => {
        const fixture = await createScopeFixture(`Management scope guard ${label}`);
        const lossy = structuredClone(approvedFixture);
        change(lossy);
        let attempts = 0;
        responder = async () => { attempts++; return JSON.stringify(lossy); };
        const beforeExecutions = executions;
        const result = await postScopeChat(fixture, 'Hataları gidermek için yeni plan hazırla, mevcut kapsamı koru ve henüz başlatma.');
        assert.equal(result.response.status, 200);
        assert.equal(attempts, 2, 'management scope loss gets exactly one bounded corrective turn');
        assert.equal(result.state.status, 'paused');
        assert.equal(getLatestRevision(fixture.project.id).id, fixture.approved.id);
        assert.equal(executions, beforeExecutions);
        assert.match(result.state.chatHistory.at(-1).parts[0].text, /kapsam|management|yönetim/i);
    });
    await runAsyncTest('fixture and browser selector repair remains revisable while approved obligations stay intact', async () => {
        const fixture = await createScopeFixture('Allowed scoped verification repair');
        const repaired = structuredClone(approvedFixture);
        const category = repaired.management.resources.find(resource => resource.name === 'Category');
        category.verification.createBody = { ...category.verification.createBody, name: '{nonce}', description: 'Isolated corrected category fixture' };
        category.verification.updateBody = { ...category.verification.updateBody, name: '{nonce}', description: 'Updated corrected category fixture' };
        repaired.browser.roleJourneys.find(journey => journey.role === 'admin' && journey.kind === 'positive')
            .steps.find(step => step.selector === '#btn-create-product').selector = '[data-testid="create-product"]';
        responder = async () => JSON.stringify(repaired);
        const beforeExecutions = executions;
        const result = await postScopeChat(fixture, 'Yalnız doğrulama fixture gövdelerini ve gerçek tarayıcı seçicilerini düzelt; henüz başlatma.');
        assert.equal(result.response.status, 200);
        assert.equal(result.state.status, 'pending_approval');
        assert.equal(result.state.planScopeReview?.valid, true);
        assert.equal(result.state.plan.management.resources.find(resource => resource.name === 'Category').verification.createBody.name, '{nonce}');
        assert.ok(result.state.plan.browser.roleJourneys.some(journey => journey.steps.some(step => step.selector === '[data-testid="create-product"]')));
        assert.equal(executions, beforeExecutions);
    });
    await runAsyncTest('duplicate approved requirement ID is corrected once and vetoed before revision or approval dispatch', async () => {
        const fixture = await createScopeFixture('Duplicate requirement scope veto');
        const duplicate = structuredClone(approvedFixture);
        duplicate.requirements.push({ id: 'REQ-5', statement: 'Unrelated AuthProvider replacement under duplicated identity', mandatory: true });
        let attempts = 0;
        responder = async () => { attempts++; return JSON.stringify(duplicate); };
        const beforeExecutions = executions;
        const result = await postScopeChat(fixture, 'Yeni bir onarım planı hazırla; henüz başlatma.');
        assert.equal(result.response.status, 200);
        assert.equal(attempts, 2);
        assert.equal(result.state.status, 'paused');
        assert.equal(getLatestRevision(fixture.project.id).id, fixture.approved.id);
        createContractRevision(fixture.project.id, duplicate, null);
        db.prepare("UPDATE projects SET status='pending_approval', plan=? WHERE id=?").run(JSON.stringify(duplicate), fixture.project.id);
        const approval = await fetch(fixture.url.replace(/\/chat$/, '/approve'), { method: 'POST' });
        assert.equal(approval.status, 409);
        const rejection = await approval.json();
        assert.equal(rejection.code, 'MANAGER_PLAN_SCOPE_CHANGED');
        assert.ok(rejection.planScopeReview.issues.some(issue => issue.id === 'REQ-5' && issue.kind === 'duplicate'));
        assert.equal(getLatestRevision(fixture.project.id).status, 'pending_approval');
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id=?').get(fixture.project.id).count, 0);
        assert.equal(executions, beforeExecutions);
    });
    await runAsyncTest('legacy pending draft exposes lost mandatory scope and both approval paths veto execution', async () => {
        const fixture = await createScopeFixture('Legacy pending stok scope approval veto');
        createContractRevision(fixture.project.id, lostScope, null);
        db.prepare("UPDATE projects SET status='pending_approval', plan=? WHERE id=?").run(JSON.stringify(lostScope), fixture.project.id);
        const pending = getLatestRevision(fixture.project.id);
        const beforeExecutions = executions;
        const attempts = db.prepare('SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id=?').get(fixture.project.id).count;
        const inspection = await fetch(fixture.url.replace(/\/chat$/, ''));
        assert.equal(inspection.status, 200);
        const inspectedState = await inspection.json();
        assert.equal(inspectedState.planScopeReview?.valid, false);
        const issue = inspectedState.planScopeReview.issues.find(item => item.id === 'REQ-5');
        assert.equal(issue?.before, approvedFixture.requirements.find(requirement => requirement.id === 'REQ-5').statement);
        assert.equal(issue?.after, lostScope.requirements.find(requirement => requirement.id === 'REQ-5').statement);
        assert.equal(issue?.kind, 'changed');
        responder = async () => { throw new Error('Invalid pending approval must not call Manager'); };
        for (const [endpoint, body] of [
            [fixture.url.replace(/\/chat$/, '/approve'), undefined],
            [fixture.url, { message: 'planı onaylıyorum' }]
        ]) {
            const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined });
            assert.equal(response.status, 409);
            assert.equal((await response.json()).code, 'MANAGER_PLAN_SCOPE_CHANGED');
        }
        assert.equal(getLatestRevision(fixture.project.id).id, pending.id);
        assert.equal(getLatestRevision(fixture.project.id).status, 'pending_approval');
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id=?').get(fixture.project.id).count, attempts);
        assert.equal(executions, beforeExecutions);
    });
    await runAsyncTest('healthy manually paused project accepts an intentional feature revision without recovery scope freezing', async () => {
        const healthy = await createProject({ title: 'Healthy manually paused feature revision' });
        createContractRevision(healthy.id, approvedFixture, null);
        const original = getLatestRevision(healthy.id);
        db.prepare("UPDATE project_contracts SET status='approved' WHERE id=?").run(original.id);
        db.prepare("UPDATE projects SET status='paused', plan=?, workflow_state=? WHERE id=?")
            .run(JSON.stringify(approvedFixture), JSON.stringify({ last_error: null }), healthy.id);
        const changed = structuredClone(approvedFixture);
        const requirement = changed.requirements.find(item => item.id === 'REQ-5');
        requirement.statement = 'Gösterge paneli yerine kullanıcının istediği yeni ayrıntılı stok raporları ekranı';
        responder = async () => JSON.stringify(changed);
        const beforeCalls = calls;
        const beforeExecutions = executions;
        const result = await postScopeChat({ url: url.replace(project.id, healthy.id) },
            'Hata olmadan elle duraklattığım projede yeni özellik revizyonu istiyorum: gösterge paneli yerine ayrıntılı stok raporları ekranını planla; henüz başlatma.');
        assert.equal(result.response.status, 200);
        assert.equal(calls, beforeCalls + 1, 'intentional feature revision must not enter recovery scope repair');
        assert.equal(result.state.status, 'pending_approval');
        assert.equal(result.state.plan.requirements.find(item => item.id === 'REQ-5').statement, requirement.statement);
        assert.equal(getLatestRevision(healthy.id).revision, original.revision + 1);
        assert.equal(getLatestRevision(healthy.id).status, 'pending_approval');
        assert.equal(executions, beforeExecutions);
    });
} finally { await new Promise(resolve => server.close(resolve)); }
finish();
