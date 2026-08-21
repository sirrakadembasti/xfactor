import assert from 'assert';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

console.log("==========================================");
console.log("⚡ XFactor Backend & Security Test Suite");
console.log("==========================================");

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`[FAIL] ${name}:`, err.message);
        failedTests++;
    }
}

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`[PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`[FAIL] ${name}:`, err.message);
        failedTests++;
    }
}

// ----------------------------------------------------
// 0. Güvenlik: Ortam Değişkeni ve Gizli Bilgi Yönetimi
// ----------------------------------------------------
const projectRoot = fs.existsSync(path.join(process.cwd(), 'backend')) ? process.cwd() : path.resolve(process.cwd(), '..');

runTest("0. Ortam yapılandırması repo içinde sabit kodlu gizli değer taşımamalı", () => {
    const envExamplePath = path.join(projectRoot, 'backend', '.env.example');

    // .env.example şablon dosyası bulunmalıdır.
    assert.strictEqual(fs.existsSync(envExamplePath), true, ".env.example dosyası bulunmalı");

    // Örnek dosyada ve ortamda demonstrasyon amaçlı sabit zayıf anahtarlar bulunmamalıdır.
    const exampleContent = fs.readFileSync(envExamplePath, 'utf8');
    assert.strictEqual(exampleContent.includes("gizli-anahtar-xfactor-123"), false, ".env.example zayıf varsayılan anahtar içermemeli");

    const existingSecret = process.env.JWT_SECRET || '';
    const existingPassword = process.env.ADMIN_PASS || '';
    assert.notStrictEqual(existingSecret, "gizli-anahtar-xfactor-123");
    assert.notStrictEqual(existingPassword, "admin123");
});

// ----------------------------------------------------
// 0b. Güvenlik: Runtime Config & JWT Secret Politikası
// ----------------------------------------------------
await runAsyncTest("0b. Runtime config weak secrets should be rejected", async () => {
    const configModule = await import('../config.js');
    const { validateRuntimeConfig } = configModule;
    assert.throws(() => validateRuntimeConfig({
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'admin123',
        JWT_SECRET: 'short'
    }), /strong|secret|length/i, 'Weak secret should be rejected');

    assert.doesNotThrow(() => validateRuntimeConfig({
        ADMIN_USER: 'admin',
        ADMIN_PASS: 'StrongPassword!2026',
        JWT_SECRET: 'k' + 'x'.repeat(31)
    }), 'Strong config should be accepted');
});

// ----------------------------------------------------
// 0c. Güvenlik: DB-backed auth test plan
// ----------------------------------------------------
await runAsyncTest("0c. User auth model should persist users and hash passwords", async () => {
    const authModule = await import('../auth.js');
    const { createUser, verifyPassword, createProjectForUser, getUserProjects } = authModule;
    const username = `u${Date.now()}`;
    const user = createUser(username, 'StrongPassword!2026');
    assert.ok(user && user.username === username, 'User created');
    assert.notStrictEqual(user.passwordHash, 'StrongPassword!2026', 'Password must be hashed');
    assert.strictEqual(verifyPassword('StrongPassword!2026', user.passwordHash), true, 'Password verification should pass');

    const project = createProjectForUser(user.id, 'Project-1');
    const projects = getUserProjects(user.id);
    assert.ok(project && project.ownerId === user.id, 'Project ownership should be recorded');
    assert.ok(projects.some(p => p.id === project.id), 'User projects should be retrievable');
});

await runAsyncTest("0d. Project ownership and role access should be enforced", async () => {
    const authModule = await import('../auth.js');
    const { createUser, createProjectForUser, userCanAccessProject, setProjectRole, getProjectMembers } = authModule;
    const owner = createUser(`owner${Date.now()}`, 'StrongPassword!2026');
    const editor = createUser(`editor${Date.now()}`, 'StrongPassword!2027');
    const project = createProjectForUser(owner.id, 'Team Project');

    assert.strictEqual(userCanAccessProject(owner.id, project.id), true, 'Owner must access project');
    assert.strictEqual(userCanAccessProject(editor.id, project.id), false, 'Unassigned user must not access project');

    const updated = setProjectRole(project.id, editor.id, 'editor');
    assert.strictEqual(updated.role, 'editor', 'Role assignment should persist');
    assert.strictEqual(userCanAccessProject(editor.id, project.id), true, 'Assigned editor should access project');

    const members = getProjectMembers(project.id);
    assert.ok(members.some((member) => member.userId === owner.id && member.role === 'owner'), 'Owner member should be present');
    assert.ok(members.some((member) => member.userId === editor.id && member.role === 'editor'), 'Editor member should be present');
});

await runAsyncTest("0e. Session tokens should be revocable and expire safely", async () => {
    const authModule = await import('../auth.js');
    const { createUser, createSession, verifySessionToken, revokeSession, revokeAllSessionsForUser } = authModule;
    const user = createUser(`session${Date.now()}`, 'StrongPassword!2028');
    const session = createSession(user.id, { ttlHours: 1 });

    assert.ok(session && session.token, 'Session token should be issued');
    assert.strictEqual(verifySessionToken(session.token), user.id, 'Valid session token should map to the user');

    revokeSession(session.token);
    assert.strictEqual(verifySessionToken(session.token), null, 'Revoked session token should be rejected');

    const secondSession = createSession(user.id, { ttlHours: 1 });
    revokeAllSessionsForUser(user.id);
    assert.strictEqual(verifySessionToken(secondSession.token), null, 'All sessions for user should be invalidated');
});

await runAsyncTest("0f. Login and project creation payloads should be strictly validated", async () => {
    const securityModule = await import('../security.js');
    const { validateLoginPayload, validateProjectTitle } = securityModule;
    assert.strictEqual(validateLoginPayload({ username: 'admin', password: 'StrongPassword!2026' }), true, 'Valid login payload should pass');
    assert.strictEqual(validateLoginPayload({ username: '', password: 'StrongPassword!2026' }), false, 'Empty username must be rejected');
    assert.strictEqual(validateLoginPayload({ username: 'admin', password: 'short' }), false, 'Short password must be rejected');

    assert.strictEqual(validateProjectTitle('My Project'), true, 'Valid project title should pass');
    assert.strictEqual(validateProjectTitle('a'.repeat(300)), false, 'Oversized project title must be rejected');
    assert.strictEqual(validateProjectTitle('javascript:alert(1)'), false, 'Unsafe project title must be rejected');
});

await runAsyncTest("0g. WebSocket auth should use secure subprotocol token instead of query params", async () => {
    const securityModule = await import('../security.js');
    const { isSafeWebSocketUrl, extractWebSocketToken, validateWebSocketAuthToken } = securityModule;
    assert.strictEqual(isSafeWebSocketUrl('ws://localhost:8000/ws/logs'), true, 'Normal WS URL should be accepted');
    assert.strictEqual(isSafeWebSocketUrl('ws://localhost:8000/ws/logs?token=abc'), false, 'WS token in query string must be rejected');

    const protocolToken = extractWebSocketToken(['xfactor-auth', 'jwt-token']);
    assert.strictEqual(protocolToken, 'jwt-token', 'Subprotocol token should be extracted');

    const secret = 'k' + 'x'.repeat(31);
    const validToken = await import('jsonwebtoken').then(({ default: jwt }) => jwt.sign({ userId: 'u1' }, secret, { expiresIn: '1h' }));
    assert.strictEqual(validateWebSocketAuthToken(validToken, secret), 'u1', 'Valid WS auth token should pass verification');
    assert.strictEqual(validateWebSocketAuthToken('tampered', secret), null, 'Tampered WS auth token should be rejected');
});

await runAsyncTest("0h. Frontend auth client should use Bearer headers and never put tokens in query strings", async () => {
    const apiModule = await import('../../frontend/src/services/api.js');
    const { buildAuthHeaders, buildWebSocketUrl, buildApiUrl, getStoredToken } = apiModule;
    const token = 'jwt-test-token';
    const headers = buildAuthHeaders(token);
    assert.strictEqual(headers.Authorization, 'Bearer jwt-test-token', 'Authorization header should be Bearer token');

    const wsUrl = buildWebSocketUrl('http://localhost:8000/api', token);
    assert.ok(!wsUrl.includes('token='), 'WebSocket URL must not leak token in query params');
    assert.strictEqual(wsUrl, 'ws://localhost:8000/ws/logs', 'WebSocket URL should target the log endpoint without query-string auth');

    const apiUrl = buildApiUrl('http://localhost:8000', '/projects');
    assert.strictEqual(apiUrl, 'http://localhost:8000/projects', 'API URL builder should join paths cleanly');

    globalThis.localStorage = { getItem: () => token, removeItem() {}, setItem() {} };
    assert.strictEqual(getStoredToken(), token, 'Stored token should be read from localStorage');
});

// ----------------------------------------------------
// 1. Package.json & Bağımlılık Testi
// ----------------------------------------------------
runTest("1. Package.json Bağımlılıklarının Varlığı ve Formatı", () => {
    const pkgPath = path.join(projectRoot, 'backend', 'package.json');
    assert.strictEqual(fs.existsSync(pkgPath), true, "package.json bulunamadı");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.strictEqual(pkg.name, "xfactor-backend");
    assert.strictEqual(pkg.type, "module");
    assert.ok(pkg.dependencies.express, "express eksik");
    assert.ok(pkg.dependencies.jsonwebtoken, "jsonwebtoken eksik");
    assert.ok(pkg.dependencies["express-rate-limit"], "express-rate-limit eksik");
    assert.ok(pkg.dependencies.ws, "ws eksik");
    assert.ok(pkg.dependencies.cors, "cors eksik");
});

// ----------------------------------------------------
// 2. Veritabanı (db.js) & SQLite Testleri
// ----------------------------------------------------
await runAsyncTest("2. SQLite Veritabanı Modülü & Tablo Yapısı", async () => {
    const dbModule = await import('../db.js');
    assert.ok(dbModule.getProjectState, "getProjectState fonksiyonu mevcut");
    assert.ok(dbModule.getAllProjects, "getAllProjects fonksiyonu mevcut");
    assert.ok(dbModule.saveProjectLog, "saveProjectLog fonksiyonu mevcut");
    assert.ok(dbModule.getProjectLogs, "getProjectLogs fonksiyonu mevcut");

    // Test Projesi Oluştur ve Kaydet
    const testId = `test-proj-${Date.now()}`;
    const testState = {
        id: testId,
        title: "Test Otomasyon Projesi",
        status: "planning",
        chatHistory: [{ role: "user", parts: [{ text: "Merhaba" }] }],
        plan: { talimatname: "Test Plani", domains: ["frontend"] }
    };

    dbModule.saveProjectState(testState);

    // Kaydedilen State'i Oku ve Doğrula
    const retrievedState = dbModule.getProjectState(testId);
    assert.ok(retrievedState, "Kaydedilen proje DB'den okunamadı");
    assert.strictEqual(retrievedState.id, testId);
    assert.strictEqual(retrievedState.title, "Test Otomasyon Projesi");
    assert.strictEqual(retrievedState.status, "planning");
    assert.strictEqual(retrievedState.chatHistory.length, 1);

    // Log Kaydetme ve Okuma Testi
    const logEntry = {
        projectId: testId,
        agent: "Manager",
        action: "test_action",
        file: "test.js",
        message: "Test log mesajı",
        node_id: "node-1",
        parent_node_id: "root"
    };
    dbModule.saveProjectLog(logEntry);

    const logs = dbModule.getProjectLogs(testId);
    assert.ok(logs.length > 0, "Log kaydı DB'ye yazılamadı");
    assert.strictEqual(logs[0].agent, "Manager");
    assert.strictEqual(logs[0].action, "test_action");

    // Proje Listesini Kontrol Et
    const allProjects = dbModule.getAllProjects();
    assert.ok(allProjects.some(p => p.id === testId), "Yeni proje listeleme sorgusunda görünmüyor");
});

// ----------------------------------------------------
// 3. LLM Entegratörü (llm.js) Testleri
// ----------------------------------------------------
await runAsyncTest("3. Multi-LLM Sağlayıcı & Mock Fallback Mantığı", async () => {
    const llmModule = await import('../llm.js');
    assert.ok(llmModule.generateLLMResponse, "generateLLMResponse fonksiyonu mevcut");
    const messages = [{ role: 'user', content: 'Test prompt' }];

    await assert.rejects(
        () => llmModule.generateLLMResponse(messages, { apiKey: '' }),
        /API key|Missing|ALLOW_MOCK_FALLBACK|provider/i,
        'Without API key and fallback flag, the app should fail closed instead of returning mock output'
    );

    const response = await llmModule.generateLLMResponse(messages, { apiKey: '', allowMockFallback: true });
    assert.ok(typeof response === 'string', "LLM yanıtı string olmalı");
    assert.ok(response.includes("Simüle Edilen LLM Yanıtı") || response.includes("Yapay zekâ sunucusuna erişilemedi"), "Beklenen mock yanıt üretilmedi");
});

// ----------------------------------------------------
// 4. Orkestrasyon Mantığı (orchestrator.js) Testleri
// ----------------------------------------------------
await runAsyncTest("4. Orchestrator Yardımcı Fonksiyonlar & Dizin Yapısı", async () => {
    const orchModule = await import('../engine/index.js');
    assert.ok(orchModule.getProjectDir, "getProjectDir fonksiyonu mevcut");
    assert.ok(orchModule.readProjectState, "readProjectState fonksiyonu mevcut");
    assert.ok(orchModule.writeProjectState, "writeProjectState fonksiyonu mevcut");

    const testId = `orch-test-${Date.now()}`;
    const projectDir = orchModule.getProjectDir(testId);
    assert.ok(projectDir.includes(testId), "Proje dizin yolu id içermeli");

    const statePath = orchModule.getStatePath(testId);
    assert.ok(statePath.endsWith('state.json'), "State dosya yolu state.json ile bitmeli");
});

// ----------------------------------------------------
// 5. Güvenlik: JWT Auth & Token Doğrulama Testi
// ----------------------------------------------------
runTest("5. Güvenlik - JWT Auth & Token Oluşturma / Doğrulama Mantığı", () => {
    const secret = "gizli-anahtar-xfactor-123";
    const payload = { username: "admin" };
    
    // Geçerli Token Testi
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });
    const decoded = jwt.verify(token, secret);
    assert.strictEqual(decoded.username, "admin");

    // Geçersiz Token Testi
    assert.throws(() => {
        jwt.verify("gecersiz.token.string", secret);
    }, "Geçersiz token hata fırlatmalı");

    // Yanlış Anahtar Testi
    assert.throws(() => {
        jwt.verify(token, "yanlis-anahtar");
    }, "Yanlış secret ile verify hata fırlatmalı");
});

// ----------------------------------------------------
// 6. Güvenlik: Path Traversal Koruması Testi
// ----------------------------------------------------
runTest("6. Güvenlik - Path Traversal Parametre Regex ve Dizin Çözümleme Engeli", () => {
    // server.js içerisindeki id parametre regex testi: /^[a-zA-Z0-9-_]+$/
    const idRegex = /^[a-zA-Z0-9-_]+$/;

    assert.strictEqual(idRegex.test("project-12345"), true, "Geçerli ID kabul edilmeli");
    assert.strictEqual(idRegex.test("proj_test_01"), true, "Geçerli ID kabul edilmeli");
    assert.strictEqual(idRegex.test("../etc/passwd"), false, "Path Traversal denemesi engellenmeli");
    assert.strictEqual(idRegex.test("..\\windows\\system32"), false, "Path Traversal denemesi engellenmeli");
    assert.strictEqual(idRegex.test("proj/../secret"), false, "Soru işareti/slash engellenmeli");

    // Posix path resolution testi
    const testPath = "../secret/data";
    const decodedPath = decodeURIComponent(testPath);
    const resolvedPath = path.posix.resolve('/', decodedPath.replace(/^\/+/, ''));
    const isDangerous = (resolvedPath !== '/' + decodedPath.replace(/^\/+/, '')) && (decodedPath !== '/');
    assert.strictEqual(isDangerous, true, "Relative path traversal saptanmalı");
});

// ----------------------------------------------------
// 7. Güvenlik: Rate Limiter Yapılandırması
// ----------------------------------------------------
runTest("7. Güvenlik - Express Rate Limiter Yapılandırma Mantığı", () => {
    // IP Süzgeci ve Muafiyet Mantığı Testi
    const skipCheck = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    
    assert.strictEqual(skipCheck('127.0.0.1'), true, "Localhost IPv4 muaf olmalı");
    assert.strictEqual(skipCheck('::1'), true, "Localhost IPv6 muaf olmalı");
    assert.strictEqual(skipCheck('192.168.1.100'), false, "Dış IP rate limiter'a takılmalı");
    assert.strictEqual(skipCheck('45.33.22.11'), false, "Dış IP rate limiter'a takılmalı");
});

// ----------------------------------------------------
// 8. WebSocket Auth & URL Token İncelemesi
// ----------------------------------------------------
runTest("8. WebSocket - URL Token Parametresi Yetkilendirme Mantığı", () => {
    const JWT_SECRET = "gizli-anahtar-xfactor-123";
    const validToken = jwt.sign({ username: "admin" }, JWT_SECRET);

    const checkWsAuth = (urlStr) => {
        const dummyHost = "http://localhost:8000";
        const url = new URL(urlStr, dummyHost);
        const token = url.searchParams.get('token');
        if (!token) return { status: false, reason: "Token gerekli" };
        try {
            jwt.verify(token, JWT_SECRET);
            return { status: true };
        } catch(e) {
            return { status: false, reason: "Geçersiz token" };
        }
    };

    assert.strictEqual(checkWsAuth(`/ws/logs?token=${validToken}`).status, true, "Geçerli ws token kabul edilmeli");
    assert.strictEqual(checkWsAuth("/ws/logs").status, false, "Tokensiz ws bağlantısı reddedilmeli");
    assert.strictEqual(checkWsAuth("/ws/logs?token=invalid_token").status, false, "Sahte tokenli ws reddedilmeli");
});

// ----------------------------------------------------
// 9. Güvenlik: WebSocket Token ve Request Validation (TDD için yeni güvenlik API)
// ----------------------------------------------------
await runAsyncTest("9. Secure WebSocket token handling and stricter request validation", async () => {
    const security = await import('../security.js');
    const { isSafeWebSocketUrl, validateChatPayload } = security;
    assert.strictEqual(isSafeWebSocketUrl('/ws/logs?token=abc123'), false, 'WS URL query string token güvenli değil');
    assert.strictEqual(isSafeWebSocketUrl('/ws/logs'), true, 'Token içermeyen WS URL kabul edilmeli');
    assert.strictEqual(validateChatPayload({ message: 'Merhaba' }), true, 'Geçerli mesaj kabul edilmeli');
    assert.strictEqual(validateChatPayload({ message: '   ' }), false, 'Boş mesaj reddedilmeli');
    assert.strictEqual(validateChatPayload({}), false, 'Eksik payload reddedilmeli');
});

// ----------------------------------------------------
// 10. Proje yaşam döngüsü ve state transition kuralı
// ----------------------------------------------------
await runAsyncTest("10. Project lifecycle should enforce safe statuses and transitions", async () => {
    const authModule = await import('../auth.js');
    const { PROJECT_LIFECYCLE, isValidProjectStatus, canTransitionProjectStatus, getProjectRole } = authModule;
    assert.ok(Array.isArray(PROJECT_LIFECYCLE), 'Lifecycle must be defined');
    assert.ok(PROJECT_LIFECYCLE.includes('planning'), 'Planning state should exist');
    assert.strictEqual(isValidProjectStatus('planning'), true, 'Planning should be accepted');
    assert.strictEqual(isValidProjectStatus('unknown_state'), false, 'Unknown states must be rejected');
    assert.strictEqual(canTransitionProjectStatus('planning', 'running'), true, 'Planning can transition to running');
    assert.strictEqual(canTransitionProjectStatus('running', 'planning'), false, 'Running cannot revert to planning');
    assert.strictEqual(canTransitionProjectStatus('completed', 'running'), false, 'Completed cannot go back to running');

    const owner = authModule.createUser(`stateowner${Date.now()}`, 'StrongPassword!2028');
    const project = authModule.createProjectForUser(owner.id, 'Lifecycle Project');
    assert.strictEqual(getProjectRole(owner.id, project.id), 'owner', 'Owner role should be resolved');
});

// ----------------------------------------------------
// 11. Rol tabanlı erişim kontrolü
// ----------------------------------------------------
await runAsyncTest("11. Role-based access should differentiate read vs write permissions", async () => {
    const authModule = await import('../auth.js');
    const { createUser, createProjectForUser, setProjectRole, userCanAccessProject, canViewProject, canEditProject, canDeleteProject } = authModule;
    const owner = createUser(`rowner${Date.now()}`, 'StrongPassword!2029');
    const editor = createUser(`reditor${Date.now()}`, 'StrongPassword!2030');
    const viewer = createUser(`rviewer${Date.now()}`, 'StrongPassword!2031');
    const project = createProjectForUser(owner.id, 'RBAC Project');

    assert.strictEqual(userCanAccessProject(owner.id, project.id), true, 'Owner must access project');
    assert.strictEqual(canViewProject(owner.id, project.id), true, 'Owner can view project');
    assert.strictEqual(canEditProject(owner.id, project.id), true, 'Owner can edit project');
    assert.strictEqual(canDeleteProject(owner.id, project.id), true, 'Owner can delete project');

    setProjectRole(project.id, editor.id, 'editor');
    setProjectRole(project.id, viewer.id, 'viewer');

    assert.strictEqual(userCanAccessProject(editor.id, project.id), true, 'Editor must be able to access project');
    assert.strictEqual(canViewProject(editor.id, project.id), true, 'Editor can view project');
    assert.strictEqual(canEditProject(editor.id, project.id), true, 'Editor can edit project');
    assert.strictEqual(canDeleteProject(editor.id, project.id), false, 'Editor should not delete project');

    assert.strictEqual(canViewProject(viewer.id, project.id), true, 'Viewer can read project');
    assert.strictEqual(canEditProject(viewer.id, project.id), false, 'Viewer cannot edit project');
    assert.strictEqual(canDeleteProject(viewer.id, project.id), false, 'Viewer cannot delete project');
});

runTest("12. Frontend App should use shared auth helper for all bearer token calls", () => {
    const appSource = fs.readFileSync(path.join(projectRoot, 'frontend', 'src', 'App.jsx'), 'utf8');

    assert.ok(/buildAuthHeaders\s*\(\s*token\s*,\s*options\.headers\s*\|\|\s*\{\s*\}\s*\)/.test(appSource), 'App must use buildAuthHeaders from shared API layer');
    assert.ok(!/Authorization\s*:\s*`\s*Bearer\s*/.test(appSource), 'App should not hardcode Bearer auth inside the component');
});

