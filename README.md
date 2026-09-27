# ⚡ XFactor — Otonom AI Yazılım Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-22.5.0%2B%20%7C%20Bun%201.0%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL%20Migrations-003B57.svg)](https://www.sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-run%20npm%20test-blue.svg)](backend/tests/test_runner.js)

**XFactor**, kullanıcıların doğal dilde ilettiği yazılım fikirlerini analiz ederek 6 seviyeli rol uzmanlaşması, deterministik **DAG dalga motoru**, sürümlü **yazılım sözleşmeleri (PROJECT_CONTRACT)**, 18 zorunlu **kalite kapısı** (Aktif Politika 2.0 Fail-Closed Veto) ve izole **temiz oda (clean-room) ZIP doğrulayıcısı** ile sıfırdan çalışan tam teşekküllü projelere dönüştüren otonom bir yazılım üretim platformudur.

---

## 🌟 Öne Çıkan Yetenekler

* 🤖 **6 Seviyeli Rol Uzmanlaşması:** `Manager` (Mimar), `Director` (Domain), `Teamleader` (DAG/Plan), `Coder` (Geliştirici), `Reviewer` (Kod Denetim) ve `Tester` (Kabul & QA).
* ⚡ **Deterministik DAG Dalga Yürütücüsü:** Görevleri katı atomik tek dosya parçalarına (`targetFiles.length === 1`) böler, bağımsız işleri paralel dalgalar halinde çalıştırır.
* 🛡️ **18 Zorunlu Kalite Kapısı (Aktif Politika 2.0):** Kodlar yalnızca sentaks değil; `clean_install`, `typecheck`, `framework_build`, `service_manifest`, `database_verification`, `api_contract`, `browser_journey`, `smoke_gate`, `placeholder_check`, `contamination_check`, `security_baseline` ve `readme_check` olmak üzere 18 zorunlu kapının makine tarafından doğrulanmış yürütme kanıtı (SHA-256 digest, exit code, ISO UTC zaman damgası) olmadan onaylanmaz (Fail-Closed Veto).
* 📜 **Sürümlü Sözleşme & Çoklu Yığın Sürüm Koruması:** Next.js 15+ (App Router), React 18.3+, Prisma 6.4+, Zod 3.24+ ve Tailwind 3.4+ kararlı sürümleri kilitlidir. Otomatik `service-manifest.json`, `layout.tsx` ve `page.tsx` iskele koruması sağlanır.
* 📦 **Sunucu Tarafı Temiz Oda ZIP Doğrulaması:** Dosya listesinden tahminî ZIP üretimi engellenmiştir. Sunucu tarafında üretilen ZIP artefaktı (`artifacts`), SHA-256 hash'i kilitlenerek izole `artifactVerifier` temiz odasında sıfırdan açılıp test edilmeden ve dayanıklı tamamlama makbuzu (`completion_receipts`, Migrasyon 10) üretilmeden indirilemez (Unverified 409 Conflict).
* 🔒 **Bölünmüş Mimari ve İzole Worker Sınırı (Split Architecture):** Web Orchestrator ve Execution Worker olarak iki ayrı güven sınırına (trust boundary) ayrılmıştır. Güvensiz kod, asla Web Orchestrator üzerinde çalıştırılmaz. API etkileşimi, Bearer token (`EXECUTION_WORKER_TOKEN`) ile doğrulanmış ayrı bir Worker sınırında gerçekleşir. Çok katmanlı uygulamalar için dinamik 4GB RAM / 2GB tmpfs tahsisi ve gzip sıkıştırmalı npm proxy desteği sunar.
* 🛡️ **OS Sandbox Sınırları & Sıfır Sızıntı:** Bubblewrap ve Docker yetenek sözleşmesi ile fail-closed duran izole alt süreç sandbox'ı, proxy DNS yönlendirmesi, otomatik gizli anahtar temizliği (`scrubEnvironmentVariables`), 24 saatlik HttpOnly sunucu oturumları, CSRF ve HSTS korumaları ve yalnızca yöneticilerin tetikleyebildiği global disk senkronizasyonu.
* 🔄 **Dayanıklı LLM Görev Katmanı & Hedefli Onarım:** Geçici ağ ve zaman aşımı hatalarında 3 denemeli sınırlı retry (`llmTaskRetry.js`), Babel AST tabanlı sentaks denetimi ve güvensiz secret fallback hatalarını dosya bazlı sıralı gideren hedefli onarım döngüsü (`executeStaticRepairLoop`).
* 📊 **Kalite Paneli & Telemetri:** Longitudinal kapı metrikleri, hata parmak izi (fingerprinting), ister etki analizi ve yeniden derleme önizlemesi (`/impact`, `/preview`), kimlik bilgileri temizlenmiş (redacted) kanıt logları ve ReactFlow DAG akış şeması. Tamamlanan proje, doğrulanmış ZIP paketi olarak indirilir.
* 🐳 **Üretilen Projelerde Dockerfile:** Üretilen uygulamaya yığınına uygun `Dockerfile` ve `.dockerignore` eklenir. Kullanıcı ZIP'i çıkardıktan sonra `docker build` ve başarılı build sonrası `docker run` komutlarıyla uygulamayı çalıştırabilir.
* 🎨 **Ergonomik UI/UX ve Sıcak Krem Tema:** Göz yormayan sıcak krem arayüz, çok satırlı yüzen sohbet giriş alanı, tek tıkla mesaj kopyalama, kullanıcı profil kartı ve belirgin oturum kapatma alanı.
* 🔄 **Dosya Protokolünden Canlı Durum ve Log Canlandırma (Rehydration Engine):** Diskteki projelerin mimari şartnameleri, görevleri, DAG durumları ve ajan logları tarihsel durum olarak yeniden kurulur. Kurtarılan ZIP `built` kalır; Worker tarafından üretilmiş geçerli doğrulama koşusu, zorunlu PASS kanıtları ve tamamlama makbuzu yoksa indirme açılmaz.

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
> Giriş alanları güvenlik için boş açılır. Bu bilgileri elle girerek başlayabilirsiniz. İnternete açık kurulumdan önce varsayılan parolayı değiştirin.

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

