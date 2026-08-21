# 🚀 sanal-okul-quiz-yonetimi — Web Quiz & Sınav Yönetim Platformu

> Admin, Öğretmen ve Öğrenci rollerinin yer aldığı, sanal okul hiyerarşisinde dersler, şubeler, interaktif quizler, soru bankası, zaman sayaçlı sınav modu, anlık otomatik puanlama ve karne analitiği içeren modern Web Quiz Platformu.

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda sıfır kurulum maliyetiyle çalıştırmak için aşağıdaki adımları uygulayın:

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

### 3. Adım: Örnek Okul ve Soru Verilerini Yükleyin (Seed)
```bash
npx prisma db seed
```

### 4. Adım: Uygulamayı Başlatın
```bash
npm run dev
```
Uygulamanız varsayılan olarak **`http://localhost:3000`** adresinde hazır olacaktır.

---

## 📋 Proje Özellikleri ve Mimari Yapı

### 🏗️ 1. Mimari & Teknoloji Yığını
* **Full-stack Çatı:** Next.js 14 (App Router & Server Actions / Route Handlers)
* **Arayüz & Tasarım:** React 18, Tailwind CSS, Lucide React ikon seti, Modern Dashboard UI
* **Form & Validasyon:** React Hook Form, @hookform/resolvers, Zod şemaları
* **Veritabanı & ORM:** SQLite (`DATABASE_URL="file:./dev.db"`) ve Prisma ORM
* **Bildirimler:** Sonner Toast bildirimleri

---

### 👥 2. Rol Bazlı Kullanıcı Akışları
1. **Admin Portalı (`/admin`):**
   * Şube/Sınıf yönetimi (9-A, 10-B vb.), ders yönetimi ve öğretmen/öğrenci atamaları.
   * Okul geneli istatistik ve analitik kartları.
2. **Öğretmen Portalı (`/teacher`):**
   * Soru Bankası: Zorluk derecesi, ders ve konu bazlı soru deposu yönetimi.
   * Quiz Stüdyosu: Zaman sayaçlı, soru seçimli interaktif quiz hazırlama.
   * Sınav Analitiği: Sınıf başarı grafikleri ve soru bazlı yanılma analizi.
3. **Öğrenci Portalı (`/student`):**
   * Aktif sınav listesi, "Sınava Başla" akışı ve geçmiş karneler.
   * **Exam Runner (`/exam/[quizId]`):** Geri sayım sayacı, soru navigasyon matrisi, anlık kaydetme ve otomatik tamamlama.
   * **Karne Raporu (`/report/[attemptId]`):** Anlık puanlama, doğru/yanlış/boş analizi ve yazdırılabilir/PDF karne.
