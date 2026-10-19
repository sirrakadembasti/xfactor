# ⚡ XFactor — Otonom AI Yazılım Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-22.23.2-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL%20Migrations-003B57.svg)](https://www.sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-run%20npm%20test-blue.svg)](backend/tests/test_runner.js)

**XFactor**, kullanıcıların doğal dilde ilettiği yazılım fikirlerini analiz ederek 6 seviyeli rol uzmanlaşması, deterministik **DAG dalga motoru**, sürümlü **yazılım sözleşmeleri (PROJECT_CONTRACT)**, 18 zorunlu **kalite kapısı** (Aktif Politika 2.0 Fail-Closed Veto) ve izole **temiz oda (clean-room) ZIP doğrulayıcısı** ile sıfırdan çalışan tam teşekküllü projelere dönüştüren otonom bir yazılım üretim platformudur.

---

## 🌟 Öne Çıkan Yetenekler

**LLM sağlayıcı yönetimi:** Yönetici hesabıyla sol menüdeki **LLM Yönetimi** bağlantısını açın. Yerel `backend/.env` dosyasında LLM için yalnızca profil şifreleme anahtarı tutulur; sağlayıcı adresi, model ve API anahtarları yönetim ekranındaki şifreli profillerde saklanır. Xiaomi MiMo Singapur adresi ve modelleri katalogda başlangıç değeri olarak sunulur; API adresi ile model kimliğini elle değiştirebilirsiniz. Aynı anda yalnızca bir profil etkindir. Sayfa seçili profili, pasif profilleri ve her profilin son bağlantı testinin sonucunu ve zamanını gösterir. Son test sonucu anlık erişim garantisi değildir; profil düzenlenirse yeniden sınanmalıdır. Kurulum ve kullanım adımları [LLM yönetimi kılavuzunda](backend/llm-auth/LLM-YONETIMI.md) yer alır. Seçilen profil Manager sohbeti ve üretim ajanları tarafından kullanılır.

