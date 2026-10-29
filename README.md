# ⚡ XFactor — Otonom AI Yazılım Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-22.23.2-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL%20Migrations-003B57.svg)](https://www.sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-run%20npm%20test-blue.svg)](backend/tests/test_runner.js)

**XFactor**, kullanıcıların doğal dilde ilettiği yazılım fikirlerini analiz ederek 6 seviyeli rol uzmanlaşması, deterministik **DAG dalga motoru**, sürümlü **yazılım sözleşmeleri (PROJECT_CONTRACT)**, 18 zorunlu **kalite kapısı** (Aktif Politika 2.0 Fail-Closed Veto) ve bağımsız **temiz oda (clean-room) ZIP doğrulayıcısı** ile yazılım projelerine dönüştüren otonom bir yazılım üretim platformudur.

---

## 🌟 Öne Çıkan Yetenekler

**LLM sağlayıcı yönetimi:** Yönetici hesabıyla sol menüdeki **LLM Yönetimi** bağlantısını açın. Yerel `backend/.env` dosyasında LLM için yalnızca profil şifreleme anahtarı tutulur; sağlayıcı adresi, model ve API anahtarları yönetim ekranındaki şifreli profillerde saklanır. Xiaomi MiMo Singapur adresi ve modelleri katalogda başlangıç değeri olarak sunulur; API adresi ile model kimliğini elle değiştirebilirsiniz. Aynı anda yalnızca bir profil etkindir. Sayfa seçili profili, pasif profilleri ve her profilin son bağlantı testinin sonucunu ve zamanını gösterir. Son test sonucu anlık erişim garantisi değildir; profil düzenlenirse yeniden sınanmalıdır. Kurulum ve kullanım adımları [LLM yönetimi kılavuzunda](backend/llm-auth/LLM-YONETIMI.md) yer alır. Seçilen profil Manager sohbeti ve üretim ajanları tarafından kullanılır.

