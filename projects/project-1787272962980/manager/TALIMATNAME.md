# emlak (Mimari Şartname)

Harika bir proje vizyonu Boss! Hem son kullanıcılar için akıcı, modern ve hızlı bir emlak vitrini, hem de yöneticiler için ilanları ve site içeriklerini tam kontrolle yönetebilecekleri kapsamlı bir **Emlak & CMS Yönetim Platformu** kuralım.

Mimariyi ve kapsamı senin için detaylıca tasarladım:

---

### 🏗️ 1. Mimari & Teknoloji Yığını
* **Çatı (Framework):** **Next.js (App Router)** & **React** (Hem dinamik public sayfalar hem de admin paneli için tam entegre mimari)
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

Mimari planı ve şartnameyi hazırladım. Üretimi otonom olarak başlatmak için lütfen aşağıdaki **'Planı Onayla ve Başlat'** butonuna tıklayınız.