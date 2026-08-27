# kütüphane-sistemi

## Mimari Şartname

Harika! Tüm gereksinimler ve iş kuralları netleşti. Projenin mimari planını ve teknik detaylarını özetliyorum:

---

# 📐 Proje Mimarisi ve Teknik Özet: Kütüphane Yönetim Sistemi (MVP)

### 1. Teknoloji Yığını (Tech Stack)
* **Frontend & Backend (Fullstack):** **Next.js (App Router)** - Hızlı geliştirme, API rotaları ve yüksek performans için.
* **UI Framework:** **Tailwind CSS + Shadcn UI** - Modern, hızlı ve şık bir yönetim paneli arayüzü.
* **ORM:** **Prisma ORM** (İleride PostgreSQL'e sorunsuz geçiş için soyutlanmış katman).
* **Veritabanı (Geliştirme/MVP):** **SQLite** (`prisma/dev.db`).
* **Kimlik Doğrulama:** **JWT (JSON Web Token) / NextAuth.js** (Rol tabanlı erişim kontrolü ile).

---

### 2. Veritabanı Modeli (Prisma Schema Özeti)
* **User (Kullanıcılar):** `id`, `email`, `password`, `fullName`, `role` (ADMIN, TEACHER), `isApproved` (Boolean, varsayılan: `false`).
* **Student (Öğrenciler):** `id`, `studentNumber`, `firstName`, `lastName`, `className`.
* **Book (Kitaplar):** `id`, `isbn`, `title`, `author`, `category`, `totalStock`, `availableStock`.
* **BorrowRecord (Ödünç Kayıtları):** `id`, `bookId`, `studentId`, `borrowDate`, `dueDate`, `returnDate`, `status` (BORROWED, RETURNED, OVERDUE).

---

### 3. Modüller ve İş Akışları

1. **Erişim ve Onay Mekanizması:**
   * Öğretmenler kayıt formundan kaydolur (`isApproved = false`).
   * **Admin**, "Kullanıcı Yönetimi" sayfasından bekleyen öğretmenleri görür ve **"Onayla"** butonuna basarak sisteme giriş yapmalarına izin verir.

2. **Yetkilendirme (RBAC):**
   * **Admin:** Kitap/Öğrenci CRUD, Ödünç Verme/İade Alma, Öğretmen Onaylama, Genel Raporlar.
   * **Öğretmen:** Sadece Kitap Kataloğunda arama/listeleme yapabilir (Salt okunur erişim).

3. **Ödünç / İade Akışı (Sadece Admin):**
   * Arama kutusundan Öğrenci ve Kitap seçilir, teslim tarihi belirlenerek işlem tamamlanır (Kitap stok sayısı otomatik 1 düşer).
   * İade alındığında stok 1 artar ve durum güncellenir.

---

Bütün taşlar yerine oturdu Boss! Proje mimarisi üretime hazır.

Eğer planı onaylıyorsanız, lütfen arayüzdeki 'Planı Onayla ve Üretime Başla' butonuna basın.