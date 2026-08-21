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
│     - manager/TALIMATNAME.md, TODO.md, .env & Domain Dağılımı   │
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
└──────────────────────────────┘   └──────────────────────────────┘
```

---

## 2. Sistem Gereksinimleri ve İlk Kurulum

### Sistem Gereksinimleri
- **İşletim Sistemi:** Windows, macOS veya Linux
- **Node.js:** v18.0.0 veya daha yenisi (veya Bun v1.0+)
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
JWT_SECRET=en-az-32-karakter-uzunlugunda-guclu-bir-rastgele-anahtar
ADMIN_USER=admin
ADMIN_PASS=StrongPassword!2026
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AI_PROVIDER=google
AI_MODEL=gemini-3.7-flash
ALLOW_MOCK_FALLBACK=false
GOOGLE_API_KEY=AIzaSy...SizinGoogleGeminiAnahtariniz...
```

### 2. Adım: Backend'i Başlatma
```bash
cd backend
npm install
npm run dev
```
> Backend sunucusu `http://127.0.0.1:8000` adresinde hazır olacaktır.

### 3. Adım: Frontend'i Başlatma
```bash
cd frontend
npm install
npm run dev
```
> Tarayıcınızda `http://localhost:5173` adresine gidin.

---

## 3. Ajan Rolleri ve Hiyerarşik Görev Dağılımı (6 Seviye)

| Ajan Rolü | Unvan | Sorumluluk Kapsamı | Canlı Kural Dosyası |
|---|---|---|---|
| **Manager** | Baş Mimar & Proje Yöneticisi | Boss ile görüşür, gereksinimleri netleştirir, mimariyi çizer, domainlere böler ve Prisma/SQLite projelerinde `.env` güvencesini şartnameye bağlar. | `docs/manager.md` |
| **Director** | Domain Direktörü | Kendisine atanan domainin teknik mimarisini, kütüphane ve bileşen standartlarını belirler. | `docs/director.md` |
| **Teamleader** | Takım Lideri | Direktörün şartnamesini atomik DAG görevlerine böler. **Maksimum 1-2 dosya (Atomik Limit)** kuralını uygular. | `docs/teamleader.md` |
| **Coder** | Yazılım Geliştirici | Kendisine verilen atomik görevi alır, hedef dosyaları eksiksiz kodlar. **Bileşen Kompozisyonu** (`@/components` import etme) kuralını uygular. | `docs/coder.md` |
| **Reviewer** | Kod İnceleme & Kalite Kapısı | Üretilen kodları sözdizimi, eksik importlar ve güvenlik açısından inceler; 2 tur sonunda onay vermezse görevi fail-closed olarak **VETO** eder. | `docs/reviewer.md` |
| **Tester** | Test & Kabul Uzmanı | `stripStringsAndComments` ile sözdizim denetimi, Prisma model-route tutarlılığı denetimi yapar; hata varsa Coder'a otomatik onarım başlatır, `RAPOR.md` ve `README.md` üretir. | `docs/tester.md` |

---

## 4. Uçtan Uca Kullanım Adımları (A'dan Z'ye)

### Adım 1: Güvenli Giriş Yapma (Authentication)
1. Tarayıcınızda `http://localhost:5173` adresini açın.
2. `.env` dosyasında belirlediğiniz kullanıcı adı ve şifreyi girin (Örn: `admin` / `StrongPassword!2026`).
3. **Giriş Yap** butonuna tıklayın.

### Adım 2: Yeni Proje Başlatma
1. Sol panelin üst kısmında yer alan `+` (Yeni Proje) butonuna tıklayın.
2. Açılan pencerede projenize bir isim verin (Örn: `araba-kiralama-otomasyonu`).
3. Proje listesinde projeniz `PLANNING` durumunda belirecektir.

### Adım 3: Manager ile Beyin Fırtınası ve Planlama (Zaman Damgalı Sohbet)
1. Proje seçildiğinde doğrudan **Manager Sohbet Paneli (`ChatView`)** açılır.
2. Manager'a geliştirmek istediğiniz uygulamayı doğal dilde anlatın:
   > *"Bana modern TailwindCSS kullanan, Next.js 14 App Router ve Prisma SQLite destekli bir Araba Kiralama ve Rezervasyon Sistemi oluştur."*
3. Manager projenin kapsamını, kullanılacak modelleri (Car, Reservation, User) ve mimariyi sizinle olgunlaştırır.
4. **Canlı Telemetri ve Hata Teşhis Yeteneği:** Süreç sırasında duraklatılan (`paused`) veya hata alan bir projede Manager'a *"Neden durdu? Hata ne anlama geliyor?"* diye sorduğunuzda; Manager veritabanındaki canlı `project_logs` ve alt ajan `RAPOR.md` dosyalarını okuyarak hatanın hangi dosyada, hangi fonksiyon/satırda ve ne sebeple (Reviewer vetosu, kesik kod, eksik import vb.) olduğunu somut kanıtlarla şeffafça açıklar ve çözüm önerir.

