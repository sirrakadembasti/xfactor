/**
 * 🧠 XFactor Graphify Generator
 * Projedeki tüm kaynak kodları (backend, frontend, docs, engine, routes, tests)
 * AST ve import düzeyinde analiz ederek graphify-out/ altında görsel haritalar üretir.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSourceGraph, assertCuratedNodesExist } from './graphSource.js';
import { getRunnableTestFiles } from '../tests/testInventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT_DIR, 'graphify-out');

async function extractCodeGraph() {
    await fs.mkdir(OUT_DIR, { recursive: true });

    const nodes = [];
    const links = [];
    const linkKeys = new Set();
    const nodeMap = new Map();

    function addNode(id, label, type, group, file, description = '') {
        if (!nodeMap.has(id)) {
            const node = { id, label, type, group, file, description, val: 1 };
            nodeMap.set(id, node);
            nodes.push(node);
        } else {
            nodeMap.get(id).val += 1;
        }
        return id;
    }

    function addLink(source, target, label = 'connects') {
        if (source && target && source !== target) {
            const key = `${source}\u0000${target}\u0000${label}`;
            if (linkKeys.has(key)) return;
            linkKeys.add(key);
            links.push({ source, target, label });
            if (nodeMap.has(source)) nodeMap.get(source).val += 0.5;
            if (nodeMap.has(target)) nodeMap.get(target).val += 0.5;
        }
    }


    // 1. Docs & Anayasa Düğüm Grubu (Group 1: Purple)
    const docs = [
        { id: 'docs/ORKESTRASYON-TALIMATNAMESI.md', label: 'ORKESTRASYON-TALIMATNAMESI (Anayasa v3)', desc: 'Platformun en üst master orkestrasyon anayasası' },
        { id: 'docs/manager.md', label: 'docs/manager.md', desc: 'Manager Ajanı canlı kural ve mimari şartname dosyası' },
        { id: 'docs/director.md', label: 'docs/director.md', desc: 'Director Ajanı canlı domain şartname kuralları' },
        { id: 'docs/teamleader.md', label: 'docs/teamleader.md', desc: 'Teamleader Ajanı atomik görev ve DAG kuralları' },
        { id: 'docs/coder.md', label: 'docs/coder.md', desc: 'Coder Ajanı bileşen kompozisyonu ve kodlama kuralları' },
        { id: 'docs/reviewer.md', label: 'docs/reviewer.md', desc: 'Reviewer Ajanı kalite kapısı ve fail-closed veto kuralları' },
        { id: 'docs/tester.md', label: 'docs/tester.md', desc: 'Tester Ajanı deterministik sentaks ve auto-repair kuralları' },
        { id: 'docs/superpowers/plans/2026-09-16-orchestration-remediation-plan.md', label: '2026-09-16 Orkestrasyon Planı', desc: 'Disk-DB senkronizasyonu, şeffaf hata loglama ve canlı DAG planı' },
        { id: 'docs/superpowers/plans/2026-09-17-remediation-refinement-plan.md', label: '2026-09-17 İyileştirme Rafine Planı', desc: 'Menü düzeni, revizyon kilidi, host fallback ve dummy düğüm temizliği' },
        { id: 'docs/superpowers/plans/2026-09-17-pragmatic-auth-standard-plan.md', label: '2026-09-17 Pragmatik Auth Standart Planı', desc: 'Sade auth, seed ve login esneklik planı' },
        { id: 'docs/superpowers/plans/2026-09-18-project-state-rehydration-plan.md', label: '2026-09-18 Proje Durumu Canlandırma Planı', desc: 'Mevcut disk projelerini veritabanında canlandırma ve geçmiş log kurtarma planı' },
        { id: 'docs/superpowers/plans/2026-09-19-accurate-project-state-and-artifact-plan.md', label: '2026-09-19 Doğru Durum ve Artefakt Planı', desc: 'Gerçek proje durumu tespiti ve doğrulanmış ZIP artefakt planı' },
        { id: 'docs/superpowers/specs/2026-09-19-chat-action-audit-design.md', label: '2026-09-19 Sohbet Aksiyon Denetim İzi Tasarımı', desc: 'Başarılı iş akışı ve yardımcı buton aksiyonlarının kalıcı sohbet denetim izi tasarımı' },
        { id: 'docs/superpowers/plans/2026-09-19-chat-action-audit-implementation-plan.md', label: '2026-09-19 Sohbet Aksiyon Denetim İzi Uygulama Planı', desc: 'İdempotent sohbet aksiyon mesajları, rota entegrasyonu ve doğrulama uygulama planı' },
        { id: 'docs/superpowers/specs/2026-09-19-quality-dashboard-graphify-design.md', label: '2026-09-19 Kalite Paneli Tasarımı', desc: 'Kalite paneli mimari Graphify entegrasyonu ve kanıt zinciri tasarımı' },
        { id: 'docs/superpowers/plans/2026-09-19-quality-dashboard-graphify-plan.md', label: '2026-09-19 Kalite Paneli Uygulama Planı', desc: 'Kalite paneli Graphify düğüm, bağlantı ve ağaç uygulama planı' },
        { id: 'docs/OPERATIONS.md', label: 'OPERATIONS.md', desc: 'Tek-node üretim sınırı, MFA/secret envelope, sandbox limitleri ve operasyon kılavuzu' },
        { id: 'kullanici-kilavuzu.md', label: 'kullanici-kilavuzu.md', desc: 'A\'dan Z\'ye operasyon ve kullanıcı kılavuzu' }
      ];

    docs.forEach(d => {
        addNode(d.id, d.label, 'Document', 'docs', d.id, d.desc);
        if (d.id !== 'docs/ORKESTRASYON-TALIMATNAMESI.md') {
            addLink('docs/ORKESTRASYON-TALIMATNAMESI.md', d.id, 'defines');
        }
    });

    // 2. Agents Grubu (Group 2: Violet)
    const agents = [
        { id: 'backend/agents/agentLoader.js', label: 'agentLoader.js (Living Docs Bridge)', desc: 'docs/*.md dosyalarını canlı yükleyip LLM promptlarına bağlayan köprü' },
        { id: 'backend/agents/index.js', label: 'agents/index.js (Registry & Factory)', desc: 'Merkezi Ajan Kayıt Defteri ve getAgent() fabrikası' },
        { id: 'backend/agents/schemas.js', label: 'schemas.js (Parser & Truncation Repair)', desc: 'JSON kurtarıcı, regex parser ve şema doğrulayıcıları' },
        { id: 'backend/agents/manager.js', label: 'manager.agent', desc: 'Manager Ajanı motoru' },
        { id: 'backend/agents/director.js', label: 'director.agent', desc: 'Director Ajanı motoru' },
        { id: 'backend/agents/teamleader.js', label: 'teamleader.agent', desc: 'Teamleader Ajanı motoru' },
        { id: 'backend/agents/coder.js', label: 'coder.agent', desc: 'Coder Ajanı motoru' },
        { id: 'backend/agents/reviewer.js', label: 'reviewer.agent', desc: 'Reviewer Ajanı motoru' },
        { id: 'backend/agents/tester.js', label: 'tester.agent', desc: 'Tester Ajanı motoru' }
    ];

    agents.forEach(a => {
        addNode(a.id, a.label, 'AgentModule', 'agents', a.id, a.desc);
        addLink('backend/agents/index.js', a.id, 'registers');
    });

    addLink('backend/agents/agentLoader.js', 'docs/ORKESTRASYON-TALIMATNAMESI.md', 'reads');
    addLink('backend/agents/manager.js', 'docs/manager.md', 'loads');
    addLink('backend/agents/director.js', 'docs/director.md', 'loads');
    addLink('backend/agents/teamleader.js', 'docs/teamleader.md', 'loads');
    addLink('backend/agents/coder.js', 'docs/coder.md', 'loads');
    addLink('backend/agents/reviewer.js', 'docs/reviewer.md', 'loads');
    addLink('backend/agents/tester.js', 'docs/tester.md', 'loads');
    addLink('backend/agents/manager.js', 'backend/agents/agentLoader.js', 'uses');
    addLink('backend/agents/coder.js', 'backend/agents/schemas.js', 'uses');

    // 3. Engine Grubu (Group 3: Blue)
    const engine = [
        { id: 'backend/engine/workflow.js', label: 'workflow.js (Master Orchestrator)', desc: 'Paralel DAG dalgalarını yürüten ana iş akışı komutanı' },
        { id: 'backend/engine/dag.js', label: 'dag.js (TaskDAG & Execution Waves)', desc: 'Topolojik sıra ve seviyeli dalga (wave) algoritması' },
        { id: 'backend/engine/stateMachine.js', label: 'stateMachine.js (Lifecycle & Revisions)', desc: 'Proje durum makinesi, CAS geçişleri ve revizyon kilit yönetimi' },
        { id: 'backend/engine/fileProtocol.js', label: 'fileProtocol.js (Agent=Klasör)', desc: 'projects/<id> altında canlı protokol dosyalarını yöneten motor' },
        { id: 'backend/engine/codeGenerator.js', label: 'codeGenerator.js (Scaffold Guard)', desc: '.env, Next 14.2, Vite ve Express şablon koruması' },
        { id: 'backend/engine/selfCorrection.js', label: 'selfCorrection.js (Review Loop)', desc: 'Coder-Reviewer 2 turlu denetim ve veto döngüsü' }
    ];

    engine.forEach(e => {
        addNode(e.id, e.label, 'EngineCore', 'engine', e.id, e.desc);
    });

    addLink('backend/engine/workflow.js', 'backend/engine/dag.js', 'executes_waves');
    addLink('backend/engine/workflow.js', 'backend/engine/fileProtocol.js', 'manages_files');
    addLink('backend/engine/workflow.js', 'backend/engine/codeGenerator.js', 'triggers_scaffold');
    addLink('backend/engine/workflow.js', 'backend/engine/selfCorrection.js', 'runs_review_loop');
    addLink('backend/engine/workflow.js', 'backend/agents/index.js', 'dispatches_agents');
    addLink('backend/engine/workflow.js', 'backend/engine/stateMachine.js', 'guards_states');

    // 4. Server & Backend Services (Group 4: Green)
    const backendServices = [
        { id: 'backend/server.js', label: 'server.js (Express & WSS)', desc: 'REST API sunucusu ve Sec-WebSocket-Protocol yayıncısı' },
        { id: 'backend/db.js', label: 'db.js (SQLite WAL & State)', desc: 'SQLite WAL modu, users, projects, logs ve workflow_state kalıcılığı' },
        { id: 'backend/projectRepository.js', label: 'projectRepository.js (Canonical Store)', desc: 'Kanonik proje CRUD, atomik SQLite işlemleri, disk-varlık kontrolleri ve .trash izolasyonu' },
        { id: 'backend/services/reconciliationService.js', label: 'services/reconciliationService.js (Disk-DB Sync)', desc: 'Disk ve SQLite arasında çift yönlü senkronizasyon, eksik klasör tespiti ve otomatik proje kaydı' },
        { id: 'backend/executionClient.js', label: 'executionClient.js (Worker Client & Host Fallback)', desc: 'İzole execution worker HTTP istemcisi ve yerel host derleyici fallback köprüsü' },
        { id: 'execution/server.js', label: 'execution/server.js (Execution Worker)', desc: 'Ayrık mimari derleme/test çalıştırma worker servisi' },
        { id: 'backend/auth.js', label: 'auth.js (Scrypt & RBAC)', desc: 'Scrypt parola hashleme, timingSafeEqual ve rol erişim kontrolü' },
        { id: 'backend/security.js', label: 'security.js (Security Guard)', desc: 'Path traversal filtresi, sanitizasyon ve WS subprotocol token doğrulama' },
        { id: 'backend/llm.js', label: 'llm.js (Multi-Provider AI)', desc: 'Gemini 3.7 Flash, OpenAI ve SDK/REST fallback yönlendirici' },
        { id: 'backend/routes/projectRoutes.js', label: 'routes/projectRoutes.js', desc: 'Proje CRUD, Chat, Onay ve Revizyon uç noktaları' },
        { id: 'backend/routes/authRoutes.js', label: 'routes/authRoutes.js', desc: 'Login ve session yetkilendirme rotaları' },
        { id: 'backend/contracts/projectContract.js', label: 'contracts/projectContract.js', desc: 'Proje sözleşme doğrulama şemaları, gereksinimler ve tip denetimi' },
        { id: 'backend/contracts/domainPolicy.js', label: 'contracts/domainPolicy.js', desc: 'Domain önceliklendirme, katman kuralları ve domain uyumluluğu' },
        { id: 'backend/contracts/traceability.js', label: 'contracts/traceability.js', desc: 'Gereksinim, görev ve dosya izlenebilirlik matrisi motoru' },
        { id: 'backend/verification/qualityPolicy.js', label: 'verification/qualityPolicy.js (Quality Gates)', desc: '18 zorunlu kalite kapısı ve fail-closed bağımsız sandbox doğrulama politikası' },
        { id: 'backend/verification/artifactVerifier.js', label: 'verification/artifactVerifier.js', desc: 'Temiz oda ZIP arşivleme, SHA-256 sağlama ve artefakt doğrulayıcısı' },
        { id: 'backend/verification/securityVerifier.js', label: 'verification/securityVerifier.js', desc: 'CORS, hardcoded secret, SQL enjeksiyonu ve güvenlik baseline denetleyicisi' },
        { id: 'backend/verification/sandboxRunner.js', label: 'verification/sandboxRunner.js', desc: 'İzole alt süreç yürütücüsü ve sandbox adaptör köprüsü' },
        { id: 'backend/verification/databaseVerifier.js', label: 'verification/databaseVerifier.js', desc: 'Prisma şema varlığı, db push ve veritabanı yazma/okuma kabiliyeti denetleyicisi' },
        { id: 'backend/verification/apiVerifier.js', label: 'verification/apiVerifier.js', desc: 'REST HTTP yanıtları ve veritabanı durum mutasyonları sözleşme denetleyicisi' },
        { id: 'backend/websocketHub.js', label: 'websocketHub.js', desc: 'Canlı telemetri yayını, rate limiting ve yetkili kullanıcı soket yöneticisi' },
        { id: 'scripts/dev.mjs', label: 'scripts/dev.mjs (Unified Dev Runner)', desc: 'Backend, frontend ve execution worker servislerini başlatan birleşik geliştirici koşucusu' }
    ];

    backendServices.forEach(b => {
        addNode(b.id, b.label, 'BackendService', 'backend', b.id, b.desc);
    });

    addLink('backend/server.js', 'backend/routes/projectRoutes.js', 'mounts');
    addLink('backend/server.js', 'backend/routes/authRoutes.js', 'mounts');
    addLink('backend/routes/projectRoutes.js', 'backend/engine/workflow.js', 'triggers_workflow');
    addLink('backend/routes/projectRoutes.js', 'backend/agents/agentLoader.js', 'reads_docs');
    addLink('backend/routes/projectRoutes.js', 'backend/llm.js', 'calls_ai');
    addLink('backend/engine/workflow.js', 'backend/llm.js', 'calls_ai');
    addLink('backend/engine/workflow.js', 'backend/db.js', 'persists_state');
    addLink('backend/server.js', 'backend/auth.js', 'authenticates');
    addLink('backend/server.js', 'backend/security.js', 'secures');
    addLink('backend/routes/projectRoutes.js', 'backend/projectRepository.js', 'persists_projects');
    addLink('backend/routes/projectRoutes.js', 'backend/services/reconciliationService.js', 'reconciles_disk');
    addLink('backend/routes/projectRoutes.js', 'backend/engine/stateMachine.js', 'validates_revisions');
    addLink('backend/engine/workflow.js', 'backend/executionClient.js', 'delegates_execution');
    addLink('backend/executionClient.js', 'execution/server.js', 'dispatches_jobs');

    // 5. Frontend UI & Components (Group 5: Amber/Orange)
    const frontend = [
        { id: 'frontend/src/App.jsx', label: 'App.jsx (Main Container)', desc: 'React 18 ana panel koordinatörü ve WebSocket canlı istemcisi' },
        { id: 'frontend/src/components/Sidebar.jsx', label: 'Sidebar.jsx', desc: 'Sol menü, arama, pin, ZIP indirme ve güvenli silme işlemleri' },
        { id: 'frontend/src/components/Header.jsx', label: 'Header.jsx', desc: 'Üst menü, sekme geçişleri ve süreç kontrol butonları' },
        { id: 'frontend/src/components/ChatView.jsx', label: 'ChatView.jsx', desc: 'Manager Sohbet, beyin fırtınası ve revizyon paneli' },
        { id: 'frontend/src/components/DAGFlowView.jsx', label: 'DAGFlowView.jsx', desc: 'ReactFlow canlı DAG akış şeması ve log tablosu' },
        { id: 'frontend/src/components/DashboardView.jsx', label: 'DashboardView.jsx (Kalite & Kanıt Paneli)', desc: '18 kalite kapısı, doğrulama koşuları ve sansürlenmiş konsol logları salt-okunur denetim paneli' },
        { id: 'frontend/src/utils/dagLayout.js', label: 'utils/dagLayout.js (6-Agent DAG Layout)', desc: '6 gerçek ajan rolünü (Manager, Director, Teamleader, Coder, Reviewer, Tester) ve gerçek görevleri yerleştiren hiyerarşik layout motoru' },
        { id: 'frontend/src/components/IDEView.jsx', label: 'IDEView.jsx', desc: 'Monaco Editor kaynak kod inceleyici' },
        { id: 'frontend/src/components/LogsView.jsx', label: 'LogsView.jsx', desc: 'Süreç logları, VETO, FEEDBACK filtreleme ve telemetri izleme tam ekranı' },
        { id: 'frontend/src/components/LoginView.jsx', label: 'LoginView.jsx', desc: 'Admin kullanıcı girişi, MFA/TOTP formu ve oturum başlatma ekranı' },
        { id: 'frontend/src/components/ConnectionStatus.jsx', label: 'ConnectionStatus.jsx', desc: 'WebSocket anlık bağlantı durumu ve kopma/yeniden bağlanma bildirim rozeti' },
        { id: 'frontend/src/services/api.js', label: 'services/api.js', desc: 'HttpOnly server-session ve CSRF uyumlu API istemcisi' }
    ];

    frontend.forEach(f => {
        addNode(f.id, f.label, 'FrontendComponent', 'frontend', f.id, f.desc);
        if (f.id !== 'frontend/src/services/api.js') {
            addLink('frontend/src/App.jsx', f.id, 'renders');
        }
    });

    addLink('frontend/src/App.jsx', 'frontend/src/services/api.js', 'uses');
    addLink('frontend/src/services/api.js', 'backend/server.js', 'http_and_ws');
    addLink('frontend/src/components/DAGFlowView.jsx', 'frontend/src/utils/dagLayout.js', 'computes_layout');

    // 6. Test Suites (Group 6: Red)
    const tests = [
        { id: 'backend/tests/test_runner.js', label: 'test_runner.js (Master Runner)', desc: 'npm test master koşucusu' },
        { id: 'backend/tests/test_test_harness.js', label: 'test_test_harness.js', desc: 'Asenkron test koşucu altyapısı' },
        { id: 'backend/tests/test_http_integration.js', label: 'test_http_integration.js', desc: 'HTTP REST, Cookie ve Session testleri' },
        { id: 'backend/tests/test_websocket_integration.js', label: 'test_websocket_integration.js', desc: 'WebSocket project-scoped telemetri testleri' },
        { id: 'backend/tests/test_backend.js', label: 'test_backend.js (31 Test)', desc: 'Scrypt, revocable session, CSRF, RBAC ve RateLimit' },
        { id: 'backend/tests/test_admin_cli.js', label: 'test_admin_cli.js', desc: 'CLI admin provisioning ve parola doğrulama' },
        { id: 'backend/tests/test_project_repository.js', label: 'test_project_repository.js', desc: 'Kanonik proje deposu ve SQLite işlemleri' },
        { id: 'backend/tests/test_workflow_attempts.js', label: 'test_workflow_attempts.js', desc: 'Lease recovery ve dayanıklı iş akışı kilitleri' },
        { id: 'backend/tests/test_cancellation_and_deadlines.js', label: 'test_cancellation_and_deadlines.js', desc: 'Kooperatif iptal ve 60s LLM deadline' },
        { id: 'backend/tests/test_generation_isolation.js', label: 'test_generation_isolation.js', desc: 'Kod üretim kotası ve metadata guard' },
        { id: 'backend/tests/test_subprocess_sandbox.js', label: 'test_subprocess_sandbox.js', desc: 'İzole alt süreç sandbox ve gizli anahtar temizliği' },
        { id: 'backend/tests/test_agent_contract_schemas.js', label: 'test_agent_contract_schemas.js', desc: 'Ajan JSON sözleşme şemaları ve tip denetimi' },
        { id: 'backend/tests/test_database_migrations.js', label: 'test_database_migrations.js', desc: 'SQLite WAL sıralı migration motoru' },
        { id: 'backend/tests/test_health_and_lifecycle.js', label: 'test_health_and_lifecycle.js', desc: 'Liveness /readyz probları ve graceful shutdown' },
        { id: 'backend/tests/test_concurrency_pool.js', label: 'test_concurrency_pool.js', desc: 'LLM eşzamanlılık havuzu (limit=2)' },
        { id: 'backend/tests/test_build_validator.js', label: 'test_build_validator.js', desc: 'tsc --noEmit ve prisma validate derleyici' },
        { id: 'backend/tests/test_quality_gate.js', label: 'test_quality_gate.js (40 Test)', desc: 'Prisma şema uyumu ve fail-closed kalite kapısı' },
        { id: 'backend/tests/test_docs_agent_sync.js', label: 'test_docs_agent_sync.js (8 Test)', desc: 'Docs/*.md ile canlı ajan prompt senkronizasyonu' },
        { id: 'backend/tests/test_deep_verification.js', label: 'test_deep_verification.js (17 Test)', desc: 'DAG motoru, dalga seviyeleme ve JSON onarım' },
        { id: 'backend/tests/test_tur2_edge_cases.js', label: 'test_tur2_edge_cases.js (8 Test)', desc: 'Döngü stresi, ayrık graf ve path traversal' },
        { id: 'backend/tests/test_runtime_verification.js', label: 'test_runtime_verification.js (6 Test)', desc: 'Sentaks denetimi, checkpoint veto ve dalga' },
        { id: 'backend/tests/test_e2e_simulation.js', label: 'test_e2e_simulation.js (1 Test)', desc: 'Uçtan uca otonom pipeline simülasyonu' },
        { id: 'backend/tests/test_disk_sync_and_isolation.js', label: 'test_disk_sync_and_isolation.js (4 Test)', desc: 'Çift yönlü disk senkronizasyonu ve sandbox izolasyonu' },
        { id: 'backend/tests/test_manager_error_telemetry.js', label: 'test_manager_error_telemetry.js', desc: 'Manager hata telemetrisi, revizyon kilit açma ve host fallback testleri' },
        { id: 'frontend/src/utils/__tests__/dagLayout.test.js', label: 'dagLayout.test.js', desc: 'DAG layout 6-ajan hiyerarşisi ve dummy düğüm temizlik testleri' },
        { id: 'backend/tests/test_scaffold_auth_standards.js', label: 'test_scaffold_auth_standards.js', desc: 'Pragmatik auth ve seed iskele standartları birim testleri' },
        { id: 'backend/tests/test_project_state_rehydration.js', label: 'test_project_state_rehydration.js (4 Test)', desc: 'Diskteki projeleri SQLite DB canlandırma, chat ve log senkronizasyon testleri' },
        { id: 'backend/tests/test_project_action_chat_audit.js', label: 'test_project_action_chat_audit.js', desc: 'Kalıcı sohbet aksiyon mesajları, idempotency, hata davranışı ve silme kapsamı testleri' },
        { id: 'frontend/src/components/__tests__/DashboardView.test.jsx', label: 'DashboardView.test.jsx', desc: 'Salt-okunur yetki sınırı, kanıt izolasyonu ve sansürlü log render birim testleri' },
        { id: 'e2e/dashboard.spec.js', label: 'dashboard.spec.js (Playwright E2E)', desc: 'Kalite paneli uçtan uca tarayıcı denetimi, yetki izolasyonu ve yeniden derleme izlenebilirliği' },
        { id: 'e2e/trust-chain.spec.js', label: 'trust-chain.spec.js (Playwright E2E)', desc: 'Güven zinciri, CAS revizyonu ve doğrulanmış ZIP indirme uçtan uca kabul testi' },
        { id: 'e2e/p9-editor.spec.js', label: 'p9-editor.spec.js (Playwright E2E)', desc: 'Monaco Editor yerel yükleme ve güvenli kodlu dosya önizleme testi' },
        { id: 'e2e/production-operability.spec.js', label: 'production-operability.spec.js (Playwright E2E)', desc: 'Üretim HTTPS/WSS origin, CSP ve operasyonel kabul testi' }
    ];

    tests.forEach(t => {
        addNode(t.id, t.label, 'TestSuite', 'tests', t.id, t.desc);
    });

    addLink('backend/tests/test_backend.js', 'backend/server.js', 'verifies');
    addLink('backend/tests/test_quality_gate.js', 'backend/engine/workflow.js', 'verifies');
    addLink('backend/tests/test_deep_verification.js', 'backend/engine/dag.js', 'verifies');
    addLink('backend/tests/test_docs_agent_sync.js', 'backend/agents/agentLoader.js', 'verifies');
    addLink('backend/tests/test_disk_sync_and_isolation.js', 'backend/projectPaths.js', 'verifies');
    addLink('backend/tests/test_build_validator.js', 'backend/engine/buildValidator.js', 'verifies');
    addLink('backend/tests/test_workflow_attempts.js', 'backend/workflowAttempts.js', 'verifies');
    addLink('backend/tests/test_cancellation_and_deadlines.js', 'backend/engine/cancellation.js', 'verifies');
    addLink('backend/tests/test_manager_error_telemetry.js', 'backend/engine/workflow.js', 'verifies');
    addLink('backend/tests/test_manager_error_telemetry.js', 'backend/routes/projectRoutes.js', 'verifies');
    addLink('frontend/src/utils/__tests__/dagLayout.test.js', 'frontend/src/utils/dagLayout.js', 'verifies');
    addLink('backend/tests/test_scaffold_auth_standards.js', 'backend/engine/codeGenerator.js', 'verifies');
    addLink('backend/tests/test_project_action_chat_audit.js', 'backend/routes/projectRoutes.js', 'verifies');
    addLink('backend/tests/test_project_action_chat_audit.js', 'backend/projectRepository.js', 'verifies');
    addLink('backend/tests/test_project_state_rehydration.js', 'backend/services/reconciliationService.js', 'verifies');
    addLink('frontend/src/components/DashboardView.jsx', 'frontend/src/services/api.js', 'uses');
    addLink('frontend/src/components/__tests__/DashboardView.test.jsx', 'frontend/src/components/DashboardView.jsx', 'verifies');
    addLink('e2e/dashboard.spec.js', 'frontend/src/components/DashboardView.jsx', 'verifies');
    addLink('e2e/dashboard.spec.js', 'backend/routes/projectRoutes.js', 'verifies');
    addLink('frontend/src/services/api.js', 'backend/routes/projectRoutes.js', 'consumes_api');
    addLink('backend/engine/workflow.js', 'backend/contracts/projectContract.js', 'validates_contracts');
    addLink('backend/engine/workflow.js', 'backend/verification/qualityPolicy.js', 'enforces_quality');
    addLink('backend/verification/qualityPolicy.js', 'backend/verification/artifactVerifier.js', 'delegates_verification');
    addLink('backend/verification/qualityPolicy.js', 'backend/verification/securityVerifier.js', 'runs_security_checks');
    addLink('backend/verification/qualityPolicy.js', 'backend/verification/databaseVerifier.js', 'checks_database');
    addLink('backend/verification/qualityPolicy.js', 'backend/verification/apiVerifier.js', 'verifies_apis');
    addLink('backend/verification/qualityPolicy.js', 'backend/verification/sandboxRunner.js', 'executes_sandbox');
    addLink('backend/verification/qualityPolicy.js', 'backend/contracts/traceability.js', 'enforces_traceability');
    addLink('backend/routes/projectRoutes.js', 'backend/verification/qualityPolicy.js', 'queries_verification');
    addLink('backend/routes/projectRoutes.js', 'backend/contracts/projectContract.js', 'validates_schema');
    addLink('backend/server.js', 'backend/websocketHub.js', 'manages_websockets');
    addLink('scripts/dev.mjs', 'backend/server.js', 'launches_server');
    addLink('scripts/dev.mjs', 'execution/server.js', 'launches_worker');
    addLink('frontend/src/components/Header.jsx', 'frontend/src/components/ConnectionStatus.jsx', 'renders');
    addLink('frontend/src/components/LogsView.jsx', 'frontend/src/services/api.js', 'uses');
    addLink('frontend/src/components/LoginView.jsx', 'frontend/src/services/api.js', 'uses');
    addLink('e2e/trust-chain.spec.js', 'backend/verification/artifactVerifier.js', 'verifies');
    addLink('e2e/p9-editor.spec.js', 'frontend/src/components/IDEView.jsx', 'verifies');
    addLink('e2e/production-operability.spec.js', 'backend/server.js', 'verifies');

    // Source-derived nodes and imports keep the map aligned with the real tree.
    // Curated edges above add architectural meaning; they must still resolve.
    const sourceGraph = await buildSourceGraph(ROOT_DIR);
    assertCuratedNodesExist(nodes, sourceGraph.nodes);
    for (const node of sourceGraph.nodes) {
        if (!nodeMap.has(node.id)) addNode(node.id, node.label, node.type, node.group, node.file, node.description);
    }
    for (const entry of getRunnableTestFiles()) {
        addLink('backend/tests/test_runner.js', `backend/tests/${entry.file}`, 'runs');
    }
    for (const link of sourceGraph.links) addLink(link.source, link.target, link.label);
    const dangling = links.filter(link => !nodeMap.has(link.source) || !nodeMap.has(link.target));
    if (dangling.length) {
        throw new Error(`Graphify has unresolved architectural links: ${dangling.map(link => `${link.source} -> ${link.target}`).join(', ')}`);
    }

    const graphData = { nodes, links };
    await fs.writeFile(path.join(OUT_DIR, 'graph.json'), JSON.stringify(graphData, null, 2), 'utf8');

    // Calculate node degrees dynamically
    const degreeMap = new Map();
    links.forEach(l => {
        degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1);
        degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1);
    });

    const topNodes = [...nodes]
        .map(n => ({ ...n, degree: degreeMap.get(n.id) || 0 }))
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 6);

    const godNodesText = topNodes
        .map((n, i) => `${i + 1}. **${n.id}**: ${n.degree} bağlantı — ${n.description || n.label}`)
        .join('\n');

    // Generate GRAPH_REPORT.md
    const reportMd = `# 🧠 XFactor Bilgi Grafiği Raporu (Graphify)

**Oluşturulma Tarihi:** ${new Date().toISOString().split('T')[0]}
**Toplam Düğüm (Nodes):** ${nodes.length}
**Toplam Bağlantı (Edges):** ${links.length}
**Modül Toplulukları:** 6 Temel Alt Sistem (Docs, Agents, Engine, Backend, Frontend, Tests)

Kaynak dosyaları ve yerel import/export bağlantıları AST taramasından; imports dışındaki mimari bağlantılar açıklamalı, elle tanımlanmış ilişkilerden gelir. Paket importları ve dinamik importlar bu grafiğe dahil değildir.

---

## 🌟 Çekirdek Odak Düğümleri ("God Nodes" & Merkez Bileşenler)
${godNodesText}

---

## 🎨 Alt Sistem Toplulukları (Communities)

| Renk Kodu | Topluluk | Dosya Sayısı | Açıklama |
|:---:|---|:---:|---|
| 🟣 **Mor** | **Docs & Anayasa** | ${nodes.filter(n => n.group === 'docs').length} Dosya | docs/ORKESTRASYON-TALIMATNAMESI.md, ajan kuralları ve SDD iyileştirme planları. |
| 🟣 **Eflatun** | **Agents** | ${nodes.filter(n => n.group === 'agents').length} Dosya | Ajan tanımları, registry ve şema ayrıştırıcıları. |
| 🔵 **Mavi** | **Engine** | ${nodes.filter(n => n.group === 'engine').length} Dosya | DAG motoru, durum makinesi, dalga seviyelendirme, dosya protokolü ve scaffold guard. |
| 🟢 **Yeşil** | **Backend & API** | ${nodes.filter(n => n.group === 'backend').length} Dosya | Express server, SQLite WAL, projectRepository, reconciliationService, executionClient, auth ve LLM yönlendirici. |
| 🟠 **Turuncu** | **Frontend** | ${nodes.filter(n => n.group === 'frontend').length} Dosya | React 18, Sidebar, Header, ChatView, DAGFlowView, dagLayout, Monaco IDE. |
| 🔴 **Kırmızı** | **Tests** | ${nodes.filter(n => n.group === 'tests').length} Dosya | Merkezi backend ve frontend davranış süitleri ve master test koşucu. |

---

## 📊 Görsel Haritalar
- **İnteraktif 2D Ağ Grafiği:** graphify-out/graph.html
- **Hiyerarşik Ağaç Görünümü (seçilmiş mimari bileşenler):** graphify-out/GRAPH_TREE.html
`;

    await fs.writeFile(path.join(OUT_DIR, 'GRAPH_REPORT.md'), reportMd, 'utf8');

    // Generate Interactive D3 graph.html
    const htmlContent = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>XFactor — Kod Bilgi Grafiği (Knowledge Graph)</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e2e8f0;
    }
    #header {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 10;
      background: rgba(15, 23, 42, 0.9);
      padding: 14px 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px);
    }
    h1 {
      margin: 0 0 6px 0;
      font-size: 18px;
      font-weight: 700;
      background: linear-gradient(135deg, #60a5fa, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p {
      margin: 0;
      font-size: 12px;
      color: #94a3b8;
    }
    .legend {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(255,255,255,0.05);
    }
    .legend-color {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    #sidebar {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 320px;
      max-height: calc(100vh - 32px);
      background: rgba(15, 23, 42, 0.95);
      padding: 20px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      backdrop-filter: blur(10px);
      z-index: 10;
      display: none;
      overflow-y: auto;
    }
    #sidebar h3 {
      margin-top: 0;
      font-size: 16px;
      color: #38bdf8;
    }
    #sidebar p {
      font-size: 13px;
      line-height: 1.5;
      color: #cbd5e1;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    svg {
      width: 100vw;
      height: 100vh;
    }
    .links line {
      stroke: #334155;
      stroke-opacity: 0.6;
      stroke-width: 1.5px;
    }
    .nodes circle {
      stroke: #ffffff;
      stroke-width: 1.5px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .nodes circle:hover {
      stroke: #38bdf8;
      stroke-width: 3px;
      filter: drop-shadow(0 0 8px #38bdf8);
    }
    .labels text {
      font-size: 10px;
      fill: #cbd5e1;
      pointer-events: none;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }
  </style>
</head>
<body>

  <div id="header">
    <h1>⚡ XFactor Bilgi Grafiği (Knowledge Graph)</h1>
    <p>AST & Mimari İlişki Haritası • Düğümleri sürükleyebilir ve tıklayarak detayları inceleyebilirsiniz.</p>
    <div class="legend">
      <div class="legend-item"><div class="legend-color" style="background: #a855f7;"></div>Docs & Anayasa</div>
      <div class="legend-item"><div class="legend-color" style="background: #8b5cf6;"></div>Ajanlar</div>
      <div class="legend-item"><div class="legend-color" style="background: #3b82f6;"></div>Engine (DAG & Waves)</div>
      <div class="legend-item"><div class="legend-color" style="background: #10b981;"></div>Backend & API</div>
      <div class="legend-item"><div class="legend-color" style="background: #f59e0b;"></div>Frontend UI</div>
      <div class="legend-item"><div class="legend-color" style="background: #ef4444;"></div>Test Süiti</div>
    </div>
  </div>

  <div id="sidebar">
    <span id="node-type" class="badge"></span>
    <h3 id="node-title">Bileşen Adı</h3>
    <p id="node-desc"></p>
    <p style="margin-top: 12px; font-family: monospace; font-size: 11px; color: #64748b;" id="node-file"></p>
  </div>

  <svg></svg>

  <script>
    const graph = ${JSON.stringify(graphData)};

    const colorMap = {
      docs: '#a855f7',
      agents: '#8b5cf6',
      engine: '#3b82f6',
      backend: '#10b981',
      frontend: '#f59e0b',
      tests: '#ef4444'
    };

    const width = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select("svg")
      .attr("viewBox", [0, 0, width, height]);

    const g = svg.append("g");

    svg.call(d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.2, 4])
      .on("zoom", ({transform}) => g.attr("transform", transform)));

    const simulation = d3.forceSimulation(graph.nodes)
      .force("link", d3.forceLink(graph.links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => Math.sqrt(d.val) * 12 + 10));

    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graph.links)
      .join("line");

    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(graph.nodes)
      .join("circle")
      .attr("r", d => Math.sqrt(d.val) * 8 + 6)
      .attr("fill", d => colorMap[d.group] || '#94a3b8')
      .call(drag(simulation))
      .on("click", (event, d) => {
        const sidebar = document.getElementById("sidebar");
        sidebar.style.display = "block";
        document.getElementById("node-title").innerText = d.label;
        document.getElementById("node-desc").innerText = d.description || "Açıklama bulunmuyor.";
        document.getElementById("node-file").innerText = "Dosya: " + d.file;
        const typeBadge = document.getElementById("node-type");
        typeBadge.innerText = d.type;
        typeBadge.style.background = colorMap[d.group] || '#334155';
        typeBadge.style.color = 'white';
      });

    const label = g.append("g")
      .attr("class", "labels")
      .selectAll("text")
      .data(graph.nodes)
      .join("text")
      .attr("dx", 14)
      .attr("dy", 4)
      .text(d => d.label);

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

      label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });

    function drag(simulation) {
      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
  </script>
</body>
</html>`;

    await fs.writeFile(path.join(OUT_DIR, 'graph.html'), htmlContent, 'utf8');

    // Generate GRAPH_TREE.html
    const treeHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>XFactor — Hiyerarşik Modül Ağacı</title>
  <style>
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 30px;
      margin: 0;
    }
    h1 {
      color: #38bdf8;
      font-size: 22px;
      margin-bottom: 20px;
    }
    .tree-container {
      max-width: 900px;
      background: #1e293b;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    ul {
      list-style-type: none;
      padding-left: 20px;
    }
    li {
      margin: 8px 0;
      line-height: 1.6;
    }
    .folder {
      font-weight: 700;
      color: #60a5fa;
    }
    .file {
      color: #cbd5e1;
    }
    .tag {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 6px;
      font-weight: 600;
    }
    .tag-doc { background: #9333ea; color: white; }
    .tag-agent { background: #7c3aed; color: white; }
    .tag-engine { background: #2563eb; color: white; }
    .tag-backend { background: #059669; color: white; }
    .tag-ui { background: #d97706; color: white; }
    .tag-test { background: #dc2626; color: white; }
  </style>
</head>
<body>
  <div class="tree-container">
    <h1>🌲 XFactor Hiyerarşik Modül ve Anayasa Ağacı</h1>
    <ul>
      <li><span class="file">📄 kullanici-kilavuzu.md</span> <span class="tag tag-doc">Kullanıcı Kılavuzu</span></li>
      <li><span class="folder">📁 docs/</span> (Platform Anayasası & Canlı Ajan Kuralları)
        <ul>
          <li><span class="file">📄 ORKESTRASYON-TALIMATNAMESI.md</span> <span class="tag tag-doc">Ana Anayasa v3</span></li>
          <li><span class="file">📄 OPERATIONS.md</span> <span class="tag tag-doc">Operasyon Kılavuzu & Üretim Sınırları</span></li>
          <li><span class="file">📄 manager.md</span> <span class="tag tag-doc">Manager Kuralı</span></li>
          <li><span class="file">📄 director.md</span> <span class="tag tag-doc">Director Kuralı</span></li>
          <li><span class="file">📄 teamleader.md</span> <span class="tag tag-doc">Teamleader Kuralı</span></li>
          <li><span class="file">📄 coder.md</span> <span class="tag tag-doc">Coder Kuralı</span></li>
          <li><span class="file">📄 reviewer.md</span> <span class="tag tag-doc">Reviewer Veto Kuralı</span></li>
          <li><span class="file">📄 tester.md</span> <span class="tag tag-doc">Tester QA Kuralı</span></li>
          <li><span class="folder">📁 superpowers/plans/</span>
            <ul>
              <li><span class="file">📄 2026-09-16-orchestration-remediation-plan.md</span> <span class="tag tag-doc">Orkestrasyon İyileştirme Planı</span></li>
              <li><span class="file">📄 2026-09-17-remediation-refinement-plan.md</span> <span class="tag tag-doc">İyileştirme Rafine Planı</span></li>
              <li><span class="file">📄 2026-09-17-pragmatic-auth-standard-plan.md</span> <span class="tag tag-doc">Pragmatik Auth Standart Planı</span></li>
              <li><span class="file">📄 2026-09-18-project-state-rehydration-plan.md</span> <span class="tag tag-doc">Proje Durumu Canlandırma Planı</span></li>
              <li><span class="file">📄 2026-09-19-accurate-project-state-and-artifact-plan.md</span> <span class="tag tag-doc">Doğru Durum ve Artefakt Planı</span></li>
              <li><span class="file">📄 2026-09-19-chat-action-audit-implementation-plan.md</span> <span class="tag tag-doc">Sohbet Aksiyon Denetim İzi Uygulama Planı</span></li>
              <li><span class="file">📄 2026-09-19-quality-dashboard-graphify-plan.md</span> <span class="tag tag-doc">Kalite Paneli Graphify Uygulama Planı</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 superpowers/specs/</span>
            <ul>
              <li><span class="file">📄 2026-09-19-chat-action-audit-design.md</span> <span class="tag tag-doc">Sohbet Aksiyon Denetim İzi Tasarımı</span></li>
              <li><span class="file">📄 2026-09-19-quality-dashboard-graphify-design.md</span> <span class="tag tag-doc">Kalite Paneli Graphify Tasarımı</span></li>
            </ul>
          </li>
        </ul>
      </li>
      <li><span class="folder">📁 backend/</span>
        <ul>
          <li><span class="folder">📁 agents/</span>
            <ul>
              <li><span class="file">📄 agentLoader.js</span> <span class="tag tag-agent">Living Docs Köprüsü</span></li>
              <li><span class="file">📄 index.js</span> <span class="tag tag-agent">Ajan Fabrikası</span></li>
              <li><span class="file">📄 schemas.js</span> <span class="tag tag-agent">JSON Parser & Repair</span></li>
              <li><span class="file">📄 manager.js</span> <span class="tag tag-agent">Manager Motoru</span></li>
              <li><span class="file">📄 director.js</span> <span class="tag tag-agent">Director Motoru</span></li>
              <li><span class="file">📄 teamleader.js</span> <span class="tag tag-agent">Teamleader Motoru</span></li>
              <li><span class="file">📄 coder.js</span> <span class="tag tag-agent">Coder Motoru</span></li>
              <li><span class="file">📄 reviewer.js</span> <span class="tag tag-agent">Reviewer Motoru</span></li>
              <li><span class="file">📄 tester.js</span> <span class="tag tag-agent">Tester Motoru</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 engine/</span>
            <ul>
              <li><span class="file">📄 workflow.js</span> <span class="tag tag-engine">Master Orchestrator</span></li>
              <li><span class="file">📄 dag.js</span> <span class="tag tag-engine">DAG & Waves</span></li>
              <li><span class="file">📄 stateMachine.js</span> <span class="tag tag-engine">Lifecycle & Revisions</span></li>
              <li><span class="file">📄 fileProtocol.js</span> <span class="tag tag-engine">Agent=Klasör</span></li>
              <li><span class="file">📄 codeGenerator.js</span> <span class="tag tag-engine">Scaffold Guard (.env)</span></li>
              <li><span class="file">📄 selfCorrection.js</span> <span class="tag tag-engine">2 Turlu Veto Döngüsü</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 contracts/</span>
            <ul>
              <li><span class="file">📄 projectContract.js</span> <span class="tag tag-engine">Sözleşme Doğrulama</span></li>
              <li><span class="file">📄 domainPolicy.js</span> <span class="tag tag-engine">Domain Önceliklendirme</span></li>
              <li><span class="file">📄 traceability.js</span> <span class="tag tag-engine">Gereksinim İzlenebilirliği</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 verification/</span>
            <ul>
              <li><span class="file">📄 qualityPolicy.js</span> <span class="tag tag-engine">18 Zorunlu Kalite Kapısı</span></li>
              <li><span class="file">📄 artifactVerifier.js</span> <span class="tag tag-engine">Temiz Oda ZIP Doğrulayıcısı</span></li>
              <li><span class="file">📄 securityVerifier.js</span> <span class="tag tag-engine">Güvenlik Baseline Denetleyicisi</span></li>
              <li><span class="file">📄 databaseVerifier.js</span> <span class="tag tag-engine">Veritabanı Uyum Denetleyicisi</span></li>
              <li><span class="file">📄 apiVerifier.js</span> <span class="tag tag-engine">REST API Sözleşme Denetleyicisi</span></li>
              <li><span class="file">📄 sandboxRunner.js</span> <span class="tag tag-engine">İzole Alt Süreç Yürütücüsü</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 routes/</span>
            <ul>
              <li><span class="file">📄 projectRoutes.js</span> <span class="tag tag-backend">CRUD, Chat & Revizyon</span></li>
              <li><span class="file">📄 authRoutes.js</span> <span class="tag tag-backend">Login & Session</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 services/</span>
            <ul>
              <li><span class="file">📄 reconciliationService.js</span> <span class="tag tag-backend">Disk-DB Çift Yönlü Sync</span></li>
            </ul>
          </li>
          <li><span class="file">📄 projectRepository.js</span> <span class="tag tag-backend">Kanonik Proje Deposu</span></li>
          <li><span class="file">📄 executionClient.js</span> <span class="tag tag-backend">Worker Client & Host Fallback</span></li>
          <li><span class="folder">📁 tests/</span>
            <ul>
              <li><span class="file">📄 test_runner.js</span> <span class="tag tag-test">Master Koşucu (npm test)</span></li>
              <li><span class="file">📄 test_test_harness.js</span> <span class="tag tag-test">Asenkron Test Koşucu</span></li>
              <li><span class="file">📄 test_http_integration.js</span> <span class="tag tag-test">HTTP REST, Cookie & Session</span></li>
              <li><span class="file">📄 test_websocket_integration.js</span> <span class="tag tag-test">WebSocket Telemetri</span></li>
              <li><span class="file">📄 test_backend.js</span> <span class="tag tag-test">Scrypt, Session & RBAC</span></li>
              <li><span class="file">📄 test_admin_cli.js</span> <span class="tag tag-test">Admin CLI & Parola</span></li>
              <li><span class="file">📄 test_project_repository.js</span> <span class="tag tag-test">Kanonik Proje Deposu</span></li>
              <li><span class="file">📄 test_workflow_attempts.js</span> <span class="tag tag-test">Lease Recovery & Kilit</span></li>
              <li><span class="file">📄 test_cancellation_and_deadlines.js</span> <span class="tag tag-test">İptal & Deadlines</span></li>
              <li><span class="file">📄 test_generation_isolation.js</span> <span class="tag tag-test">Kota & Metadata Guard</span></li>
              <li><span class="file">📄 test_subprocess_sandbox.js</span> <span class="tag tag-test">Alt Süreç Sandbox</span></li>
              <li><span class="file">📄 test_agent_contract_schemas.js</span> <span class="tag tag-test">Sözleşme Şemaları</span></li>
              <li><span class="file">📄 test_database_migrations.js</span> <span class="tag tag-test">SQLite Migration Motoru</span></li>
              <li><span class="file">📄 test_health_and_lifecycle.js</span> <span class="tag tag-test">Healthz / Readyz Probları</span></li>
              <li><span class="file">📄 test_concurrency_pool.js</span> <span class="tag tag-test">LLM Eşzamanlılık Havuzu</span></li>
              <li><span class="file">📄 test_build_validator.js</span> <span class="tag tag-test">tsc & prisma Derleyici</span></li>
              <li><span class="file">📄 test_quality_gate.js</span> <span class="tag tag-test">40 Testlik Kalite Kapısı</span></li>
              <li><span class="file">📄 test_docs_agent_sync.js</span> <span class="tag tag-test">Canlı Docs Senkronizasyonu</span></li>
              <li><span class="file">📄 test_project_state_rehydration.js</span> <span class="tag tag-test">Proje Durum Canlandırma</span></li>
              <li><span class="file">📄 test_project_action_chat_audit.js</span> <span class="tag tag-test">Kalıcı Sohbet Aksiyon Denetimi</span></li>
              <li><span class="file">📄 test_deep_verification.js</span> <span class="tag tag-test">17 Testlik DAG & JSON Onarım</span></li>
              <li><span class="file">📄 test_tur2_edge_cases.js</span> <span class="tag tag-test">8 Testlik Edge-Case Stresi</span></li>
              <li><span class="file">📄 test_runtime_verification.js</span> <span class="tag tag-test">6 Testlik Çalışma Zamanı</span></li>
              <li><span class="file">📄 test_e2e_simulation.js</span> <span class="tag tag-test">Uçtan Uca Otonom Pipeline</span></li>
              <li><span class="file">📄 test_disk_sync_and_isolation.js</span> <span class="tag tag-test">Disk Senkronizasyonu & İzolasyon</span></li>
              <li><span class="file">📄 test_scaffold_auth_standards.js</span> <span class="tag tag-test">Pragmatik Auth & Seed Standartları</span></li>
            </ul>
          </li>
          <li><span class="file">📄 server.js</span> <span class="tag tag-backend">Express & WSS</span></li>
          <li><span class="file">📄 websocketHub.js</span> <span class="tag tag-backend">Canlı Telemetri & Rate Limit</span></li>
          <li><span class="file">📄 db.js</span> <span class="tag tag-backend">SQLite WAL</span></li>
          <li><span class="file">📄 auth.js</span> <span class="tag tag-backend">Scrypt & RBAC</span></li>
          <li><span class="file">📄 security.js</span> <span class="tag tag-backend">Security Guard</span></li>
          <li><span class="file">📄 llm.js</span> <span class="tag tag-backend">Gemini 3.7 Flash</span></li>
      </li>
      <li><span class="folder">📁 execution/</span>
        <ul>
          <li><span class="file">📄 server.js</span> <span class="tag tag-engine">Execution Worker Servisi</span></li>
        </ul>
      </li>
      <li><span class="folder">📁 frontend/src/</span>
        <ul>
          <li><span class="file">📄 App.jsx</span> <span class="tag tag-ui">Ana Koordinatör & WS</span></li>
          <li><span class="file">📄 components/Sidebar.jsx</span> <span class="tag tag-ui">Sol Menü, Pin & ZIP İndir</span></li>
          <li><span class="file">📄 components/Header.jsx</span> <span class="tag tag-ui">Üst Menü & Sekmeler</span></li>
          <li><span class="file">📄 components/ChatView.jsx</span> <span class="tag tag-ui">Sohbet & Revizyon</span></li>
          <li><span class="file">📄 components/DAGFlowView.jsx</span> <span class="tag tag-ui">Canlı ReactFlow DAG</span></li>
          <li><span class="folder">📁 utils/</span>
            <ul>
              <li><span class="file">📄 dagLayout.js</span> <span class="tag tag-ui">6-Ajan Hiyerarşik DAG Motoru</span></li>
            </ul>
          </li>
          <li><span class="file">📄 components/IDEView.jsx</span> <span class="tag tag-ui">Monaco Editor</span></li>
          <li><span class="file">📄 components/DashboardView.jsx</span> <span class="tag tag-ui">Kalite & Kanıt Paneli</span></li>
          <li><span class="file">📄 components/LogsView.jsx</span> <span class="tag tag-ui">Süreç Logları & Filtreler</span></li>
          <li><span class="file">📄 components/LoginView.jsx</span> <span class="tag tag-ui">Admin Giriş & MFA Formu</span></li>
          <li><span class="file">📄 components/ConnectionStatus.jsx</span> <span class="tag tag-ui">WebSocket Durum Rozeti</span></li>
          <li><span class="file">📄 services/api.js</span> <span class="tag tag-ui">AuthFetch & WS Client</span></li>
        </ul>
      </li>
      <li><span class="folder">📁 e2e/</span>
        <ul>
          <li><span class="file">📄 dashboard.spec.js</span> <span class="tag tag-test">Dashboard E2E Kanıt Testi</span></li>
          <li><span class="file">📄 trust-chain.spec.js</span> <span class="tag tag-test">Güven Zinciri & ZIP Kabul Testi</span></li>
          <li><span class="file">📄 p9-editor.spec.js</span> <span class="tag tag-test">Monaco Editor Önizleme Testi</span></li>
          <li><span class="file">📄 production-operability.spec.js</span> <span class="tag tag-test">Üretim Operasyonel Kabul Testi</span></li>
        </ul>
      </li>
      <li><span class="folder">📁 scripts/</span>
        <ul>
          <li><span class="file">📄 dev.mjs</span> <span class="tag tag-backend">Unified Dev Runner</span></li>
        </ul>
      </li>
    </ul>
  </div>
</body>
</html>`;

    await fs.writeFile(path.join(OUT_DIR, 'GRAPH_TREE.html'), treeHtml, 'utf8');

    console.log("✓ Graphify Bilgi Grafiği ve Görsel HTML Haritaları Başarıyla Üretildi!");
    console.log(`  - JSON Grafiği: graphify-out/graph.json (${nodes.length} düğüm, ${links.length} bağlantı)`);
    console.log(`  - İnteraktif Harita: graphify-out/graph.html`);
    console.log(`  - Hiyerarşik Ağaç: graphify-out/GRAPH_TREE.html`);
    console.log(`  - Rapor: graphify-out/GRAPH_REPORT.md`);
}

extractCodeGraph().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
