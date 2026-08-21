# 🚀 emlak — Emlak Yönetim & Vitrin Platformu

> Hem son kullanıcılar için modern bir emlak arama ve vitrin portalı, hem de yöneticiler için ilan ve site içeriklerini tam kontrolle yönetebilecekleri kapsamlı bir Admin CMS Yönetim Platformu.

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda sıfır kurulum maliyetiyle çalıştırmak için aşağıdaki adımları sırasıyla uygulayın:

### 1. Adım: Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Adım: Veritabanı ve Şemayı Hazırlayın (Prisma / SQLite)
> **Not:** Projede `.env` dosyası hazır olarak `DATABASE_URL="file:./dev.db"` şeklinde tanımlıdır.
```bash
npx prisma generate
npx prisma db push
```

### 3. Adım: Örnek Emlak Verilerini Yükleyin (Seed)
```bash
npx prisma db seed
```

### 4. Adım: Uygulamayı Başlatın
```bash
npm run dev
```
Uygulamanız varsayılan olarak **`http://localhost:3000`** adresinde çalışacaktır.
Admin paneline **`http://localhost:3000/admin`** adresinden erişebilirsiniz.

---

## 📋 Proje Şartnamesi ve Mimari Detaylar (Manager TALIMATNAME)

### 🏗️ 1. Mimari & Teknoloji Yığını
* **Çatı (Framework):** **Next.js (App Router)** & **React 18** (Dinamik public sayfalar ve admin paneli için tam entegre mimari)
* **Stil & Arayüz:** **Tailwind CSS**, modern kart tasarımları, filtreleme çubukları, responsive dashboard bileşenleri ve **Lucide Icons**
* **Veritabanı & ORM:** **Prisma ORM** + **SQLite** (`file:./dev.db`), ilişkisel veri modelleri ve hazır zengin seed (örnek) verileri
* **API Mimarisi:** RESTful Next.js API rotaları (`/api/properties`, `/api/categories`, `/api/settings`, `/api/analytics`)

---

### 🌐 2. Ön Yüz (Public Portal) Özellikleri
1. **Anasayfa & Vitrin:**
   * Dinamik Hero Banner (Arama motoru: Satılık/Kiralık, Şehir/İlçe, Kategori, Fiyat aralığı)
   * Öne Çıkan & Fırsat İlanlar vitrini
   * Kategorilere göre hızlı erişim (Daire, Villa, Ticari, Arsa vb.)
   * Neden Biz / Müşteri Yorumları & İletişim blokları
2. **İlan Listeleme & Gelişmiş Filtreleme:**
   * Çok kriterli filtreleme (Satılık/Kiralık, Fiyat Min-Max, m², Oda Sayısı, Isıtma, Balkon, Otopark vb.)
   * Harita / Liste görünümü desteği, sıralama (Fiyata göre artan/azalan, en yeni)
3. **İlan Detay Sayfası:**
   * Çoklu fotoğraf galerisi / slider
   * Konum bilgileri, detaylı bina özellikleri listesi
   * Danışman iletişim formu & WhatsApp hızlı erişim butonu
4. **Kurumsal Sayfalar:** Hakkımızda, İletişim ve İletişim Formu.

---

### 🛠️ 3. Arka Yüz (Admin Yönetim Paneli - `/admin`)
1. **Dashboard (Genel Bakış):**
   * Toplam ilan, satılık/kiralık dağılımı, toplam vitrin ilanı ve potansiyel müşteri mesaj istatistikleri.
2. **İlan Yönetimi (CRUD):**
   * Yeni ilan oluşturma (Çoklu görsel URL'leri, oda sayısı, m², fiyat, kat, tapu durumu, harita koordinatı vb.)
   * İlan listesi, arama, aktif/pasif yapma, öne çıkarılanlara ekleme ve silme.
3. **Ön Yüz CMS & Site Ayarları:**
   * Site başlığı, logo, iletişim numaraları, sosyal medya linkleri, hero banner metinlerinin panelden güncellenmesi.
4. **Gelen Mesajlar / Talepler:**
   * İlan detayından veya iletişimden gelen müşteri teklif ve mesajlarının listelenmesi.

---

### 📦 4. Domain & Ajan Bölünmesi
* **`backend.director`:** Prisma modelleri (`Property`, `Category`, `Setting`, `Inquiry`), API endpoint'leri, filtreleme motoru ve gerçekçi emlak seed verisi.
* **`frontend.director`:** Public Portal sayfaları, ilan detay galerisi, filtreleme UI ve `/admin` yönetim paneli arayüzü.

---

## 🧪 Test ve Kalite Kapısı Doğrulaması
- **Kabul Durumu:** ✅ Onaylandı (Kusursuz)
- **Rapor Dosyası:** `RAPOR.md`

---
*Bu proje **XFactor Otonom AI Ajan Orkestrasyon Platformu** tarafından uçtan uca otonom olarak inşa edilmiştir.*
