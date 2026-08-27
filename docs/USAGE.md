# 📖 XFactor — Adım Adım Kullanım Kılavuzu (USAGE.md)

Bu kılavuz, **XFactor Otonom AI Kod Üretim ve Yazılım Orkestrasyon Platformu**'nu sıfırdan kurup kullanmanız için gerekli tüm adımları açıklamaktadır.

---

## 📑 İÇİNDEKİLER

1. [Sistemi Başlatma (Backend & Frontend)](#1-sistemi-başlatma-backend--frontend)
2. [Giriş Yapma (Authentication)](#2-giriş-yapma-authentication)
3. [Yeni Proje Oluşturma](#3-yeni-proje-oluşturma)
4. [Manager ile Gereksinimleri Belirleme (Sohbet & Mimari)](#4-manager-ile-gereksinimleri-belirleme-sohbet--mimari)
5. [Mimari Planı İnceleme ve Onaylama (`pending_approval`)](#5-mimari-planı-inceleme-ve-onaylama-pending_approval)
6. [Otonom Üretim Sürecini Başlatma](#6-otonom-üretim-sürecini-başlatma)
7. [Canlı DAG Akışını İzleme (ReactFlow Görünümü)](#7-canlı-dag-akışını-izleme-reactflow-görünümü)
8. [Canlı Süreç Loglarını Takip Etme](#8-canlı-süreç-loglarını-takip-etme)
9. [Kod Editörü (Monaco IDE) Üzerinden Dosyaları İnceleme](#9-kod-editörü-monaco-ide-üzerinden-dosyaları-inceleme)
10. [Süreci Duraklatma ve Devam Ettirme (`Pause / Resume`)](#10-süreci-duraklatma-ve-devam-ettirme-pause--resume)
11. [Reviewer veya Derleme Kapısı Nedeniyle Durma Durumunda Kurtarma (Recovery)](#11-reviewer-veya-derleme-kapısı-nedeniyle-durma-durumunda-kurtarma-recovery)
12. [Tamamlanan Projeyi ZIP Olarak İndirme](#12-tamamlanan-projeyi-zip-olarak-indirme)
13. [Üretilen Projeyi Bilgisayarınızda Çalıştırma Adımları](#13-üretilen-projeyi-bilgisayarınızda-çalıştırma-adımları)

---

## 1. Sistemi Başlatma (Backend & Frontend)

XFactor iki bağımsız katmandan oluşur: **Backend API (Port 8000)** ve **Frontend Dashboard (Port 5173)**.

### Adım 1.1: Backend'i Başlatma
1. Bir terminal açın ve `backend` klasörüne girin:
   ```bash
   cd backend
   ```
2. Ortam değişkenleri dosyanızı oluşturun:
   ```bash
   cp .env.example .env   # Windows: copy .env.example .env
   ```
3. `.env` dosyasındaki `GOOGLE_API_KEY` (veya tercih ettiğiniz LLM anahtarı) alanını doldurun.
4. Bağımlılıkları yükleyin, ilk yöneticiyi oluşturun ve backend'i başlatın:
   ```bash
   npm install
   npm run create-admin -- admin
   npm run dev
   ```
   `create-admin` parolayı terminalde göstermeden iki kez sorar. Mevcut kullanıcıyı yükseltirken geçerli parola zorunludur. Terminalde `Backend hazır: http://127.0.0.1:8000` mesajını görmelisiniz.

### Adım 1.2: Frontend'i Başlatma
1. İkinci bir terminal açın ve `frontend` klasörüne girin:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Tarayıcınızda `http://localhost:5173` adresini açın.

---

## 2. Giriş Yapma (Authentication)

1. Tarayıcı giriş ekranında `npm run create-admin -- <kullanıcı-adı>` ile hazırladığınız DB hesabını kullanın.
2. Başarılı giriş 24 saatlik sabit ömürlü HttpOnly sunucu oturumu açar. Credential response JSON, JavaScript veya `localStorage` üzerinden erişilebilir değildir.
3. **Çıkış** mevcut oturumu server-side iptal eder; diğer tarayıcı oturumları açık kalır.

---

## 3. Yeni Proje Oluşturma

1. Sol yan menünün üst kısmında yer alan **`+ Yeni Proje`** butonuna tıklayın.
2. Açılan pencereye projenizin adını yazın (Örn: `E-Ticaret Platformu`, `Online Sınav Sistemi`, `Emlak Portalı`).
3. **`Oluştur`** butonuna basın. Projeniz listeye eklenecek ve otomatik olarak seçilecektir.

---

## 4. Manager ile Gereksinimleri Belirleme (Sohbet & Mimari)

1. Üst sekmeden **`💬 Sohbet & Mimari`** görünümünü seçin.
2. Ekranın altındaki mesaj kutusuna uygulamanızda olmasını istediğiniz özellikleri doğal dille yazın.
   * *Örnek Mesaj:*  
     > "Bana Next.js 14 App Router, Tailwind CSS ve Prisma SQLite kullanan bir Emlak Portalı üret. İlan listeleme, detay sayfası, admin ilan ekleme formu ve filtreleme özellikleri olsun."
3. Manager mimariyi değerlendirir, veri modellerini ve domain ayrımını size Türkçe olarak açıklar.
4. İhtiyaç duyarsanız sohbet üzerinden ek özellikler veya değişiklikler isteyebilirsiniz.

---

## 5. Mimari Planı İnceleme ve Onaylama (`pending_approval`)

1. Şartname olgunlaştığında Manager planı hazırlar ve sohbet ekranının altında **Yeşil "Mimari Planı Onayla ve Başlat" Kartı** belirir.
2. Kartta projenin domainleri (Frontend, Backend) ve mimari özeti yer alır.
3. Planı beğendiyseniz **`Planı Onayla ve Başlat`** butonuna tıklayın.

---

## 6. Otonom Üretim Sürecini Başlatma

1. Onay butonuna basıldığında proje durumu `running` moduna geçer.
2. Merkezi orkestratör (`workflow.js`) sırasıyla:
   * `package.json`, `tsconfig.json`, `.env.example` şablonlarını diske kilitler.
   * `Director` domain şartnamelerini hazırlar.
   * `Teamleader` görevleri atomik parçalara (1-2 dosya kuralı) bölerek DAG grafını kurar.
   * `Coder` ve `Reviewer` dalgalar halinde kod üretimine başlar.

---

## 7. Canlı DAG Akışını İzleme (ReactFlow Görünümü)

1. Üst menüden **`📊 Canlı DAG Grafiği`** sekmesine geçin.
2. Bu ekranda görevlerin hiyerarşik bağımlılık ağacını canlı olarak izleyebilirsiniz:
   * 🟦 **Mavi:** Bekleyen veya sırası gelen görevler.
   * 🟨 **Sarı:** O an kodlanan / incelenen aktif görevler.
   * 🟩 **Yeşil:** Reviewer onayından geçmiş tamamlanan görevler.
   * 🟥 **Kırmızı:** Kalite kapısına takılan / veto edilen görevler.

---

## 8. Canlı Süreç Loglarını Takip Etme

1. Üst menüden **`📜 Canlı Süreç Logları`** sekmesine geçin.
2. WebSocket üzerinden anlık akan tüm telemetri kayıtlarını inceleyin:
   * Hangi ajanın (`Manager`, `Director`, `Teamleader`, `Coder`, `Reviewer`, `Tester`) çalıştığı,
   * Hangi dosyanın yazıldığı (`WRITE`),
   * Reviewer'ın düzeltme talepleri (`FEEDBACK`),
   * Veto kayıtları (`VETO`).
3. Arama çubuğunu kullanarak belirli bir dosya veya hata mesajını filtreleyebilirsiniz.

---

## 9. Kod Editörü (Monaco IDE) Üzerinden Dosyaları İnceleme

2. Sol tarafta üretilen tüm dosyaların (`src/`, `prisma/`, `package.json`, `.env.example` vb.) klasör ağacını görebilirsiniz.
3. İstediğiniz dosyaya tıklayarak Monaco Editor üzerinde kod renklendirmesiyle kaynak kodları inceleyebilirsiniz.

---

## 10. Süreci Duraklatma ve Devam Ettirme (`Pause / Resume`)

* **Duraklatma:** Süreç devam ederken üst bardaki **`⏸️ Duraklat`** butonuna basarak iş akışını güvenli bir checkpoint anında durdurabilirsiniz.
* **Müdahale:** Duraklatılmış moddayken Manager ile sohbet ederek revizyon talep edebilirsiniz.
* **Devam Ettirme:** Hazır olduğunuzda üst bardaki yeşil **`▶️ Devam Et (Resume)`** butonuna tıklayarak süreci kaldığı yerden devam ettirebilirsiniz.

---

## 11. Reviewer veya Derleme Kapısı Nedeniyle Durma Durumunda Kurtarma (Recovery)

Eğer bir görev 2 turlu Reviewer denetimini geçemezse veya finalde TypeScript/Prisma derleme hatası oluşursa; platform **Fail-Closed** ilkesi gereği projeyi otomatik olarak `paused` moduna alır.

### Kurtarma Adımları:
1. **`📜 Canlı Süreç Logları`** sekmesine geçerek son kırmızı renkli `[VETO]` veya `[Kalite Uyarısı]` logunu okuyun.
2. **`💬 Sohbet & Mimari`** sekmesine geçin. Manager size hatanın kök nedenini açıklayacaktır.
3. Manager'a *"Bu hatayı düzeltmek için görevi ikiye bölelim"* veya *"Bileşeni şu şekilde sadeleştir"* diyerek yönlendirme yapın.
4. Ardından yeşil **`▶️ Projeyi Devam Ettir (Resume)`** butonuna basarak üretimin devam etmesini sağlayın.

---

## 12. Tamamlanan Projeyi ZIP Olarak İndirme

1. Tester kabul testini onayladığında proje `completed` durumuna geçer ve sohbet ekranında tebrik kartı görünür.
3. Tarayıcınız `.env.example`, `prisma/`, `src/` ve `package.json` dahil tüm kaynak kodları eksiksiz bir ZIP arşivi olarak bilgisayarınıza indirecektir; `.env` dosyası ZIP'e dahil edilmez.

---

## 13. Üretilen Projeyi Bilgisayarınızda Çalıştırma Adımları

İndirdiğiniz veya `projects/<proje_id>/` klasöründeki projeyi bilgisayarınızda çalıştırmak için:

1. Proje klasörüne girin:
   ```bash
   cd projects/proje-adiniz
   ```
2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
3. `.env.example` dosyasını `.env` olarak kopyalayın ve `NEXTAUTH_SECRET` değerini uzun rastgele bir anahtarla değiştirin:
   ```bash
   cp .env.example .env   # Windows: copy .env.example .env
   ```
4. Veritabanını ve Prisma şemasını senkronize edin:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
5. Uygulamayı başlatın:
   ```bash
   npm run dev
   ```
6. Tarayıcınızda `http://localhost:3000` (veya Vite ise `http://localhost:5173`) adresini açarak uygulamanızı kullanın.

---

🎉 **XFactor ile otonom, güvenli ve gerçek derleme onaylı yazılım geliştirmenin keyfini çıkarın!**