* 🤖 **6 Seviyeli Rol Uzmanlaşması:** `Manager` (Mimar), `Director` (Domain), `Teamleader` (DAG/Plan), `Coder` (Geliştirici), `Reviewer` (Kaynak Kod Denetimi) ve `Tester` (Statik Kabul İncelemesi). Gerçek build, runtime, API ve tarayıcı denetimlerini ayrı execution worker çalıştırır.
* ⚡ **Deterministik DAG Dalga Yürütücüsü:** Görevleri katı atomik tek dosya parçalarına (`targetFiles.length === 1`) böler, bağımsız işleri paralel dalgalar halinde çalıştırır.
* 🛡️ **18 Zorunlu Kalite Kapısı (Aktif Politika 2.0):** Kodlar yalnızca sentaks değil; `clean_install`, `typecheck`, `framework_build`, `service_manifest`, `database_verification`, `api_contract`, `browser_journey`, `smoke_gate`, `placeholder_check`, `contamination_check`, `security_baseline` ve `readme_check` olmak üzere 18 zorunlu kapının makine tarafından doğrulanmış yürütme kanıtı (SHA-256 digest, exit code, ISO UTC zaman damgası) olmadan onaylanmaz (Fail-Closed Veto).
* **Çok servisli yerel doğrulama:** Vite/Express projelerinin web ve API servisleri birlikte sınanır. Yönetim testleri, sınırlı ve yetkili önkoşul adımlarından gerçek kayıt kimlikleri alır; uydurma kimlik veya eksik test sözleşmesi başarı sayılmaz. Koşuya özel giriş imza anahtarları teslim paketine yazılmaz.
* 📜 **Sürümlü Sözleşme & Çoklu Yığın Koruması:** Backend yığına uygun paket ve iskele kurallarını uygular. Paket politikası bazı bağımlılıklarda semver aralığı, bazılarında `latest` kullanır; tüm sürümler kaynak şablonda sabitlenmiş değildir. Worker bağımlılık hazırlığı gerçek sürümleri teslim artefaktının `package-lock.json` dosyasına bağlar. Otomatik `service-manifest.json`, `layout.tsx` ve `page.tsx` iskele koruması sağlanır.
* 📦 **Sunucu Tarafı Temiz Oda ZIP Doğrulaması:** Dosya listesinden tahminî ZIP üretimi engellenmiştir. Sunucu tarafında üretilen ZIP artefaktı (`artifacts`), SHA-256 hash'i kilitlenerek `artifactVerifier` tarafından ayrı temiz iş dizininde sıfırdan açılıp test edilmeden ve dayanıklı tamamlama makbuzu (`completion_receipts`, Migrasyon 10) üretilmeden indirilemez (Unverified 409 Conflict).
* **Proje ve ZIP yaşam döngüsü:** Kaynak klasörünün kaybolması veritabanını veya ZIP'leri otomatik silmez. ZIP'in fiziksel bulunabilirliği tarihsel kalite durumundan ayrı raporlanır; eksik veya değiştirilmiş paket indirilemez. Normal proje silme işlemi tamamlama makbuzuyla korunan projeyi reddeder; silinebilen projenin hash ile sahipliği doğrulanan ZIP'leri kalıcı DB günlüğü üzerinden karantinaya alınır. [Envanter, saklama ve karantina kılavuzu](docs/ARTIFACT-LIFECYCLE.md).
* 🔒 **Bağımsız Execution Worker:** Web Orchestrator ve Execution Worker ayrı süreçlerdir; iş API'si Bearer token (`EXECUTION_WORKER_TOKEN`) ile korunur. `npm run dev:local` kalite kontrollerini Docker olmadan Node/npm/Playwright/Chromium ile yürütür. `local-trusted` profili işletim sistemi izolasyonu sağlamaz; üretilen kod worker kullanıcısının yetkileriyle çalışır.
* 🛡️ **Profile Göre Güvenlik Sınırları:** Docker profili container kaynak/ağ sınırlarını uygular. Yerel profil ayrı iş dizini, ortam temizliği, arşiv sınırları, iptal ve süreç ağacı temizliği sağlar; container sandbox garantisi vermez. HttpOnly oturum, CSRF, HSTS ve yöneticiye özel disk senkronizasyonu platformun ortak korumalarıdır.
* 🔄 **Dayanıklı LLM Görev Katmanı & Hedefli Onarım:** Geçici sağlayıcı/transport hatalarında görev başına en fazla üç sağlayıcı isteği; iç içe HTTP retry bütçeyi çarpmaz, JSON/şema hatası otomatik tekrar çağrılmaz. Tüm ajan rollerinde kesilmiş yanıtlar (`LLM_TRUNCATED`) fail-closed olarak reddedilir. `@babel/parser` AST tabanlı sentaks/tip/import denetimi (`buildValidator.js`, `tester.js`) ve 1. iterasyondan itibaren dosya kapsamıyla (`targetFiles`) sınırlı statik onarım uygulanır.
* **Kanıta bağlı worker onarımı:** Normal çıkışlı ve kesilmemiş TypeScript derleyici bulguları, aynı onaylı sözleşmedeki tekil dosya sahibine yönlendirilir. 7 bileşenli `inputSignature` (`contract.id`, `contract.contract_hash`, `owner.spec`, `target`, `currentHash`, `fingerprints`, `digest(currentContext)`) ile kalıcı çağrı bütçesi ve kaynak karşılaştırması korunur; taze Reviewer/Tester kabulü ve yeni bağımsız worker kanıtı olmadan onarım kapanmaz. Altyapı, belirsiz sahiplik veya dışarıdan değişmiş kaynak için Manager revizyonu gerekir.
* **Güvenli kurtarma ve görev kimliği:** Kaynak yazımı lease/iptal/sözleşme sınırında korunur. Protokol ve kurtarma okuyucuları proje dışı yolları, symlink/junction bağlantılarını ve 2 MiB üzerindeki metadata dosyalarını reddeder; diskten canlandırma (`reconciliationService.js`) kanonik durum makinesini (`PROJECT_STATUS`), tamamlama makbuzunu (`completion_receipts`) ve sözleşme şemasını zorunlu kılar. Checkpoint ve kurtarılan log kimlikleri farklı takımların aynı yerel görev ID'sini birbirine karıştırmaz; hükümsüz kılınan checkpoint'ler `status = 'invalidated'` olarak işaretlenir.
* 📊 **Kalite Paneli & Telemetri:** Koşu geçmişi, hata parmak izi, ister etki analizi (`GET /api/projects/:id/requirements/:reqId/impact`) ve yeniden derleme önizlemesi (`POST /api/projects/:id/rebuild-preview`), kimlik bilgileri temizlenmiş kanıt logları ve ReactFlow DAG akış şeması (`verification_failed` ve `capability_blocked` durum rozetleri ile kronolojik zaman damgalı düğüm yerleşimi). Tamamlanan proje, doğrulanmış ZIP paketi olarak indirilir.
* 🐳 **Üretilen Projelerde Dockerfile:** Üretilen uygulamaya yığınına uygun (Next.js, tek katmanlı web/API ve tam yığın `Vite + Express + Prisma` monorepo dahil) çok aşamalı `Dockerfile`, `.dockerignore` ve `README.md` Docker çalıştırma bölümü eklenir. Kullanıcı ZIP'i çıkardıktan sonra `docker build` ve başarılı build sonrası `docker run` komutlarıyla uygulamayı çalıştırabilir.
* 🎨 **Ergonomik UI/UX ve Sıcak Krem Tema:** Göz yormayan sıcak krem arayüz, çok satırlı yüzen sohbet giriş alanı, tek tıkla mesaj kopyalama, kullanıcı profil kartı ve belirgin oturum kapatma alanı.
* 🔄 **Dosya Protokolünden Canlı Durum ve Log Canlandırma (Rehydration Engine):** Diskteki projelerin mimari şartnameleri, görevleri, DAG durumları ve ajan logları tarihsel durum olarak yeniden kurulur. Kurtarılan ZIP `built` kalır; Worker tarafından üretilmiş geçerli doğrulama koşusu, zorunlu PASS kanıtları ve tamamlama makbuzu yoksa indirme açılmaz.

