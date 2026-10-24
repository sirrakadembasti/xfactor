/**
 * 🧠 XFactor Graphify Generator
 * Projedeki tüm kaynak kodları (backend, frontend, docs, engine, routes, tests)
 * AST ve import düzeyinde analiz ederek graphify-out/ altında görsel haritalar üretir.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSourceGraph, assertCuratedNodesExist } from './graphSource.js';
import { renderGraphHtml, renderTreeHtml, renderGraphReport } from './graphViews.js';
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

    function addNode(id, label, type, group, file, description = '', details = {}) {
        if (!nodeMap.has(id)) {
            const node = { id, label, type, group, file, description, val: 1, provenance: 'curated', ...details };
            nodeMap.set(id, node);
            nodes.push(node);
        } else {
            nodeMap.get(id).val += 1;
        }
        return id;
    }

    function addLink(source, target, label = 'connects', details = {}) {
        if (source && target && source !== target) {
            const key = `${source}\u0000${target}\u0000${label}`;
            if (linkKeys.has(key)) return;
            linkKeys.add(key);
            links.push({ source, target, label, provenance: 'curated', ...details });
            if (nodeMap.has(source)) nodeMap.get(source).val += 0.5;
            if (nodeMap.has(target)) nodeMap.get(target).val += 0.5;
        }
    }


    // 1. Docs & Anayasa Düğüm Grubu (Group 1: Purple)
    const docs = [
        { id: 'x-agents/ORKESTRASYON-TALIMATNAMESI.md', label: 'ORKESTRASYON-TALIMATNAMESI (Anayasa v5)', desc: 'Altı role ve Manager sohbetine tam metin aktarılan ortak platform politikası; kod ve şema denetimleri önceliklidir' },
        { id: 'x-agents/manager.md', label: 'x-agents/manager.md', desc: 'Manager Ajanı canlı kural ve mimari şartname dosyası' },
        { id: 'x-agents/director.md', label: 'x-agents/director.md', desc: 'Director Ajanı canlı domain şartname kuralları' },
        { id: 'x-agents/teamleader.md', label: 'x-agents/teamleader.md', desc: 'Teamleader Ajanı atomik görev ve DAG kuralları' },
        { id: 'x-agents/coder.md', label: 'x-agents/coder.md', desc: 'Coder Ajanı bileşen kompozisyonu ve kodlama kuralları' },
        { id: 'x-agents/reviewer.md', label: 'x-agents/reviewer.md', desc: 'Reviewer Ajanı kalite kapısı ve fail-closed veto kuralları' },
        { id: 'x-agents/tester.md', label: 'x-agents/tester.md', desc: 'Tester statik inceleme ve veto talimatları; bağımsız worker çalışma kanıtı üretir' },
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
        if (/^x-agents\/(manager|director|teamleader|coder|reviewer|tester)\.md$/.test(d.id)) {
            addLink('x-agents/ORKESTRASYON-TALIMATNAMESI.md', d.id, 'defines');
        }
    });

    // 2. Agents Grubu (Group 2: Violet)
    const agents = [
        { id: 'backend/agents/agentLoader.js', label: 'agentLoader.js (Trusted Agent Documents)', desc: 'Yalnız x-agents talimatlarını okuyup LLM promptlarına bağlayan köprü; eksik talimatta fail-closed' },
        { id: 'backend/agents/agentPaths.js', label: 'agentPaths.js (Agent Document Boundary)', desc: 'Sabit ajan kökü, rol/dosya izin listesi, junction/symlink ve proje yolu çakışma kontrolü' },
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
        if (/^backend\/agents\/(manager|director|teamleader|coder|reviewer|tester)\.js$/.test(a.id)) {
            addLink('backend/agents/index.js', a.id, 'registers');
        }
    });

    addLink('backend/agents/agentLoader.js', 'x-agents/ORKESTRASYON-TALIMATNAMESI.md', 'reads');
    for (const role of ['manager', 'director', 'teamleader', 'coder', 'reviewer', 'tester']) {
        addLink(`backend/agents/${role}.js`, 'backend/agents/agentLoader.js', 'composes_policy');
        addLink(`backend/agents/${role}.js`, 'x-agents/ORKESTRASYON-TALIMATNAMESI.md', 'inherits_policy');
    }
    addLink('backend/agents/manager.js', 'x-agents/manager.md', 'loads');
    addLink('backend/agents/director.js', 'x-agents/director.md', 'loads');
    addLink('backend/agents/teamleader.js', 'x-agents/teamleader.md', 'loads');
    addLink('backend/agents/coder.js', 'x-agents/coder.md', 'loads');
    addLink('backend/agents/reviewer.js', 'x-agents/reviewer.md', 'loads');
    addLink('backend/agents/tester.js', 'x-agents/tester.md', 'loads');
    addLink('backend/agents/manager.js', 'backend/agents/agentLoader.js', 'uses');
    addLink('backend/agents/coder.js', 'backend/agents/schemas.js', 'uses');

    // 3. Engine Grubu (Group 3: Blue)
    const engine = [
        { id: 'backend/engine/workflow.js', label: 'workflow.js (Master Orchestrator)', desc: 'Paralel DAG dalgalarını yürüten ana iş akışı komutanı' },
        { id: 'backend/engine/dag.js', label: 'dag.js (TaskDAG & Execution Waves)', desc: 'Topolojik sıra ve seviyeli dalga (wave) algoritması' },
        { id: 'backend/engine/stateMachine.js', label: 'stateMachine.js (Lifecycle & Revisions)', desc: 'Proje durum makinesi, CAS geçişleri ve revizyon kilit yönetimi' },
        { id: 'backend/engine/fileProtocol.js', label: 'fileProtocol.js (Agent=Klasör)', desc: 'projects/<id> altında canlı protokol dosyalarını yöneten motor' },
        { id: 'backend/engine/codeGenerator.js', label: 'codeGenerator.js (Scaffold Guard)', desc: '.env ve framework şablon koruması' },
        { id: 'backend/engine/selfCorrection.js', label: 'selfCorrection.js (Review Loop)', desc: 'İlk Reviewer incelemesi ve en fazla iki Coder düzeltmesi; çalışma kanıtı değildir' },
        { id: 'backend/engine/protocolIO.js', label: 'protocolIO.js (Protocol Boundary)', desc: 'İç içe protokol dosyaları için bounded okuma, link reddi ve korumalı yazım' },
        { id: 'backend/engine/checkpointIdentity.js', label: 'checkpointIdentity.js (Scoped Ownership)', desc: 'Sözleşme/domain/takım/görev kimliği ve konservatif eski checkpoint aidiyeti' },
        { id: 'backend/engine/checkpointRepository.js', label: 'checkpointRepository.js (Durable Evidence)', desc: 'Sürümlü görev aidiyeti, sözleşme ve lease kontrollü checkpoint kalıcılığı' },
        { id: 'backend/engine/workerRepairs.js', label: 'workerRepairs.js (Bounded Owner Repair)', desc: 'Kalıcı çağrı bütçesi, tekil sahiplik ve kaynak CAS ile worker bulgusu onarımı; taze inceleme ve worker kanıtı gerekir' }
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
    addLink('backend/engine/fileProtocol.js', 'backend/engine/protocolIO.js', 'guards_protocol_io');
    addLink('backend/engine/workflow.js', 'backend/engine/checkpointIdentity.js', 'qualifies_task_ownership');
    addLink('backend/engine/workflow.js', 'backend/engine/checkpointRepository.js', 'persists_reviewed_checkpoints');
    addLink('backend/engine/workflow.js', 'backend/engine/workerRepairs.js', 'routes_bounded_owner_repairs');

    // 4. Server & Backend Services (Group 4: Green)
    const backendServices = [
        { id: 'backend/server.js', label: 'server.js (Express & WSS)', desc: 'REST API ve cookie oturumuyla doğrulanan, 64 KiB sınırlı WebSocket yayıncısı' },
        { id: 'backend/db.js', label: 'db.js (SQLite WAL & State)', desc: 'SQLite WAL modu, users, projects, logs ve workflow_state kalıcılığı' },
        { id: 'backend/projectRepository.js', label: 'projectRepository.js (Canonical Store)', desc: 'Kanonik proje CRUD, atomik SQLite işlemleri, disk-varlık kontrolleri ve .trash izolasyonu' },
        { id: 'backend/services/reconciliationService.js', label: 'services/reconciliationService.js (Disk-DB Sync)', desc: 'Disk ve SQLite arasında çift yönlü senkronizasyon, eksik klasör tespiti ve otomatik proje kaydı' },
        { id: 'backend/executionClient.js', label: 'executionClient.js (Worker Client)', desc: 'Token doğrulamalı bağımsız worker HTTP istemcisi; yerel veya Docker profilinde artefakt doğrulama' },
        { id: 'execution/server.js', label: 'execution/server.js (Execution Worker)', desc: 'Ayrık mimari derleme/test çalıştırma worker servisi' },
        { id: 'backend/auth.js', label: 'auth.js (Scrypt & RBAC)', desc: 'Scrypt parola hashleme, timingSafeEqual ve rol erişim kontrolü' },
        { id: 'backend/security.js', label: 'security.js (Security Guard)', desc: 'Path traversal filtresi, sanitizasyon ve WS subprotocol token doğrulama' },
        { id: 'backend/llm.js', label: 'llm.js (Multi-Provider AI)', desc: 'Yapılandırılmış sağlayıcı/model adaptörleri ve sınırlı SDK/REST transport yönlendirmesi' },
        { id: 'backend/routes/projectRoutes.js', label: 'routes/projectRoutes.js', desc: 'Proje CRUD, Chat, Onay ve Revizyon uç noktaları' },
        { id: 'backend/routes/authRoutes.js', label: 'routes/authRoutes.js', desc: 'Login ve session yetkilendirme rotaları' },
        { id: 'backend/contracts/projectContract.js', label: 'contracts/projectContract.js', desc: 'Proje sözleşme doğrulama şemaları, gereksinimler ve tip denetimi' },
        { id: 'backend/contracts/domainPolicy.js', label: 'contracts/domainPolicy.js', desc: 'Domain önceliklendirme, katman kuralları ve domain uyumluluğu' },
        { id: 'backend/contracts/traceability.js', label: 'contracts/traceability.js', desc: 'Gereksinim, görev ve dosya izlenebilirlik matrisi motoru' },
        { id: 'backend/verification/qualityPolicy.js', label: 'verification/qualityPolicy.js (Quality Gates)', desc: '18 zorunlu kalite kapısı ve fail-closed bağımsız worker doğrulama politikası' },
        { id: 'backend/verification/artifactVerifier.js', label: 'verification/artifactVerifier.js', desc: 'Temiz oda ZIP arşivleme, SHA-256 sağlama ve artefakt doğrulayıcısı' },
        { id: 'backend/verification/workerFailures.js', label: 'workerFailures.js (Rejection Provenance)', desc: 'Sınırlandırılmış, sırları temizlenmiş worker diagnostic ve kalıcı ret kaydı; belirsiz/altyapı bulguları otomatik onarımı durdurur' },
        { id: 'backend/verification/verificationCli.js', label: 'verificationCli.js (Canonical Acceptance)', desc: 'Güncel sözleşme/lease altında kanonik worker kanıtı, onarım çözümü ve proje tamamlama geçişi' },
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
    addLink('backend/verification/artifactVerifier.js', 'backend/verification/workerFailures.js', 'records_worker_rejections');
    addLink('backend/engine/workflow.js', 'backend/verification/workerFailures.js', 'loads_current_rejections');
    addLink('backend/verification/verificationCli.js', 'backend/engine/workerRepairs.js', 'resolves_with_fresh_evidence');
    addLink('backend/services/reconciliationService.js', 'backend/engine/protocolIO.js', 'guards_recovery_metadata');
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
        { id: 'frontend/src/components/Header.jsx', label: 'Header.jsx', desc: 'Üst menü, sekme geçişleri ve duraklatılmış/doğrulama hatalı projeler için Resume' },
        { id: 'frontend/src/components/ChatView.jsx', label: 'ChatView.jsx', desc: 'Manager Sohbet, revizyon ve duraklatılmış/doğrulama hatalı projeler için Resume' },
        { id: 'frontend/src/components/DAGFlowView.jsx', label: 'DAGFlowView.jsx', desc: 'ReactFlow canlı DAG akış şeması ve log tablosu' },
        { id: 'frontend/src/components/DashboardView.jsx', label: 'DashboardView.jsx (Kalite & Kanıt Paneli)', desc: '18 kalite kapısı, doğrulama koşuları ve sansürlenmiş konsol logları salt-okunur denetim paneli' },
        { id: 'frontend/src/utils/dagLayout.js', label: 'utils/dagLayout.js (6-Agent DAG Layout)', desc: '6 gerçek ajan rolünü (Manager, Director, Teamleader, Coder, Reviewer, Tester) ve gerçek görevleri yerleştiren hiyerarşik layout motoru' },
        { id: 'frontend/src/components/LogsView.jsx', label: 'LogsView.jsx', desc: 'Süreç logları, VETO/FEEDBACK filtreleme ve duraklatılmış/doğrulama hatalı projeler için Resume' },
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
        { id: 'backend/tests/test_docs_agent_sync.js', label: 'test_docs_agent_sync.js', desc: 'x-agents/*.md ile altı ajan ve Manager sohbeti prompt senkronizasyonu' },
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
    addLink('e2e/production-operability.spec.js', 'backend/server.js', 'verifies');

    // Source-derived nodes and imports keep the map aligned with the real tree.
    // Curated edges above add architectural meaning; they must still resolve.
    const sourceGraph = await buildSourceGraph(ROOT_DIR);
    assertCuratedNodesExist(nodes, sourceGraph.nodes);
    for (const node of sourceGraph.nodes) {
        if (!nodeMap.has(node.id)) addNode(node.id, node.label, node.type, node.group, node.file, node.description, { line: node.line, provenance: 'ast' });
    }
    for (const entry of getRunnableTestFiles()) {
        addLink('backend/tests/test_runner.js', `backend/tests/${entry.file}`, 'runs');
    }
    for (const link of sourceGraph.links) addLink(link.source, link.target, link.label, { provenance: link.provenance, location: link.location });
    const dangling = links.filter(link => !nodeMap.has(link.source) || !nodeMap.has(link.target));
    if (dangling.length) {
        throw new Error(`Graphify has unresolved architectural links: ${dangling.map(link => `${link.source} -> ${link.target}`).join(', ')}`);
    }

    const graphData = { nodes, links };
    await fs.writeFile(path.join(OUT_DIR, 'graph.json'), JSON.stringify(graphData, null, 2), 'utf8');

    await fs.writeFile(path.join(OUT_DIR, 'graph.html'), renderGraphHtml(graphData), 'utf8');
    await fs.writeFile(path.join(OUT_DIR, 'GRAPH_TREE.html'), renderTreeHtml(graphData), 'utf8');
    await fs.writeFile(path.join(OUT_DIR, 'GRAPH_REPORT.md'), renderGraphReport(graphData), 'utf8');

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