* 🤖 **6 Seviyeli Rol Uzmanlaşması:** `Manager` (Mimar), `Director` (Domain), `Teamleader` (DAG/Plan), `Coder` (Geliştirici), `Reviewer` (Kod Denetim) ve `Tester` (Kabul & QA).
* ⚡ **Deterministik DAG Dalga Yürütücüsü:** Görevleri katı atomik tek dosya parçalarına (`targetFiles.length === 1`) böler, bağımsız işleri paralel dalgalar halinde çalıştırır.
* 🛡️ **18 Zorunlu Kalite Kapısı (Aktif Politika 2.0):** Kodlar yalnızca sentaks değil; `clean_install`, `typecheck`, `framework_build`, `service_manifest`, `database_verification`, `api_contract`, `browser_journey`, `smoke_gate`, `placeholder_check`, `contamination_check`, `security_baseline` ve `readme_check` olmak üzere 18 zorunlu kapının makine tarafından doğrulanmış yürütme kanıtı (SHA-256 digest, exit code, ISO UTC zaman damgası) olmadan onaylanmaz (Fail-Closed Veto).
* 📜 **Sürümlü Sözleşme & Çoklu Yığın Sürüm Koruması:** Next.js 15+ (App Router), React 18.3+, Prisma 6.4+, Zod 3.24+ ve Tailwind 3.4+ kararlı sürümleri kilitlidir. Otomatik `service-manifest.json`, `layout.tsx` ve `page.tsx` iskele koruması sağlanır.
* 📦 **Sunucu Tarafı Temiz Oda ZIP Doğrulaması:** Dosya listesinden tahminî ZIP üretimi engellenmiştir. Sunucu tarafında üretilen ZIP artefaktı (`artifacts`), SHA-256 hash'i kilitlenerek izole `artifactVerifier` temiz odasında sıfırdan açılıp test edilmeden ve dayanıklı tamamlama makbuzu (`completion_receipts`, Migrasyon 10) üretilmeden indirilemez (Unverified 409 Conflict).
* 🔒 **Bağımsız Execution Worker:** Web Orchestrator ve Execution Worker ayrı süreçlerdir; iş API'si Bearer token (`EXECUTION_WORKER_TOKEN`) ile korunur. `npm run dev:local` kalite kontrollerini Docker olmadan Node/npm/Playwright/Chromium ile yürütür. `local-trusted` profili işletim sistemi izolasyonu sağlamaz; üretilen kod worker kullanıcısının yetkileriyle çalışır.
* 🛡️ **Profile Göre Güvenlik Sınırları:** Docker profili container kaynak/ağ sınırlarını uygular. Yerel profil ayrı iş dizini, ortam temizliği, arşiv sınırları, iptal ve süreç ağacı temizliği sağlar; container sandbox garantisi vermez. HttpOnly oturum, CSRF, HSTS ve yöneticiye özel disk senkronizasyonu platformun ortak korumalarıdır.
* 🔄 **Dayanıklı LLM Görev Katmanı & Hedefli Onarım:** Geçici ağ ve zaman aşımı hatalarında 3 denemeli sınırlı retry (`llmTaskRetry.js`), Babel AST tabanlı sentaks denetimi ve güvensiz secret fallback hatalarını dosya bazlı sıralı gideren hedefli onarım döngüsü (`executeStaticRepairLoop`).
* 📊 **Kalite Paneli & Telemetri:** Longitudinal kapı metrikleri, hata parmak izi (fingerprinting), ister etki analizi ve yeniden derleme önizlemesi (`/impact`, `/preview`), kimlik bilgileri temizlenmiş (redacted) kanıt logları ve ReactFlow DAG akış şeması. Tamamlanan proje, doğrulanmış ZIP paketi olarak indirilir.
* 🐳 **Üretilen Projelerde Dockerfile:** Üretilen uygulamaya yığınına uygun `Dockerfile` ve `.dockerignore` eklenir. Kullanıcı ZIP'i çıkardıktan sonra `docker build` ve başarılı build sonrası `docker run` komutlarıyla uygulamayı çalıştırabilir.
* 🎨 **Ergonomik UI/UX ve Sıcak Krem Tema:** Göz yormayan sıcak krem arayüz, çok satırlı yüzen sohbet giriş alanı, tek tıkla mesaj kopyalama, kullanıcı profil kartı ve belirgin oturum kapatma alanı.
* 🔄 **Dosya Protokolünden Canlı Durum ve Log Canlandırma (Rehydration Engine):** Diskteki projelerin mimari şartnameleri, görevleri, DAG durumları ve ajan logları tarihsel durum olarak yeniden kurulur. Kurtarılan ZIP `built` kalır; Worker tarafından üretilmiş geçerli doğrulama koşusu, zorunlu PASS kanıtları ve tamamlama makbuzu yoksa indirme açılmaz.

---

## 🚀 Hızlı Başlangıç

Platform ajanlarının dosyaları kökteki **`x-agents/`** dizinindedir: altı rol talimatı, orkestrasyon anayasası ve `GOREV/DURUM/TODO/RAPOR/ALT-TALIMATNAME` şablonları. Backend yalnız bu sabit dizindeki izinli dosyaları sistem istemi olarak okur; `docs/` veya üretilen proje belgeleri bu talimatların kaynağı değildir. Eksik/geçersiz talimat üretimi engeller.

`docs/` geliştirme ve işletim belgelerine ayrılmıştır. Üretilen uygulamanın README ve belgeleri `projects/<proje-id>/` altında; o üretimin gerçek görev/durum kayıtları da aynı projenin `manager/` ve alt ajan klasörlerinde tutulur. `x-agents` altındaki durum dosyaları şablondur. Proje kökü veya proje klasörü `x-agents` ile çakışırsa backend bunu reddeder. Ayrıntılar: [ajan dosyaları kılavuzu](x-agents/README.md).

