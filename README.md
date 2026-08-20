# ⚡ XFactor — Otonom AI Ajan Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Style-TailwindCSS-38B2AC.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-71%2F71%20Passing-brightgreen.svg)](file:///F:/projeler/xfactor/backend/tests/test_runner.js)
[![Architecture](https://img.shields.io/badge/Architecture-Agency--Agents%20%2B%20Archon%20DAG%20%2B%20Living%20Docs-blueviolet.svg)](https://github.com/coleam00/Archon)

**XFactor**, doğal dilde verilen kullanıcı isteklerini analiz eden, hiyerarşik çok katmanlı AI ajanları (`Manager`, `Director`, `Teamleader`, `Coder`, `Reviewer`, `Tester`) arasında görev dağılımı yapan, deterministik bir **DAG (Directed Acyclic Graph)** dalga motoruyla bağımlılıkları çözen, kuralları canlı **`docs/*.md`** anayasasından dinamik okuyan ve çalışan çok dosyalı yazılım projeleri üreten kurumsal bir AI Ajan Orkestrasyon Platformudur.

---

## 🌟 Öne Çıkan Yetenekler

- 🧠 **Canlı Kural Merkezi ve Dinamik Ajan Beyinleri (`docs/*.md` & `agentLoader.js`):**
  - Ajan sistem promptları statik JS stringlerinde değil; doğrudan **`docs/`** altındaki Markdown dosyalarında (`manager.md`, `director.md`, `teamleader.md`, `coder.md`, `reviewer.md`, `tester.md`, `ORKESTRASYON-TALIMATNAMESI.md`) yaşar.
  - `docs/` altında bir kural güncellendiğinde yapay zekâ ajanları bu kuralı **anında canlı olarak uygular**.
- 🤖 **Uzmanlaşmış 6 Seviyeli Ajan Hiyerarşisi (`Agency-Agents` Modeli):** 
  - `Manager`: Proje gereksinimlerini analiz eder, `manager/TALIMATNAME.md` üretir, domainlere ayırır ve `.env` güvencesini şartnameye bağlar.
  - `Director`: Sorumlu olduğu domain için mimari alt şartname (`ALT-TALIMATNAME.md`) üretir.
  - `Teamleader`: Görevleri atomik parçalara (DAG) ayırır ve **"Görev başına maksimum 1-2 dosya"** sınırını uygular.
  - `Coder`: Çok dosyalı kod üretir ve **"Bileşen Kompozisyonu"** (`@/components` import etme) kuralını uygular.
  - `Reviewer`: Üretilen kodları kalite, güvenlik ve sözdizimi açısından denetler; 2 tur sonunda onay alamazsa görevi fail-closed olarak **VETO** eder (Quality Gate).
  - `Tester`: Prisma şeması, API kontratı ve sözdizimini deterministik denetler (`stripStringsAndComments`), hata varsa Coder'a otomatik onarım döngüsü başlatır, `RAPOR.md` ve kurulum kılavuzunu (`README.md`) üretir.
- ⚙️ **Deterministik Paralel DAG Dalga Motoru (`Archon` Modeli):**
  - Görevler arasındaki önkoşul bağımlılıklarını DFS topolojik sıralama ve `getExecutionWaves()` dalga algoritması ile seviyelere ayırır.
  - Bağımsız görevleri `CONCURRENCY_LIMIT = 2` havuzunda eşzamanlı (`Promise.all`) paralel çalıştırarak hem süreyi kısaltır hem de LLM 429 rate-limit hatalarını önler.
  - Dalga sonu atomik dosya birleştirme (wave reduce) ile yarış durumlarını (race condition) engeller.
- 📁 **Dosya-Bazlı Koordinasyon Protokolü ("Agent = Klasör"):**
  - Her ajan kendi klasöründe izole çalışır (`manager/`, `<domain>.director/`, `<tl>.teamleader/`, `<task_id>/`).
  - İletişim ve durum takibi `GOREV.md`, `DURUM.md`, `TODO.md` ve `RAPOR.md` dosyaları üzerinden yürütülür.
- 🔄 **Stateful Checkpoint Recovery (Kaldığı Yerden Akıllı Devam Etme):**
  - Duraklatılan veya kesintiye uğrayan projeler devam ettirildiğinde (`Resume`), tamamlanmış görevler (`[SKIP]`) hem rapor hem durum hem de fiziksel dosya boyutu (`size > 0` byte) denetlenerek atlanır ve süreç **doğrudan yarım kalan görevden** devam eder.
  - `DURUM.md` dosyasında `BASARISIZ` / `REDDEDILDI` olan görevler asla atlanmaz.
- 💬 **Sohbet Üzerinden Canlı Revizyon ve Gerçek DAG Tetikleyicisi:**
  - Tamamlanmış veya durdurulmuş bir projede sohbetten hata veya revizyon bildirildiğinde, Manager `[PLAN_HAZIR]` etiketiyle onay kartını açar.
  - Onay verildiğinde **gerçek DAG motoru, Coder, Reviewer ve Tester ajanları sıfırdan çalışarak** gerçek dosyaları üretir.
- 📦 **Otomatik Proje İskeleti ve Çalıştırılabilirlik Koruması (`Scaffold Guard`):**
  - Üretilen her projede güncel ve güvenli bağımlılıklar (`Next.js ^14.2.24`, `React ^18.3.1`, `Prisma ^5.22.0`, `TypeScript ^5.7.2`, `Tailwind ^3.4.17`), `tsconfig.json` (`@/*` alias), `.env` ve `.env.example` (`DATABASE_URL="file:./dev.db"`) otomatik oluşturulur.
  - Saf Express REST API projelerinde React/Tailwind temizlenerek hafif (~50 paket) iskelet üretilir.
- 📥 **Temiz ve Doğrudan Çalıştırılabilir ZIP Dışa Aktarma:**
  - İndirilen ZIP paketinde iç ajan yönetim klasörleri (`manager/`, `DURUM.md`, `TODO.md`) elenir; `.env` dahil çalıştırılabilir **temiz yazılım kaynak kodları** paketlenir.
- 🔒 **Güvenlik ve RBAC (Hardened & Zero-Trust):**
  - Scrypt + TimingSafeEqual ile parola hashleme ve SHA-256 oturum yönetimi.
  - Path Traversal engelleme (`isSafeProjectPath`) ve katı girdi sanitizasyonu.
  - WebSocket Subprotocol yetkilendirmesi (`Sec-WebSocket-Protocol: xfactor-auth.<token>`).

---

## 🏗️ Mimari ve Veri Akışı

```text
Kullanıcı (Boss)
  └── React 18 + Vite UI (Frontend)
        ├── 💬 İnteraktif Chat (Zaman Damgalı & Revizyon Tetikleyicili)
        ├── 📊 Canlı ReactFlow DAG Akış Görselleştirmesi
        └── 💻 Monaco Editor IDE & ZIP Dışa Aktarma
             │
             ▼ Bearer JWT / Sec-WebSocket-Protocol (xfactor-auth)
  Express REST API & WebSocket Sunucusu (Backend)
        ├── 🔒 Güvenlik, CORS, Rate Limit & RBAC (Owner, Editor, Viewer)
        ├── 💾 SQLite Kalıcılık Katmanı (WAL Modu, workflow_state JSON)
        └── 🚀 Otonom DAG Workflow Engine (backend/engine/)
              ├── docs/*.md ──────────► agentLoader.js (Canlı Anayasa Yükleyici)
              ├── 1. Manager.agent ───► manager/TALIMATNAME.md & Kök TODO.md
              ├── 2. Director.agent ──► ALT-TALIMATNAME.md & Director TODO.md
              ├── 3. Teamleader.agent ► Görev DAG'ı (Maksimum 1-2 Dosya Limiti)
              ├── 4. Coder.agent ─────► Çok Dosyalı Kodlama & Bileşen Kompozisyonu
              ├── 5. Reviewer.agent ──► 2 Turlu İnceleme & Fail-Closed VETO Kapısı
              └── 6. Tester.agent ────► Deterministik Şema/Sentaks QA, Auto-Repair & README
```

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
- **Node.js:** 18+ veya **Bun**
- **npm**

### 1. Ortam Değişkenlerini Ayarlama
`backend/` dizini altındaki örnek yapılandırma dosyasını kopyalayın:

```bash
cd backend
copy .env.example .env
```

`.env` dosyasını düzenleyin:
```env
PORT=8000
JWT_SECRET=en-az-32-karakter-uzunlugunda-guclu-bir-rastgele-anahtar
ADMIN_USER=admin
ADMIN_PASS=GucluParola!2026
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AI_PROVIDER=google
AI_MODEL=gemini-3.7-flash
ALLOW_MOCK_FALLBACK=false
GOOGLE_API_KEY=your-gemini-api-key-here
```

### 2. Backend'i Başlatma

```bash
cd backend
npm install
npm run dev
```
> Backend sunucusu `http://127.0.0.1:8000` adresinde hazır olacaktır.

### 3. Frontend'i Başlatma

```bash
cd frontend
npm install
npm run dev
```
> Web arayüzü `http://localhost:5173` adresinde açılacaktır.

---

## 🧪 Test Suite (TDD, Güvenlik ve Deterministik Kalite Kapısı)

Tüm test süitleri **`backend/tests/`** dizini altında toplanmıştır. Tek bir komutla tüm 71 testi koşturabilirsiniz:

```bash
cd backend
npm test
```

```text
==================================================
⚡ XFactor Test Suite Sonuçları (backend/tests/):
- test_backend.js:              31/31 BAŞARILI  (Güvenlik, Auth, DB, JWT, RateLimit, Scrypt)
- test_quality_gate.js:          7/7  BAŞARILI  (Prisma Model Uyum, Fail-Closed, Scaffold)
- test_deep_verification.js:    17/17 BAŞARILI  (DAG Motoru, Execution Waves, Truncation Repair)
- test_tur2_edge_cases.js:       8/8  BAŞARILI  (Döngü Stresi, Ayrık Graf, Path Traversal, RBAC)
- test_runtime_verification.js:  6/6  BAŞARILI  (Sentaks Denetimi, Checkpoint Veto, 4-Wave DAG)
- test_e2e_simulation.js:        1/1  BAŞARILI  (Uçtan Uca Otonom Pipeline Simülasyonu)
- test_docs_agent_sync.js:       1/1  BAŞARILI  (Docs/*.md Canlı Ajan Senkronizasyonu)
==================================================
🎉 Toplam: 71 BAŞARILI, 0 HATALI (%100 Başarı)
==================================================
```

---

## 📂 Dizin Yapısı

```
xfactor/
├── docs/                                  # 📚 CANLI AJAN BEYİNLERİ & TALİMATNAMELER
│   ├── ORKESTRASYON-TALIMATNAMESI.md      # Ana Orkestrasyon Master Anayasası (v3)
│   ├── KULLANIM-KILAVUZU.md               # A'dan Z'ye Kullanıcı ve Operasyon Kılavuzu
│   ├── manager.md                         # Manager Ajan Promptu & Kuralları
│   ├── director.md                        # Director Ajan Promptu & Kuralları
│   ├── teamleader.md                      # Teamleader Ajan Promptu & Kuralları
│   ├── coder.md                           # Coder Ajan Promptu & Kuralları
│   ├── reviewer.md                        # Reviewer Kalite Kapısı Promptu
│   └── tester.md                          # Tester Deterministik QA Promptu
│
├── backend/
│   ├── agents/                            # Ajan Fabrikası ve Şema Ayrıştırıcılar
│   │   ├── agentLoader.js                 # docs/*.md dosyalarını canlı yükleyen köprü
│   │   ├── schemas.js                     # JSON Truncation Repair & Validatörler
│   │   └── index.js                       # Merkezi Ajan Kayıt Defteri (Registry)
│   ├── engine/                            # Orkestrasyon Çekirdeği
│   │   ├── dag.js                         # Topolojik Sıralama & Execution Waves (Dalgalar)
│   │   ├── workflow.js                    # Concurrency Pool (Max 2) & Veto Kontrolcüsü
│   │   ├── fileProtocol.js                # Agent=Klasör & Checkpoint Dosya Denetimi
│   │   ├── codeGenerator.js               # Dinamik Scaffold Guard (.env, Next, Vite, Express)
│   │   └── selfCorrection.js              # Reviewer-Coder 2 Turlu Döngü Motoru
│   ├── routes/                            # Modüler Express Rotaları (auth, projects)
│   │   ├── authRoutes.js                  # Login & Session Uç Noktaları
│   │   └── projectRoutes.js               # Proje CRUD, Canlı Chat & Revizyon Tetikleyicisi
│   ├── tests/                             # 📁 MERKEZİ TEST KLASÖRÜ
│   │   ├── test_runner.js                 # Master Test Koşucusu (npm test)
│   │   ├── test_backend.js                # Güvenlik, Scrypt, JWT, RateLimit
│   │   ├── test_quality_gate.js           # Prisma & Kalite Kapısı Testleri
│   │   ├── test_deep_verification.js      # DAG & Execution Waves Testleri
│   │   ├── test_tur2_edge_cases.js        # Döngü Stresi & RBAC Testleri
│   │   ├── test_runtime_verification.js   # Sentaks & Checkpoint Testleri
│   │   ├── test_e2e_simulation.js         # Uçtan Uca Otonom Pipeline Testi
│   │   └── test_docs_agent_sync.js        # Docs Senkronizasyon Testi
│   ├── auth.js                            # Scrypt & RBAC
│   ├── db.js                              # SQLite WAL & workflow_state
│   ├── llm.js                             # Multi-Provider LLM (Gemini 3.7 Flash vb.)
│   ├── security.js                        # Path Traversal & WebSocket Token Doğrulama
│   ├── observability.js                   # Request ID & Yapılandırılmış Loglama
│   ├── server.js                          # Express & WebSocket Sunucusu
│   └── package.json
│
├── frontend/                              # React 18 + Vite + Tailwind Panel
│   ├── src/
│   │   ├── components/                    # Sidebar, Header, ChatView, DAGFlowView, IDEView
│   │   ├── services/                      # API ve WebSocket İstemcisi
│   │   └── App.jsx                        # Ana Koordinatör
│   └── package.json
│
└── projects/                              # 📁 ÜRETİLEN GERÇEK PROJELER
    └── <proje_id>/
        ├── manager/                       # Canlı Protokol Dosyaları
        ├── src/                           # Üretilen Temiz Kaynak Kodlar
        ├── prisma/                        # schema.prisma & seed.ts
        ├── .env & .env.example            # Otomatik DATABASE_URL="file:./dev.db"
        ├── package.json                   # Modern Bağımlılıklar (Next 14.2+, React 18.3+, Prisma 5.22+)
        ├── RAPOR.md                       # Tester Nihai Kabul Raporu
        └── README.md                      # Kurulum ve Çalıştırma Kılavuzu
```

---

## 📖 Kapsamlı Dokümantasyon
Detaylı kullanım senaryoları, ekran görüntüleri ve sorun giderme için:
👉 **[Kullanım Kılavuzu (KULLANIM-KILAVUZU.md)](file:///F:/projeler/xfactor/KULLANIM-KILAVUZU.md)**
👉 **[Orkestrasyon Master Talimatnamesi (ORKESTRASYON-TALIMATNAMESI.md)](file:///F:/projeler/xfactor/docs/ORKESTRASYON-TALIMATNAMESI.md)**