### Adım 4: Mimari Planı Onaylama ve Canlı Revizyon (`pending_approval`)
1. Manager mimari şartnameyi tamamladığında veya Boss *"başla"* dediğinde sistem otomatik olarak `pending_approval` durumuna geçer.
2. Sohbet panelinin hemen altında yeşil renkli **"Mimari Plan Hazırlandı — Onayınız Bekleniyor"** onay kartı belirir.
3. **"Planı Onayla ve Başlat"** butonuna tıkladığınızda otonom DAG motoru devreye girer ve proje durumu `RUNNING` olur.
4. **Sohbetten Canlı Revizyon Yeteneği:** Tamamlanmış veya durdurulmuş bir projede sohbete girip *"Şu sayfayı veya şu modeli yeniden yapılandır"* dediğinizde Manager revizyon şartnamesini hazırlar ve onay butonunu tekrar açarak gerçek DAG üretimini baştan tetikler.
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

### Adım 7: Monaco Editor'de Kodları İnceleme ve ZIP Olarak İndirme
1. Tüm ajanlar görevlerini bitirip Tester onay verdiğinde proje durumu `COMPLETED` olur ve Manager sohbete tebrik/özet mesajı bırakır.
2. Üst barda iki buton belirir:
   - **💻 Kod Editörünü Aç:** Monaco Editor IDE modunda dosyaları inceler.
   - **📥 Projeyi (ZIP) İndir:** `.env` (`DATABASE_URL="file:./dev.db"`), `.env.example` ve `.gitignore` dahil tüm kaynak kodları temiz paket halinde bilgisayarınıza indirir.

## 5. Yan Menü Proje Yönetimi ve İşlem Menüsü (`...`)

Sol kenar çubuğunda her proje kartının yanında üç nokta (`...`) işlem butonu yer alır:
- 📌 **Başa Sabitle / Sabitlemeyi Kaldır (`Pin / Unpin`)**
- ✏️ **Yeniden Adlandır (`Rename`)**
- ⬇️ **Projeyi (ZIP) İndir (`Download ZIP`)**
- 🗑️ **Projeyi Sil (`Delete`)**
- 🔄 **Disk ile Senkronize Et (`RefreshCw`)**

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
├── src/                            # Üretilen Temiz Uygulama Kaynak Kodları
├── prisma/                         # schema.prisma & seed.ts
├── .env & .env.example            # Otomatik DATABASE_URL="file:./dev.db"
├── package.json                    # Güncel Bağımlılıklar (Next 14.2+, React 18.3+, Prisma 5.22+)
├── tsconfig.json                   # Path Alias (@/* -> ./src/*) Konfigürasyonu
├── tailwind.config.ts              # Stil Yapılandırması
├── README.md                       # Otomatik Üretilen Kurulum & Çalıştırma Rehberi
└── RAPOR.md                        # Tester Nihai Kabul Raporu
```

---

## 7. Üretilen Projeyi Bilgisayarınızda Çalıştırma Kılavuzu

Projenizi ZIP olarak indirdikten veya `projects/<proje_id>` klasörünü açtıktan sonra:

### 1. Adım: Bağımlılıkları Kurun
```bash
npm install
```

### 2. Adım: Veritabanını Oluşturun (Prisma ORM)
> `.env` dosyası hazır olarak `DATABASE_URL="file:./dev.db"` içerdiği için doğrudan çalıştırabilirsiniz:
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

Tüm çekirdek motorları, güvenlik, DAG dalga motoru, concurrency havuzu, gerçek derleyici doğrulaması (`tsc`, `prisma`), deterministik kalite kapısı ve checkpoint kurtarma fonksiyonlarını test etmek için:

```bash
cd backend
npm test
```

Tüm 85 test merkezi **`backend/tests/`** altındaki master koşucu ile doğrulanır:
```text
==================================================
📊 Test Özeti: 8 Süit Başarılı, 0 Süit Hatalı (85/85 Test %100 Başarı)
==================================================
```
---

## 9. Sıkça Sorulan Sorular (SSS) ve Sorun Giderme

### S: `error: Environment variable not found: DATABASE_URL` hatası alırsam ne yapmalıyım?
**C:** XFactor'ın güncel sürümünde `.env` ve `.env.example` dosyaları otomatik üretilmekte ve ZIP paketine dahil edilmektedir. Proje kök dizininde `.env` dosyasının bulunduğundan ve içinde `DATABASE_URL="file:./dev.db"` yazdığından emin olun.

### S: LLM çıktısı token sınırına takılırsa veya Reviewer veto ederse ne olur?
**C:** XFactor'da `finishReason === 'MAX_TOKENS'` kontrolü ve Teamleader'ın "Sayfaları ve büyük UI bileşenlerini atomik alt parçalara bölme" kuralı bulunur. Eğer bir görev 2 tur sonunda tamamlanamazsa Reviewer güvenli modda **VETO** verir ve projeyi `PAUSED` durumuna alır. Bu durumda sohbetten Manager'a hatayı sorabilir veya üst bardaki **"Devam Et (Resume)"** butonuna basarak orkestrasyonu güvenle sürdürebilirsiniz.

### S: Tamamlanmış bir projeyi sohbetten değiştirebilir miyim?
**C:** Evet. Tamamlanmış bir projede sohbet paneline girip revizyon istediğinizde Manager yeni planı oluşturur ve onay butonunu açar; onayladığınızda gerçek DAG motoru projeyi sıfırdan revize eder.
🎉 **XFactor ile otonom, güvenli ve hatasız yazılım geliştirmenin keyfini çıkarın!**