### 1. Hazırlık ve Bağımlılıklar
```bash
# 1. Backend yapılandırması
cd backend
# İlk açılış .env dosyasını oluşturur ve LLM şifreleme anahtarını yazar.
# Özel port veya ağ ayarı gerekiyorsa .env.example dosyasını önce .env olarak kopyalayıp düzenleyin.
# Sağlayıcı API anahtarını LLM Yönetimi ekranında kaydedin.
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
Backend ve frontend bağımlılıkları kurulduktan sonra yerel worker araçlarını hazırlayıp üç servisi Docker olmadan başlatın:
```bash
npm run worker:local:setup -- --install
npm run dev
```

| Port | Servis | Rolü ve Erişimi |
|:---:|---|---|
| **`5173`** | **Frontend (Vite/React)** | **Kullanıcı Arayüzü:** Tarayıcınızda açacağınız ana panel (`http://127.0.0.1:5173`). |
| **`8000`** | **Backend (Web Orchestrator)** | **Platform Beyni:** REST API, SQLite WAL, WebSocket telemetrisi ve 6 yapay zekâ ajanı. |
| **`8099`** | **Execution Worker** | **Bağımsız Derleyici/Test:** Yerel veya Docker profiliyle çalışan, token korumalı iç servis. |

> ℹ️ **Execution Worker (`8099`) Hakkında:** Bu port tarayıcıyla açılacak bir web sayfası değildir; Backend'in Bearer token (`EXECUTION_WORKER_TOKEN`) ile iletişim kurduğu korumalı bir iç RPC servisidir. Tarayıcıdan açıldığında `{"error":"Unauthorized"}` dönmesi güvenlik kalkanının çalıştığını gösterir. Worker'ın derleme ve test logları doğrudan Frontend arayüzündeki **Loglar**, **DAG Akışı** ve **Kalite Paneli** sekmelerine canlı yansıtılır.

> Backend `GET /healthz` ile yalnız süreç canlılığını, `GET /readyz` ile veritabanı, depolama, üretim frontend'i ve Worker kapasitesini birlikte denetler. Worker yanıt vermezse readiness, varsayılan `READINESS_WORKER_TIMEOUT_MS=2000` süresi sonunda HTTP 503 döner.