---

## 🚀 Hızlı Başlangıç

Platform ajanlarının dosyaları kökteki **`x-agents/`** dizinindedir. Her rolün sistem istemi ortak yükleyiciyle tam orkestrasyon anayasası ve tam rol talimatından oluşur; kod/şema doğrulayıcıları önceliklidir, rolün çıktı şeması genel anlatımı uzmanlaştırır. `GOREV/DURUM/TODO/RAPOR/ALT-TALIMATNAME` şablonları insan için biçim referansıdır; backend bunları okumaz, gerçek kayıtları merkezi protokol kodu üretir. `docs/` veya üretilen proje belgeleri sistem talimatı kaynağı değildir. Eksik/geçersiz rol veya anayasa üretimi engeller.

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

> ℹ️ **Execution Worker (`8099`) Hakkında:** Bu port Backend'in Bearer token (`EXECUTION_WORKER_TOKEN`) ile iletişim kurduğu iç RPC servisidir. Yetkisiz istekte `{"error":"Unauthorized"}` dönmesi erişim denetimini gösterir; worker'ın hazır olduğunun kanıtı değildir. İş akışı olayları Loglar/DAG ekranlarında izlenir; Kalite Paneli koşu ve kanıt geçmişini 15 saniyede bir yeniler, seçilen kontrolün temizlenmiş kayıtlarını açar. Ham terminal çıktısı aynı olay akışı değildir.

> Backend `GET /healthz` ile yalnız süreç canlılığını, `GET /readyz` ile veritabanı, depolama, üretim frontend'i ve Worker kapasitesini birlikte denetler. `READINESS_WORKER_TIMEOUT_MS` temel varsayılanı `2000` ms'dir; yerel geliştirme başlatıcısı ayar verilmemişse `35000` ms kullanır, açıkça verilmiş değeri korur. Yerel worker gerçek Chromium başlatma ve sayfa çizimini de sınar; soğuk başlangıç süreyi aşabilir. Yetkisiz `8099` isteğinin 401 dönmesi bu kapasitenin hazır olduğunu kanıtlamaz. Worker hazır değilse `/readyz` HTTP 503 döner; worker günlükleri hata aşaması, hata adı ve güvenli kodla tanı sağlar.