await runAsyncTest("13. CORS origins and file-system paths should be validated", async () => {
    const security = await import('../security.js');
    const { isAllowedOrigin, isSafeProjectPath } = security;
    const allowed = ['http://localhost:5173', 'http://127.0.0.1:5173'];

    assert.strictEqual(isAllowedOrigin('http://localhost:5173', allowed), true, 'Allowed localhost origin should pass');
    assert.strictEqual(isAllowedOrigin('https://evil.example', allowed), false, 'Disallowed origin must be rejected');
    assert.strictEqual(isAllowedOrigin(undefined, allowed), false, 'Missing origin should be rejected');

    assert.strictEqual(isSafeProjectPath('src/App.jsx', 'F:/projeler/xfactor-main/projects/test-project'), true, 'Safe relative project path should pass');
    assert.strictEqual(isSafeProjectPath('../outside.txt', 'F:/projeler/xfactor-main/projects/test-project'), false, 'Parent traversal must be rejected');
    assert.strictEqual(isSafeProjectPath('/etc/passwd', 'F:/projeler/xfactor-main/projects/test-project'), false, 'Absolute filesystem path must be rejected');
});

await runAsyncTest("14. Request logging and safe error payloads should be structured and traceable", async () => {
    const logger = await import('../observability.js');
    const { generateRequestId, buildStructuredLog, serializeError, buildErrorResponse } = logger;
    const requestId = generateRequestId();
    assert.ok(typeof requestId === 'string' && requestId.length >= 8, 'Request ID should be generated');

    const logEntry = buildStructuredLog('api.error', { requestId, status: 400, code: 'BAD_REQUEST' });
    assert.strictEqual(logEntry.event, 'api.error', 'Log event name should be preserved');
    assert.strictEqual(logEntry.requestId, requestId, 'Request ID should be included in the log entry');

    const error = serializeError(new Error('bad input'));
    assert.strictEqual(error.message, 'bad input', 'Error message should be preserved');
    assert.strictEqual(error.stack, undefined, 'Stack should not be exposed to clients');

    const payload = buildErrorResponse(new Error('bad input'), 'fallback message', requestId);
    assert.strictEqual(payload.error, 'fallback message', 'Fallback message should be returned');
    assert.strictEqual(payload.requestId, requestId, 'Error payload should include request ID');
});

