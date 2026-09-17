# 📖 XFactor — A'dan Z'ye Kapsamlı Kullanım ve Operasyon Kılavuzu

Bu kılavuz, **XFactor Otonom AI Ajan Orkestrasyon Platformu**'nun çalışma mantığını, mimari bileşenlerini, arayüz kullanımını ve adım adım uçtan uca yazılım üretim süreçlerini tüm detaylarıyla açıklamaktadır.

---

## 📑 İÇİNDEKİLER

1. [Genel Bakış ve Mimari Felsefe](#1-genel-bakış-ve-mimari-felsefe)
2. [Sistem Gereksinimleri ve İlk Kurulum](#2-sistem-gereksinimleri-ve-ilk-kurulum)
3. [Ajan Rolleri ve Hiyerarşik Görev Dağılımı (6 Seviye)](#3-ajan-rolleri-ve-hiyerarşik-görev-dağılımı-6-seviye)
4. [Uçtan Uca Kullanım Adımları (A'dan Z'ye)](#4-uçtan-uca-kullanım-adımları-adan-zye)
   - [Adım 1: Güvenli Giriş Yapma (Authentication)](#adım-1-güvenli-giriş-yapma-authentication)
   - [Adım 2: Yeni Proje Başlatma](#adım-2-yeni-proje-başlatma)
   - [Adım 3: Manager ile Beyin Fırtınası ve Planlama (Zaman Damgalı Sohbet)](#adım-3-manager-ile-beyin-fırtınası-ve-planlama-zaman-damgalı-sohbet)
   - [Adım 4: Mimari Planı Onaylama ve Canlı Revizyon (`pending_approval`)](#adım-4-mimari-planı-onaylama-ve-canlı-revizyon-pending_approval)
   - [Adım 5: Canlı ReactFlow DAG Akışını ve Log Tablosunu İzleme](#adım-5-canlı-reactflow-dag-akışını-ve-log-tablosunu-izleme)
   - [Adım 6: Canlı Müdahale, Duraklatma ve Kaldığı Yerden Devam Etme (`Pause / Resume`)](#adım-6-canlı-müdahale-duraklatma-ve-kaldığı-yerden-devam-etme-pause--resume)
   - [Adım 7: Monaco Editor'de Kodları İnceleme ve ZIP Olarak İndirme](#adım-7-monaco-editorde-kodları-inceleme-ve-zip-olarak-indirme)
5. [Yan Menü Proje Yönetimi ve İşlem Menüsü (`...`)](#5-yan-menü-proje-yönetimi-ve-işlem-menüsü-)
6. [Dosya-Bazlı Koordinasyon Protokolü ("Agent = Klasör")](#6-dosya-bazlı-koordinasyon-protokolü-agent--klasör)
7. [Üretilen Projeyi Bilgisayarınızda Çalıştırma Kılavuzu](#7-üretilen-projeyi-bilgisayarınızda-çalıştırma-kılavuzu)
8. [Test Süiti ve Otomasyonun Çalıştırılması (`npm test`)](#8-test-süiti-ve-otomasyonun-çalıştırılması-npm-test)
9. [Sıkça Sorulan Sorular (SSS) ve Sorun Giderme](#9-sıkça-sorulan-sorular-sss-ve-sorun-giderme)
10. [Geliştirici Rehberi: Kod Tabanı Analizi ve Bilgi Grafiği (Graphify)](#10-geliştirici-rehberi-kod-tabanı-analizi-ve-bilgi-grafiği-graphify)
11. [18 Zorunlu Kalite Kapısı ve Temiz Oda Doğrulama Sistemi (Politika 2.0)](#11-18-zorunlu-kalite-kapısı-ve-temiz-oda-doğrulama-sistemi-politika-20)

---

## 1. Genel Bakış ve Mimari Felsefe

Geleneksel yapay zekâ kodlama araçları genellikle tek bir prompt ile tüm uygulamayı tek seferde yazmaya çalışır; bu durum halüsinasyonlara, eksik dosyalara ve kırık bağımlılıklara yol açar.

**XFactor**, bu sorunu iki güçlü dünya standardını birleştirerek çözer:
1. **`msitarzewski/agency-agents` (Uzmanlaşmış Rol Kütüphanesi & Living Docs):** Her ajan sadece kendi uzmanlık alanındaki işi yapar. Sistem kuralları `docs/*.md` dosyalarından dinamik yüklenir.
2. **`coleam00/Archon` (Deterministik DAG Dalga Motoru & Dark Factory):** Tüm görevler matematiksel bir **Yönlü Döngüsüz Çizge (DAG)** yapısında dalgalar (`Execution Waves`) halinde çözülür. Bağımsız görevler paralel çalışırken bağımlı görevler önkoşulları bekler.

```text
┌─────────────────────────────────────────────────────────────────┐
│                      KULLANICI (BOSS)                           │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Doğal Dilde İstekler & Revizyonlar
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MANAGER AGENT                             │
│     - manager/TALIMATNAME.md, TODO.md, .env.example & Domain Dağılımı   │
└──────────────┬───────────────────────────────────┬──────────────┘
               │                                   │
               ▼ Frontend Domain                   ▼ Backend Domain
┌──────────────────────────────┐   ┌──────────────────────────────┐
│       DIRECTOR AGENT         │   │       DIRECTOR AGENT         │
│   - ALT-TALIMATNAME.md       │   │   - ALT-TALIMATNAME.md       │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│     TEAMLEADER AGENT         │   │     TEAMLEADER AGENT         │
│   - Atomik Görev DAG'ı       │   │   - Atomik Görev DAG'ı       │
│   - (Maks 1-2 Dosya Limiti)  │   │   - (Maks 1-2 Dosya Limiti)  │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│        CODER AGENT           │   │        CODER AGENT           │
│   - Çok Dosyalı Kod Üretimi  │   │   - Çok Dosyalı Kod Üretimi  │
│   - (Bileşen Kompozisyonu)   │   │   - (Bileşen Kompozisyonu)   │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│   REVIEWER & TESTER AGENTS   │   │   REVIEWER & TESTER AGENTS   │
│ - 2 Turlu Quality Gate Veto  │   │ - 2 Turlu Quality Gate Veto  │
│ - Deterministik Sentaks QA   │   │ - Deterministik Sentaks QA   │
│ - Otomatik Onarım Döngüsü    │   │ - Otomatik Onarım Döngüsü    │
│ - Final RAPOR.md & README.md │   │ - Final RAPOR.md & README.md │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                   │
               ▼                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│      WEB ORCHESTRATOR & ISOLATED EXECUTION WORKER BOUNDARY      │
│ - 18 Zorunlu Kalite Kapısı (Aktif Politika 2.0 Fail-Closed Veto)│
│ - OS Sandbox Yürütmesi (Docker --cap-drop ALL, limits)          │
│ - Sunucu Tarafı ZIP Artefaktı & SHA-256 Hash Bütünlüğü          │
│ - Değişmez Tamamlama Makbuzu (completion_receipts, Migrasyon 10)│
│ - HTTP Bearer Token Authenticated İletişim                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Sistem Gereksinimleri ve İlk Kurulum

### Sistem Gereksinimleri
- **İşletim Sistemi:** Windows, macOS veya Linux
- **Node.js:** v22.5.0 veya daha yenisi (veya Bun v1.0+)
- **İnternet Bağlantısı:** LLM API sağlayıcılarına (Google Gemini / OpenAI / OpenRouter) erişim için

### 1. Adım: Yapılandırma Dosyasını Hazırlama
`backend/` klasöründe bulunan `.env.example` dosyasını kopyalayarak `.env` oluşturun:

```bash
# Windows
cd backend
copy .env.example .env

# macOS / Linux
cd backend
cp .env.example .env
```

`.env` dosyasını açıp doldurun:
```env
PORT=8000
# Kimlik doğrulama anahtarı veya yönetici parolası .env içinde tutulmaz.
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AI_PROVIDER=google
AI_MODEL=gemini-3.7-flash
ALLOW_MOCK_FALLBACK=false
GOOGLE_API_KEY=...GeminiAnahtariniz...
```

### 2. Adım: Bağımlılıklar ve Yönetici Hesabı
```bash
# Backend bağımlılıkları ve yönetici hesabı
cd backend
npm install
npm run create-admin -- admin
cd ..

# Frontend bağımlılıkları
cd frontend
npm install
cd ..
```
`create-admin` parolayı ve doğrulamasını terminalde göstermeden sorar (en az 12 karakter olmalıdır). Mevcut kullanıcıyı yöneticiye yükseltmek için o kullanıcının geçerli parolası gerekir.

#### Yönetici parolası yenileme ve sıfırlama
Parola en az 12 karakter olmalı (en fazla 256); terminal kriteri önceden basar ve parolayı göstermeden sorar.
```bash
cd backend
npm run create-admin -- admin            # yeni yönetici oluşturur
npm run create-admin -- admin --renew    # mevcut parolayı doğrulayıp yenisiyle değiştirir
npm run create-admin -- admin --reset    # unutulan parolayı mevcut parolayı sormadan sıfırlar
cd ..
```
`Password confirmation does not match.` iki girişin farklı yazıldığı; `Existing user credentials do not match.` girilen parolanın kayıtlı parola olmadığı anlamına gelir (yenileme için `--renew`, unuttuysanız `--reset` kullanın).

### 3. Adım: Uygulamayı Başlatma

#### ⭐ Seçenek A: Kök Dizininden Tek Komutla Başlatma (Önerilen)
Proje kök dizininde tek bir `npm run dev` komutuyla platformun 3 ana servisi birlikte ayağa kalkar:
```bash
npm run dev
```

| Port | Servis | Açıklama |
|:---:|---|---|
| **`5173`** | **Frontend (Vite / React)** | **Kullanıcı Paneli:** Tarayıcınızda açtığınız ana ekran (`http://localhost:5173`). |
| **`8000`** | **Backend (Web Orchestrator)** | **Yönetim Beyni:** REST API, SQLite veritabanı, WebSocket telemetrisi ve 6 yapay zekâ ajanı. |
| **`8099`** | **Execution Worker** | **İzole Derleyici:** Güvensiz kodları ana sistemden ayrı sandbox içinde derleyen ve test eden iç RPC işçisi. |

> ℹ️ **Önemli Not:** `8099` portu doğrudan kullanıcıların tarayıcıdan gezinmesi için değil; Backend'in Bearer token (`EXECUTION_WORKER_TOKEN`) ile izole kod çalıştırma işlerini devrettiği korumalı bir iç servistir. Tarayıcıdan girildiğinde `{"error":"Unauthorized"}` dönmesi bu güvenlik önleminin gereğidir.

> Kısıtlı Windows kurumsal ağlarında `start-project.ps1` betiği üzerinden de doğrudan çalıştırılabilir.
#### Seçenek B: Ayrı Terminallerde Başlatma
* **1. Terminal (Backend):**
  ```bash
  cd backend
  npm run dev
  ```
  > Backend sunucusu `http://127.0.0.1:8000` adresinde hazır olacaktır.
* **2. Terminal (Frontend):**
  ```bash
  cd frontend
  npm run dev
  ```
  > Tarayıcınızda `http://localhost:5173` adresine giderek uygulamayı kullanmaya başlayabilirsiniz.

> [!CAUTION]
> **Production / VPS Uyarısı:** VPS veya sunucu ortamında backend'i (`8000`) doğrudan internete açmayınız. TLS sonlandırması ve `X-Forwarded-Proto: https` başlığı sağlayan bir Reverse Proxy (Caddy, Nginx vb.) kurunuz. Oturum çerezlerinin güvenliği için HTTPS zorunludur.

---

## 3. Ajan Rolleri ve Hiyerarşik Görev Dağılımı (6 Seviye)

| Ajan Rolü | Unvan | Sorumluluk Kapsamı | Canlı Kural Dosyası |
|---|---|---|---|
| **Manager** | Baş Mimar & Proje Yöneticisi | Boss ile görüşür, gereksinimleri netleştirir, mimariyi çizer, domainlere böler ve Prisma/SQLite projelerinde `.env.example` güvencesini şartnameye bağlar. | `docs/manager.md` |
| **Director** | Domain Direktörü | Kendisine atanan domainin teknik mimarisini, kütüphane ve bileşen standartlarını belirler. | `docs/director.md` |
| **Teamleader** | Takım Lideri | Direktörün şartnamesini atomik DAG görevlerine böler. **Katı Tek Dosya Atomik Limit (`targetFiles.length === 1`)** kuralını uygular. | `docs/teamleader.md` |
| **Coder** | Yazılım Geliştirici | Kendisine verilen atomik görevi alır, hedef dosyaları eksiksiz kodlar. **Bileşen Kompozisyonu** (`@/components` import etme) kuralını uygular. | `docs/coder.md` |
| **Reviewer** | Kod İnceleme & Kalite Kapısı | Üretilen kodları sözdizimi, eksik importlar ve güvenlik açısından inceler; 2 tur sonunda onay vermezse görevi fail-closed olarak **VETO** eder. | `docs/reviewer.md` |
| **Tester** | Test & Kabul Uzmanı | Babel AST (`@babel/parser`) ile deterministik sentaks denetimi, secret fallback tespiti, `executeStaticRepairLoop` ile sıralı hedefli dosya onarımı yapar; `RAPOR.md` ve dinamik `README.md` üretir. | `docs/tester.md` |

---

## 4. Uçtan Uca Kullanım Adımları (A'dan Z'ye)

### Adım 1: Güvenli Giriş Yapma (Authentication)
1. Tarayıcınızda `http://localhost:5173` adresini açın.
2. `npm run create-admin -- <kullanıcı-adı>` ile oluşturduğunuz DB hesabını girin.
3. **Giriş Yap** butonuna tıklayın. Tarayıcı 24 saatlik HttpOnly sunucu oturumu kullanır; credential `localStorage` içinde tutulmaz. **Çıkış** yalnız mevcut oturumu iptal eder.

### Adım 2: Yeni Proje Başlatma ve Disk Senkronizasyonu
1. Sol panelin üst kısmında yer alan `+` (Yeni Proje) butonuna tıklayın.
2. Açılan pencerede projenize bir isim verin (Örn: `araba-kiralama-otomasyonu`).
3. Proje listesinde projeniz `PLANNING` durumunda belirecek ve ana dizindeki `projects/<proje_id>` klasörüne fiziksel olarak oluşturulacaktır.
4. **Çift Yönlü Disk Senkronizasyonu:** `projects/` dizini altına dışarıdan eklenen veya silinen proje klasörleri web arayüzü tarafından otomatik algılanarak yan menüyle anında senkronize edilir. Test süitleri (`npm test`) izole `os.tmpdir()` sandbox'ında çalıştığından ana veritabanı ve yan menü test artıklarından tamamen korunur.

### Adım 3: Manager ile Beyin Fırtınası ve Planlama (Zaman Damgalı Sohbet)
1. Proje seçildiğinde doğrudan **Manager Sohbet Paneli (`ChatView`)** açılır.
2. Manager'a geliştirmek istediğiniz uygulamayı doğal dilde anlatın:
   > *"Bana modern TailwindCSS kullanan, Next.js 14 App Router ve Prisma SQLite destekli bir Araba Kiralama ve Rezervasyon Sistemi oluştur."*
3. Manager projenin kapsamını, kullanılacak modelleri (Car, Reservation, User) ve mimariyi sizinle olgunlaştırır.
4. **Canlı Telemetri ve Hata Teşhis Yeteneği:** Süreç sırasında duraklatılan (`paused`) veya hata alan bir projede Manager'a *"Neden durdu? Hata ne anlama geliyor?"* diye sorduğunuzda; Manager veritabanındaki canlı `project_logs` ve alt ajan `RAPOR.md` dosyalarını okuyarak hatanın hangi dosyada, hangi fonksiyon/satırda ve ne sebeple (Reviewer vetosu, kesik kod, eksik import vb.) olduğunu somut kanıtlarla şeffafça açıklar ve çözüm önerir.

### Adım 4: Mimari Planı Onaylama, Sürümlü Sözleşme ve Canlı Revizyon (`pending_approval`)
1. Manager mimari şartnameyi tamamladığında veya Boss *"başla"* dediğinde sistem otomatik olarak `pending_approval` durumuna geçer.
2. **Sürümlü Yazılım Sözleşmesi (`PROJECT_CONTRACT`):** Sistem arka planda `project_contracts`, `requirements` ve `contract_elements` tablolarına değişmez bir sözleşme revizyonu ve SHA-256 sözleşme özeti (`contract_hash`) kaydeder.
3. Sohbet panelinin hemen altında yeşil renkli **"Mimari Plan Hazırlandı — Onayınız Bekleniyor"** onay kartı belirir.
4. **"Planı Onayla ve Başlat"** butonuna tıkladığınızda sözleşme onaylanır (`status = approved`), otonom DAG motoru devreye girer ve proje durumu `RUNNING` olur. Onaylanmayan sözleşme kod üretimine aktarılamaz.
5. **Sohbetten Canlı Revizyon ve Hükümsüz Kılma (Supersession):** Tamamlanmış veya durdurulmuş bir projede sohbete girip *"Next.js yerine Vite React ve Tailwind yap"* veya *"Şu modeli ekle"* dediğinizde; Manager yeni bir sözleşme taslağı oluşturur, eski çelişen gereksinimleri `superseded` olarak işaretler ve yeni bir sözleşme revizyonuyla onay butonunu tekrar açar.
### Adım 5: Canlı ReactFlow DAG Akışını ve Süreç Loglarını İzleme (4 Ayrı Sekme)
1. Proje başladığında üst menüdeki 4 bağımsız sekme arasında serbestçe gezinebilirsiniz:
   - **💬 Sohbet & Mimari (`chat`):** Manager ile konuşma, canlı düşünce animasyonu (`Sparkles & Bouncing Dots`) ve otomatik bitiş/müdahale bildirimleri.
   - **📊 Canlı DAG Grafiği (`flow`):** Ekranın tamamını kaplayan, çakışmasız ve kompakt 2 sütunlu hiyerarşik ağaç grafiği.
   - **📜 Canlı Süreç Logları (`logs`):** Arama kutusu, `ERROR` / `VETO` / `FEEDBACK` filtreleri ve anlık bağlantı durumu içeren tam sayfa log izleme ekranı.
   - **💻 Kod Editörü (`ide`):** Proje tamamlandığında açılan tam teşekküllü Monaco Editor arayüzü.

### Adım 6: Canlı Müdahale, Duraklatma ve Kaldığı Yerden Devam Etme (`Pause / Resume`)
1. Süreç devam ederken üst barda bulunan **"⏸️ Süreci Duraklat"** butonuna tıklayabilirsiniz.
2. Projeyi tekrar başlatmak için üst bardaki veya bildirim şeridindeki yeşil **"▶️ Projeyi Devam Ettir (Resume)"** butonuna basmanız yeterlidir.
3. **Çift Katmanlı Checkpoint Koruması:** Motor, daha önce tamamlanmış görevleri diskteki `RAPOR.md`, `DURUM.md` ve fiziksel dosya boyutu (`size > 0` byte) üzerinden doğrular; reddedilmiş (`BASARISIZ`) görevleri asla atlamaz.

### Adım 7: Monaco Editor'de Kodları İnceleme ve Güvenli ZIP Olarak İndirme
1. Tüm ajanlar görevlerini bitirdiğinde süreç hemen tamamlandı sayılmaz. Bağımsız temiz oda doğrulayıcısı (`artifactVerifier`) devreye girer:
   - Sunucu tarafında ZIP arşivi oluşturulur ve disk SHA-256 özeti hesaplanır (`artifacts`).
   - Arşiv, izole sandbox temiz odasında açılarak 18 zorunlu kalite kapısından geçirilir.
   - Tüm kontroller eksiksiz PASS olduğunda `completeVerifiedProject` fonksiyonu atomik bir CAS işlemiyle projeyi `COMPLETED` yapar ve `completion_receipts` tablosuna değişmez denetim makbuzu yazar.
2. Üst barda iki buton belirir:
   - **💻 Kod Editörünü Aç:** Monaco Editor IDE modunda dosyaları inceler.
   - **📥 Projeyi (ZIP) İndir:** Sunucuda doğrulanmış ve hash'i eşleşen temiz ZIP paketini bilgisayarınıza indirir. Doğrulanmamış veya disktteki hash'i uyuşmayan hiçbir dosya indirilemez (409 Fail-Closed).
## 5. Yan Menü Proje Yönetimi ve İşlem Menüsü (`...`)

Sol kenar çubuğunda her proje kartının yanında üç nokta (`...`) işlem butonu yer alır:
- 📌 **Başa Sabitle / Sabitlemeyi Kaldır (`Pin / Unpin`):** Projeyi listenin en üstüne sabitler veya sabitlemeyi kaldırır.
- ⬇️ **Projeyi (ZIP) İndir (`Download ZIP`):** Tamamlanmış (`COMPLETED`) projeleri doğrudan yan menüden doğrulanmış ZIP paketi olarak bilgisayarınıza indirir.
- 🗑️ **Uygulamayı Kaldır / Projeyi Sil (`Delete`):** Projeyi veritabanı ve diskten güvenle kaldırır; çöp işlemleri işletim sisteminin geçici dizininde (`os.tmpdir()`) izole edilir, `projects/` dizininde gereksiz boş `.trash` klasörü bırakılmaz.

> **Not:** Diskte fiziksel klasörü bulunmayan projeler yan menüde `(Diskte Bulunamadı)` uyarısıyla anlık olarak tespit edilir ve güvenle temizlenebilir.

---

## 6. Dosya-Bazlı Koordinasyon Protokolü ("Agent = Klasör")

Her ajan kendi izole klasöründe çalışır:

```text
projects/<proje_id>/
├── manager/                        # Manager Ajanı ve Tüm Ajan Hiyerarşisi
│   ├── TALIMATNAME.md              # Ana Mimari Şartname
│   ├── TODO.md                     # Manager Seviyesi Görev Çizelgesi
│   ├── DURUM.md                    # Anlık İlerleme Durumu
│   ├── GOREV.md                    # Manager Misyonu
│   │
│   ├── frontend.director/          # Frontend Direktörü
│   │   ├── ALT-TALIMATNAME.md      # Frontend Mimari Şartnamesi
│   │   ├── TODO.md
│   │   └── frontend.teamleader/    # Frontend Takım Lideri
│   │       ├── TODO.md             # Atomik Görevler DAG'ı
│   │       └── task-1-setup-ui/    # Coder Görev Klasörü (GOREV, DURUM, RAPOR)
│   │
│   └── backend.director/           # Backend Direktörü
│       └── backend.teamleader/
│
├── src/                            # Üretilen Temiz Uygulama Kaynak Kodları (app/layout.tsx, app/page.tsx, components, lib)
├── prisma/                         # schema.prisma & seed.ts
├── .env.example                    # Güvenli örnek yapılandırma şablonu
├── package.json                    # Kilitli Kararlı Sürümler (Next 15+, React 18.3+, Prisma 6.4+, Zod 3.24+, Tailwind 3.4+)
├── tsconfig.json                   # Path Alias (@/* -> ./src/*) Konfigürasyonu
├── tailwind.config.ts              # Stil Yapılandırması (darkMode: 'class')
├── service-manifest.json           # Otomatik Üretilen Servis & Port Sözleşmesi
├── README.md                       # Otomatik Üretilen Kurulum & Çalıştırma Rehberi
└── RAPOR.md                        # Tester Nihai Kabul Raporu

---

## 7. Üretilen Projeyi Bilgisayarınızda Çalıştırma Kılavuzu

Projenizi ZIP olarak indirdikten veya `projects/<proje_id>` klasörünü açtıktan sonra:

### 1. Adım: Bağımlılıkları Kurun
```bash
npm install
```

### 2. Adım: Veritabanını Oluşturun (Prisma ORM)
> `.env.example` dosyasını `.env` olarak kopyalayıp `NEXTAUTH_SECRET` değerini uzun rastgele bir anahtarla değiştirmeniz gerekir:
```bash
npx prisma generate
npx prisma db push
```

### 3. Adım: (Opsiyonel) Örnek Verileri Yükleyin
```bash
npx prisma db seed
```

### 4. Adım: Uygulamayı Başlatın
```bash
npm run dev
```
> Tarayıcınızda `http://localhost:3000` adresini açarak uygulamanızı kullanmaya başlayabilirsiniz!

---

## 8. Test Süiti ve Otomasyonun Çalıştırılması (`npm test`)

Tüm çekirdek motorları, güvenlik (CSP, HSTS, rate limiter), RFC 6238 TOTP/MFA, asenkron scrypt doğrulamasını, HTTP/WebSocket entegrasyonunu, DAG dalga motorunu, concurrency havuzunu, gerçek derleyici doğrulamasını (`tsc`, `prisma`), deterministik kalite kapısını, alt süreç sandbox'ını, veritabanı migration'larını (V1-V6), log saklama temizliğini ve liveness/readiness problarını test etmek için:

```bash
cd backend
npm test
```

Tüm testler merkezi **`backend/tests/test_runner.js`** altındaki master koşucu ile doğrulanır:
```text
==================================================
📊 Test Özeti: 25 Süit Başarılı, 0 Süit Hatalı (%100 Başarı)
==================================================
```

## 9. Sıkça Sorulan Sorular (SSS) ve Sorun Giderme

### S: `error: Environment variable not found: DATABASE_URL` hatası alırsam ne yapmalıyım?
**C:** XFactor'ın güncel sürümünde `.env.example` dosyası üretilir ve ZIP paketine eklenir; `.env` dosyasını siz oluşturup `NEXTAUTH_SECRET` ile `DATABASE_URL` gibi değerleri doldurmalısınız.

### S: Manager ile konuşurken "Mesaj iletilemedi, lütfen tekrar deneyin" hatası alıyorum, nedeni nedir?
**C:** Bu durum iki nedenden kaynaklanabilir:
1. `backend/.env` dosyasında geçerli bir `GOOGLE_API_KEY` tanımlı değildir veya model adı (`AI_MODEL`) hatalıdır.
2. İşletim sistemi veya kısıtlı kurumsal ağ ortamlarında Node.js varsayılan `dns.lookup` sistem çağrısı harici API host'larını (`generativelanguage.googleapis.com`) doğrudan çözümleyemeyebilir. XFactor içinde yerleşik `backend/networkResolver.js` modülü `ENOTFOUND` durumunda doğrudan aktif DNS sunucusundan IPv4 (`dns.resolve4`) çözümlemesine otomatik düşer. Sorun devam ederse yerel DNS veya proxy ayarlarınızı kontrol ediniz.

### S: LLM çıktısı token sınırına takılırsa veya Reviewer veto ederse ne olur?
**C:** XFactor'da `finishReason === 'MAX_TOKENS'` kontrolü ve Teamleader'ın "Sayfaları ve büyük UI bileşenlerini atomik alt parçalara bölme" kuralı bulunur. Eğer bir görev 2 tur sonunda tamamlanamazsa Reviewer güvenli modda **VETO** verir ve projeyi `PAUSED` durumuna alır. Bu durumda sohbetten Manager'a hatayı sorabilir veya üst bardaki **"Devam Et (Resume)"** butonuna basarak orkestrasyonu güvenle sürdürebilirsiniz.

### S: Tamamlanmış veya duraklatılmış bir projeyi sohbetten değiştirebilir miyim?
**C:** Evet. Tamamlanmış, duraklatılmış (`PAUSED`) veya doğrulama hatası almış (`VERIFICATION_FAILED`) bir projede sohbet paneline girip revizyon istediğinizde (örn: *"1"*, *"baştan başla"*, *"şunu ekle"*); Manager yeni mimari şartnameyi hazırlar, yeni bir sözleşme revizyonu açar ve sohbetin altında yeşil **"Planı Onayla ve Başlat"** onay kartını sunar. Onayladığınızda otonom motor yeni plan doğrultusunda temiz üretime geçer.

### S: Log ekranındaki hataları nasıl yorumlamalıyım?
**C:** XFactor'da log ekranında anlamsız hexadecimal referans kodları gösterilmez; doğrudan insan tarafından anlaşılabilir net Türkçe hata kategorileri (`[Hata] LLM Kota ve Bütçe Sınırı Aşıldı`, `[Hata] Bağımlılık Hazırlığı Başarısız`, `[Süreç Hatası]`) basılır. Ayrıca Docker'ın çalışmadığı geliştirme ortamlarında sistem otomatik olarak yerel host üzerinden kilit dosyası (`package-lock.json`) üretme fallback'ini devreye sokarak döngüsel kilitlenmeleri engeller.

### S: 8099 portu nedir? Tarayıcıdan açtığımda neden `{"error":"Unauthorized"}` hatası alıyorum?
**C:** XFactor, **Bölünmüş Güvenlik Mimarisi (Split Architecture)** ile çalışır. Yapay zekânın yazdığı kodların derlenmesi (`tsc`), paketlenmesi (`npm install`) ve çalıştırılması ana Backend sürecinde (`8000`) değil, izole bir **Execution Worker (`8099`)** servisinde yürütülür.
- Bu port bir web sitesi veya kullanıcı arayüzü değildir; yalnızca Backend ile Worker arasındaki makine seviyesinde şifreli bir API'dir.
- Tarayıcınızla doğrudan bu porta istek attığınızda, sistem güvenlik amacıyla isteği reddeder ve `{"error":"Unauthorized"}` cevabı döner.
- Kullanıcının bu portu doğrudan ziyaret etmesi gerekmez; Worker'ın yürüttüğü tüm işlemler (derleme logları, test sonuçları, 18 kalite kapısı kontrolleri) anlık olarak ana ön yüzdeki (`5173`) **Loglar**, **DAG Akış Şeması** ve **Kalite Paneli** ekranlarına canlı olarak yansıtılır.

---

## 10. Geliştirici Rehberi: Kod Tabanı Analizi ve Bilgi Grafiği (Graphify)

XFactor kod tabanını genişletmek, yeni bir ajan eklemek veya mevcut mimari bağımlılıkları görselleştirmek isteyen geliştiriciler için aşağıdaki analiz araçları ve yöntemleri önerilir:

### 1. Kod Tabanı Bağımlılık Haritası
Proje içindeki modüller arasındaki bağımlılık ilişkileri deterministik olarak şu katmanlara ayrılmıştır:
- **API & Sunucu Katmanı:** `server.js` ➔ `routes/projectRoutes.js` ➔ `sessionAuth.js` / `security.js`
- **Orkestrasyon & DAG Motoru:** `engine/workflow.js` ➔ `engine/dag.js` ➔ `engine/fileProtocol.js`
- **Kalite Kapıları & Denetim:** `agents/tester.js` ➔ `engine/buildValidator.js` ➔ `engine/selfCorrection.js`
- **Veri Kalıcılığı & İzolasyon:** `projectRepository.js` ➔ `db.js` ➔ `migrations/`

### 2. Bilgi Grafiği (Graphify) ile Mimari Görselleştirme ve Analiz
XFactor, projenin kaynak kodlarını, yaşayan dokümanlarını, ajan sözleşmelerini ve test süitlerini AST seviyesinde analiz eden yerel bir **Graphify Bilgi Grafiği Motoru** (`backend/scripts/generate_graph.js`) barındırır.

#### Grafiği Üretme ve Güncelleme:
Kök dizinde tek bir komutla tüm bilgi grafiğini ve görsel HTML haritalarını tazeleyebilirsiniz:
```bash
npm run graph
```

Bu komut çalıştığında `graphify-out/` dizini altında şu zengin çıktılar üretilir:
1. **`graphify-out/graph.json`:** 69 düğüm (node) ve 92 bağlantı (edge) içeren tam makine-okunur bağımlılık grafiği.
2. **`graphify-out/graph.html`:** Tarayıcınızda açabileceğiniz, D3.js tabanlı, interaktif, sürüklenebilir ve filtrelenebilir **2D/3D Kod Ağ Haritası**.
3. **`graphify-out/GRAPH_TREE.html`:** Renk kodlu rozetlerle (Docs, Agents, Engine, Backend, Frontend, Tests) modül hiyerarşisini gösteren **Hiyerarşik Ağaç Görünümü**.
4. **`graphify-out/GRAPH_REPORT.md`:** Sistemdeki çekirdek odak düğümlerini ("God Nodes") ve alt sistem metriklerini listeleyen özet rapor.

#### Çekirdek Odak Düğümleri ("God Nodes"):
- `backend/tests/test_runner.js` — 25 bağlantı ile tüm test ekosisteminin merkez koşucusu.
- `backend/engine/workflow.js` — 12 bağlantı ile DAG dalgalarını yürüten master orkestratör.
- `docs/ORKESTRASYON-TALIMATNAMESI.md` — 10 bağlantı ile platform anayasası.
- `backend/agents/index.js` — 9 bağlantı ile ajan fabrikası ve kayıt defteri.
- `backend/routes/projectRoutes.js` — 8 bağlantı ile REST API ve revizyon merkezi.
- `frontend/src/App.jsx` — 8 bağlantı ile React 18 kullanıcı arayüzü kökü.
---

## 11. 18 Zorunlu Kalite Kapısı ve Temiz Oda Doğrulama Sistemi (Politika 2.0)

XFactor'de yapay zekâ ajanının *"Kusursuz tamamlandı"* demesi projeyi tamamlamaya yetmez. Yalnızca makine tarafından yürütülen ve değişmez kanıt üreten **18 Kalite Kapısı** projeyi onaylayabilir:

| # | Kalite Kapısı | Doğrulama Mekanizması ve Kuralı |
|---|---|---|
| 1 | `package_json` | Bağımlılıkların biçim, sürüm ve çakışma kontrolü; geçersiz `^1.0.0` tahminleri engellenir. |
| 2 | `lockfile` | Paket yöneticisi kilit dosyasının (`package-lock.json`) varlığı ve tutarlılığı. |
| 3 | `ast_import_inventory` | Kod içinde `import` edilen tüm paketlerin `package.json`'da tanımlı olduğunun AST analiziyle kanıtı. |
| 4 | `clean_install` | Temiz, izole sandbox ortamında `npm install` komutunun 0 çıkış koduyla başarıyla tamamlanması. |
| 5 | `typecheck` | Gerçek framework derleyicisi (`tsc --noEmit`) ile tip kontrolü; eksik tip veya kırık export derhal reddedilir. |
| 6 | `framework_build` | Gerçek framework derleme betiğinin (`npm run build`) sandbox içinde başarıyla sonuçlanması. |
| 7 | `requirement_traceability` | Sözleşmedeki her zorunlu gereksinimin (`requirements`) en az bir PASS alan kontrolle kanıtlanması. |
| 8 | `service_manifest` | Frontend/backend port, base URL, proxy ve CORS sözleşmesinin `service-manifest.json` ile çakışmasız yapılandırılması. |
| 9 | `database_verification` | Prisma şemasının (`npx prisma validate`), client üretiminin (`prisma generate`), migration/push (`prisma db push`), tohumlama (`prisma db seed`) ve kullanıcı hesabı varlığının (`prisma_seed_accounts`) izole worker'da doğrulanması. |
| 10 | `api_contract` | Üretilen HTTP API rotalarının gerçek HTTP istekleriyle ve veritabanı yan etkileriyle doğrulanması. |
| 11 | `browser_journey` | Headless Chromium tarayıcısıyla kritik kullanıcı yolculuklarının (form doldurma, CRUD, sayfa yenileme) testi. |
| 12 | `smoke_gate` | Projenin bağımsız servis başlatıcı ve sağlık kontrolleriyle uçtan uca ayağa kalktığının doğrulanması. |
| 13 | `test_infrastructure` | Proje içinde çalıştırılabilir test altyapısının (`test` scripti, test dosyaları) varlığı. |
| 14 | `domain_entity_check` | Kullanıcının istediği ana modellerin ve iş akışlarının kod tabanında somut olarak varlığının denetimi. |
| 15 | `placeholder_check` | Sahte kimlik doğrulama, içi boş formlar, işlevsiz butonlar veya stub kodların engellenmesi. |
| 16 | `contamination_check` | Farklı şablonlardan veya alakasız projelerden kalan yabancı metin ve kodların elenmesi. |
| 17 | `security_baseline` | Açık CORS, hard-coded secret, zayıf oturum ve enjeksiyon risklerinin statik ve dinamik denetimi. |
| 18 | `readme_check` | Projede üretilen README.md içindeki kurulum ve çalıştırma komutlarının projeyle birebir uyumu. |

Her kapı; çalıştırılan komut, çıkış kodu, SHA-256 çıktı özetleri (`stdout_digest`, `stderr_digest`) ve ISO UTC takvim zaman damgalarını veritabanında `verification_checks` ve `verification_evidence` tablolarına değişmez olarak yazar. Kanıtı eksik veya sahte olan hiçbir kontrol `PASS` sayılmaz.
🎉 **XFactor ile otonom, güvenli ve hatasız yazılım geliştirmenin keyfini çıkarın!**