> Temiz oda doğrulama bütçesi operatörün `VERIFICATION_JOB_TIMEOUT_MS` ayarıyla belirlenir: varsayılan 15 dakika (`900000`), yerel geliştirme launcher'ında ayar verilmemişse 25 dakika (`1500000`). Docker profili varsayılan 15 dakikayı korur. Pozitif tam sayı değerler mevcut 25 dakika worker sınırını aşamaz; açıkça verilen daha düşük bütçe korunur. Ayar yalnız yeni işlerin deadline'ını belirler; çalışan iş uzatılmaz, iptal ve kalite kapıları değişmez. Bu ayar proje sözleşmesi veya üretilen uygulamanın `.env` dosyasından okunmaz.

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

Yeni proje açıldığında ilk ekran **Sohbet & Mimari** olur; üst sekmelerde de önce sohbet, ardından **Kalite Paneli**, **Canlı DAG Grafiği** ve **Canlı Süreç Logları** yer alır. Kalite Paneli üstte amacını ve durumların anlamını açıklar; altta koşu geçmişi, yapılan kontroller, çıkış kodu, zaman damgası, SHA-256 özetleri ve gizli bilgileri temizlenmiş loglar bulunur. Güncel başarısız veya duraklatılmış akış, önceki doğrulanmış koşunun tarihsel PASS sonucundan ayrı gösterilir. Eski PASS yeni üretime indirme yetkisi vermez. Manager tamamlanma mesajı kaynak kodu incelemek için doğrulanmış ZIP indirmesine yönlendirir.

Kalite Paneli açıkken koşu geçmişi ve seçili koşunun kanıtları 15 saniyede bir yenilenir. En güncel koşuyu izliyorsanız yeni koşuya geçilir; özellikle seçtiğiniz eski koşu, log ve yüklenmiş geçmiş sayfaları korunur. Önceki istek bitmeden aynı yenileme tekrar başlatılmaz.

Manager'ın tamamlanma mesajı, sağlayıcının bildirdiği ve proje bazında kaydedilen giriş, çıkış ve toplam token kullanımını da gösterir. Bir çağrıda sağlayıcı kullanım bilgisi vermezse yalnız bilinen en düşük toplam ve eksik çağrı sayısı gösterilir. Bu sayaç geçmişte kaydedilmemiş çağrıları geriye dönük hesaplamaz; API ücreti anlamına gelmez.

### Yönetim ve takip uygulamalarının kapsamı

Manager, kullanıcı “admin paneli” demese bile kalıcı kayıt, işlem veya rol gerektiren her istekte yönetim ihtiyacını değerlendirir. Önerilen planda yönetilecek kaynaklar, gerekli işlemler, yönetim ekranları, oturum açma ve rol yetkileri açıklanır; yönetim gerekmiyorsa bunun gerekçesi yazılır. Bu kapsam kod üretimine ancak kullanıcının planı onaylamasıyla girer. Açık kullanıcı kaydı ayrı bir ürün kararıdır; kayıt işlemi ayrıcalıklı rol vermez.

Yönetim gerektiren projelerde her rol için yalnız geliştirme ve test ortamında kullanılacak ayrı demo hesabı ile izin verilen ve reddedilmesi gereken akışlar tanımlanır. Kalite kontrolü API kayıtlarının gerçekten değişip kalıcı olduğunu, oturumsuz ve yetkisiz işlemlerin reddedildiğini, silme ve ilişkili kayıt politikasının izlendiğini ve arayüz eylemlerinin görünür sonuç verdiğini arar. Gerçek etkileşim sağlayan güvenilir tarayıcı adaptörü bulunmazsa yönetim yolculuğu `BLOCKED` kalır; HTML varlığı veya bir testin yalnızca “başarılı” demesi yeterli değildir. Docker imajının build/run kabulü, yerel kalite doğrulamasından ayrı bir altyapı kontrolüdür.

Next.js projelerinde `public/` dizini boş veya yoksa üretilen Dockerfile derleme aşamasında dizini oluşturur. ZIP'ten çıkarılan uygulama klasöründe `docker build -t projem .` komutu tamamlanmadan `docker run` çalıştırılmamalıdır; build başarısızsa yerel imaj oluşmaz.