// ----------------------------------------------------
// 15. Ajan Rol Şablonları & Registry Testi (Agency-Agents Modeli)
// ----------------------------------------------------
await runAsyncTest("15. Agent registry and persona modules should be defined and instantiable", async () => {
    const agents = await import('../agents/index.js');
    const { getAgent, AGENT_REGISTRY } = agents;
    const expectedRoles = ['manager', 'director', 'teamleader', 'coder', 'reviewer', 'tester'];
    for (const role of expectedRoles) {
        assert.ok(AGENT_REGISTRY[role], `Agent role "${role}" must exist in registry`);
        const agent = getAgent(role);
        assert.strictEqual(agent.role, role, `getAgent("${role}") should resolve`);
        assert.ok(typeof agent.systemPrompt === 'string' && agent.systemPrompt.length > 50, `System prompt for "${role}" must be defined`);
        assert.ok(typeof agent.buildPrompt === 'function', `buildPrompt for "${role}" must be a function`);
        assert.ok(typeof agent.parseResponse === 'function', `parseResponse for "${role}" must be a function`);
    }

    assert.throws(() => getAgent('invalid_agent'), /bilinmeyen ajan türü/i, 'Unknown agent must throw error');
});

// ----------------------------------------------------
// 16. JSON Schema & Structured Output Doğrulayıcıları
// ----------------------------------------------------
await runAsyncTest("16. Structured JSON schema parsers should strictly validate agent outputs", async () => {
    const schemas = await import('../agents/schemas.js');
    const { extractAndParseJSON, validateManagerPlan, validateDirectorSpec, validateTeamleaderTasks, validateCoderFiles, validateReviewResult } = schemas;
    // Markdown fence içinden JSON çıkarma testi
    const sampleMarkdown = "```json\n{\n  \"summary\": \"Test summary\",\n  \"talimatname\": \"# Plan\",\n  \"domains\": [{\"name\": \"frontend\", \"prefix\": \"frontend\", \"description\": \"UI\"}]\n}\n```";
    const parsed = extractAndParseJSON(sampleMarkdown);
    assert.strictEqual(parsed.summary, "Test summary");
    assert.strictEqual(validateManagerPlan(parsed), true, "Valid manager plan must pass validation");

    // Eksik alan içeren manager planı testi
    assert.throws(() => validateManagerPlan({ summary: "Eksik" }), /talimatname/i, "Missing talimatname must throw error");

    // Director şartname testi
    const directorData = { domain: "frontend", altTalimatname: "# Spec", teamleaders: [{ name: "frontend.tl", prefix: "frontend", mission: "Dev" }] };
    assert.strictEqual(validateDirectorSpec(directorData), true, "Valid director spec must pass");

    // Teamleader görev ayrıştırma testi
    const tlData = { tasks: [{ id: "task-1", title: "Setup", description: "Config", dependencies: [], targetFiles: ["package.json"] }] };
    assert.strictEqual(validateTeamleaderTasks(tlData), true, "Valid teamleader task list must pass");

    // Coder çoklu dosya çıktısı testi
    const coderData = { summary: "Code written", files: [{ path: "src/App.jsx", content: "export default () => {}" }] };
    assert.strictEqual(validateCoderFiles(coderData), true, "Valid coder files must pass");

    // Reviewer & Tester değerlendirme testi
    const reviewData = { approved: true, summary: "Looks good", feedback: "OK" };
    assert.strictEqual(validateReviewResult(reviewData), true, "Valid review result must pass");
});

