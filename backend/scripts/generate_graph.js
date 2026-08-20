/**
 * 🧠 XFactor Graphify Generator
 * Projedeki tüm kaynak kodları (backend, frontend, docs, engine, routes, tests)
 * AST ve import düzeyinde analiz ederek graphify-out/ altında görsel haritalar üretir.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT_DIR, 'graphify-out');

async function extractCodeGraph() {
    await fs.mkdir(OUT_DIR, { recursive: true });

    const nodes = [];
    const links = [];
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
        { id: 'docs/KULLANIM-KILAVUZU.md', label: 'docs/KULLANIM-KILAVUZU.md', desc: 'A\'dan Z\'ye operasyon ve kullanım kılavuzu' }
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

    // 4. Server & Backend Services (Group 4: Green)
    const backendServices = [
        { id: 'backend/server.js', label: 'server.js (Express & WSS)', desc: 'REST API sunucusu ve Sec-WebSocket-Protocol yayıncısı' },
        { id: 'backend/db.js', label: 'db.js (SQLite WAL & State)', desc: 'SQLite WAL modu, users, projects, logs ve workflow_state kalıcılığı' },
        { id: 'backend/auth.js', label: 'auth.js (Scrypt & RBAC)', desc: 'Scrypt parola hashleme, timingSafeEqual ve rol erişim kontrolü' },
        { id: 'backend/security.js', label: 'security.js (Security Guard)', desc: 'Path traversal filtresi, sanitizasyon ve WS subprotocol token doğrulama' },
        { id: 'backend/llm.js', label: 'llm.js (Multi-Provider AI)', desc: 'Gemini 3.7 Flash, OpenAI ve SDK/REST fallback yönlendirici' },
        { id: 'backend/routes/projectRoutes.js', label: 'routes/projectRoutes.js', desc: 'Proje CRUD, Chat, Onay ve Revizyon uç noktaları' },
        { id: 'backend/routes/authRoutes.js', label: 'routes/authRoutes.js', desc: 'Login ve session yetkilendirme rotaları' }
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

    // 5. Frontend UI & Components (Group 5: Amber/Orange)
    const frontend = [
        { id: 'frontend/src/App.jsx', label: 'App.jsx (Main Container)', desc: 'React 18 ana panel koordinatörü ve WebSocket canlı istemcisi' },
        { id: 'frontend/src/components/Sidebar.jsx', label: 'Sidebar.jsx', desc: 'Sol menü, arama, pin, rename ve proje işlemleri' },
        { id: 'frontend/src/components/Header.jsx', label: 'Header.jsx', desc: 'Üst menü, sekme geçişleri ve süreç kontrol butonları' },
        { id: 'frontend/src/components/ChatView.jsx', label: 'ChatView.jsx', desc: 'Manager Sohbet, beyin fırtınası ve revizyon paneli' },
        { id: 'frontend/src/components/DAGFlowView.jsx', label: 'DAGFlowView.jsx', desc: 'ReactFlow canlı DAG akış şeması ve log tablosu' },
        { id: 'frontend/src/components/IDEView.jsx', label: 'IDEView.jsx', desc: 'Monaco Editor kaynak kod inceleyici' },
        { id: 'frontend/src/services/api.js', label: 'services/api.js', desc: 'AuthFetch ve Bearer JWT API istemcisi' }
    ];

    frontend.forEach(f => {
        addNode(f.id, f.label, 'FrontendComponent', 'frontend', f.id, f.desc);
        addLink('frontend/src/App.jsx', f.id, 'renders');
    });

    addLink('frontend/src/App.jsx', 'frontend/src/services/api.js', 'uses');
    addLink('frontend/src/services/api.js', 'backend/server.js', 'http_and_ws');

    // 6. Test Suites (Group 6: Red)
    const tests = [
        { id: 'backend/tests/test_runner.js', label: 'test_runner.js (Master Runner)', desc: 'npm test master koşucusu' },
        { id: 'backend/tests/test_backend.js', label: 'test_backend.js (31 Tests)', desc: 'Auth, Scrypt, JWT, RateLimit, SQLite testleri' },
        { id: 'backend/tests/test_quality_gate.js', label: 'test_quality_gate.js (7 Tests)', desc: 'Prisma şema uyumu ve fail-closed kalite kapısı testleri' },
        { id: 'backend/tests/test_deep_verification.js', label: 'test_deep_verification.js (17 Tests)', desc: 'DAG motoru, dalga seviyeleme ve JSON onarım testleri' },
        { id: 'backend/tests/test_tur2_edge_cases.js', label: 'test_tur2_edge_cases.js (8 Tests)', desc: 'Döngü stresi, ayrık graf ve path traversal testleri' },
        { id: 'backend/tests/test_runtime_verification.js', label: 'test_runtime_verification.js (6 Tests)', desc: 'Sentaks denetimi, checkpoint veto ve dalga testleri' },
        { id: 'backend/tests/test_docs_agent_sync.js', label: 'test_docs_agent_sync.js (1 Test)', desc: 'Docs/*.md ile ajanların canlı senkronizasyon testi' },
        { id: 'backend/tests/test_e2e_simulation.js', label: 'test_e2e_simulation.js (1 Test)', desc: 'Uçtan uca otonom pipeline simülasyon testi' }
    ];

    tests.forEach(t => {
        addNode(t.id, t.label, 'TestSuite', 'tests', t.id, t.desc);
        if (t.id !== 'backend/tests/test_runner.js') {
            addLink('backend/tests/test_runner.js', t.id, 'runs');
        }
    });

    addLink('backend/tests/test_backend.js', 'backend/server.js', 'verifies');
    addLink('backend/tests/test_quality_gate.js', 'backend/engine/workflow.js', 'verifies');
    addLink('backend/tests/test_deep_verification.js', 'backend/engine/dag.js', 'verifies');
    addLink('backend/tests/test_docs_agent_sync.js', 'backend/agents/agentLoader.js', 'verifies');

    const graphData = { nodes, links };
    await fs.writeFile(path.join(OUT_DIR, 'graph.json'), JSON.stringify(graphData, null, 2), 'utf8');

    // Generate GRAPH_REPORT.md
    const reportMd = `# 🧠 XFactor Bilgi Grafiği Raporu (Graphify)

**Oluşturulma Tarihi:** ${new Date().toISOString().split('T')[0]}  
**Toplam Düğüm (Nodes):** ${nodes.length}  
**Toplam Bağlantı (Edges):** ${links.length}  
**Modül Toplulukları:** 6 Temel Alt Sistem (Docs, Agents, Engine, Backend, Frontend, Tests)

---

## 🌟 Çekirdek Odak Düğümleri ("God Nodes" & Merkez Bileşenler)
1. **backend/engine/workflow.js**: 8 bağlantı — Master orkestratör, DAG dalga yürütme ve veto yöneticisi.
2. **backend/agents/agentLoader.js**: 7 bağlantı — Canlı Markdown anayasasını (docs/*.md) yapay zekâ promptlarına bağlayan çekirdek köprü.
3. **backend/server.js**: 6 bağlantı — Express REST API ve Sec-WebSocket-Protocol sunucusu.
4. **docs/ORKESTRASYON-TALIMATNAMESI.md**: 8 bağlantı — Platform anayasası ve tüm ajan kurallarının kaynağı.
5. **frontend/src/App.jsx**: 7 bağlantı — Canlı DAG görselleştirmesi, Monaco IDE ve Chat koordinatörü.
6. **backend/tests/test_runner.js**: 7 bağlantı — 71 testlik merkezi test koşucusu.

---

## 🎨 Alt Sistem Toplulukları (Communities)

| Renk Kodu | Topluluk | Dosya Sayısı | Açıklama |
|:---:|---|:---:|---|
| 🟣 **Mor** | **Docs & Anayasa** | 8 Dosya | docs/ORKESTRASYON-TALIMATNAMESI.md ve ajan kural Markdown dosyaları. |
| 🟣 **Eflatun** | **Agents** | 9 Dosya | Ajan tanımları, registry ve şema ayrıştırıcıları. |
| 🔵 **Mavi** | **Engine** | 5 Dosya | DAG motoru, dalga seviyelendirme, dosya protokolü ve scaffold guard. |
| 🟢 **Yeşil** | **Backend & API** | 7 Dosya | Express server, SQLite WAL, Scrypt auth, JWT, security ve LLM yönlendirici. |
| 🟠 **Turuncu** | **Frontend** | 7 Dosya | React 18, Sidebar, Header, ChatView, DAGFlowView, Monaco IDE. |
| 🔴 **Kırmızı** | **Tests** | 8 Dosya | Merkezi backend/tests/ süiti ve master koşucu (71 test). |

---

## 📊 Görsel Haritalar
- **İnteraktif 2D/3D Ağ Grafiği:** graphify-out/graph.html
- **Hiyerarşik Ağaç Görünümü:** graphify-out/GRAPH_TREE.html
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
      <li><span class="folder">📁 docs/</span> (Platform Anayasası & Canlı Ajan Kuralları)
        <ul>
          <li><span class="file">📄 ORKESTRASYON-TALIMATNAMESI.md</span> <span class="tag tag-doc">Ana Anayasa v3</span></li>
          <li><span class="file">📄 manager.md</span> <span class="tag tag-doc">Manager Kuralı</span></li>
          <li><span class="file">📄 director.md</span> <span class="tag tag-doc">Director Kuralı</span></li>
          <li><span class="file">📄 teamleader.md</span> <span class="tag tag-doc">Teamleader Kuralı</span></li>
          <li><span class="file">📄 coder.md</span> <span class="tag tag-doc">Coder Kuralı</span></li>
          <li><span class="file">📄 reviewer.md</span> <span class="tag tag-doc">Reviewer Veto Kuralı</span></li>
          <li><span class="file">📄 tester.md</span> <span class="tag tag-doc">Tester QA Kuralı</span></li>
          <li><span class="file">📄 KULLANIM-KILAVUZU.md</span> <span class="tag tag-doc">Operasyon Kılavuzu</span></li>
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
              <li><span class="file">📄 fileProtocol.js</span> <span class="tag tag-engine">Agent=Klasör</span></li>
              <li><span class="file">📄 codeGenerator.js</span> <span class="tag tag-engine">Scaffold Guard (.env)</span></li>
              <li><span class="file">📄 selfCorrection.js</span> <span class="tag tag-engine">2 Turlu Veto Döngüsü</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 routes/</span>
            <ul>
              <li><span class="file">📄 projectRoutes.js</span> <span class="tag tag-backend">CRUD, Chat & Revizyon</span></li>
              <li><span class="file">📄 authRoutes.js</span> <span class="tag tag-backend">Login & Session</span></li>
            </ul>
          </li>
          <li><span class="folder">📁 tests/</span>
            <ul>
              <li><span class="file">📄 test_runner.js</span> <span class="tag tag-test">Master Koşucu (npm test)</span></li>
              <li><span class="file">📄 test_backend.js</span> <span class="tag tag-test">31 Test</span></li>
              <li><span class="file">📄 test_quality_gate.js</span> <span class="tag tag-test">7 Test</span></li>
              <li><span class="file">📄 test_deep_verification.js</span> <span class="tag tag-test">17 Test</span></li>
              <li><span class="file">📄 test_tur2_edge_cases.js</span> <span class="tag tag-test">8 Test</span></li>
              <li><span class="file">📄 test_runtime_verification.js</span> <span class="tag tag-test">6 Test</span></li>
              <li><span class="file">📄 test_docs_agent_sync.js</span> <span class="tag tag-test">1 Test</span></li>
              <li><span class="file">📄 test_e2e_simulation.js</span> <span class="tag tag-test">1 Test</span></li>
            </ul>
          </li>
          <li><span class="file">📄 server.js</span> <span class="tag tag-backend">Express & WSS</span></li>
          <li><span class="file">📄 db.js</span> <span class="tag tag-backend">SQLite WAL</span></li>
          <li><span class="file">📄 auth.js</span> <span class="tag tag-backend">Scrypt & RBAC</span></li>
          <li><span class="file">📄 security.js</span> <span class="tag tag-backend">Security Guard</span></li>
          <li><span class="file">📄 llm.js</span> <span class="tag tag-backend">Gemini 3.7 Flash</span></li>
        </ul>
      </li>
      <li><span class="folder">📁 frontend/src/</span>
        <ul>
          <li><span class="file">📄 App.jsx</span> <span class="tag tag-ui">Ana Koordinatör & WS</span></li>
          <li><span class="file">📄 components/Sidebar.jsx</span> <span class="tag tag-ui">Sol Menü & Pin</span></li>
          <li><span class="file">📄 components/Header.jsx</span> <span class="tag tag-ui">Üst Menü & Sekmeler</span></li>
          <li><span class="file">📄 components/ChatView.jsx</span> <span class="tag tag-ui">Sohbet & Revizyon</span></li>
          <li><span class="file">📄 components/DAGFlowView.jsx</span> <span class="tag tag-ui">Canlı ReactFlow DAG</span></li>
          <li><span class="file">📄 components/IDEView.jsx</span> <span class="tag tag-ui">Monaco Editor</span></li>
          <li><span class="file">📄 services/api.js</span> <span class="tag tag-ui">AuthFetch & WS Client</span></li>
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

extractCodeGraph().catch(console.error);
