# sanal-okul-quiz-yonetimi (Mimari Şartname)

Harika bir vizyon! Sanal okul hiyerarşisine sahip, rol bazlı ve yüksek etkileşimli modern **Web Quiz & Sınav Yönetim Platformu** için kapsamlı mimari planı hazırladım.

---

# 🏛️ Mimari Plan ve Proje Şartnamesi: Sanal Okul Quiz Yönetim Platformu

### 1. 🛠️ Teknoloji Yığını ve Altyapı
* **Full-stack Çatı:** Next.js 14+ (App Router & Server Actions / Route Handlers)
* **Arayüz & Tasarım:** React, Tailwind CSS, Lucide React (ikonlar), modern Glassmorphism & Dashboard UI
* **Veritabanı & ORM:** SQLite (`DATABASE_URL="file:./dev.db"`) ve Prisma ORM
* **Durum & Veri Yönetimi:** React Context / Zustand, SWR / Fetch API

---

### 2. 👥 Rol Bazlı Kullanıcı Akışları ve Yetkilendirme
1. **Admin:**
   * Okul genel yapısı: Şubeler/Sınıflar (örn. 9-A, 10-B), Dersler (Matematik, Fizik vb.) yönetimi.
   * Öğretmen ve öğrenci kullanıcılarını şubelere/derslere atama.
   * Okul geneli başarı metrikleri ve sistem istatistikleri.
2. **Öğretmen:**
   * **Soru Bankası:** Zorluk derecesi, ders ve konu etiketlerine göre soru oluşturma/arşivleme.
   * **Quiz Hazırlama:** Süre sınırı (dakika), soru sayısı, rastgele soru sıralama, aktif/pasif durumu belirleme.
   * **Sonuç İnceleme:** Sınav bazında sınıf başarı grafiği, soru analizleri (en çok yanılınan sorular) ve onaylama.
3. **Öğrenci:**
   * **Sınav Paneli:** Atanan aktif sınavları listeleme, "Sınava Başla" akışı.
   * **Zaman Sayaçlı Sınav Ekranı:** Geri sayım, soru navigasyonu, işaretleme ve anlık otomatik gönderim.
   * **Karne & Başarı Karnesi:** Anlık puanlama, doğru/yanlış/boş analizi, geçmiş sınav karneleri ve gelişim grafikleri.

---

### 3. 🗄️ Veri Modeli (Prisma Şeması)
* `User` (Roller: `ADMIN`, `TEACHER`, `STUDENT`)
* `Classroom` (Şubeler: 9-A, 11-B vb.)
* `Subject` (Dersler: Matematik, Biyoloji vb.)
* `Question` (Soru metni, soru tipi, şıklar, doğru cevap, açıklama, zorluk seviyesi, puan)
* `Quiz` (Başlık, açıklama, süre, başlangıç-bitiş tarihi, şube/sınıf eşleşmesi)
* `QuizQuestion` (Quiz ve soru çoktan-çoğa ilişki ve sıra no)
* `QuizAttempt` (Öğrencinin sınava girişi, başlama/bitiş zamanı, toplam puan, durum: `IN_PROGRESS`, `SUBMITTED`)
* `UserAnswer` (Öğrencinin her soruya verdiği cevap, doğruluk durumu, kazanılan puan)

---

### 4. 🧩 Domain Ayrımı ve Görev Dağılımı
* **`backend` Domaini:**
  * Prisma şeması, SQLite migrasyonu ve zengin Mock/Seed verileri (örnek sınıflar, öğretmenler, öğrenciler ve soru havuzu).
  * CRUD API Rotaları: `/api/classes`, `/api/subjects`, `/api/questions`, `/api/quizzes`.
  * Sınav Yürütme & Değerlendirme Motoru: `/api/quizzes/[id]/submit`, süre kontrolü ve anlık puanlama mantığı.
  * Analitik & Raporlama API'leri: Öğrenci karnesi ve öğretmen sınıf başarı dağılımları.
* **`frontend` Domaini:**
  * Rol değiştirici / Hızlı profil simülatörü (Admin, Öğretmen, Öğrenci arasında tek tıkla geçiş).
  * Dashboard görünümleri: Admin Okul Yönetimi, Öğretmen Quiz Stüdyosu, Öğrenci Sınav Portalı.
  * Geri sayımlı, şık ve odaklanmış İnteraktif Sınav Modülü (Exam Runner UI).
  * Zengin karne & analitik arayüzü (doğru/yanlış dökümü, konu analiz çubukları, PDF/yazdırılabilir karne görünümü).

---

Mimari planı ve şartnameyi hazırladım. Üretimi otonom olarak başlatmak için lütfen aşağıdaki **'Planı Onayla ve Başlat'** butonuna tıklayınız.