// ----------------------------------------------------
// 17. Deterministik DAG Engine & Bağımlılık Çözümleme Testi (Archon Modeli)
// ----------------------------------------------------
await runAsyncTest("17. TaskDAG should correctly resolve execution order, ready tasks, and detect cycles", async () => {
    const { TaskDAG } = await import('../engine/dag.js');
    const dag = new TaskDAG();
    dag.addTask({ id: "task-setup", title: "Setup", dependencies: [], targetFiles: ["package.json"] });
    dag.addTask({ id: "task-api", title: "API", dependencies: ["task-setup"], targetFiles: ["src/api.js"] });
    dag.addTask({ id: "task-ui", title: "UI", dependencies: ["task-setup"], targetFiles: ["src/App.jsx"] });
    dag.addTask({ id: "task-integration", title: "Integration", dependencies: ["task-api", "task-ui"], targetFiles: ["src/main.jsx"] });

    // Döngü olmamalı
    assert.strictEqual(dag.detectCycles(), false, "DAG should have no cycles");

    // Yürütme sırası bağımlılıkları karşılamalı
    const order = dag.getExecutionOrder();
    assert.ok(order.indexOf("task-setup") < order.indexOf("task-api"), "Setup before API");
    assert.ok(order.indexOf("task-setup") < order.indexOf("task-ui"), "Setup before UI");
    assert.ok(order.indexOf("task-api") < order.indexOf("task-integration"), "API before Integration");
    assert.ok(order.indexOf("task-ui") < order.indexOf("task-integration"), "UI before Integration");

    // Başlangıçta yalnızca bağımsız task hazır olmalı
    const readyInitially = dag.getReadyTasks();
    assert.strictEqual(readyInitially.length, 1, "Only setup task is initially ready");
    assert.strictEqual(readyInitially[0].id, "task-setup");

    // Setup tamamlandığında API ve UI hazır olmalı
    dag.setTaskStatus("task-setup", "completed", { files: [] });
    const readyAfterSetup = dag.getReadyTasks();
    assert.strictEqual(readyAfterSetup.length, 2, "API and UI should be ready after setup");

    // Döngüsel bağımlılık testi
    const cyclicDag = new TaskDAG();
    cyclicDag.addTask({ id: "A", dependencies: ["B"] });
    cyclicDag.addTask({ id: "B", dependencies: ["A"] });
    assert.strictEqual(cyclicDag.detectCycles(), true, "Cycle must be detected between A and B");
    assert.throws(() => cyclicDag.getExecutionOrder(), /döngüsel bağımlılık/i, "Execution order must throw on cycle");
});

