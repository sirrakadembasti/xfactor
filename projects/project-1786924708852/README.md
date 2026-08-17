# 📚 Kütüphane Yönetim Sistemi (Library Management System)

Next.js 14 App Router, TypeScript, TailwindCSS, Prisma ORM (SQLite) ve NextAuth tabanlı modern, rol tabanlı kütüphane yönetim otomasyonu.

---

## 🚀 Hızlı Başlangıç ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları sırasıyla uygulayın:

### 1. Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Ortam Değişkenlerini Ayarlayın
Kök dizinde bir `.env` dosyası oluşturun:
```env
DATABASE_URL=file:./dev.db
NEXTAUTH_SECRET=super-secret-nextauth-key-2026-min-32-chars
NEXTAUTH_URL=http://localhost:3000
```

### 3. Veritabanını Hazırlayın (Prisma ORM & SQLite)
```bash
npx prisma generate
npx prisma db push
```

### 4. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```
Tarayıcınızda `http://localhost:3000` adresini açarak uygulamayı test edebilirsiniz.

---

## 👥 Kullanıcı Rolleri ve Yetkilendirme
- **ADMIN:** Tüm kitapları yönetebilir, yeni öğrenci ekleyebilir/silebilir, öğretmen kayıt başvurularını onaylayabilir/reddedebilir, istatistikleri görebilir.
- **TEACHER:** Kitap arayabilir, öğrencilere ödünç verme ve iade işlemlerini gerçekleştirebilir.
- **PENDING:** Kayıt olan yeni öğretmenler admin onayı bekler (`/pending-approval` sayfası).

---

## 📁 Dizin Yapısı ve Modüller
- `src/app/`: Next.js 14 App Router sayfaları ve API uç noktaları.
- `src/components/`: Shadcn UI, Dashboard, Kitap ve Öğrenci Yönetim bileşenleri.
- `src/lib/`: Prisma istemcisi, Auth doğrulaması ve Zod şemaları.
- `prisma/schema.prisma`: Veritabanı modelleri (User, Book, Student, BorrowRecord).
- `manager/`: Proje mimari tasarım şartnamesi (`TALIMATNAME.md`) ve koordinasyon protokolü.

---
*XFactor Otonom AI Ajan Orkestrasyon Platformu ile üretilmiştir.*
