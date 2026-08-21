# ⚡ XFactor — Otonom AI Kod Üretim ve Yazılım Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B%20%7C%2022%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL-003B57.svg)](https://www.sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-85%2F85%20Passing%20(8%20Suites)-brightgreen.svg)](backend/tests/test_runner.js)

**XFactor**, kullanıcıların doğal dilde ilettiği yazılım isteklerini analiz ederek 6 seviyeli rol uzmanlaşması (`Manager`, `Director`, `Teamleader`, `Coder`, `Reviewer`, `Tester`), deterministik **DAG dalga yürütücüsü**, katı **çok katmanlı kalite kapıları** ve **gerçek compiler/build doğrulayıcısı** ile sıfırdan çalışan tam teşekküllü yazılım projeleri üreten merkezi bir AI orkestrasyon platformudur.

---

## 🏗️ Gerçek Runtime Mimarisi

XFactor, dağıtık veya bağımsız aktör/mikroservis tabanlı bir "multi-agent" yapısı **değildir**. Tek bir Node.js sürecinde çalışan **Merkezi Prosedürel Orkestratör + In-Memory DAG Dalga Yürütücüsü + Durum Makineli Prompt/Parser Pipeline'ıdır**.

```text
[Kullanıcı / Boss]
       │ Doğal Dilde İstek & Beyin Fırtınası (HTTP POST /api/projects/:id/chat)
       ▼
[Manager Chat Route] ──────────────────────────┐
       │ (buildManagerChatSystemPrompt)        │
       ▼                                       │ (State: pending_approval)
[Manager Rolü] ──► Şartname & Domainler ───────┘
       │
       ▼ Kullanıcı Onayı (HTTP POST /api/projects/:id/approve)
[executeProjectTasks() - Merkezi Orkestratör]
       │
       ├─► 1. Manager Protokolü ──► TALIMATNAME.md, TODO.md, .env, tsconfig, package.json
       │
       ├─► 2. Director Katmanı (Domain Bazlı) ──► ALT-TALIMATNAME.md & Takım Liderleri
       │
       ├─► 3. Teamleader Katmanı (DAG Çözümleme) ──► Atomik Görevler (Maks 1-2 Dosya)
       │
       ├─► 4. DAG Dalga Yürütücüsü (Execution Waves - Concurrency Limit: 2)
       │     │
       │     ├──► Görev Tamamlanmış mı? (isTaskCompleted) ──► Evet: Atla (Checkpoint Skip)
       │     │
       │     └──► Hayır: [Coder & Reviewer Döngüsü - selfCorrection.js]
       │             │
       │             ├─► Coder (Kod Üretimi)
       │             ├─► Reviewer (Kod Denetimi & Kalite Kapısı)
       │             │     ├─► Red (Düzeltme İsteği, Maks 2 Tur) ──► Tekrar Coder
       │             │     └─► Veto ──► Task Failed & Workflow Paused (Fail-Closed)
       │             └─► Onay ──► fs.writeFile (Proje Kökü & Coder Klasörü)
       │
       ├─► 5. Çok Katmanlı Kalite Kapısı & Derleme Doğrulaması
       │     ├─► A. Deterministik Statik Denetim (JSON, Parantez Dengesi, Dosya Varlığı)
       │     ├─► B. Compiler / Type Validation (npx tsc --noEmit / TS Semantic Validator)
       │     ├─► C. Prisma Validation (npx prisma validate / Schema Linter)
       │     ├─► D. Framework Build Check (npm run build - node_modules mevcutsa)
       │     │
       │     └──► Hata Varsa ──► Coder Otomatik Onarım Döngüsü (Maks 2 Tur) ──► Revalidate
       │
       ├─► 6. Tester Final QA (Project Manifest + Compiler Sonuçları + Spec)
       │     ├─► Başarısız ──► DURUM.md = BASARISIZ & state.status = paused
       │     └─► Başarılı ──► RAPOR.md & README.md Üretimi
       │
       └─► 7. Tamamlanma & Yayın (status = 'completed')
```

---

## 🛡️ Çok Katmanlı Kalite Kapıları (Quality Gates)

XFactor, üretilen kodların çalışabilirliğini güvenceye almak için sıralı 6 aşamalı bir denetim hattı işletir:

