# Graph Report - xfactor  (2026-08-07)

## Corpus Check
- 34 files · ~16,485 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 221 nodes · 235 edges · 26 communities (23 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `88e18a5c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- orchestrator.js
- Dosya-Bazlı Çok Katmanlı Ajan Orkestrasyonu — Talimatname (v2)
- dependencies
- dependencies
- frontend/package.json
- backend/package.json
- ⚡ XFactor — Otonom Çoklu Ajan Yazılım Geliştirme Platformu
- Admin.jsx
- GÖREV: <başlık>
- ⚡ XFactor — Kapsamlı Sistem Analiz ve Test Takip Listesi (`ANALIZTODO.md`)
- Alt Talimatname — <domain adı, örn. Frontend>
- Graphify Kullanım ve Bilgi Notu
- RAPOR — <bu klasörün/görevin adı>
- basit-oyunlar
- coder.md
- director.md
- DURUM — <bu klasörün adı>
- manager.md
- teamleader.md
- TODO — <bu klasörün adı>
- GEMINI.md
- CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `Dosya-Bazlı Çok Katmanlı Ajan Orkestrasyonu — Talimatname (v2)` - 12 edges
2. `executeProjectTasks()` - 9 edges
3. `⚡ XFactor — Otonom Çoklu Ajan Yazılım Geliştirme Platformu` - 8 edges
4. `GÖREV: <başlık>` - 8 edges
5. `⚡ XFactor — Kapsamlı Sistem Analiz ve Test Takip Listesi (`ANALIZTODO.md`)` - 7 edges
6. `Alt Talimatname — <domain adı, örn. Frontend>` - 7 edges
7. `generateLLMResponse()` - 6 edges
8. `2. Hiyerarşi ve Roller (sabit 4 seviye)` - 6 edges
9. `RAPOR — <bu klasörün/görevin adı>` - 6 edges
10. `getProjectDir()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `generateLLMResponse()` --references--> `@google/generative-ai`  [EXTRACTED]
  backend/llm.js → backend/package.json
- `Home()` --calls--> `getProperties()`  [EXTRACTED]
  frontend/src/pages/Home.jsx → frontend/src/services/api.js
- `readProjectState()` --calls--> `getProjectState()`  [EXTRACTED]
  backend/orchestrator.js → backend/db.js
- `writeProjectState()` --calls--> `saveProjectState()`  [EXTRACTED]
  backend/orchestrator.js → backend/db.js
- `logEvent()` --calls--> `saveProjectLog()`  [EXTRACTED]
  backend/orchestrator.js → backend/db.js

## Import Cycles
- None detected.

## Communities (26 total, 3 thin omitted)

### Community 0 - "orchestrator.js"
Cohesion: 0.11
Nodes (28): DATA_DIR, db, dbEvents, __dirname, __filename, getAllProjects(), getProjectLogs(), getProjectState() (+20 more)

### Community 1 - "Dosya-Bazlı Çok Katmanlı Ajan Orkestrasyonu — Talimatname (v2)"
Cohesion: 0.09
Nodes (22): 0. Senaryo (özet), 10. Riskler ve Öneriler (özet), 1. Temel İlke: "Agent = Klasör", 2.1 Boss (kullanıcı), 2.2 manager.agent (proje kökü), 2.3 director.agent (her `<prefix>.director/` klasöründe bir tane), 2.4 teamleader.agent (her `<prefix>.teamleader/` klasöründe bir tane, director'ın altında), 2.5 coder.agent (her `gorev-<isim>/` klasöründe bir tane — **YAPRAK, altında başka ajan yok**) (+14 more)

### Community 2 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, cors, dotenv, express, express-rate-limit, @google/generative-ai, jsonwebtoken, ws (+7 more)

### Community 3 - "dependencies"
Cohesion: 0.11
Nodes (17): file-saver, dependencies, file-saver, jszip, lucide-react, @monaco-editor/react, react, react-dom (+9 more)

### Community 4 - "frontend/package.json"
Cohesion: 0.10
Nodes (19): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, vite, @vitejs/plugin-react, name (+11 more)

### Community 5 - "backend/package.json"
Cohesion: 0.22
Nodes (8): description, main, name, scripts, dev, start, type, version

### Community 6 - "⚡ XFactor — Otonom Çoklu Ajan Yazılım Geliştirme Platformu"
Cohesion: 0.14
Nodes (13): 1. Projeyi Klonlayın, 2. Backend Kurulumu ve Başlatılması, 3. Frontend Kurulumu ve Başlatılması, Ajan Rolleri ve Sorumlulukları, Gereksinimler, 🔒 Güvenlik, 🛠️ Kurulum ve Çalıştırma, 📜 Lisans (+5 more)

### Community 7 - "Admin.jsx"
Cohesion: 0.54
Nodes (5): Admin(), Home(), addProperty(), deleteProperty(), getProperties()

### Community 8 - "GÖREV: <başlık>"
Cohesion: 0.22
Nodes (8): Amaç, Bağımlılıklar, GÖREV: <başlık>, Kabul Kriterleri, Kapsam, Kapsam Dışı, Kaynak, Teknik Kısıtlar / Standartlar

### Community 13 - "⚡ XFactor — Kapsamlı Sistem Analiz ve Test Takip Listesi (`ANALIZTODO.md`)"
Cohesion: 0.25
Nodes (7): 1. Statik Kod & Yapı Doğrulaması (Static Code & Structure Audit), 2. Backend API & Veritabanı Testleri (Backend REST API & SQLite Audit), 3. WebSocket & Canlı Süreç Yayın Testi (Real-time WebSocket Audit), 4. Otonom Çoklu Ajan Orkestrasyon Akış Testi (Multi-Agent Execution Audit), 5. Frontend IDE & Dışa Aktarma Testi (Monaco IDE & ZIP Export Audit), 6. Güvenlik & Sınır Durumu Testleri (Security & Edge Cases Audit), ⚡ XFactor — Kapsamlı Sistem Analiz ve Test Takip Listesi (`ANALIZTODO.md`)

### Community 14 - "Alt Talimatname — <domain adı, örn. Frontend>"
Cohesion: 0.25
Nodes (7): 1. Özet, 2. Bu Domainin Kapsamı, 3. Kapsam Dışı, 4. Tasarım / Mimari Kararları (bu domaine özel), 5. Teamleader Bölünmesi, 6. Kabul Kriterleri (bu domain için), Alt Talimatname — <domain adı, örn. Frontend>

### Community 15 - "Graphify Kullanım ve Bilgi Notu"
Cohesion: 0.25
Nodes (7): 1. Graphify Nedir ve Ne İşe Yarar?, 2. Kısıtlı Ağlarda (MEB vb.) IPv4 ile Çalıştırma, 3. Temel Graphify Komutları ve Kullanımları, 4. Bu Uygulama (Gemini / Antigravity AI) İçinde Kullanımı, A. Standart Komut (İnternet/Ağ Normal Olduğunda):, B. Kısıtlı Ağ / IPv4 Zorlamalı Komut (Garanti Çalışan Yöntem):, Graphify Kullanım ve Bilgi Notu

### Community 16 - "RAPOR — <bu klasörün/görevin adı>"
Cohesion: 0.29
Nodes (6): Bilinen Sınırlamalar, Oluşturulan / Değiştirilen Dosyalar, RAPOR — <bu klasörün/görevin adı>, Test Durumu, Yapılanlar, Üst Göreve Not

### Community 17 - "basit-oyunlar"
Cohesion: 0.40
Nodes (4): basit-oyunlar, 📐 Güncellenmiş Teknik Mimari, 🚀 Onay ve Başlangıç, 🎮 Oyunların Tasarım Konseptleri (Minimalist & Modern)

### Community 18 - "coder.md"
Cohesion: 0.50
Nodes (3): Görev Akışı, Kesin Kurallar, Kimlik

### Community 19 - "director.md"
Cohesion: 0.50
Nodes (3): Görev Akışı, Kesin Kurallar, Kimlik

### Community 20 - "DURUM — <bu klasörün adı>"
Cohesion: 0.50
Nodes (3): Alt Birimler Özeti (varsa), Bloke Nedeni (yalnızca BLOKE ise doldur), DURUM — <bu klasörün adı>

### Community 21 - "manager.md"
Cohesion: 0.50
Nodes (3): Görev Akışı, Kesin Kurallar, Kimlik

### Community 22 - "teamleader.md"
Cohesion: 0.50
Nodes (3): Görev Akışı, Kesin Kurallar, Kimlik

## Knowledge Gaps
- **124 isolated node(s):** `__filename`, `__dirname`, `DATA_DIR`, `db`, `__filename` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `backend/package.json`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `generateLLMResponse()` connect `orchestrator.js` to `dependencies`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `@google/generative-ai` connect `dependencies` to `orchestrator.js`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `__filename`, `__dirname`, `DATA_DIR` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `orchestrator.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10873440285204991 - nodes in this community are weakly interconnected._
- **Should `Dosya-Bazlı Çok Katmanlı Ajan Orkestrasyonu — Talimatname (v2)` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._