> Backend `GET /healthz` ile yalnız süreç canlılığını, `GET /readyz` ile veritabanı, depolama, üretim frontend'i ve Worker kapasitesini birlikte denetler. Worker yanıt vermezse readiness, varsayılan `READINESS_WORKER_TIMEOUT_MS=2000` süresi sonunda HTTP 503 döner.

> Kısıtlı Windows kurumsal ortamlarında `start-project.ps1` betiği üzerinden de doğrudan çalıştırılabilir.
#### Seçenek B: Ayrı Terminallerde Başlatma
Üç ayrı terminal penceresinde servisleri bağımsız olarak ayağa kaldırabilirsiniz:
* **Terminal 1 (Backend):** `cd backend && npm run dev` *(Backend hazır: http://127.0.0.1:8000)*
* **Terminal 2 (Frontend):** `cd frontend && npm run dev` *(Web Arayüzü: http://localhost:5173)*
* **Terminal 3 (Execution Worker):** proje kökünde `node execution/server.js` *(İç servis: http://127.0.0.1:8099)*
### 3. Kullanmaya Başlayın
1. Tarayıcınızda `http://localhost:5173` adresini açın.
2. README'deki varsayılan bilgileri (`admin` / `xfactor`) giriş alanlarına yazıp **`Giriş Yap`** butonuna tıklayın.
3. Sol menüden **`+ Yeni Proje`** oluşturun.
4. Manager ile sohbet ederek istediğiniz uygulamayı tarif edin ve **`Planı Onayla ve Başlat`** butonuna tıklayın!

Yeni proje açıldığında ilk ekran **Sohbet & Mimari** olur; üst sekmelerde de önce sohbet, ardından **Kalite Paneli**, **Canlı DAG Grafiği** ve **Canlı Süreç Logları** yer alır. Kalite Paneli üstte amacını ve durumların anlamını açıklar; altta koşu geçmişi, yapılan kontroller, çıkış kodu, zaman damgası, SHA-256 özetleri ve gizli bilgileri temizlenmiş loglar bulunur. Manager tamamlanma mesajı kaynak kodu incelemek için doğrulanmış ZIP indirmesine yönlendirir.

Manager'ın tamamlanma mesajı, sağlayıcının bildirdiği ve proje bazında kaydedilen giriş, çıkış ve toplam token kullanımını da gösterir. Bir çağrıda sağlayıcı kullanım bilgisi vermezse yalnız bilinen en düşük toplam ve eksik çağrı sayısı gösterilir. Bu sayaç geçmişte kaydedilmemiş çağrıları geriye dönük hesaplamaz; API ücreti anlamına gelmez.

Next.js projelerinde `public/` dizini boş veya yoksa üretilen Dockerfile derleme aşamasında dizini oluşturur. ZIP'ten çıkarılan uygulama klasöründe `docker build -t projem .` komutu tamamlanmadan `docker run` çalıştırılmamalıdır; build başarısızsa yerel imaj oluşmaz.

### Üretim sırasında hata ve devam etme

Plan onayından sonra Manager'ın `TODO.md` dosyası, Director şartnameleri ve Teamleader görev dosyaları üretim ilerlemesini diskte tutar. Kesinti sonrası **Devam Ettir**, mevcut `TODO.md` ve `GOREV.md` kayıtlarındaki tek dosyalık görev hedeflerini geri yükler. Aynı sözleşmeye ait geçerli checkpoint'ler yeniden kullanılır; kabul hatası nedeniyle açık onarım kaydı varsa tamamlanmış görevler denetlenerek sürdürülür.

Sohbet, üst çubuk ve Loglar ekranı `paused` ile `verification_failed` durumlarında **Devam Ettir** gösterir. `artifact_verified` durumunda son hata kayıtlıysa da aynı seçenek görünür. İş akışı hata bildirdiğinde sohbet ekranı açılır; neden ve varsa ilgili kalite kapısı burada ve süreç loglarında gösterilir. Diskten kurtarılan görevler canlı logları silmeden DAG'a eklenir; tamamlanmamış görevler bitmiş gibi işaretlenmez.

Derlemenin veya ZIP oluşturmanın bitmesi teslimin doğrulandığı anlamına gelmez. Zorunlu kapılardan biri başarısız ya da atlanmışsa proje tamamlanmaz; isteğe bağlı ve uygulanamayan kontrol `NOT_APPLICABLE` olabilir. **ZIP indir** yalnızca geçerli Worker doğrulaması, zorunlu PASS kanıtları ve tamamlama makbuzu oluştuğunda açılır. Ayrıntılı müdahale adımları [kullanıcı kılavuzunda](kullanici-kilavuzu.md#adım-6-canlı-müdahale-duraklatma-ve-kaldığı-yerden-devam-etme-pause--resume) yer alır.

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
npm --prefix frontend run build
npm --prefix execution test
npm run test:e2e
```

Execution Worker'ın gerçek izolasyon entegrasyon testi çalışan bir Docker daemon gerektirir; daemon yoksa ilgili test açıkça `BLOCKED` olur.

---

## 🧾 Kalıcı Sohbet Aksiyon Denetimi

İş akışı ve yardımcı butonlarla yapılan **başarılı** işlemler, aynı proje sohbetinde kullanıcı ve Manager mesaj çifti olarak görünür. Buna plan onayı, devam etme ve duraklatmanın yanı sıra yönetici tarafından yapılan disk senkronizasyonu, sabitleme/sabitlemeyi kaldırma ve doğrulanmış ZIP indirme dahildir.

- Mesajlar frontend tarafından üretilmez; backend'in kanonik proje sohbeti geçmişine yazılır.
- Sayfa yenilense veya başka projeye geçilip geri dönülse bile mesajlar veritabanından yeniden yüklenir ve sıralı kalır.
- Yetkisiz, geçersiz ya da başarısız işlemler başarı mesajı yazmaz; hata mevcut hata bildirimleriyle gösterilir.
- Aynı isteğin ağ tekrarı (aynı aksiyon kimliği) idempotenttir; plan onayı ve devam etme gibi idempotent geçişler sohbeti çoğaltmaz. Ayrı ve başarılı yardımcı buton tıklamaları ise ayrı kullanıcı işlemleri olarak kaydedilir.
- **Projeyi Sil** için bilerek sohbet mesajı yazılmaz. Silme işlemi proje sohbet geçmişini de kaldırdığı için kalıcı bir silme mesajı gösterilemez.

Bu denetim izi, proje durumuyla birlikte kanonik olarak döner; böylece Sohbet, DAG, loglar ve proje menüsü aynı başarılı işlem kaydını kullanır.

Kalite kapısı doğrulaması başarısız olursa proje `verification_failed` durumunda kalır; hata ayrıntısı sohbet ve süreç loglarında görünür. `paused`, `verification_failed` ve son hata kaydı bulunan `artifact_verified` durumlarında **Devam Ettir (Resume)** eylemi sohbet, üst çubuk ve log ekranında kullanılabilir. Devam ettirme aynı backend iş akışını kaldığı yerden başlatır; proje doğrulanmadan ZIP indirme açılmaz.

Normal tamamlama akışı Worker hatasını yerel bir geliştirme doğrulamasına dönüştürmez ve diskten okunan `DURUM.md` / `state.json` kayıtlarından sentetik PASS kanıtı üretmez. Worker hatası kanıtsız başarı yerine fail-closed olarak yukarı taşınır.

---


## 🧠 Mimari Bilgi Grafiği (Graphify)

XFactor, kaynak dosyalarını AST ile tarayan ve elle tanımlanmış mimari ilişkileri de gösteren yerel bir Graphify bilgi grafiği motoruna sahiptir. Dinamik query parçaları rota yolundan ayrılır; Node HTTP Worker rotaları ile `executionClient` istekleri `requests_route` bağlantılarıyla eşleştirilir. Harita her çalışmada mevcut koddan yeniden üretilir:

```bash
npm run graph
```

Bu komut ile `graphify-out/` altında aşağıdaki görsel çıktılar üretilir:
- **Etkileşimli ilişki haritası:** `graphify-out/graph.html` (arama, tür ve ilişki süzgeçleri, seçilen düğümün tüm bağlantıları)
- **Tam kaynak ağacı:** `graphify-out/GRAPH_TREE.html` (taranan dosyalardan üretilen hiyerarşi)
- **Makine okunur grafik:** `graphify-out/graph.json` (dosya, sınıf, fonksiyon, metot, rota, istemci isteği, paket ve ortam değişkeni adı düğümleri)
- **Özet rapor:** `graphify-out/GRAPH_REPORT.md` (güncel tür ve bağlantı sayıları ile statik analiz sınırları)
---

## 📚 Kapsamlı Dokümantasyon

* 📖 **[A'dan Z'ye Kullanıcı ve Operasyon Kılavuzu (kullanici-kilavuzu.md)](kullanici-kilavuzu.md)** — Arayüz kullanımı, revizyon adımları, kurtarma rehberi ve projeyi çalıştırma talimatları.
* 📝 **[Kütüphane Takip Sistemi süreç raporu (surec-raporu.md)](surec-raporu.md)** — Manager sohbetinden başlayan örnek üretimin görevleri, doğrulama denemeleri ve karşılaşılan hatalar. Örnek proje `kutuphane-takip-sistemi-2` kimliğiyle görünür; ZIP yalnızca doğrulama makbuzu oluşup proje tamamlandığında arayüzden indirilebilir.
* 🛠️ **[Operasyon Kılavuzu (docs/OPERATIONS.md)](docs/OPERATIONS.md)** — Tek-node üretim sınırı, MFA/secret envelope, sandbox limitleri, kalıcı volumeler, reverse proxy/TLS sözleşmesi, bakım aralığı ve yatay ölçekleme önkoşulları.
* 📜 **[Master Talimatname & Ajan Anayasası (docs/ORKESTRASYON-TALIMATNAMESI.md)](docs/ORKESTRASYON-TALIMATNAMESI.md)** — Platformun 6 seviyeli orkestrasyon anayasası ve kural seti.