| Sıra | Kalite Kapısı | Uygulama & Komut | Neyi Yakalar? | Neyi Garanti Etmez? |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Reviewer Gate** | `selfCorrection.js` (LLM) | Görev bazlı sözdizimi, eksik JSX kapanışı, prompt uyumu. | Proje genelindeki semantik ve tip uyumunu tek başına garanti etmez. |
| **2** | **Static Audit** | `tester.js` (Regex/AST) | Bozuk JSON parse, dengesiz parantezler, diskte olmayan kırık yerel importlar. | TypeScript tip uyuşmazlıklarını ve derin runtime mantık hatalarını yakalayamaz. |
| **3** | **Type / Compiler Gate** | `buildValidator.js` (`tsc --noEmit`) | Tip uyuşmazlıkları (`TS2322`), tanımsız metotlar (`TS2339`), eksik interface'ler. | Çalışma zamanı dinamik veri uyuşmazlıklarını yakalayamaz. |
| **4** | **Prisma Gate** | `buildValidator.js` (`prisma validate`) | Geçersiz provider, tanımsız model/ilişki alanları, eksik birincil anahtarlar (`@id`). | Veritabanı sunucusunun anlık ağ bağlantısını test etmez. |
| **5** | **Build Sandbox Gate**| `buildValidator.js` (`npm run build`) | Next.js / Vite derleme anı asset ve konfigürasyon hataları. | Harici backend servislerinin runtime yanıtlarını test etmez. |
| **6** | **Tester Manifest QA**| `tester.js` (LLM Manifest) | Rotalar, veri modelleri, env değişkenleri ve kabul kriterleri uyumu. | Birim (unit) test assertion'ları çalıştırmaz. |

---

## 🤖 Rol Hiyerarşisi (6 Seviye)

* **Manager (Seviye 0):** Proje gereksinimlerini analiz eder, `TALIMATNAME.md` üretir, domainleri belirler ve canlı telemetri/log takibi yapar.
* **Director (Seviye 1):** Domain standartlarını, teknoloji yığınını ve sözleşmeleri belirleyerek `ALT-TALIMATNAME.md` hazırlar.
* **Teamleader (Seviye 2):** Görevleri Coder'ın tek seferde bitirebileceği **atomik parçalara (maksimum 1-2 dosya)** ayırır ve bağımlılık DAG'ını oluşturur.
* **Coder (Seviye 3):** Belirlenen hedef dosyaları TypeScript uyumlu, kompakt ve modüler bileşenler halinde kodlar.
* **Reviewer (Seviye 4):** Üretilen kodu bağımsız olarak denetler; hata varsa düzeltme ister, 2 tur sonunda onaylanmazsa fail-closed **VETO** uygular.
* **Tester (Seviye 5):** Proje manifestosu, derleyici sonuçları ve kabul kriterlerini karşılaştırarak nihai kabul raporunu (`RAPOR.md` & `README.md`) yazar.

---

## 🖥️ 4 Bağımsız Dashboard Sekmesi

1. 💬 **Sohbet & Mimari:** Manager ile beyin fırtınası, zaman damgalı konuşma geçmişi ve mimari plan onay kartı (`pending_approval`).
2. 📊 **Canlı DAG Grafiği:** Renk kodlu, 2 sütunlu ve hiyerarşik ReactFlow akış ağacı görünümü.
3. 📜 **Canlı Süreç Logları:** Arama ve filtreleme (`ERROR`, `VETO`, `WRITE`, `FINISH`, `FEEDBACK`) destekli tam sayfa telemetri tablosu.
4. 💻 **Kod Editörü (IDE):** Tamamlanan projeyi anlık incelemek için Monaco Editor ve `.env` dahil tek tıkla ZIP indirme.

---

## 🚀 Hızlı Başlangıç ve Kurulum

### Sistem Gereksinimleri
* **Node.js:** v18.0.0+, v20.0.0+ veya v22.0.0+ (veya Bun v1.0+)
* **İşletim Sistemi:** Windows 10/11, macOS, Linux

### 1. Backend Kurulumu
```bash
cd backend
# .env dosyasını oluşturun
cp .env.example .env   # Windows için: copy .env.example .env

# Bağımlılıkları yükleyin
npm install

# Backend'i başlatın
npm run dev
# Backend hazır: http://127.0.0.1:8000
```

