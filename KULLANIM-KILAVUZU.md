# 📖 XFactor — A'dan Z'ye Kapsamlı Kullanım ve Operasyon Kılavuzu

Bu kılavuz, **XFactor Otonom AI Ajan Orkestrasyon Platformu**'nun çalışma mantığını, mimari bileşenlerini, arayüz kullanımını ve adım adım uçtan uca yazılım üretim süreçlerini tüm detaylarıyla açıklamaktadır.

---

## 📑 İÇİNDEKİLER

1. [Genel Bakış ve Mimari Felsefe](#1-genel-bakış-ve-mimari-felsefe)
2. [Sistem Gereksinimleri ve İlk Kurulum](#2-sistem-gereksinimleri-ve-ilk-kurulum)
3. [Ajan Rolleri ve Hiyerarşik Görev Dağılımı](#3-ajan-rolleri-ve-hiyerarşik-görev-dağılımı)
4. [Uçtan Uca Kullanım Adımları (A'dan Z'ye)](#4-uçtan-uca-kullanım-adımları-adan-zye)
   - [Adım 1: Güvenli Giriş Yapma (Authentication)](#adım-1-güvenli-giriş-yapma-authentication)
   - [Adım 2: Yeni Proje Başlatma](#adım-2-yeni-proje-başlatma)
   - [Adım 3: Manager ile Beyin Fırtınası ve Planlama (Zaman Damgalı Sohbet)](#adım-3-manager-ile-beyin-fırtınası-ve-planlama-zaman-damgalı-sohbet)
   - [Adım 4: Mimari Planı Onaylama (`pending_approval`)](#adım-4-mimari-planı-onaylama-pending_approval)
   - [Adım 5: Canlı ReactFlow DAG Akışını ve Log Tablosunu İzleme](#adım-5-canlı-reactflow-dag-akışını-ve-log-tablosunu-izleme)
   - [Adım 6: Canlı Müdahale, Duraklatma ve Kaldığı Yerden Devam Etme (`Pause / Resume`)](#adım-6-canlı-müdahale-duraklatma-ve-kaldığı-yerden-devam-etme-pause--resume)
   - [Adım 7: Monaco Editor'de Kodları İnceleme ve ZIP Olarak İndirme](#adım-7-monaco-editorde-kodları-inceleme-ve-zip-olarak-indirme)
5. [Yan Menü Proje Yönetimi ve İşlem Menüsü (`...`)](#5-yan-menü-proje-yönetimi-ve-işlem-menüsü-)
6. [Dosya-Bazlı Koordinasyon Protokolü ("Agent = Klasör")](#6-dosya-bazlı-koordinasyon-protokolü-agent--klasör)
7. [Üretilen Projeyi Bilgisayarınızda Çalıştırma Kılavuzu](#7-üretilen-projeyi-bilgisayarınızda-çalıştırma-kılavuzu)
8. [Test Süiti ve Otomasyonun Çalıştırılması](#8-test-süiti-ve-otomasyonun-çalıştırılması)
9. [Sıkça Sorulan Sorular (SSS) ve Sorun Giderme](#9-sıkça-sorulan-sorular-sss-ve-sorun-giderme)
10. [Geliştirici Rehberi: Kod Tabanı Analizi ve Bilgi Grafiği (Graphify)](#10-geliştirici-rehberi-kod-tabanı-analizi-ve-bilgi-grafiği-graphify)

---

## 1. Genel Bakış ve Mimari Felsefe

Geleneksel yapay zekâ kodlama araçları genellikle tek bir prompt ile tüm uygulamayı tek seferde yazmaya çalışır; bu durum halüsinasyonlara, eksik dosyalara ve kırık bağımlılıklara yol açar.

**XFactor**, bu sorunu iki güçlü dünya standardını birleştirerek çözer:
1. **`msitarzewski/agency-agents` (Uzmanlaşmış Rol Kütüphanesi):** Her ajan sadece kendi uzmanlık alanındaki işi yapar. Bir Manager asla kod yazmaz; bir Coder asla mimari planı kafasına göre değiştirmez.
2. **`coleam00/Archon` (Deterministik DAG & Dark Factory):** Tüm görevler matematiksel bir **Yönlü Döngüsüz Çizge (DAG - Directed Acyclic Graph)** yapısında sıralanır. Bir Coder ancak veritabanı şeması veya API modelleri tamamlandığında arayüz geliştirmeye başlar.

```text
┌─────────────────────────────────────────────────────────────────┐
│                      KULLANICI (BOSS)                           │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Doğal Dilde İstekler & Onay
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MANAGER AGENT                             │
│     - manager/TALIMATNAME.md, TODO.md ve Domain Dağılımı        │
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
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│        CODER AGENT           │   │        CODER AGENT           │
│   - Çok Dosyalı Kod Üretimi  │   │   - Çok Dosyalı Kod Üretimi  │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│   REVIEWER & TESTER AGENTS   │   │   REVIEWER & TESTER AGENTS   │
│ - Quality Gate & Düzeltme    │   │ - Quality Gate & Düzeltme    │
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
JWT_SECRET=super_secret_xfactor_jwt_key_2026_at_least_32_chars_long
ADMIN_USER=admin
ADMIN_PASS=StrongPassword!2026
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AI_PROVIDER=google
AI_MODEL=gemini-2.5-flash
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

## 3. Ajan Rolleri ve Hiyerarşik Görev Dağılımı

| Ajan Rolü | Unvan | Sorumluluk Kapsamı | Ürettiği / Yönettiği Dosyalar |
|---|---|---|---|
| **Manager** | Baş Mimar & Proje Yöneticisi | Boss ile görüşür, gereksinimleri netleştirir, mimariyi çizer ve domainlere (`frontend`, `backend` vb.) böler. | `manager/TALIMATNAME.md`, `manager/TODO.md`, `manager/GOREV.md` |
| **Director** | Domain Direktörü | Kendisine atanan domainin teknik mimarisini, kütüphane ve bileşen standartlarını belirler. | `ALT-TALIMATNAME.md`, `TODO.md` |
| **Teamleader** | Takım Lideri | Direktörün şartnamesini atomik, bağımsız kodlanabilir alt görevlere ve önkoşul bağımlılıklarına (DAG) ayırır. | `GOREV.md`, `TODO.md` (Görevler) |
| **Coder** | Yazılım Geliştirici | Kendisine verilen atomik görevi alır, hedef dosyaları (`package.json`, `App.jsx`, `api.js` vb.) eksiksiz kodlar. | Hedef Kaynak Dosyalar, `DURUM.md` |
| **Reviewer** | Kod İnceleme & Kalite Kapısı | Üretilen kodları sözdizimi, eksik importlar ve güvenlik açısından inceler; hata varsa Coder'a düzelttirir. | `RAPOR.md`, İnceleme Geri Bildirimi |
| **Tester** | Test & Doğrulama Uzmanı | Üretilen projenin uçtan uca kabul kriterlerine ve şartnameye uygunluğunu doğrular; çalıştırma rehberi (`README.md`) üretir. | `RAPOR.md` (Final Rapor), `README.md` |

---

## 4. Uçtan Uca Kullanım Adımları (A'dan Z'ye)

### Adım 1: Güvenli Giriş Yapma (Authentication)
1. Tarayıcınızda `http://localhost:5173` adresini açın.
2. Karşınıza **XFactor'a Giriş Yap** ekranı gelecektir.
3. `.env` dosyasında belirlediğiniz kullanıcı adı ve şifreyi girin (Örn: `admin` / `StrongPassword!2026`).
4. **Giriş Yap** butonuna tıklayın.

---

### Adım 2: Yeni Proje Başlatma
1. Sol panelin üst kısmında yer alan `+` (Yeni Proje) ikonuna tıklayın.
2. Açılan pencerede projenize bir isim verin (Örn: `kütüphane-otomasyonu`).
3. Proje listesinde projeniz `PLANNING` durumunda belirecektir. Projeye tıklandığında **doğrudan Manager Sohbet (Brainstorming) ekranı** açılır.

---

### Adım 3: Manager ile Beyin Fırtınası ve Planlama (Zaman Damgalı Sohbet)
1. Proje seçildiğinde **Manager Sohbet Paneli** açılır. Tüm mesajlar altında kesin tarih ve saat damgası (`DD.MM.YYYY HH:mm:ss`) ile listelenir.
2. Manager'a geliştirmek istediğiniz uygulamayı doğal dilde anlatın:
   > *"Bana modern TailwindCSS kullanan, Next.js 14 App Router ve Prisma SQLite destekli bir Kütüphane Yönetim Sistemi oluştur."*
3. Manager projenin kapsamını, kullanılacak kütüphaneleri ve bileşen mimarisini sizinle tartışarak olgunlaştırır.

---

### Adım 4: Mimari Planı Onaylama (`pending_approval`)
1. Manager mimari şartnameyi tamamladığında sistem otomatik olarak `pending_approval` durumuna geçer.
2. Sohbet panelinin hemen altında yeşil renkli **"Mimari Plan Hazırlandı — Onayınız Bekleniyor"** onay kartı belirir.
3. **"Planı Onayla ve Başlat"** butonuna tıkladığınızda otonom orkestrasyon motoru devreye girer ve proje durumu `RUNNING` olur.

---

### Adım 5: Canlı ReactFlow DAG Akışını ve Log Tablosunu İzleme
1. Proje başladığında ekran otomatik olarak **ReactFlow Görselleştirme ve Canlı Log Paneline** geçer.
2. Üst menüdeki sekme düğmeleriyle (`💬 Sohbet & Mimari` / `📊 Canlı DAG Grafiği`) istediğiniz görünüme serbestçe geçebilirsiniz.
3. Alt kısımdaki **Canlı Süreç Logları Tablosu** aşağıdaki sütunlarla gerçek zamanlı akar:
   - **Tarih & Saat (`created_at`):** İşlemin yapıldığı kesin zaman damgası.
   - **Ajan (`agent`):** Manager, Director, Teamleader, Coder, Reviewer, Tester.
   - **Eylem (`action`):** START, WRITE, DELEGATE, FEEDBACK, SKIP, FINISH, ERROR.
   - **Hedef Dosya (`file`):** Kodlanan veya denetlenen dosya yolu.
   - **Düğüm ID (`node_id`):** DAG düğüm kimliği.
   - **İşlem Mesajı (`message`):** Ajanın gerçekleştirdiği operasyon detayı.

---

### Adım 6: Canlı Müdahale, Duraklatma ve Kaldığı Yerden Devam Etme (`Pause / Resume`)
1. Süreç devam ederken üst barda bulunan **"⏸️ Süreci Durdur (Müdahale Et)"** butonuna tıklayabilirsiniz.
2. Motor anında güvenli bir noktada duraklar (`status = paused`) ve sohbet ekranına döner.
3. **Stateful Checkpoint Recovery Yeteneği:**
   - Projeyi tekrar başlatmak için üst bardaki veya sohbet altındaki yeşil **"▶️ Projeyi Devam Ettir (Resume)"** butonuna basmanız yeterlidir.
   - Motor, daha önce tamamlanmış görevleri (`task-1` .. `task-5`) diskteki `RAPOR.md` dosyalarından algılar ve **`[SKIP]` eylemiyle atlayarak doğrudan yarım kalan görevden (`task-6`)** devam eder.

---

### Adım 7: Monaco Editor'de Kodları İnceleme ve ZIP Olarak İndirme
1. Tüm ajanlar görevlerini bitirip Tester onay verdiğinde proje durumu `COMPLETED` olur.
2. Üst barda iki yeni buton belirir:
   - **💻 Kod Editörünü Aç:** Monaco Editor IDE modunu açar.
   - **📥 Projeyi (ZIP) İndir:** Tüm kaynak kodları tek tıkla bilgisayarınıza indirir.
3. **Durum Farkında Manager Sohbeti:** Proje bittiğinde sohbete girip "Proje bitti mi?" diye sorduğunuzda Manager projenin tamamlandığını, üretilen modülleri ve çalıştırma yönergelerini detaylıca açıklar.

---

## 5. Yan Menü Proje Yönetimi ve İşlem Menüsü (`...`)

Sol kenar çubuğunda her proje kartının yanında üç nokta (`...`) işlem butonu yer alır:

- 📌 **Başa Sabitle / Sabitlemeyi Kaldır (`Pin / Unpin`):** Önemli projelerinizi listenin en üstüne sabitler (📌 simgesiyle görünür).
- ✏️ **Yeniden Adlandır (`Rename`):** Projenin başlığını anında günceller.
- ⬇️ **Projeyi (ZIP) İndir (`Download ZIP`):** Proje dosyalarını doğrudan yan menüden bilgisayarınıza indirir.
- 🗑️ **Projeyi Sil (`Delete`):** Projeyi veritabanından ve disk üzerindeki klasöründen temizler.
- 🔄 **Disk ile Senkronize Et:** Üst bardaki `RefreshCw` butonu diskteki klasörlerle veritabanını anlık senkronize eder, çöp kayıtları temizler.

---

## 6. Dosya-Bazlı Koordinasyon Protokolü ("Agent = Klasör")

Her ajan kendi izole klasöründe çalışır:

```text
projects/project-1786924708852/
├── manager/                        # Manager Ajanı ve Tüm Ajan Hiyerarşisi
│   ├── TALIMATNAME.md              # Ana Mimari Şartname
│   ├── TODO.md                     # Manager Seviyesi Görev Çizelgesi
│   ├── DURUM.md                    # Anlık İlerleme Durumu
│   ├── GOREV.md                    # Manager Misyonu
│   │
│   ├── frontend.director/          # Frontend Direktörü (Manager altında)
│   │   ├── ALT-TALIMATNAME.md      # Frontend Mimari Şartnamesi
│   │   ├── TODO.md
│   │   ├── DURUM.md
│   │   └── frontend.teamleader/    # Frontend Takım Lideri
│   │       ├── TODO.md             # Atomik Görevler DAG'ı
│   │       ├── DURUM.md
│   │       ├── task-1-setup-ui/    # Coder Görev Klasörü
│   │       │   ├── GOREV.md
│   │       │   ├── DURUM.md
│   │       │   └── RAPOR.md
│   │       └── task-2-auth-pages/
│   │
│   └── backend.director/           # Backend Direktörü (Manager altında)
│       └── backend.teamleader/
│
├── src/                            # Üretilen Temiz Uygulama Kaynak Kodları
├── prisma/                         # Veritabanı Şemaları
├── package.json                    # Eksiksiz Paket Bağımlılıkları (Otomatik Scaffold Guard)
├── tsconfig.json                   # Path Alias (@/* -> ./src/*) Konfigürasyonu
├── tailwind.config.ts              # Stil Yapılandırması
├── README.md                       # Otomatik Üretilen Kurulum & Çalıştırma Rehberi
└── KULLANIM-KILAVUZU.md             # Ayrıntılı Uygulama ve Oyun Kılavuzu
```

---

## 7. Üretilen Projeyi Bilgisayarınızda Çalıştırma Kılavuzu

Projenizi ZIP olarak indirdikten veya `projects/<proje_id>` klasörünü açtıktan sonra:

### 1. Adım: Bağımlılıkları Kurun
```bash
npm install
```

### 2. Adım: Ortam Değişkenlerini Tanımlayın (`.env`)
```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="super-secret-key-2026"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Adım: Veritabanını Oluşturun (Prisma ORM)
```bash
npx prisma generate
npx prisma db push
```

### 4. Adım: Uygulamayı Başlatın
```bash
npm run dev
```
> Tarayıcınızda `http://localhost:3000` adresini açarak uygulamanızı kullanmaya başlayabilirsiniz!

---

## 8. Test Süiti ve Otomasyonun Çalıştırılması

Tüm çekirdek motorları, güvenlik, DAG ve checkpoint kurtarma fonksiyonlarını test etmek için:

```bash
cd backend
npm test
```

Toplam **56 adet test** çalıştırılır ve sistemin hatasızlığı onaylanır.

---

## 9. Sıkça Sorulan Sorular (SSS) ve Sorun Giderme

### S: LLM çıktısı token sınırına takılırsa ne olur?
**C:** XFactor'ın `repairTruncatedJSON` ve `extractCoderFilesFromText` motorları devreye girerek yarıda kesilmiş veya kaçışsız JSX çift tırnakları içeren kod bloklarını otomatik olarak onarır ve parse eder.

### S: Süreci durdurup tekrar başlattığımda biten işler silinir mi?
**C:** Kesinlikle hayır. `isTaskCompleted` ve `stateful teamleader plans` mekanizması sayesinde tamamlanmış görevler korunur ve süreç doğrudan yarım kalan görevden devam eder.

---

## 10. Geliştirici Rehberi: Kod Tabanı Analizi ve Bilgi Grafiği (Graphify)

XFactor projesini geliştiren veya kod tabanında değişiklik yapmak isteyen geliştiriciler için projeye **Graphify** bilgi grafiği entegre edilmiştir.

### 📌 Graphify Nedir?
Graphify; projedeki tüm JavaScript, React ve dokümantasyon dosyalarını **AST (Soyut Sözdizimi Ağacı)** seviyesinde ayrıştırarak bileşenler, ajan modülleri, veri tabanı modelleri ve API uç noktaları arasındaki ilişkileri haritalandırır.

### 🚀 Başlangıç ve Kurulum

1. **Paketi Yükleyin:**
   ```bash
   pip install graphify
   ```

2. **Bilgi Grafiğini Çıkarın:**
   ```bash
   python -m graphify extract . --code-only
   ```
   Bu komut `graphify-out/` klasörü altında:
   - `graph.json`: Tüm ilişkileri içeren makine tarafından okunabilir grafik veri tabanını,
   - `graph.html` ve `GRAPH_TREE.html`: Tarayıcıda açılabilen görselleştirme sayfalarını,
   - `GRAPH_REPORT.md`: Projenin mimari düğüm ve topluluk raporunu üretir.

3. **Gemini / Antigravity AI Entegrasyonu:**
   ```bash
   python -m graphify gemini install
   ```
   Kurulum tamamlandığında yapay zeka asistanı kod tabanı ile ilgili sorularınızı doğrudan grafik üzerinden sorgular ve %90'a varan token tasarrufu sağlar.

### 🛠️ Önemli Komutlar ve Kullanım Senaryoları

- **Belirli bir bileşeni sorgulama:**
  ```bash
  python -m graphify query "Workflow engine checkpoint recovery nasıl çalışıyor?"
  ```
- **Mimari kavramı veya sınıfı açıklama:**
  ```bash
  python -m graphify explain "dag.js"
  ```
- **İki modül arasındaki bağlantı yolunu bulma:**
  ```bash
  python -m graphify path "server.js" "codeGenerator.js"
  ```
- **En kritik merkez düğümleri (God Nodes) listeleme:**
  ```bash
  python -m graphify god-nodes
  ```
- **Kod değişiklikleri sonrası grafiği tazeleme (Maliyetsiz / AST-only):**
  ```bash
  python -m graphify update .
  ```

### 🌐 Kısıtlı Ağlarda (MEB vb.) IPv4 ile Çalıştırma
MEB veya IPv6 DNS kısıtlaması olan ağlarda `python -m graphify` komutları soket hatası verirse, aşağıdaki IPv4 zorlamalı şablonu kullanabilirsiniz:
```bash
python -c "import socket; orig=socket.getaddrinfo; socket.getaddrinfo=lambda h,p,f=0,t=0,pr=0,fl=0: orig(h,p,socket.AF_INET,t,pr,fl); from graphify.cli import main; import sys; sys.argv=['graphify'] + sys.argv[1:]; main()" <komut>
```
Detaylı açıklamalar için [graphify-bilgi-notu.md](file:///D:/dnm/xfactor/graphify-bilgi-notu.md) dokümanına başvurabilirsiniz.

---

🎉 **XFactor ile otonom ve hatasız yazılım geliştirmenin keyfini çıkarın!**
