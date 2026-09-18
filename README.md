# ⚡ XFactor — Otonom AI Yazılım Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-22.5.0%2B%20%7C%20Bun%201.0%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL%20Migrations-003B57.svg)](https://www.sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing%20(25%20Suites)-brightgreen.svg)](backend/tests/test_runner.js)

**XFactor**, kullanıcıların doğal dilde ilettiği yazılım fikirlerini analiz ederek 6 seviyeli rol uzmanlaşması, deterministik **DAG dalga motoru**, sürümlü **yazılım sözleşmeleri (PROJECT_CONTRACT)**, 18 zorunlu **kalite kapısı** (Aktif Politika 2.0 Fail-Closed Veto) ve izole **temiz oda (clean-room) ZIP doğrulayıcısı** ile sıfırdan çalışan tam teşekküllü projelere dönüştüren otonom bir yazılım üretim platformudur.

---

## 🌟 Öne Çıkan Yetenekler

* 🤖 **6 Seviyeli Rol Uzmanlaşması:** `Manager` (Mimar), `Director` (Domain), `Teamleader` (DAG/Plan), `Coder` (Geliştirici), `Reviewer` (Kod Denetim) ve `Tester` (Kabul & QA).
* ⚡ **Deterministik DAG Dalga Yürütücüsü:** Görevleri katı atomik tek dosya parçalarına (`targetFiles.length === 1`) böler, bağımsız işleri paralel dalgalar halinde çalıştırır.
* 🛡️ **18 Zorunlu Kalite Kapısı (Aktif Politika 2.0):** Kodlar yalnızca sentaks değil; `clean_install`, `typecheck`, `framework_build`, `service_manifest`, `database_verification`, `api_contract`, `browser_journey`, `smoke_gate`, `placeholder_check`, `contamination_check`, `security_baseline` ve `readme_check` olmak üzere 18 zorunlu kapının makine tarafından doğrulanmış yürütme kanıtı (SHA-256 digest, exit code, ISO UTC zaman damgası) olmadan onaylanmaz (Fail-Closed Veto).
* 📜 **Sürümlü Sözleşme & Çoklu Yığın Sürüm Koruması:** Next.js 15+ (App Router), React 18.3+, Prisma 6.4+, Zod 3.24+ ve Tailwind 3.4+ kararlı sürümleri kilitlidir. Otomatik `service-manifest.json`, `layout.tsx` ve `page.tsx` iskele koruması sağlanır.
* 📦 **Sunucu Tarafı Temiz Oda ZIP Doğrulaması:** Dosya listesinden tahminî ZIP üretimi engellenmiştir. Sunucu tarafında üretilen ZIP artefaktı (`artifacts`), SHA-256 hash'i kilitlenerek izole `artifactVerifier` temiz odasında sıfırdan açılıp test edilmeden ve dayanıklı tamamlama makbuzu (`completion_receipts`, Migrasyon 10) üretilmeden indirilemez (Unverified 409 Conflict).
* 🔒 **Bölünmüş Mimari ve İzole Worker Sınırı (Split Architecture):** Web Orchestrator ve Execution Worker olarak iki ayrı güven sınırına (trust boundary) ayrılmıştır. Güvensiz kod, asla Web Orchestrator üzerinde çalıştırılmaz. API etkileşimi, Bearer token (`EXECUTION_WORKER_TOKEN`) ile doğrulanmış ayrı bir Worker sınırında gerçekleşir. Çok katmanlı uygulamalar için dinamik 4GB RAM / 2GB tmpfs tahsisi ve gzip sıkıştırmalı npm proxy desteği sunar.
* 🛡️ **OS Sandbox Sınırları & Sıfır Sızıntı:** Bubblewrap ve Docker yetenek sözleşmesi ile fail-closed duran izole alt süreç sandbox'ı, proxy DNS yönlendirmesi, otomatik gizli anahtar temizliği (`scrubEnvironmentVariables`), 24 saatlik HttpOnly sunucu oturumları, CSRF ve HSTS korumaları, ve çift yönlü disk senkronizasyonu.
* 🔄 **Dayanıklı LLM Görev Katmanı & Hedefli Onarım:** Geçici ağ ve zaman aşımı hatalarında 3 denemeli sınırlı retry (`llmTaskRetry.js`), Babel AST tabanlı sentaks denetimi ve güvensiz secret fallback hatalarını dosya bazlı sıralı gideren hedefli onarım döngüsü (`executeStaticRepairLoop`).
* 📊 **Kalite Paneli & Telemetri:** Longitudinal kapı metrikleri, hata parmak izi (fingerprinting), ister etki analizi ve yeniden derleme önizlemesi (`/impact`, `/preview`), kimlik bilgileri temizlenmiş (redacted) kanıt logları, ReactFlow DAG akış şeması ve dahili Monaco Editor IDE.
* 🐳 **Üretilen Projelerde Tak-Çalıştır Konteyner (Dockerfile):** Üretilen her uygulamaya özel çok aşamalı (multi-stage) `Dockerfile` ve `.dockerignore` otomatik eklenir; kullanıcı tek komutla (`docker build` veya `docker compose up`) projeyi kendi sunucusunda ayağa kaldırabilir.
* 🎨 **Ergonomik UI/UX ve Sıcak Krem Tema:** Göz yormayan sıcak krem arayüz, çok satırlı yüzen sohbet giriş alanı, tek tıkla mesaj kopyalama, kullanıcı profil kartı ve belirgin oturum kapatma alanı.
* 🔄 **Dosya Protokolünden Canlı Durum ve Log Canlandırma (Rehydration Engine):** Diskteki projelerin mimari şartnameleri, görevleri, DAG durumları ve 200+ ajan logları veritabanıyla çift yönlü eşitlenir; devam eden projelerde onay butonları, tamamlananlarda ise doğrulanmış ZIP indirme aktifleşir.