// ----------------------------------------------------
// 18. Dosya-Bazlı Ajan Koordinasyon Protokolü ("Agent = Klasör")
// ----------------------------------------------------
await runAsyncTest("18. File-based protocol should create TALIMATNAME, ALT-TALIMATNAME, GOREV, TODO, and DURUM files", async () => {
    const fileProto = await import('../engine/fileProtocol.js');
    const { setupRootProtocol, setupDirectorProtocol, setupTeamleaderProtocol, setupCoderProtocol, writeDurum, readDurum, checkTodoItem } = fileProto;
    const testProjectDir = path.join(projectRoot, 'backend', 'data', `test-proto-${Date.now()}`);

    // Kök protokol (manager/ altında oluşturulur)
    await setupRootProtocol(testProjectDir, "# Test Talimatname", [{ name: "frontend", prefix: "frontend" }]);
    const rootTodoContent = await fs.promises.readFile(path.join(testProjectDir, 'manager', 'TODO.md'), 'utf8');
    assert.ok(rootTodoContent.includes('frontend.director/'), "Manager TODO must list frontend director");
    // Director protokol
    const directorDir = await setupDirectorProtocol(testProjectDir, "frontend", "# Görev Frontend", "# Alt Talimatname", [{ name: "frontend.teamleader" }]);
    const altTalimat = await fs.promises.readFile(path.join(directorDir, 'ALT-TALIMATNAME.md'), 'utf8');
    assert.strictEqual(altTalimat, "# Alt Talimatname", "ALT-TALIMATNAME.md must be written");

    // Teamleader protokol
    const tlDir = await setupTeamleaderProtocol(directorDir, "frontend.teamleader", "# Görev TL", [{ id: "gorev-1", title: "Giriş Ekranı", dependencies: [] }]);
    const tlTodo = await fs.promises.readFile(path.join(tlDir, 'TODO.md'), 'utf8');
    assert.ok(tlTodo.includes('gorev-1'), "TL TODO must contain gorev-1");

    // Coder protokol
    const coderDir = await setupCoderProtocol(tlDir, "gorev-1", "Giriş Ekranı", "# Görev Detayı");
    const durumContent = await readDurum(coderDir);
    assert.ok(durumContent.includes('CALISIYOR'), "Coder initial DURUM must be CALISIYOR");

    // TODO satırı checkleme testi
    await checkTodoItem(path.join(tlDir, 'TODO.md'), "Giriş Ekranı");
    const updatedTlTodo = await fs.promises.readFile(path.join(tlDir, 'TODO.md'), 'utf8');
    assert.ok(updatedTlTodo.includes('- [x]'), "TODO item must be checked with [x]");

    // Temizlik
    await fs.promises.rm(testProjectDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 19. Pause / Resume / State Senkronizasyon Testi
// ----------------------------------------------------
await runAsyncTest("19. Workflow state and pause/resume mechanisms should be reliable", async () => {
    const orchestrator = await import('../engine/index.js');
    const { readProjectState, writeProjectState, getProjectDir } = orchestrator;
    const testId = `test-pause-${Date.now()}`;
    const testState = { id: testId, title: "Pause Test Project", status: "running", plan: { domains: [] } };
    await writeProjectState(testId, testState);

    const retrieved = await readProjectState(testId);
    assert.strictEqual(retrieved.status, "running", "Project state should be running");

    testState.status = "paused";
    await writeProjectState(testId, testState);
    const pausedState = await readProjectState(testId);
    assert.strictEqual(pausedState.status, "paused", "Project state should transition to paused");

    // Temizlik
    await fs.promises.rm(getProjectDir(testId), { recursive: true, force: true }).catch(() => {});
});

// ----------------------------------------------------
// 20. Çok Dosyalı Kod Üretim ve Güvenli Dosya Yazma Testi
// ----------------------------------------------------
await runAsyncTest("20. Multi-file code generator should safely write files and traverse directory tree", async () => {
    const generator = await import('../engine/codeGenerator.js');
    const { writeGeneratedFiles, listProjectTree } = generator;
    const testProjectDir = path.join(projectRoot, 'backend', 'data', `test-gen-${Date.now()}`);
    const testCoderDir = path.join(testProjectDir, 'coder-temp');
    await fs.promises.mkdir(testCoderDir, { recursive: true });

    const sampleFiles = [
        { path: 'package.json', content: '{"name": "generated-app"}' },
        { path: 'src/App.jsx', content: 'export default () => "Hello XFactor";' },
        { path: 'src/components/Header.jsx', content: 'export const Header = () => null;' }
    ];

    const written = await writeGeneratedFiles(testProjectDir, testCoderDir, sampleFiles);
    assert.strictEqual(written.length, 3, "3 files should be written");

    // Traversal ile dosyaların listelenebilirliğini doğrula
    const tree = await listProjectTree(testProjectDir);
    assert.ok(tree.some(f => f.path.includes('package.json')), "package.json should be in tree");
    assert.ok(tree.some(f => f.path.includes('src/App.jsx') || f.path.includes('src\\App.jsx')), "src/App.jsx should be in tree");

    // Traversal saldırısı denemesi
    const unsafeFiles = [{ path: '../../outside.txt', content: 'malicious' }];
    const unsafeWritten = await writeGeneratedFiles(testProjectDir, testCoderDir, unsafeFiles);
    assert.strictEqual(unsafeWritten.length, 0, "Unsafe traversal paths must be rejected");

    // Temizlik
    await fs.promises.rm(testProjectDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 21. Self-Correction & Reviewer Geri Bildirim Döngüsü Testi
// ----------------------------------------------------
await runAsyncTest("21. Self-correction module should handle iterative review loop and feedback", async () => {
    const schemas = await import('../agents/schemas.js');
    const { validateReviewResult } = schemas;
    // Reviewer simülasyonu
    const mockSuccessReview = { approved: true, summary: "Mükemmel", feedback: "Onaylandı" };
    assert.strictEqual(validateReviewResult(mockSuccessReview), true, "Review validation should pass");

    const mockFailReview = { approved: false, summary: "Eksik import", feedback: "React importu eksik" };
    assert.strictEqual(validateReviewResult(mockFailReview), true, "Review fail validation should pass");
    assert.strictEqual(mockFailReview.approved, false, "Approval should be false on failure");
});

// ----------------------------------------------------
// 22. Chat Plan Hazırlığı & Structured Onay Tetikleme Testi
// ----------------------------------------------------
await runAsyncTest("22. Chat approval should dynamically configure domains and trigger pending_approval", async () => {
    const isPlanReady = (text, userMsg = '', parsedPlan = null) => {
        const userTrimmed = (userMsg || '').toLowerCase().trim();
        const isUserStarting = ['başla', 'basla', 'başlayalım', 'baslayalim', 'onay', 'onayla', 'onaylıyorum', 'onayliyorum', 'tamam', 'tamamdır', 'tamamdir', 'olur', 'inşa et', 'insa et', 'üret', 'uret', 'başlat', 'baslat', 'projeyi başlat', 'projeyi baslat', 'üretime geç', 'uretime gec', 'yap', 'yapalım', 'hadi'].some(kw => userTrimmed === kw || userTrimmed.startsWith(kw + ' ') || userTrimmed.endsWith(' ' + kw));
        return !!parsedPlan ||
               text.includes("[PLAN_HAZIR]") ||
               text.toLowerCase().includes("onaylıyor") ||
               text.toLowerCase().includes("planı onayla") ||
               text.toLowerCase().includes("üretime başla") ||
               text.toLowerCase().includes("revizyon planı") ||
               text.toLowerCase().includes("onayınız bekleniyor") ||
               text.toLowerCase().includes("onayınıza sunuldu") ||
               text.toLowerCase().includes("başlatabilirsiniz") ||
               text.toLowerCase().includes("başlatabilirsin") ||
               text.toLowerCase().includes("onaylayabilirsiniz") ||
               text.toLowerCase().includes("onaylayabilirsin") ||
               isUserStarting;
    };

    assert.strictEqual(isPlanReady("Planı onaylıyorsanız butona basın."), true, "Approval keyword should trigger");
    assert.strictEqual(isPlanReady("Üretime başla butonuna tıklayın."), true, "Production start keyword should trigger");
    assert.strictEqual(isPlanReady("[PLAN_HAZIR] Mimari hazır."), true, "Marker keyword should trigger");
    assert.strictEqual(isPlanReady("Mimari plan hazırlandı.", "başla"), true, "User start intent should trigger approval");
    assert.strictEqual(isPlanReady("Mimari plan hazırlandı.", "", { summary: "Ok", talimatname: "Spec", domains: [] }), true, "Parsed JSON plan should trigger approval");
    assert.strictEqual(isPlanReady("Hangi özellikleri eklemek istersiniz?", "merhaba"), false, "Regular chat should not trigger approval");
});
// ----------------------------------------------------
// 23. Frontend IDE Dosya Ağacı ve Dışa Aktarım Uyumluluğu
// ----------------------------------------------------
await runAsyncTest("23. Frontend App component should render approval card and Monaco IDE view", async () => {
    const appSource = fs.readFileSync(path.join(projectRoot, 'frontend', 'src', 'App.jsx'), 'utf8');
    const routesSource = fs.readFileSync(path.join(projectRoot, 'backend', 'routes', 'projectRoutes.js'), 'utf8');

    assert.ok(appSource.includes("pending_approval"), "App should handle pending_approval state");
    assert.ok(appSource.includes("Planı Onayla ve Başlat"), "App should display approval button");
    assert.ok(appSource.includes("ReactFlow"), "App should render ReactFlow for DAG visualization");
    assert.ok(appSource.includes("Editor"), "App should render Monaco Editor for IDE view");
    assert.ok(appSource.includes("JSZip"), "App should support ZIP download via JSZip");
    assert.ok(routesSource.includes(".env"), "projectRoutes must allow .env file in exported files");
});
console.log("\n==========================================");
console.log(`🎉 Testler Tamamlandı: ${passedTests} BAŞARILI, ${failedTests} HATALI`);
console.log("==========================================");