### Üretim sırasında hata ve devam etme

#### Log izleme ve kalıcı checkpoint

Loglar ekranı varsayılan olarak **İşlerin son durumu** görünümünde her işin yüklenmiş kayıtlardaki son durumunu gösterir. **Son çalışma kayıtları** son yürütmeyi, **Yüklenen kayıt geçmişi** ise yüklenmiş olayların tamamını gösterir. Eski olaylar silinmez; görünüm değişikliği üretim motorunu çalıştırmaz. Gerçekte yeniden çalışan görevler **Yeniden çalıştırılıyor** olarak belirtilir.

Motor, aynı onaylı sözleşme ve plan için görev kapsamını, bağımlılık girdilerini, hedef dosyaların içeriklerini ve kalite kapısı sürümünü doğrular. Checkpoint kimliği sözleşme, domain, takım ve yerel görev ID'sine bağlıdır; farklı takımlardaki aynı ID ve aynı görev metni kanıt paylaşmaz. Eski kayıtlar yalnız tam sahiplik envanteri tek bir görevi gösteriyorsa yeniden kullanılabilir; migration tarihsel kanıtı başka göreve etiketlemez. Değişmeyen geçerli checkpoint, o görevin Coder/Reviewer çağrılarını atlar. Kapsam, sözleşme veya dosya değişiklikleri ile açık geçersiz kılma kayıtları yeniden çalışma gerektirebilir; yalnızca logdaki “tamamlandı” satırı yeterli değildir.

Yeni bir Coder/Reviewer çalışması aynı çıktıyı tekrar onaylarsa checkpoint anahtar çakışması yerine kayıt yenilenir. Görev, checkpoint kalıcı olarak kaydedildikten sonra tamamlandı olarak yayımlanır. Checkpoint deposu okunamaz veya kayıt yazılamazsa motor hata verir ve durur; bu durum sessizce önbellek yokluğu sayılarak ücretli üretime çevrilmez. Devam eden fakat henüz checkpoint oluşturmamış görevlerin kesinti sonrası yeniden çalışması mümkündür.

Plan onayından sonra Manager'ın `TODO.md` dosyası, Director şartnameleri ve Teamleader görev dosyaları üretim ilerlemesini diskte tutar. Kesinti sonrası **Devam Ettir**, mevcut `TODO.md` ve `GOREV.md` kayıtlarındaki tek dosyalık görev hedeflerini geri yükler. Aynı sözleşmeye ait geçerli checkpoint'ler yeniden kullanılır; kabul hatası nedeniyle açık onarım kaydı varsa tamamlanmış görevler denetlenerek sürdürülür.

Sohbet, üst çubuk ve Loglar ekranı `paused` ile `verification_failed` durumlarında **Devam Ettir** gösterir. `artifact_verified` durumunda son hata kayıtlıysa da aynı seçenek görünür. İş akışı hata bildirdiğinde sohbet ekranı açılır; neden ve varsa ilgili kalite kapısı burada ve süreç loglarında gösterilir. Diskten kurtarılan görevler canlı logları silmeden DAG'a eklenir; tamamlanmamış görevler bitmiş gibi işaretlenmez.

