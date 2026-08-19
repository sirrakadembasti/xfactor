# ⚡ XFactor — Otonom AI Ajan Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Style-TailwindCSS-38B2AC.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-63%2F63%20Passing-brightgreen.svg)](file:///F:/projeler/xfactor/backend/test_quality_gate.js)
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

## 🧪 Test Suite (TDD, Güvenlik ve Deterministik Kalite Kapısı)

Backend, Ajan Rolleri, JSON Şemaları, DAG Motoru, Dosya Protokolü, Checkpoint Recovery, Deterministik Şema Doğrulama ve Güvenlik katmanlarını kapsayan **63 adet otomatik test** mevcuttur:

```bash
cd backend
node test_backend.js
node test_deep_verification.js
node test_tur2_edge_cases.js
node test_quality_gate.js
node test_e2e_simulation.js
```

```text
==================================================
⚡ XFactor Test Suite Sonuçları:
- Backend & Security Tests: 31/31 BAŞARILI
- Derin Doğrulama Tests: 16/16 BAŞARILI
- Edge-Case & Stres Tests: 8/8 BAŞARILI
- Kalite Kapısı & Şema Doğrulama Tests: 7/7 BAŞARILI
- E2E Pipeline Simulation: 1/1 BAŞARILI
==================================================
🎉 Toplam: 63 BAŞARILI, 0 HATALI (%100 Başarı)
==================================================
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
├── yenitodo.md                     # Faz Bazlı İyileştirme ve Yeniden Yapılandırma Takibi
├── analiz.md                       # Kapsamlı Dokümantasyon vs. Gerçek Uygulama Denetim Raporu
├── KULLANIM-KILAVUZU.md             # A'dan Z'ye Kapsamlı Kullanıcı ve Operasyon Kılavuzu
├── README.md                       # Genel Mimari ve Başlangıç Dokümantasyonu
├── graphify-bilgi-notu.md          # Graphify ve Kısıtlı Ağlar Kullanım Notu
│
├── backend/
│   ├── agents/                     # Uzman Ajan Rol ve Sistem Promptları (Agency-Agents Modeli)
│   │   ├── manager.js              # Manager Ajanı
│   │   ├── director.js             # Director Ajanı
│   │   ├── teamleader.js           # Teamleader Ajanı
│   │   ├── coder.js                # Coder Ajanı & Robust Parser
│   │   ├── reviewer.js             # Reviewer Ajanı (Iterative Quality Gate)
│   │   ├── tester.js               # Tester Ajanı & Deterministik Şema/Prisma Audit
│   │   ├── schemas.js              # JSON Şema, Truncation Repair & Regex Extractor
│   │   └── index.js                # Ajan Kayıt Defteri ve Fabrika
│   │
│   ├── engine/                     # Deterministik İş Akışı ve DAG Motoru (Archon Modeli)
│   │   ├── dag.js                  # Topolojik Sıralama ve Döngü Kontrolü
│   │   ├── fileProtocol.js         # "Agent = Klasör" Protokol Dosyaları & Checkpoint Kontrolü
│   │   ├── codeGenerator.js        # Dinamik Scaffold Guard & Kod Yazıcı
│   │   ├── selfCorrection.js       # Reviewer-Coder Çok Turlu Düzeltme Döngüsü
│   │   ├── workflow.js             # Otonom Proje Yürütücüsü & Checkpoint Recovery
│   │   └── index.js                # Motor İndeksi
│   │
│   ├── routes/                     # Modüler API Yönlendiricileri
│   │   ├── authRoutes.js           # Kimlik Doğrulama ve Login Uç Noktaları
│   │   └── projectRoutes.js        # Proje CRUD, Chat, Log ve Workflow Tetikleyicileri
│   │
│   ├── auth.js                     # Kullanıcı, Parola (Scrypt), Oturum ve RBAC
│   ├── db.js                       # SQLite Veritabanı, WAL Kalıcılık & workflow_state Kolonu
│   ├── llm.js                      # Multi-Provider LLM Yönlendirme (Gemini, OpenAI vb.)
│   ├── security.js                 # Path Traversal, CORS, Rate Limit ve Sanitizasyon
│   ├── observability.js            # Request ID ve Yapılandırılmış Loglama
│   ├── server.js                   # Express API & WebSocket Sunucusu
│   ├── test_backend.js             # TDD ve Güvenlik Test Süiti
│   └── test_quality_gate.js        # Kalite Kapısı ve Şema Doğrulama Test Süiti
│
├── frontend/
│   ├── src/
│   │   ├── components/             # Modüler Görünüm Bileşenleri
│   │   │   ├── LoginView.jsx       # Güvenli Giriş Ekranı
│   │   │   ├── Sidebar.jsx         # Sol Menü, Arama ve Proje İşlemleri
│   │   │   ├── Header.jsx          # Üst Başlık ve Süreç Kontrol Butonları
│   │   │   ├── ChatView.jsx        # Manager Beyin Fırtınası Sohbet Paneli
│   │   │   ├── DAGFlowView.jsx     # ReactFlow Canlı DAG ve Log Tablosu
│   │   │   └── IDEView.jsx         # Monaco Editor Proje Dosya Gezgini
│   │   ├── services/
│   │   │   └── api.js              # Modüler XFactor API ve WebSocket İstemcisi
│   │   ├── App.jsx                 # Ana Panel Koordinatörü
│   │   ├── main.jsx                # React Giriş Noktası
│   │   └── index.css               # Tailwind & ReactFlow Stilleri
│   ├── package.json
│   └── vite.config.js
│
├── docs/                           # Mimari Kararlar ve Ajan Rol Talimatnameleri
└── projects/                       # Ajanlar Tarafından Üretilen Gerçek Çıktı Projeleri
```

