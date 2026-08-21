# Frontend Domain Alt Şartnamesi (ALT-TALIMATNAME.md)

## 1. Mimari & Teknoloji Standartları
- **Framework:** Next.js 14+ (App Router)
- **Stil & UI:** Tailwind CSS, Lucide React (ikonlar), Glassmorphism & Modern Dashboard UI kartları.
- **Yardımcı Kütüphaneler:** `clsx`, `tailwind-merge`, `sonner` (Toast bildirimleri), `react-hook-form`.
- **Klasör Yapısı:**
  - `src/components/ui/`: Yeniden kullanılabilir atomik bileşenler (Button, Card, Modal, Badge, Input, Select, Progress).
  - `src/components/layout/`: Navbar, Sidebar, RoleSwitcher, Header.
  - `src/components/admin/`: Sınıf & Ders Yönetimi, İstatistik Kartları, Kullanıcı Listeleri.
  - `src/components/teacher/`: Soru Bankası Editörü, Quiz Oluşturma/Yönetme Sihirbazı, Sınav Başarı Grafikleri & Soru Analizleri.
  - `src/components/student/`: Aktif/Geçmiş Sınav Listesi, Sınav Koşucu (Exam Runner), Karne & Detaylı Sonuç Ekranı.
  - `src/app/`: Sayfa rotaları (`/`, `/admin`, `/teacher`, `/student`, `/exam/[quizId]`, `/report/[attemptId]`).
  - `src/context/`: Auth & Mock Rol Context'i (`RoleContext`).

## 2. Sayfa ve Bileşen Yol Haritası

### A. Global Layout & Hızlı Profil Değiştirici (Mock Auth)
- Üst barda yer alan tek tıkla `Admin`, `Öğretmen (Ali Hoca)`, `Öğrenci (Zeynep)` rolleri arasında geçiş sağlayan dinamik `RoleSwitcher` ve Header.
- Aktif role göre dinamik güncellenen modern Sidebar navigasyonu.

### B. Admin Dashboard (`/admin`)
- **Metrik Kartları:** Toplam öğrenci, öğretmen, aktif sınıf ve sınav sayıları.
- **Sınıf & Ders Yönetim Modülü:** Yeni sınıf (örn: 9-A, 10-B) ve ders ekleme, listeleme, silme modal/formları.
- **Kullanıcı Atama Paneli:** Öğretmen ve öğrencileri sınıflara/derslere atama arayüzü.

### C. Öğretmen Portalı (`/teacher`)
- **Soru Bankası:** Zorluk seviyesi (Kolay, Orta, Zor), ders seçimi, çoktan seçmeli şıklar ve doğru cevap belirleme formu ve filtreli liste.
- **Quiz Stüdyosu:** Soru havuzundan soru seçerek quiz oluşturma (süre, aktiflik, hedef sınıf belirleme).
- **Sonuç & Analiz:** Tamamlanan sınavların başarı yüzdeleri, ortalama puanlar ve en çok yanlış yapılan soruların dağılım tablosu.

### D. Öğrenci Portalı & Sınav Deneyimi (`/student`, `/exam/[quizId]`)
- **Sınavlarım Listesi:** Atanan aktif sınavlar ("Sınava Başla" butonu) ve tamamlanan sınavlar karnesi.
- **Exam Runner (Sınav Ekranı):**
  - Geri sayım sayacı (dakika/saniye animasyonlu).
  - Soru navigasyon matrisi (cevaplanan, boş bırakılan, aktif soru göstergeleri).
  - Şık işaretleme ve sonraki/önceki soru geçişleri.
  - Sınav bitirme onayı ve süre bitiminde otomatik gönderme mekanizması.
- **Karne & Sonuç Detayı (`/report/[attemptId]`):**
  - Toplam puan, doğru/yanlış/boş sayıları, süre kullanımı.
  - Soru bazlı döküm (öğrencinin cevabı vs. doğru cevap ve soru açıklaması).
  - Yazdırılabilir karne tasarımı.

## 3. Kodlama Kuralları
- Tüm bileşenler responsive (mobil ve masaüstü uyumlu) olmalıdır.
- Yüklenme ve boş durumlar (loading skeleton, empty states) şık tasarlanmalıdır.
- API çağrıları `@/lib/api` veya doğrudan `fetch` ile tip korumalı yapılmalıdır.