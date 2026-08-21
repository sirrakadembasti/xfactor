# Backend Domain Alt Şartnamesi (Sanal Okul & Sınav Platformu)

## 1. Mimari ve Teknoloji Standartları
- **ORM & Veritabanı:** Prisma ORM, SQLite (`DATABASE_URL="file:./dev.db"`)
- **Kütüphaneler:** `@prisma/client`, `prisma`, `zod`, `bcryptjs`
- **İstemci Yolu:** `@/lib/prisma.ts` ve `@/lib/db.ts` (global singleton instance)
- **Doğrulama & Şemalar:** `@/lib/validations/index.ts` (Zod şemaları)
- **API İletişimi:** Next.js Route Handlers (`app/api/.../route.ts`)

---

## 2. Veri Modeli ve Prisma Şeması (`prisma/schema.prisma`)