---

## 🧠 Geliştirici Araçları & Kod Bilgi Grafiği (Graphify)

XFactor projesi, kod tabanının **AST (Abstract Syntax Tree)** düzeyinde analiz edilmesini ve yapay zeka asistanının kod mimarisini ilişkisel bir grafik olarak kavramasını sağlayan **Graphify** bilgi grafiği motoru ile donatılmıştır.

### 📌 Neden Graphify?
- **%90'a Varan Token Tasarrufu:** Yapay zekanın yüzlerce kaynak dosyayı okuması yerine `graphify-out/graph.json` grafiğini sorgulaması sağlanır.
- **Hızlı Mimari Analiz:** Sınıflar, fonksiyonlar ve modüller arası çağrı yolları ve bağımlılıklar milisaniyeler içinde çözümlenir.
- **Yerel ve Güvenli:** Kodlarınız dış sunuculara gönderilmeden tamamen yerel makinede analiz edilir.

### ⚙️ Kurulum ve Entegrasyon
```bash
# 1. Graphify paketini kurun (Python 3.10+)
pip install graphify

# 2. Kod grafiğini ve Gemini / Antigravity CLI entegrasyonunu oluşturun
python -m graphify extract . --code-only
python -m graphify gemini install
```

### ⚡ Önemli Komutlar ve Kullanım Senaryoları

| Komut | Kullanım Senaryosu / Amaç |
| :--- | :--- |
| `python -m graphify extract . --code-only` | Kodları tarar ve `graphify-out/graph.json` grafiğini günceller. |
| `python -m graphify query "<soru>"` | Kod tabanındaki belirli fonksiyon veya bileşen hakkında odaklı sorgu yapar. |
| `python -m graphify explain "<kavram>"` | Projedeki bir mekanizmayı (örn: DAG motoru, RBAC) grafik üzerinden açıklar. |
| `python -m graphify path "<A>" "<B>"` | İki bileşen arasındaki veri/çağrı akış yolunu tespit eder. |
| `python -m graphify god-nodes` | Projenin merkezindeki en kritik (en çok referans alan) düğümleri listeler. |
| `python -m graphify tree` | Tarayıcıda açılabilen `graphify-out/GRAPH_TREE.html` ve `graph.html` interaktif mimari haritasını üretir. |
| `python -m graphify update .` | Kod değişikliklerinden sonra grafiği API maliyetsiz (yalnızca AST) günceller. |

### 🌐 Kısıtlı Ağlarda (MEB vb.) IPv4 ile Çalıştırma
Ağ ortamınızda IPv6 kısıtlaması veya DNS engelleri bulunuyorsa, komutları IPv4 soket zorlamasıyla çalıştırabilirsiniz:
```bash
python -c "import socket; orig=socket.getaddrinfo; socket.getaddrinfo=lambda h,p,f=0,t=0,pr=0,fl=0: orig(h,p,socket.AF_INET,t,pr,fl); from graphify.cli import main; import sys; sys.argv=['graphify'] + sys.argv[1:]; main()" <komut>
```
Detaylı bilgi için [graphify-bilgi-notu.md](file:///D:/dnm/xfactor/graphify-bilgi-notu.md) dokümanını inceleyebilirsiniz.