---

## 🚀 Hızlı Başlangıç

### 1. Hazırlık ve Bağımlılıklar
```bash
# 1. Backend yapılandırması
cd backend
copy .env.example .env    # Linux/macOS: cp .env.example .env

# .env dosyasına GOOGLE_API_KEY değerinizi girin
npm install

# 2. Frontend bağımlılıkları
cd ../frontend
npm install
cd ..
```

> 🔑 **Varsayılan Yönetici Girişi:** XFactor, hazır tanımlı bir geliştirici hesabı ile gelir:
> - **Kullanıcı Adı:** `admin`
> - **Şifre:** `xfactor`
> 
> Tarayıcı giriş ekranında bu bilgiler otomatik doldurulmuş olarak gelir; doğrudan **"Giriş Yap"** butonuna basarak başlayabilirsiniz.

#### (Opsiyonel) Parola Değiştirme veya Yeni Yönetici Ekleme
Parolanızı değiştirmek veya sıfırlamak isterseniz (asgari 6 karakter):
```bash
cd backend
npm run create-admin -- admin            # yeni yönetici oluşturur
npm run create-admin -- admin --renew    # mevcut parolayı doğrulayıp yenisiyle değiştirir
npm run create-admin -- admin --reset    # unutulan parolayı sıfırlar
cd ..
```
### 2. Uygulamayı Başlatma

#### ⭐ Seçenek A: Kök Dizininden Tek Komutla Başlatma (Önerilen)
Proje kök dizinindeyken tek bir `npm run dev` komutuyla sistemin 3 temel servisi eşzamanlı başlatılır:
```bash
npm run dev
```

| Port | Servis | Rolü ve Erişimi |
|:---:|---|---|
| **`5173`** | **Frontend (Vite/React)** | **Kullanıcı Arayüzü:** Tarayıcınızda açacağınız ana panel (`http://localhost:5173`). |
| **`8000`** | **Backend (Web Orchestrator)** | **Platform Beyni:** REST API, SQLite WAL, WebSocket telemetrisi ve 6 yapay zekâ ajanı. |
| **`8099`** | **Execution Worker** | **İzole Derleyici/Test:** Yapay zekânın ürettiği kodları izole çalıştıran iç servis. |

