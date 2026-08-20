# emlak takip uygulaması

## Mimari Şartname

Gayet net ve eksiksiz anlaşıldı Boss! Tüm maddeleri tam istediğin mimariye oturttum. 

Aşağıda belirlediğimiz kararlara göre oluşturduğum **Sistem Mimarisi ve Teknik Şartname Özeti** yer alıyor:

---

# 🏗️ Emlak Portalı & Yönetim Paneli — Mimari Şartname

### 1. Teknoloji Yığını (Tech Stack)
* **Framework:** Next.js (App Router, Server Components + Server Actions)
* **Veritabanı & ORM:** SQLite + Prisma ORM (Hafif, taşınabilir ve hızlı)
* **Arayüz (UI):** Tailwind CSS + Lucide Icons + Modern ve sade bileşenler
* **Harita:** OpenStreetMap (Leaflet entegrasyonu — ilan detayında interaktif konum ve admin panelinde haritadan pinleme)
* **Kimlik Doğrulama:** Session/Cookie tabanlı NextAuth veya basit güvenli admin auth katmanı.
* **Varsayılan Giriş:** `admin / admin`

---

### 2. Veri Modeli (Prisma Schema Özeti)
* **`User`**: Admin kullanıcıları (`admin / admin` seed edilecek).
* **`Property` (İlanlar):**
  * Başlık, Slug, Açıklama, Tip (`SATILIK` / `KIRALIK`), Kategori (`KONUT`, `IS_YERI`, `ARSA`).
  * Fiyat, Para Birimi (₺/$/€), İl (İstanbul), İlçe (Kadıköy, Beşiktaş vb.), Mahalle/Adres.
  * Konum: `latitude` & `longitude` (OpenStreetMap için).
  * Teknik Detaylar: m² (Brüt/Net), Oda Sayısı (3+1, 2+1 vb.), Kat, Bina Yaşı, Isıtma, Eşyalı mı?, Balkon, Otopark vb.
  * Durum: `YAYINDA`, `TASLAK`, `SATILDI`, `KIRALANDI`, `ONE_CIKAN` (Featured).
* **`PropertyImage`:** Çoklu resimler, kapak fotoğrafı ve sıralama.
* **`Inquiry` (Müşteri Talepleri):** Ziyaretçilerin ilan detayından bıraktığı formlar (İsim, Tel, Mesaj, İlan ID).
* **`SiteSetting`:** Firma adı, logo, telefon, WhatsApp hattı, adres, hero başlıkları.

---

### 3. Sayfa ve Rota Mimarisi

#### 🌐 Ön Yüz (Public Vitrin - TR):
1. **Ana Sayfa (`/`):** 
   * Dinamik Hero Arama Çubuğu (Satılık/Kiralık, İlçe, Fiyat, Oda).
   * Öne Çıkan Portföyler.
   * "Neden Biz?" & Hızlı İletişim Bloğu.
2. **İlan Listesi (`/ilanlar`):** Kapsamlı filtreleme paneli (Fiyat aralığı, oda sayısı, tip vb.) ve ızgara (Grid) görünümü.
3. **İlan Detay (`/ilan/[slug]`):** 
   * Fotoğraf galerisi.
   * Özellik tabloları.
   * **OpenStreetMap** entegrasyonu ile konum gösterimi.
   * Danışman kartı, "WhatsApp'tan Yaz" ve "Bilgi Al" formu.
4. **Kurumsal Sayfalar (`/hakkimizda`, `/iletisim`):** İletişim formu ve ofis lokasyonu.

#### ⚙️ Yönetim Paneli (Backoffice):
1. **Giriş (`/admin/login`):** `admin / admin` ile giriş.
2. **Dashboard (`/admin`):** Toplam ilan, aktif kiralık/satılık sayıları, son gelen müşteri talepleri.
3. **İlan Yönetimi (`/admin/ilanlar` & `/admin/ilanlar/yeni`):**
   * Tam ilan CRUD operasyonları.
   * Haritadan tıklayarak enlem/boylam seçme (OSM Picker).
   * Durum değiştirme (Yayından kaldır / Satıldı işaretle).
4. **Gelen Talepler (`/admin/talepler`):** Ön yüzden gelen mesajları okuma/cevaplama listesi.
5. **Site Ayarları (`/admin/ayarlar`):** Firma bilgileri ve iletişim kanallarını güncelleme.

---

### 4. Başlangıç Verisi (Mock Seed):
Sistemi ayağa kaldırdığımızda hazır gelecek 5 adet gerçekçi İstanbul ilanı:
1. *Beşiktaş Bebek’te Boğaz Manzaralı Lüks 3+1 Daire (Satılık)*
2. *Kadıköy Moda’da Tarihi Dokuda Balkonlu 2+1 (Kiralık)*
3. *Sarıyer Zekeriyaköy’de Müstakil Havuzlu Villa (Satılık)*
4. *Şişli Bomonti’de Rezidans 1+1 Full Eşyalı (Kiralık)*
5. *Ataşehir Finans Merkezi Yakını Kurumsal Plaza Katı (Satılık)*

---

Tüm detaylar hazır. Planı onaylıyorsan hemen geliştirme aşamasına geçebiliriz Boss! Ne dersin?