# Frontend Domain Alt Şartnamesi (Sanal Okul & İnteraktif Quiz Platformu)

## 1. Mimari ve Teknoloji Standartları
- **Framework:** Next.js 14+ (App Router)
- **Stil & Tasarım Sistemi:** Tailwind CSS, Lucide React ikonları, clsx & tailwind-merge (`@/lib/utils`)
- **Grafik & Veri Görselleştirme:** `recharts` (BarChart, PieChart, LineChart ile başarı ve dağılım analizleri)
- **Bildirim:** `sonner` (Toast bildirimleri)
- **Form & Doğrulama:** React Hook Form, `@hookform/resolvers/zod`
- **Durum Yönetimi:** React Context & Hooks (Aktif rol/kullanıcı simülasyonu, Sınav sayaç & durum motoru)

## 2. Sayfa ve Rota Yapısı
- `/` -> Karşılama, rol seçici / hızlı giriş paneli ve genel okul istatistikleri özeti.
- `/admin` -> Okul Yönetim Paneli (Sınıflar, Kullanıcılar, Dersler, Genel Okul Metrikleri).
- `/teacher` -> Öğretmen Paneli:
  - `/teacher/questions` -> Soru Bankası (Filtreleme, ekleme, düzenleme, silme, zorluk ve tip seçimi).
  - `/teacher/quizzes` -> Quiz Oluşturucu & Yayınlama (Süre, soru havuzu seçimi, sınıf atama).
  - `/teacher/results` -> Sınav Analitikleri & Sınıf Başarı Raporları.
- `/student` -> Öğrenci Paneli (Aktif, yaklaşan ve tamamlanmış sınavlar).
- `/student/quiz/[id]` -> İnteraktif Canlı Sınav Odası (Kalan süre sayacı, soru haritası, bayrak koyma, auto-submit).
- `/student/results/[id]` -> Sınav Sonu Karnesi ve Detaylı Konu/Başarı Grafikleri.

## 3. Temel Arayüz Bileşenleri ve Gereksinimler
1. **Rol Bazlı Layout:** Üstte veya yanda dinamik navbar/sidebar, hızlı rol değiştirici (Admin, Öğretmen, Öğrenci geçişi) ve kullanıcı profil kartı.
2. **İnteraktif Sınav Modülü (`QuizRunner`):**
   - Dinamik geri sayım sayacı (son 1 dakikada görsel uyarı).
   - Soru gezgini (Cevaplandı, Boş, Bayraklı durumları).
   - Tarayıcı kapanmasına / süre bitimine karşı anlık `localStorage` veya state senkronizasyonu ve otomatik teslim.
3. **Veri Görselleştirme (`AnalyticsCharts`):**
   - Sınıf başarı dağılımı (histogram / bar chart).
   - Öğrenci konu bazlı başarı oranı (radar veya bar chart).
   - Doğru/Yanlış/Boş oranları (pie chart / donut chart).
4. **Form ve Modal Yapıları:**
   - Soru ekleme/düzenleme modali (Çoktan seçmeli, doğru/yanlış seçenek yönetimi).
   - Yeni quiz oluşturma sihirbazı (Soru seçimi, süre, yayın tarihi).
   - Sınıf ve kullanıcı oluşturma formları.

## 4. Kodlama Standartları
- Tüm bileşenler `use client` veya Server Component ayrımına uygun yazılacaktır.
- UI durumları için Loading skeleton ve Empty state durumları eksiksiz tasarlanacaktır.
- Temiz tip tanımları `@/types` altında tutulacaktır.