> ℹ️ **Execution Worker (`8099`) Hakkında:** Bu port tarayıcıyla açılacak bir web sayfası değildir; Backend'in Bearer token (`EXECUTION_WORKER_TOKEN`) ile iletişim kurduğu korumalı bir iç RPC servisidir. Tarayıcıdan açıldığında `{"error":"Unauthorized"}` dönmesi güvenlik kalkanının çalıştığını gösterir. Worker'ın derleme ve test logları doğrudan Frontend arayüzündeki **Loglar**, **DAG Akışı** ve **Kalite Paneli** sekmelerine canlı yansıtılır.

> Kısıtlı Windows kurumsal ortamlarında `start-project.ps1` betiği üzerinden de doğrudan çalıştırılabilir.
#### Seçenek B: Ayrı Terminallerde Başlatma
İki ayrı terminal penceresinde servisleri bağımsız olarak ayağa kaldırabilirsiniz:
* **Terminal 1 (Backend):** `cd backend && npm run dev` *(Backend hazır: http://127.0.0.1:8000)*
* **Terminal 2 (Frontend):** `cd frontend && npm run dev` *(Web Arayüzü: http://localhost:5173)*
### 3. Kullanmaya Başlayın
1. Tarayıcınızda `http://localhost:5173` adresini açın.
2. Otomatik doldurulmuş varsayılan bilgilerle (`admin` / `xfactor`) doğrudan **`Giriş Yap`** butonuna tıklayın.
3. Sol menüden **`+ Yeni Proje`** oluşturun.
4. Manager ile sohbet ederek istediğiniz uygulamayı tarif edin ve **`Planı Onayla ve Başlat`** butonuna tıklayın!
---

## 🧪 Test Süiti & Güvenlik Doğrulaması

Platform, çekirdek motorları, güvenlik sınırlarını, MFA ve observabilite mekanizmalarını kapsayan backend test süitleri ile frontend birim testleri ve Chromium tabanlı E2E testlerine sahiptir. CI (`test` işi) bunların tamamını zorunlu kılar: backend/frontend `npm audit --audit-level=high` (60 sn sınır, engelleyici), `P8_REQUIRE_DOCKER_LIMITS=1` ile backend süitleri, `test:unit`, frontend build ve `test:e2e`.

```bash
cd backend
npm test
```
> Testler `os.tmpdir()` üzerindeki izole geçici sandbox'ta çalışır; geliştirme veritabanınızı (`projects.db`) ve `projects/` klasörünüzü kesinlikle kirletmez.

```bash
npm --prefix frontend run test:unit
npm run test:e2e
```

---

## 🧠 Mimari Bilgi Grafiği (Graphify)

XFactor, projedeki tüm kaynak kodları, yaşayan anayasa dokümanlarını (`docs/*.md`), ajan modüllerini ve test süitlerini AST seviyesinde analiz eden yerel bir Graphify bilgi grafiği motoruna sahiptir:

```bash
npm run graph
```

Bu komut ile `graphify-out/` altında aşağıdaki görsel çıktılar üretilir:
- **İnteraktif 2D/3D Kod Haritası:** `graphify-out/graph.html` (D3.js tabanlı ağ haritası)
- **Hiyerarşik Modül Ağacı:** `graphify-out/GRAPH_TREE.html` (Renk kodlu hiyerarşi görünümü)
- **Mimari Özet Raporu:** `graphify-out/GRAPH_REPORT.md` (69 düğüm, 92 bağlantı ve God Node analizleri)
---

## 📚 Kapsamlı Dokümantasyon

* 📖 **[A'dan Z'ye Kullanıcı ve Operasyon Kılavuzu (kullanici-kilavuzu.md)](kullanici-kilavuzu.md)** — Arayüz kullanımı, revizyon adımları, kurtarma rehberi ve projeyi çalıştırma talimatları.
* 🛠️ **[Operasyon Kılavuzu (docs/OPERATIONS.md)](docs/OPERATIONS.md)** — Tek-node üretim sınırı, MFA/secret envelope, sandbox limitleri, kalıcı volumeler, reverse proxy/TLS sözleşmesi, bakım aralığı ve yatay ölçekleme önkoşulları.
* 📜 **[Master Talimatname & Ajan Anayasası (docs/ORKESTRASYON-TALIMATNAMESI.md)](docs/ORKESTRASYON-TALIMATNAMESI.md)** — Platformun 6 seviyeli orkestrasyon anayasası ve kural seti.