Derlemenin veya ZIP oluşturmanın bitmesi teslimin doğrulandığı anlamına gelmez. Zorunlu kapılardan biri başarısız ya da atlanmışsa proje tamamlanmaz; isteğe bağlı ve uygulanamayan kontrol `NOT_APPLICABLE` olabilir. **ZIP indir** yalnızca geçerli Worker doğrulaması, zorunlu PASS kanıtları ve tamamlama makbuzu oluştuğunda açılır. Ayrıntılı müdahale adımları [kullanıcı kılavuzunda](docs/kullanici-kilavuzu.md#adım-6-canlı-müdahale-duraklatma-ve-kaldığı-yerden-devam-etme-pause--resume) yer alır.

Yalnız tarayıcı kabul adımları revize edilirken Manager, onaylı sözleşmenin kimliği ve özetiyle bağlı bir güncelleme sunabilir. Bu yol yalnız `browser.roleJourneys` alanını değiştirir; gereksinimler, kaynaklar ve rol izinleri korunur. Eski tabana veya başka alanlara yönelen güncellemeler reddedilir; geçerli revizyon da yeniden onay bekler. Sohbet mesajı sınırı 4000 karakterdir; doğrulama ve boyut hataları LLM bağlantı hatasından ayrı gösterilir.

---

## 🧪 Test Süiti & Güvenlik Doğrulaması

Platform, çekirdek motorları, güvenlik sınırlarını, MFA ve observabilite mekanizmalarını kapsayan backend test süitleri ile frontend birim testleri ve Chromium tabanlı E2E testlerine sahiptir. CI (`test` işi) bunların tamamını zorunlu kılar: backend/frontend `npm audit --audit-level=high` (60 sn sınır, engelleyici), `P8_REQUIRE_DOCKER_LIMITS=1` ile backend süitleri, `test:unit`, frontend build ve `test:e2e`.

```bash
cd backend
npm test
```
> Testler `os.tmpdir()` üzerindeki izole geçici sandbox'ta çalışır; `test_runner.js` şablon SQLite veritabanını (`template.db`) bir kez migrate edip her test süiti için klonlar (`XFACTOR_TEMPLATE_DB_PATH`) ve kontrollü paralel işçi havuzuyla (`XFACTOR_TEST_CONCURRENCY`, varsayılan 2) yürütür. Geliştirme veritabanınızı (`projects.db`) ve `projects/` klasörünüzü kesinlikle kirletmez.

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

Statik denetim/Tester reddinde proje `verification_failed` olur. Worker reddi veya iş akışı istisnası projeyi `paused` durumuna alabilir; başarısız doğrulama koşusu ayrı tarihsel kayıttır. Hata ayrıntısı sohbet ve süreç loglarında görünür. `paused`, `verification_failed` ve son hata kaydı bulunan `artifact_verified` durumlarında **Devam Ettir (Resume)** eylemi sohbet, üst çubuk ve log ekranında kullanılabilir. Devam ettirme kayıtlı işten kurtarma kontrollerini başlatır; proje doğrulanmadan ZIP indirme açılmaz.

Normal tamamlama akışı Worker hatasını yerel bir geliştirme doğrulamasına dönüştürmez ve diskten okunan `DURUM.md` / `state.json` kayıtlarından sentetik PASS kanıtı üretmez. Worker hatası kanıtsız başarı yerine fail-closed olarak yukarı taşınır.

Backend açıldığında yarım kalmış ve kalp atışı süresi dolmuş üretim girişimleri güvenli biçimde `paused` durumuna alınır. Manager'ın tamamlanma sorusuna verdiği yanıt, Tester'ın statik `FINISH` kaydı yerine tamamlama makbuzu ve doğrulanmış ZIP kanıtına dayanır. Bağımlılık hazırlığı başarısız olursa worker'ın hata mesajı süreç hatasına taşınır.

Tüm kod üretimi tamamlandığında `generationCompletion` aşama kaydı tutulur. **Devam Ettir**, bu kaydın sözleşme kimliği, sözleşme SHA-256 özeti ve plan SHA-256 özeti güncel onayla eşleşirse tamamlanan Coder/DAG üretimini atlar ve mevcut kaynak düzeltmelerini korur. Statik denetim, Tester, bağımlılık hazırlığı, yeni ZIP üretimi ve bağımsız worker doğrulaması yeniden çalışır; bu kayıt çalışma zamanı başarısının kanıtı değildir. Eski PASS sonuçları veya eski ZIP yeniden kullanılmaz. Plan veya sözleşme değişirse normal DAG üretimine dönülür. Bu üretim kaydı bulunmayan eski akışlarda, değişmemiş sözleşme ve içerik özetiyle bağımlılık hazırlığından devam desteği korunur. Vue/Vite üretiminde Vue 3 uyumlu bağımlılıklar ve `@vitejs/plugin-vue` kullanılır.

---


## 🧠 Mimari Bilgi Grafiği (Graphify)

XFactor, kaynak dosyalarını AST ile tarayan ve elle tanımlanmış mimari ilişkileri de gösteren yerel bir Graphify bilgi grafiği motoruna sahiptir. Dinamik query parçaları rota yolundan ayrılır; alt Express yönlendiricileri (`projectObservabilityRoutes.js`, `projectTraceabilityRoutes.js`) üst rota öneklerini (`mountsByFile`) miras alır ve Node HTTP Worker rotaları ile `executionClient` istekleri `requests_route` bağlantılarıyla eşleştirilir. Harita her çalışmada mevcut koddan yeniden üretilir:

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

29 Ekim 2026 mimari yol haritası (`Faz 1–4`) kapanış doğrulamasında 28 kanıtlı mimari bulgu (`ENG-1..8`, `VER-1..5`, `DAT-1..6`, `AGT-1..5`, `FE-1..4`) kapatılmış; `workflow.js`, `codeGenerator.js`, `projectRoutes.js` ve `db.js` modülleri sıfır kırılma garantisiyle 7 yeni alt modüle (`stages/repairStage.js`, `stages/verificationStage.js`, `templates/dockerTemplates.js`, `templates/prismaTemplates.js`, `routes/projectObservabilityRoutes.js`, `routes/projectTraceabilityRoutes.js`, `db/migrations.js`) ayrıştırılmıştır. Bu kapanışta **148/148 backend süiti**, **156/156 worker birim testi**, **159/159 yerel worker entegrasyon testi (`npm run test:local-worker`, gerçek SQLite/API/Chromium 4 rol yolculuğu dahil)** ve **130/130 frontend birim testi (14 dosya) + üretim build'i (1.702 modül)** sıfır hatayla geçti. Docker motoru bulunmadığından P8.3/P8.4 kontrolleri atlandı. Native fixture JavaScript'tir; gerçek TypeScript derleme kanıtı değildir. Bu tarihli sonuçlar her kurulum için üretim kabulü sayılmaz. Ayrıntılı faz kanıtları: [Mimari Yol Haritası](docs/roadmap-reports/mimari-yol-haritasi.md), [Faz 1](docs/roadmap-reports/faz-1-rapor.md), [Faz 2](docs/roadmap-reports/faz-2-rapor.md), [Faz 3](docs/roadmap-reports/faz-3-rapor.md), [Faz 4](docs/roadmap-reports/faz-4-rapor.md) ve [Graphify bilgi notu](graphify-out/graphify-bilgi-notu.md).

* 📖 **[A'dan Z'ye Kullanıcı ve Operasyon Kılavuzu (docs/kullanici-kilavuzu.md)](docs/kullanici-kilavuzu.md)** — Arayüz kullanımı, revizyon adımları, kurtarma rehberi ve projeyi çalıştırma talimatları.
* 🛠️ **[Operasyon Kılavuzu (docs/OPERATIONS.md)](docs/OPERATIONS.md)** — Tek-node üretim sınırı, MFA/secret envelope, sandbox limitleri, kalıcı volumeler, reverse proxy/TLS sözleşmesi, bakım aralığı ve yatay ölçekleme önkoşulları.
* 📦 **[Proje ve ZIP Yaşam Döngüsü (docs/ARTIFACT-LIFECYCLE.md)](docs/ARTIFACT-LIFECYCLE.md)** — Salt okunur envanter, eksik dosyalar, proje silme bağlantısı ve durdurulmuş servislerle kontrollü karantina; kalıcı ZIP silme uygulanmaz.
* 🔧 **[Yerel Worker Paket Kılavuzu (docs/LOCAL-WORKER-PACKAGE.md)](docs/LOCAL-WORKER-PACKAGE.md)** — Docker olmadan bağımsız yerel execution worker kurulumu, paketlenmesi ve başlatılması.
* 📜 **[Master Talimatname & Ajan Anayasası (x-agents/ORKESTRASYON-TALIMATNAMESI.md)](x-agents/ORKESTRASYON-TALIMATNAMESI.md)** — Platformun 6 seviyeli orkestrasyon anayasası ve kural seti.
## Docker olmadan bağımsız yerel worker

Yerel worker Node 22.23.2, npm 10.9.8, Playwright 1.62.1 ve Chromium ile gerçek kurulum, build, test, API, veritabanı ve tarayıcı kontrollerini yürütür. Python veya Docker gerekmez. İlk kurulumda `npm run worker:local:setup -- --install`, ardından `npm run dev:local` kullanılabilir. Chromium sistem kitaplıkları Linux'ta ayrıca kurulu olmalıdır.

Yerel işler genel npm registry indirme önbelleğini `os.tmpdir()/xfactor-local-cache/npm` altında paylaşır; kaynak, veritabanı, HOME, npm ayarları ve günlükler iş başına ayrılıp temizlenir. Ana bilgisayarın npm kimlik bilgileri aktarılmaz. Hata tanısı için en fazla 64 komutun aşaması, çalıştırıcı adı, zamanı, çıkış kodu, zaman aşımı/kesilme işaretleri ve çıktı SHA-256 özetleri tutulur; argümanlar, çıktı metni veya ortam değerleri kaydedilmez. Bu kayıtlar kalite PASS kanıtı değildir.

Paket üretmek için `npm run worker:local:package -- --output dist/local-worker` çalıştırın. Aynı işletim sistemi ve mimariye sahip bilgisayarda paketin `start-worker.cmd` veya `start-worker.sh` dosyasını başlatın. Backend'in worker URL ve token ayarlarını [paket kılavuzuna](docs/LOCAL-WORKER-PACKAGE.md) göre eşleştirin. Paket kendi Node/npm/Chromium dosyalarını içerir; Node kurulmamış hedef bilgisayarda da başlatılabilir.

Profil `local-trusted` olarak raporlanır: gerçek bağımsız testler vardır, **OS izolasyonu yoktur**. Üretilen kod yerel kullanıcının yetkileriyle çalışır. Kaynak üzerinden doğrudan worker başlatılırken `EXECUTION_WORKER_RUNTIME=local` ve `EXECUTION_WORKER_TRUST_LOCAL_CODE=1` açıkça seçilmelidir; Docker'dan sessiz geçiş yapılmaz. Docker imajı üretme/çalıştırma doğrulaması ayrı bir işlem olarak Docker gerektirir. 21 Ekim otel kabul koşusu Windows üzerinde tamamlandı; bu sonuç Linux/macOS üzerinde aynı uygulamanın doğrulandığı anlamına gelmez. Her hedef işletim sistemi ve mimarisi için kendi paket ve entegrasyon kabulü gerekir.

## Bağımsız LLM yönetimi eklentisi

LLM sayfası ve API artık depodaki `llm-yonetimi/` paketinden sunulur. Başka uygulamalara taşınabilecek bağımsız kopya `F:/projeler/llm-yonetimi` dizinindedir; GitHub kurulumu için depodaki paket yeterlidir. Kurulum, Express entegrasyonu, runtime çağrıları ve güvenlik sorumlulukları [eklenti README dosyasında](llm-yonetimi/README.md) açıklanır. Mevcut profil ve şifreleme anahtarı konumları korunur; paket başka uygulamaya taşınırken bu özel veriler kopyalanmaz.

Profilde yanıt süresi, çıktı token bütçesi ve düşünme ayarı düzenlenebilir. **Bağlantıyı sına** kısa erişim çağrısıdır; **Sohbeti sına** Manager benzeri bir istektir. Test türü, süre ve hata kodu ayrı kaydedilir. Profil değişirse sonuçlar geçersizleşir; eski ekran aynı profili kaydetmeye çalışırsa çakışma bildirilir.

MiMo için otomatik düşünme ayarı Manager sohbetinde düşünmeyi kapatır; üretim ajanlarında sağlayıcının varsayılanını korur. Açıkça seçilen düşünme ayarı korunur. Süre aşımı, kota, sağlayıcı yetkisi, ağ ve kesilmiş yanıt hataları ayrı gösterilir. Token sınırında kesilmiş Manager yanıtı tamamlanmış plan sayılmaz. Model hızı, sağlayıcı yükü, kota, bölge ve ağ koşulları uygulama tarafından garanti edilemez. Uzun planlar daha fazla çıktı ve süre gerektirir.