### 2. Frontend Kurulumu
```bash
cd ../frontend

# Bağımlılıkları yükleyin
npm install

# Frontend'i başlatın
npm run dev
# Web Arayüzü: http://localhost:5173
```

---

## ⚙️ Ortam Değişkenleri (.env)

`backend/.env.example` dosyasında tanımlı değişkenler:

```env
PORT=8000
JWT_SECRET=en-az-32-karakter-uzunlugunda-guclu-bir-rastgele-anahtar
ADMIN_USER=admin
ADMIN_PASS=GucluParola!2026_EnAz12Karakter
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AI_PROVIDER=google
AI_MODEL=gemini-3.5-flash
ALLOW_MOCK_FALLBACK=false

# Seçtiğiniz sağlayıcıya ait API Anahtarı:
GOOGLE_API_KEY=AIzaSy...
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=...
# OPENROUTER_API_KEY=...
# QWEN_API_KEY=...
```

### Desteklenen LLM Sağlayıcıları
* **Google Gemini:** `gemini-3.5-flash`, `gemini-3.5-pro` (Varsayılan ve önerilen)
* **OpenAI:** `gpt-4o`, `gpt-4o-mini`
* **DeepSeek:** `deepseek-chat`, `deepseek-coder`
* **OpenRouter:** Çoklu model yönlendirme
* **Qwen & MiniMax & Kimi:** REST uyumlu endpoint'ler

---

## 🧪 Test Süiti

XFactor, çekirdek motor güvenilirliğini 8 ayrı test süitinde **85/85 test (%100 Başarı)** ile doğrular:

```bash
cd backend
npm test
```

### Test Süiti Yapısı
1. **Backend & Güvenlik:** JWT auth, RBAC matrisi, path traversal filtreleri, WebSocket subprotocol güvenliği (31 Test).
2. **Concurrency Pool:** Dalga yürütücüsü, havuz aktif görev takibi ve limit izolasyonu (6 Test).
3. **Build & Compiler Validator:** TypeScript `tsc`, Prisma validation, build script fail ve process timeout kontrolleri (7 Test).
4. **Kalite Kapısı & Deterministik Doğrulama:** Prisma model uyumu, JSON doğrulaması, kırık import tespiti (10 Test).
5. **DAG & Dosya Protokolü Derin Doğrulama:** Topolojik sıralama, döngü engelleme, markdown protokol dosyaları (17 Test).
6. **Edge-Case & Stres:** Ayrık graflar, self-loop'lar ve bozuk JSON onarımları (8 Test).
7. **Çalışma Zamanı Doğrulaması:** Checkpoint-resume ve scaffold guard testleri (6 Test).
8. **E2E Simülasyonu:** L0'dan L5'e tam otonom pipeline entegrasyonu (1 Test).

---

## ⚠️ Bilinen Sınırlamalar (Known Limitations)

1. **İnternetsiz Ortamda CLI İndirmeleri:** Eğer sistemde yerel `typescript` veya `prisma` paketleri kurulu değilse ve internet bağlantısı yoksa, CLI doğrulamaları semantic/static motor fallback'ine geçer.
2. **Çoklu Görev Semantik Sapması:** Coder ajanları görevleri izole yazdığı için proje genelinde terminoloji farklılıkları (örn. bir bileşende "Quiz", diğerinde "Exam" yazılması) oluşabilir; bu durum Project Manifest ile asgariye indirilmiştir.
3. **Frontend-Backend Derin Sözleşme Denetimi:** API endpoint parametrelerinin statik şema uyumu kontrol edilse de dinamik runtime mock veri testleri derleme anında çalıştırılmaz.
4. **Eşzamanlılık Sınırı:** Varsayılan LLM havuzu eşzamanlılığı `CONCURRENCY_LIMIT = 2` olarak ayarlanmıştır; LLM sağlayıcısının rate-limit sınırlarına göre yapılandırılmalıdır.

---

## 📚 Kapsamlı Dokümantasyon

* 📖 **[Adım Adım Kullanım Kılavuzu (docs/USAGE.md)](docs/USAGE.md)**
* 📜 **[Master Talimatname & Protokol Anayasası (docs/ORKESTRASYON-TALIMATNAMESI.md)](docs/ORKESTRASYON-TALIMATNAMESI.md)**
