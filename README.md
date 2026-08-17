# ⚡ XFactor — Otonom AI Ajan Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Style-TailwindCSS-38B2AC.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-56%2F56%20Passing-brightgreen.svg)](file:///F:/projeler/xfactor/backend/test_backend.js)
[![Architecture](https://img.shields.io/badge/Architecture-Agency--Agents%20%2B%20Archon%20DAG-blueviolet.svg)](https://github.com/coleam00/Archon)

**XFactor**, doğal dilde verilen kullanıcı isteklerini analiz eden, hiyerarşik çok katmanlı AI ajanları (`Manager`, `Director`, `Teamleader`, `Coder`, `Reviewer`, `Tester`) arasında görev dağılımı yapan, deterministik bir **DAG (Directed Acyclic Graph)** motoruyla bağımlılıkları çözen ve çalışan çok dosyalı yazılım projeleri üreten kurumsal bir AI Ajan Orkestrasyon Platformudur.

---

## 🌟 Öne Çıkan Yetenekler

- 🤖 **Uzmanlaşmış Ajan Hiyerarşisi (`Agency-Agents` Modeli):** 
  - `Manager`: Proje gereksinimlerini beyin fırtınasıyla netleştirir, `manager/TALIMATNAME.md` üretir ve dinamik domainlere ayırır.
  - `Director`: Sorumlu olduğu domain için mimari alt şartname (`ALT-TALIMATNAME.md`) üretir.
  - `Teamleader`: Görevleri atomik parçalara (DAG) ayırır ve Coder ajanlarını koordine eder.
  - `Coder`: Çok dosyalı tam kod bloklarını (`files: [{ path, content }]`) üretir.
  - `Reviewer`: Üretilen kodları kalite, güvenlik ve sözdizimi açısından denetler (Quality Gate).
  - `Tester`: Tüm projenin kabul kriterlerine uygunluğunu doğrular, `RAPOR.md` ve kurulum kılavuzunu (`README.md`) üretir.
- ⚙️ **Deterministik DAG İş Akışı Motoru (`Archon` Modeli):**
  - Görevler arasındaki önkoşul bağımlılıklarını DFS tabanlı topolojik sıralama ile çözer.
  - Döngüsel bağımlılıkları (Cycle Detection) tespit eder ve kilitlenmeleri önler.
- 📁 **Dosya-Bazlı Koordinasyon Protokolü ("Agent = Klasör"):**
  - Her ajan kendi klasöründe izole çalışır (`manager/`, `frontend.director/`, `backend.teamleader/`, `task-*/`).
  - İletişim ve durum takibi `GOREV.md`, `DURUM.md`, `TODO.md` ve `RAPOR.md` dosyaları üzerinden yürütülür.
- 🔄 **Stateful Checkpoint Recovery (Kaldığı Yerden Akıllı Devam Etme):**
  - Duraklatılan veya kesintiye uğrayan projeler yeniden başlatıldığında (`Resume`), daha önce tamamlanmış görevler (`[SKIP]`) otomatik atlanır ve süreç **doğrudan yarım kalan görevden** devam eder.
- 🛡️ **Ultra Dayanıklı Kod Parser & Truncation Kurtarıcı:**
  - LLM çıktılarında kaçışsız JSX çift tırnakları (`className="..."`) veya token sınırından kaynaklı yarım kesilmeler olsa bile parser (`extractCoderFilesFromText` & `repairTruncatedJSON`) kodları hatasız kurtarır.
- 🔒 **Güvenlik ve RBAC (Hardened & Zero-Trust):**
  - Scrypt + TimingSafeEqual ile parola hashleme ve SHA-256 oturum yönetimi.
  - Path Traversal engelleme (`isSafeProjectPath`) ve katı girdi sanitizasyonu.
  - WebSocket Subprotocol yetkilendirmesi (`xfactor-auth.<token>`).
- 📦 **Otomatik Proje İskeleti ve Çalıştırılabilirlik Koruması (`Scaffold Guard`):**
  - Üretilen her projede `package.json` (eksiksiz bağımlılıklar), `tsconfig.json` (`@/*` path alias çözümlemesi), `src/app/globals.css` (Tailwind direktifleri), `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `README.md` ve `KULLANIM-KILAVUZU.md` otomatik olarak garanti altına alınır.
- 📥 **Temiz ve Doğrudan Çalıştırılabilir ZIP Dışa Aktarma:**
  - İndirilen ZIP paketinde iç ajan yönetim klasörleri (`manager/`, `frontend.director/`, `DURUM.md`, `TODO.md`, `RAPOR.md`) elenir; yalnızca çalıştırılabilir **temiz yazılım kaynak kodları** paketlenir.
- 💻 **Gelişmiş Yönetim & Canlı Süreç Paneli:**
  - Yan menüde her proje için 3 nokta (`...`) işlem menüsü: **Başa Sabitleme (Pin)**, **Yeniden Adlandırma (Rename)**, **ZIP İndirme** ve **Silme**.
  - Canlı log izleme tablosunda tam tarih/saat damgaları (`DD.MM.YYYY HH:mm:ss`) ve veritabanı şemasıyla uyumlu sütunlar (`created_at`, `agent`, `action`, `file`, `node_id`, `message`).
  - Proje durumu farkında dinamik Manager sohbeti (tamamlanan projelerde çalıştırma yönergelerini verir).

## 🏗️ Mimari ve Veri Akışı

```text
Kullanıcı (Boss)
  └── React 18 + Vite UI (Frontend)
        ├── 💬 İnteraktif Chat (Zaman Damgalı & Durum Farkında)
        ├── 📊 Canlı ReactFlow DAG Akış Görselleştirmesi
        └── 💻 Monaco Editor IDE & ZIP Dışa Aktarma
             │
             ▼ Bearer JWT / Sec-WebSocket-Protocol
  Express REST API & WebSocket Sunucusu (Backend)
        ├── 🔒 Güvenlik, CORS, Rate Limit & RBAC (Owner, Editor, Viewer)
        ├── 💾 SQLite Kalıcılık Katmanı (WAL Modu, Users, Projects, Sessions, Logs)
        └── 🚀 Otonom DAG Workflow Engine (backend/engine/)
              ├── 1. Manager.agent ───► manager/TALIMATNAME.md & Kök TODO.md
              ├── 2. Director.agent ──► ALT-TALIMATNAME.md & Director TODO.md
              ├── 3. Teamleader.agent ► Görev DAG'ı & Teamleader TODO.md
              ├── 4. Coder.agent ─────► Çok Dosyalı Kod Üretimi & Resilient Parser
              ├── 5. Reviewer.agent ──► Kod İnceleme & Self-Correction Döngüsü
              └── 6. Tester.agent ────► Kabul Doğrulaması, RAPOR.md & README.md
```

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
- **Node.js:** 18+ veya **Bun**
- **npm** veya **bun**

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
AI_MODEL=gemini-2.5-flash
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

## 🧪 Test Suite (TDD ve Güvenlik Doğrulaması)

Backend, Ajan Rolleri, JSON Şemaları, DAG Motoru, Dosya Protokolü, Checkpoint Recovery ve Güvenlik katmanlarını kapsayan **56 adet otomatik test** mevcuttur:

```bash
cd backend
node test_backend.js
node test_deep_verification.js
node test_tur2_edge_cases.js
node test_e2e_simulation.js
```

```text
==========================================
⚡ XFactor Test Suite Sonuçları:
- Backend & Security Tests: 31/31 BAŞARILI
- Derin Doğrulama Tests: 16/16 BAŞARILI
- Edge-Case & Stres Tests: 8/8 BAŞARILI
- E2E Pipeline Simulation: 1/1 BAŞARILI
==========================================
🎉 Toplam: 56 BAŞARILI, 0 HATALI (%100 Başarı)
==========================================
```

---

## 📖 Kapsamlı Dokümantasyon

Uygulamanın A'dan Z'ye kullanım kılavuzuna, ekran görüntülü akış senaryolarına ve örnek projelere ulaşmak için:
👉 **[Kullanım Kılavuzu (KULLANIM-KILAVUZU.md)](file:///F:/projeler/xfactor/KULLANIM-KILAVUZU.md)** dokümanını inceleyebilirsiniz.

---

## 📂 Dizin Yapısı

```
xfactor/
├── TODO.md                         # Master Yol Haritası ve Test Sertifikasyonları
├── KULLANIM-KILAVUZU.md             # A'dan Z'ye Kapsamlı Kullanıcı ve Operasyon Kılavuzu
├── README.md                       # Genel Mimari ve Başlangıç Dokümantasyonu
│
├── backend/
│   ├── agents/                     # Uzman Ajan Rol ve Sistem Promptları (Agency-Agents Modeli)
│   │   ├── manager.js              # Manager Ajanı
│   │   ├── director.js             # Director Ajanı
│   │   ├── teamleader.js           # Teamleader Ajanı
│   │   ├── coder.js                # Coder Ajanı & Robust Parser
│   │   ├── reviewer.js             # Reviewer Ajanı
│   │   ├── tester.js               # Tester Ajanı
│   │   ├── schemas.js              # JSON Şema, Truncation Repair & Regex Extractor
│   │   └── index.js                # Ajan Kayıt Defteri ve Fabrika
│   │
│   ├── engine/                     # Deterministik İş Akışı ve DAG Motoru (Archon Modeli)
│   │   ├── dag.js                  # Topolojik Sıralama ve Döngü Kontrolü
│   │   ├── fileProtocol.js         # "Agent = Klasör" Protokol Dosyaları
│   │   ├── codeGenerator.js        # Çok Dosyalı Kod Yazıcı ve Ağaç Gezgini
│   │   ├── selfCorrection.js       # Reviewer-Coder Düzeltme Döngüsü
│   │   ├── workflow.js             # Otonom Proje Yürütücüsü & Checkpoint Recovery
│   │   └── index.js                # Motor İndeksi
│   │
│   ├── auth.js                     # Kullanıcı, Parola (Scrypt), Oturum ve RBAC
│   │   ├── db.js                       # SQLite Veritabanı, WAL Kalıcılık & Disk Senkronizasyonu
│   │   ├── llm.js                      # Multi-Provider LLM Yönlendirme (Gemini, OpenAI vb.)
│   │   ├── security.js                 # Path Traversal, CORS, Rate Limit ve Sanitizasyon
│   │   ├── observability.js            # Request ID ve Yapılandırılmış Loglama
│   │   ├── server.js                   # Express API, Dinamik Manager Chat & WebSocket Sunucusu
│   │   └── test_backend.js             # Kapsamlı TDD ve Güvenlik Test Süiti
│   │
├── frontend/
│   ├── src/
│   │   ├── services/
│   │   │   └── api.js              # Modüler XFactor API ve WebSocket İstemcisi
│   │   ├── App.jsx                 # Ana Panel (Chat, ReactFlow DAG, Monaco IDE, 3-Dots Menü)
│   │   ├── main.jsx                # React Giriş Noktası
│   │   └── index.css               # Tailwind & ReactFlow Stilleri
│   ├── package.json
│   └── vite.config.js
│
├── docs/                           # Mimari Kararlar ve Ajan Rol Talimatnameleri
└── projects/                       # Ajanlar Tarafından Üretilen Gerçek Çıktı Projeleri
```
