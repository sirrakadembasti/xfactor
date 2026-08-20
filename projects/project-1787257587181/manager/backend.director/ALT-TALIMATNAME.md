# Backend ve Veri Mimarisi Alt-Talimatnamesi

## 1. Genel Mimari ve Teknoloji Yığını
* **Veritabanı:** SQLite (`prisma/dev.db`)
* **ORM:** Prisma ORM
* **Sunucu Mimarisi:** Next.js Server Actions ve Next.js Route Handlers (`app/api/*`)
* **Validasyon:** Zod şemaları
* **Kimlik Doğrulama:** Güvenli Cookie/Session tabanlı Admin Kimlik Doğrulama mekanizması

---

## 2. Veritabanı Şeması (Prisma Schema)