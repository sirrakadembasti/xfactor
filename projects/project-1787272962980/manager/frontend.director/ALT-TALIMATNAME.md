# Frontend Mimari Şartnamesi (ALT-TALIMATNAME.md)

## 1. Mimari ve Teknoloji Standartları
- **Framework:** Next.js (App Router), React 18+
- **Stil & Arayüz:** Tailwind CSS, responsive tasarım, Lucide Icons
- **State & Veri İletişimi:** React Hooks (`useState`, `useEffect`, `useCallback`), URL Query State (`useSearchParams`, `useRouter`), Fetch API / SWR
- **Bildirim & Geri Bildirim:** Modern Toast / Alert bildirimleri

## 2. Sayfa & Arayüz Yapısı

### A. Public Portal (Ziyaretçi Arayüzü)
1. **Ortak Layout (`/`):**
   - Header / Navigation (Logo, Satılık, Kiralık, Projeler, Kurumsal, İletişim, İlan Ver/Giriş butonu, Favoriler)
   - Footer (Hızlı linkler, kategori listesi, sosyal medya, iletişim & bülten aboneliği)
2. **Anasayfa (`/`):**
   - Hero Banner & Dinamik Arama Kutusu (Tür: Satılık/Kiralık, Şehir, Kategori, Fiyat Min/Max)
   - Vitrin / Öne Çıkan İlanlar Grid kartları (Görsel slider/thumbnail, fiyat rozeti, oda sayısı, m², lokasyon bilgisi)
   - Popüler Kategoriler & Lokasyonlar vitrini
   - Neden Biz? & Müşteri Yorumları & Hızlı Teklif/Danışman Bannerı
3. **İlan Listeleme Sayfası (`/properties` veya `/ilanlar`):**
   - Sol tarafta (veya mobilde filtre çekmecesi) Gelişmiş Filtreleme (Durum, Kategori, Şehir/İlçe, Fiyat, m², Oda, Bina Yaşı, Isıtma, Otopark, vb.)
   - Sıralama (En Yeniler, Fiyat Artan/Azalan) ve Görünüm Seçici (Grid / Liste)
   - Dinamik sayfalama veya sonsuz kaydırma/sayfa numaralandırma
4. **İlan Detay Sayfası (`/properties/[id]`):**
   - Çoklu fotoğraf galerisi / Lightbox görünümü
   - Temel Özellikler Özeti (Fiyat, m², Oda, Kat, Tapu, Isıtma vb.)
   - İlan Açıklaması ve İç/Dış Donanım Listesi (Checklist formatında)
   - Danışman İletişim Kartı & WhatsApp / Ara butonları & 'Mesaj Gönder / Randevu Al' formu
   - Benzer İlanlar öneri alanı
5. **Kurumsal Sayfalar:**
   - Hakkımızda (`/about`)
   - İletişim (`/contact`) - Harita görünümü, adres/telefon/mail ve mesaj gönderme formu

### B. Admin Yönetim Paneli (`/admin`)
1. **Admin Layout (`/admin`):**
   - Sidebar (Dashboard, İlanlar, Yeni İlan Ekle, Gelen Talepler/Mesajlar, Site Ayarları / CMS, Siteye Dön)
   - Topbar (Yönetici profili, bildirim ikonu, hızlı aksiyonlar)
2. **Dashboard (`/admin`):**
   - Metrik Kartları (Toplam İlan, Satılık/Kiralık Oranı, Okunmamış Mesajlar, Vitrin İlanları)
   - Son Eklenen İlanlar & Son Gelen Mesajlar tabloları
3. **İlan Yönetimi (`/admin/properties`):**
   - Tablo Görünümü (Görsel, Başlık, Fiyat, Kategori, Durum, Vitrin Durumu, İşlemler: Düzenle/Sil/Öne Çıkar)
   - Arama ve filtreleme çubuğu
4. **Yeni İlan Ekleme & Düzenleme (`/admin/properties/new` & `/admin/properties/[id]/edit`):**
   - Kapsamlı Form: Başlık, Açıklama, Fiyat, Para Birimi, Kategori, Durum (Satılık/Kiralık), m², Oda, Salon, Banyo, Kat, Isıtma, Lokasyon (İl, İlçe, Adres), Çoklu Görsel URL ekleme alanı, Özellikler checklist'i
   - Form validasyonu ve hata mesajları
5. **Site Ayarları & CMS (`/admin/settings`):**
   - Site Adı, Logo URL, Telefon, WhatsApp, E-posta, Adres, Hero Başlık ve Alt Başlık metinleri düzenleme formu
6. **Gelen Mesajlar (`/admin/inquiries`):**
   - Mesaj listesi, okundu/okunmadı durumu, detay modali ve yanıtla/sil aksiyonları

## 3. Bileşen & Tasarım Standartları
- Modern, ferah ve profesyonel emlak temasını yansıtan renk paleti (Derin mavi/indigo, zümrüt yeşili aksanlar, temiz gri tonları)
- Skeleton loading animasyonları ve responsive mobil uyumluluk
- Tüm formlarda kullanıcı dostu validasyonlar ve işlem feedback'leri (Toast notifications)