> Kısıtlı Windows kurumsal ortamlarında `start-project.ps1` betiği üzerinden de doğrudan çalıştırılabilir.
#### Seçenek B: Ayrı Terminallerde Başlatma
Üç ayrı terminal penceresinde servisleri bağımsız olarak ayağa kaldırabilirsiniz:
* **Terminal 1 (Backend):** `cd backend && npm run dev` *(Backend hazır: http://127.0.0.1:8000)*
* **Terminal 2 (Frontend):** `cd frontend && npm run dev` *(Web Arayüzü: http://127.0.0.1:5173)*
* **Terminal 3 (Execution Worker):** yerel kullanımda [paket kılavuzundaki](docs/LOCAL-WORKER-PACKAGE.md) launcher ve backend URL/token bağlantısını kullanın *(İç servis: http://127.0.0.1:8099)*. Normal `npm run dev` Docker olmadan yerel worker'ı başlatır; `npm run dev:local` aynı akışın açık adıdır. Docker profili yalnız `npm run dev:docker` ile seçilir. Doğrudan `node execution/server.js` düşük seviyeli sunucu komutudur ve ayrı runtime/token yapılandırması gerektirir.
### 3. Kullanmaya Başlayın
1. Tarayıcınızda `http://127.0.0.1:5173` adresini açın.
2. README'deki varsayılan bilgileri (`admin` / `xfactor`) giriş alanlarına yazıp **`Giriş Yap`** butonuna tıklayın.
3. Sol menüden **`+ Yeni Proje`** oluşturun.
4. Manager ile istediğiniz uygulamayı tarif edin. Geçerli planı **`Planı Onayla ve Başlat`** düğmesiyle veya **“varsayımlarla devam et”** yazarak onaylayın.

Manager planı kısa özetle sunar; tam şartname ve kapsam **Planın kapsamını ve kabul kriterlerini incele** bölümündedir. Mevcut bekleyen planın sohbetten açık onayında yeniden LLM çağrılmaz; düğmeyle aynı yetki, sözleşme ve tek yürütme kontrolleri uygulanır. Geçersiz JSON/eksik test sözleşmesi için bir sınırlı düzeltme denenir. Düzelmezse hata gösterilir, onay düğmesi açılmaz ve üretim başlamaz.

Yeni proje açıldığında ilk ekran **Sohbet & Mimari** olur; üst sekmelerde de önce sohbet, ardından **Kalite Paneli**, **Canlı DAG Grafiği** ve **Canlı Süreç Logları** yer alır. Kalite Paneli üstte amacını ve durumların anlamını açıklar; altta koşu geçmişi, yapılan kontroller, çıkış kodu, zaman damgası, SHA-256 özetleri ve gizli bilgileri temizlenmiş loglar bulunur. Manager tamamlanma mesajı kaynak kodu incelemek için doğrulanmış ZIP indirmesine yönlendirir.

Manager'ın tamamlanma mesajı, sağlayıcının bildirdiği ve proje bazında kaydedilen giriş, çıkış ve toplam token kullanımını da gösterir. Bir çağrıda sağlayıcı kullanım bilgisi vermezse yalnız bilinen en düşük toplam ve eksik çağrı sayısı gösterilir. Bu sayaç geçmişte kaydedilmemiş çağrıları geriye dönük hesaplamaz; API ücreti anlamına gelmez.

### Yönetim ve takip uygulamalarının kapsamı

Manager, kullanıcı “admin paneli” demese bile kalıcı kayıt, işlem veya rol gerektiren her istekte yönetim ihtiyacını değerlendirir. Önerilen planda yönetilecek kaynaklar, gerekli işlemler, yönetim ekranları, oturum açma ve rol yetkileri açıklanır; yönetim gerekmiyorsa bunun gerekçesi yazılır. Bu kapsam kod üretimine ancak kullanıcının planı onaylamasıyla girer. Açık kullanıcı kaydı ayrı bir ürün kararıdır; kayıt işlemi ayrıcalıklı rol vermez.

Yönetim gerektiren projelerde her rol için yalnız geliştirme ve test ortamında kullanılacak ayrı demo hesabı ile izin verilen ve reddedilmesi gereken akışlar tanımlanır. Kalite kontrolü API kayıtlarının gerçekten değişip kalıcı olduğunu, oturumsuz ve yetkisiz işlemlerin reddedildiğini, silme ve ilişkili kayıt politikasının izlendiğini ve arayüz eylemlerinin görünür sonuç verdiğini arar. Gerçek etkileşim sağlayan güvenilir tarayıcı adaptörü bulunmazsa yönetim yolculuğu `BLOCKED` kalır; HTML varlığı veya bir testin yalnızca “başarılı” demesi yeterli değildir. Docker imajının build/run kabulü, yerel kalite doğrulamasından ayrı bir altyapı kontrolüdür.

Next.js projelerinde `public/` dizini boş veya yoksa üretilen Dockerfile derleme aşamasında dizini oluşturur. ZIP'ten çıkarılan uygulama klasöründe `docker build -t projem .` komutu tamamlanmadan `docker run` çalıştırılmamalıdır; build başarısızsa yerel imaj oluşmaz.

### Üretim sırasında hata ve devam etme

#### Log izleme ve kalıcı checkpoint

Loglar ekranı varsayılan olarak **İşlerin son durumu** görünümünde her işin yüklenmiş kayıtlardaki son durumunu gösterir. **Son çalışma kayıtları** son yürütmeyi, **Yüklenen kayıt geçmişi** ise yüklenmiş olayların tamamını gösterir. Eski olaylar silinmez; görünüm değişikliği üretim motorunu çalıştırmaz. Gerçekte yeniden çalışan görevler **Yeniden çalıştırılıyor** olarak belirtilir.

Motor, aynı onaylı sözleşme ve plan için görev kapsamını, bağımlılık girdilerini, hedef dosyaların içeriklerini ve kalite kapısı sürümünü doğrular. Değişmeyen geçerli checkpoint, o görevin Coder/Reviewer çağrılarını atlar. Kapsam, sözleşme veya dosya değişiklikleri ile açık geçersiz kılma kayıtları yeniden çalışma gerektirebilir; yalnızca logdaki “tamamlandı” satırı yeterli değildir.

Yeni bir Coder/Reviewer çalışması aynı çıktıyı tekrar onaylarsa checkpoint anahtar çakışması yerine kayıt yenilenir. Görev, checkpoint kalıcı olarak kaydedildikten sonra tamamlandı olarak yayımlanır. Checkpoint deposu okunamaz veya kayıt yazılamazsa motor hata verir ve durur; bu durum sessizce önbellek yokluğu sayılarak ücretli üretime çevrilmez. Devam eden fakat henüz checkpoint oluşturmamış görevlerin kesinti sonrası yeniden çalışması mümkündür.

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

Yerel kalite doğrulaması için `npm run test:local-worker`; paketli worker için `npm run test:local-worker-package -- --bundle dist/local-worker` kullanın. Bu testler Docker gerektirmez. Docker izolasyonu entegrasyonu ve imaj build/run kabulü ayrı kontrollerdir; bunlar çalışan bir Docker daemon gerektirir.
Yönetim uygulamalarının kalite paneli, demo rol girişlerini, izinli/reddedilen CRUD işlemlerini ve yönetim ekranı etkileşimlerini ayrı kanıt satırları olarak gösterir. Bu satırlar mevcut API, tarayıcı ve canlı servis kapılarının ayrıntılarıdır; ayrıca yeni bir üst seviye kapı sayısı oluşturmaz.
Üretilen Dockerfile için ayrıca `npm --prefix backend run test:docker:artifact` komutu, temsilî Express ve `public/` klasörü olmayan Next projelerini ZIP'e koyup ZIP'den çıkarır; Docker build ve ilk HTTP yanıtını denetler. Bu bağımsız kabul testi, her kullanıcı ZIP'inin üretim sırasında Docker ile doğrulandığı anlamına gelmez.

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

Backend açıldığında yarım kalmış ve kalp atışı süresi dolmuş üretim girişimleri güvenli biçimde `paused` durumuna alınır. Manager'ın tamamlanma sorusuna verdiği yanıt, Tester'ın statik `FINISH` kaydı yerine tamamlama makbuzu ve doğrulanmış ZIP kanıtına dayanır. Bağımlılık hazırlığı başarısız olursa worker'ın hata mesajı süreç hatasına taşınır. [Emlak üretim olayı incelemesi](docs/EMLAK-URETIM-OLAYI-2026-09-28.md) bu davranışın dayandığı gerçek olayı ve doğrulanamayan npm hata nedenini açıklar.

Statik denetim tamamlandığında onaylı sözleşme ile artefakt içeriğinin özeti saklanır. Bu kanıt değişmemişse bağımlılık hazırlığındaki bir hatadan sonra **Devam Ettir** doğrudan aynı aşamayı yeniden dener; Manager, DAG ve Tester aşamaları tekrar loglanmaz. Hazırlık başarılı olduğunda bu aşama kaydı temizlenir; sonraki doğrulama hatası bağımlılık hazırlığı hatası gibi tekrar denenmez. Vue/Vite üretiminde Vue 3 uyumlu bağımlılıklar ve `@vitejs/plugin-vue` kullanılır.

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

* 🧹 **[Depo temizliği ve refactor raporu](docs/REPOSITORY-CLEANUP.md)** — Kaldırılan dosyalar, korunan giriş noktaları, kurtarma kopyaları ve doğrulama sonuçları.

* 📖 **[A'dan Z'ye Kullanıcı ve Operasyon Kılavuzu (kullanici-kilavuzu.md)](kullanici-kilavuzu.md)** — Arayüz kullanımı, revizyon adımları, kurtarma rehberi ve projeyi çalıştırma talimatları.
* 📝 **[Kütüphane Takip Sistemi süreç raporu (surec-raporu.md)](surec-raporu.md)** — Manager sohbetinden başlayan örnek üretimin görevleri, doğrulama denemeleri ve karşılaşılan hatalar. Örnek proje `kutuphane-takip-sistemi-2` kimliğiyle görünür; ZIP yalnızca doğrulama makbuzu oluşup proje tamamlandığında arayüzden indirilebilir.
* 🛠️ **[Operasyon Kılavuzu (docs/OPERATIONS.md)](docs/OPERATIONS.md)** — Tek-node üretim sınırı, MFA/secret envelope, sandbox limitleri, kalıcı volumeler, reverse proxy/TLS sözleşmesi, bakım aralığı ve yatay ölçekleme önkoşulları.
* 📜 **[Master Talimatname & Ajan Anayasası (x-agents/ORKESTRASYON-TALIMATNAMESI.md)](x-agents/ORKESTRASYON-TALIMATNAMESI.md)** — Platformun 6 seviyeli orkestrasyon anayasası ve kural seti.
## Docker olmadan bağımsız yerel worker

Yerel worker Node 22.23.2, npm 10.9.8, Playwright 1.62.1 ve Chromium ile gerçek kurulum, build, test, API, veritabanı ve tarayıcı kontrollerini yürütür. Python veya Docker gerekmez. İlk kurulumda `npm run worker:local:setup -- --install`, ardından `npm run dev:local` kullanılabilir. Chromium sistem kitaplıkları Linux'ta ayrıca kurulu olmalıdır.

Paket üretmek için `npm run worker:local:package -- --output dist/local-worker` çalıştırın. Aynı işletim sistemi ve mimariye sahip bilgisayarda paketin `start-worker.cmd` veya `start-worker.sh` dosyasını başlatın. Backend'in worker URL ve token ayarlarını [paket kılavuzuna](docs/LOCAL-WORKER-PACKAGE.md) göre eşleştirin. Paket kendi Node/npm/Chromium dosyalarını içerir; Node kurulmamış hedef bilgisayarda da başlatılabilir.

Profil `local-trusted` olarak raporlanır: gerçek bağımsız testler vardır, **OS izolasyonu yoktur**. Üretilen kod yerel kullanıcının yetkileriyle çalışır. Kaynak üzerinden doğrudan worker başlatılırken `EXECUTION_WORKER_RUNTIME=local` ve `EXECUTION_WORKER_TRUST_LOCAL_CODE=1` açıkça seçilmelidir; Docker'dan sessiz geçiş yapılmaz. Docker imajı üretme/çalıştırma doğrulaması ayrı bir işlem olarak Docker gerektirir. Windows gerçek uçtan uca testleri çalıştırılır; Linux/macOS platform doğrulaması CI matrisinde bulunur.

## Bağımsız LLM yönetimi eklentisi

LLM sayfası ve API artık depodaki `llm-yonetimi/` paketinden sunulur. Başka uygulamalara taşınabilecek bağımsız kopya `F:/projeler/llm-yonetimi` dizinindedir; GitHub kurulumu için depodaki paket yeterlidir. Kurulum, Express entegrasyonu, runtime çağrıları ve güvenlik sorumlulukları [eklenti README dosyasında](llm-yonetimi/README.md) açıklanır. Mevcut profil ve şifreleme anahtarı konumları korunur; paket başka uygulamaya taşınırken bu özel veriler kopyalanmaz.

Profilde yanıt süresi, çıktı token bütçesi ve düşünme ayarı düzenlenebilir. **Bağlantıyı sına** kısa erişim çağrısıdır; **Sohbeti sına** Manager benzeri bir istektir. Test türü, süre ve hata kodu ayrı kaydedilir. Profil değişirse sonuçlar geçersizleşir; eski ekran aynı profili kaydetmeye çalışırsa çakışma bildirilir.

MiMo için otomatik düşünme ayarı Manager sohbetinde düşünmeyi kapatır; üretim ajanlarında sağlayıcının varsayılanını korur. Açıkça seçilen düşünme ayarı korunur. Süre aşımı, kota, sağlayıcı yetkisi, ağ ve kesilmiş yanıt hataları ayrı gösterilir. Token sınırında kesilmiş Manager yanıtı tamamlanmış plan sayılmaz. Model hızı, sağlayıcı yükü, kota, bölge ve ağ koşulları uygulama tarafından garanti edilemez. Uzun planlar daha fazla çıktı ve süre gerektirir.
