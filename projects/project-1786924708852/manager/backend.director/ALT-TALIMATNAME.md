# Backend Domain Alt-Talimatnamesi

## 1. Genel Mimari ve Teknoloji Yığını
Bu alt-talimatname, Kütüphane Yönetim Sistemi'nin sunucu tarafı ve API mimarisini, veri tabanı erişim katmanını, yetkilendirme ve iş kurallarını tanımlar.

- **Çatısı:** Next.js (App Router) Route Handlers (`app/api/...`)
- **ORM:** Prisma ORM (`prisma/schema.prisma`)
- **Veritabanı:** SQLite (`prisma/dev.db`)
- **Kimlik Doğrulama ve Yetkilendirme:** JWT / NextAuth.js (RBAC - Role Based Access Control)
- **Doğrulama (Validation):** Zod şemaları ile istek gövdesi (request body) ve parametre doğrulamaları

---

## 2. Veritabanı Modelleri ve Katman Mimarısi

### Prisma Şeması Gereksinimleri (`prisma/schema.prisma`)
1. **User (Kullanıcılar):**
   - `id`: String (UUID veya cuid)
   - `email`: String (Unique)
   - `password`: String (Hashed - bcryptjs)
   - `fullName`: String
   - `role`: Enum (`ADMIN`, `TEACHER`)
   - `isApproved`: Boolean (Default: `false`)
   - `createdAt`, `updatedAt`: DateTime

2. **Student (Öğrenciler):**
   - `id`: String
   - `studentNumber`: String (Unique)
   - `firstName`: String
   - `lastName`: String
   - `className`: String
   - `createdAt`, `updatedAt`: DateTime
   - İlişki: `borrowRecords` (BorrowRecord[])

3. **Book (Kitaplar):**
   - `id`: String
   - `isbn`: String (Unique)
   - `title`: String
   - `author`: String
   - `category`: String
   - `totalStock`: Int
   - `availableStock`: Int
   - `createdAt`, `updatedAt`: DateTime
   - İlişki: `borrowRecords` (BorrowRecord[])

4. **BorrowRecord (Ödünç Kayıtları):**
   - `id`: String
   - `bookId`: String (Foreign Key -> Book)
   - `studentId`: String (Foreign Key -> Student)
   - `borrowDate`: DateTime (Default: now)
   - `dueDate`: DateTime
   - `returnDate`: DateTime? (Opsiyonel)
   - `status`: Enum (`BORROWED`, `RETURNED`, `OVERDUE`)
   - `createdAt`, `updatedAt`: DateTime

---

## 3. Servis Katmanı ve İş Mantığı (Business Logic)

### A. Kimlik Doğrulama & Yetkilendirme (Auth & RBAC)
- Öğretmen kaydı yapıldığında `isApproved = false` olarak set edilmelidir.
- Giriş işleminde (Login) `isApproved == false` ise `403 Forbidden` veya uygun hata mesajı ("Hesabınız henüz yönetici tarafından onaylanmamıştır.") dönülmelidir.
- Admin tüm endpoint'lere erişebilir.
- Öğretmen sadece Kitap Listeleme/Arama ve Öğrenci Listeleme/Arama (Salt Okunur) endpoint'lerine erişebilir. Ödünç verme/alma ve CRUD işlemlerine erişmeye çalıştığında `403 Forbidden` hatası alır.

### B. Ödünç / İade İş Akışı
- **Ödünç Verme:**
  - Seçilen kitabın `availableStock > 0` olup olmadığı kontrol edilir. Stok 0 ise işlem reddedilir (`400 Bad Request`).
  - İşlem başarılıysa `availableStock` 1 azaltılır.
  - `BorrowRecord` kaydı `status = BORROWED` olarak oluşturulur.
- **İade Alma:**
  - İlgili `BorrowRecord` güncellenir (`returnDate = now()`, `status = RETURNED`).
  - Kitabın `availableStock` değeri 1 artırılır (`availableStock <= totalStock` sınırı aşılmamalıdır).

---

## 4. API Endpoints Şartnamesi

### Auth & Kullanıcı Yönetimi
- `POST /api/auth/register`: Yeni öğretmen kaydı (`role: TEACHER`, `isApproved: false`).
- `POST /api/auth/login`: Kullanıcı girişi ve JWT token üretimi.
- `GET /api/admin/users/pending`: Onay bekleyen öğretmenleri listele (Sadece Admin).
- `PATCH /api/admin/users/[id]/approve`: Öğretmen hesabını onayla (`isApproved: true`) (Sadece Admin).

### Kitap Yönetimi (`/api/books`)
- `GET /api/books`: Kitap listesi ve arama (Query params: `search`, `category`). (Admin & Teacher)
- `POST /api/books`: Yeni kitap ekleme (Sadece Admin)
- `PUT /api/books/[id]`: Kitap güncelleme (Sadece Admin)
- `DELETE /api/books/[id]`: Kitap silme (Sadece Admin)

### Öğrenci Yönetimi (`/api/students`)
- `GET /api/students`: Öğrenci listesi ve arama (Admin & Teacher)
- `POST /api/students`: Yeni öğrenci ekleme (Sadece Admin)
- `PUT /api/students/[id]`: Öğrenci bilgisi güncelleme (Sadece Admin)
- `DELETE /api/students/[id]`: Öğrenci silme (Sadece Admin)

### Ödünç İşlemleri (`/api/borrow`)
- `GET /api/borrow`: Ödünç kayıtlarını listele/filtrele (Status: BORROWED, OVERDUE, RETURNED) (Sadece Admin)
- `POST /api/borrow`: Kitap ödünç ver (Sadece Admin)
- `POST /api/borrow/return`: Kitap iade al (Sadece Admin)

---

## 5. Hata Yönetimi ve Standart Yanıt Formatı
Tüm API yanıtları standart bir JSON formatında olmalıdır:

```json
// Başarılı Yanıt Formatı
{
  "success": true,
  "data": { ... },
  "message": "İşlem başarılı."
}

// Hatalı Yanıt Formatı
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "details": "Bu işlem için yetkiniz bulunmamaktadır."
  }
}
```

Hata kodları standart HTTP durum kodları ile uyumlu olmalıdır (200, 201, 400, 401, 403, 404, 500).