# TODO — domain

| # | Görev ID | Başlık | Bağımlılıklar | Durum |
|---|---|---|---|---|
| 1 | gorev-1-tsconfig | TypeScript Yapılandırması | — | bekliyor |
| 2 | gorev-2-prisma-schema | Prisma Veritabanı Şeması | — | bekliyor |
| 3 | gorev-3-prisma-client | Prisma İstemci Örneği (Singleton) | gorev-2-prisma-schema | bekliyor |
| 4 | gorev-4-error-middleware | Merkezi Hata Yakalama Middleware | gorev-1-tsconfig | bekliyor |
| 5 | gorev-5-validate-middleware | Zod Doğrulama Middleware | gorev-1-tsconfig | bekliyor |
| 6 | gorev-6-app-entry | Express Uygulama Yapılandırması | gorev-4-error-middleware, gorev-5-validate-middleware | bekliyor |
| 7 | gorev-7-server-listen | Sunucu Başlatma Giriş Noktası | gorev-3-prisma-client, gorev-6-app-entry | bekliyor |

## Checkbox Görünümü
- [x] 1. TypeScript Yapılandırması → `gorev-1-tsconfig/`
- [x] 2. Prisma Veritabanı Şeması → `gorev-2-prisma-schema/`
- [x] 3. Prisma İstemci Örneği (Singleton) → `gorev-3-prisma-client/`
- [x] 4. Merkezi Hata Yakalama Middleware → `gorev-4-error-middleware/`
- [x] 5. Zod Doğrulama Middleware → `gorev-5-validate-middleware/`
- [x] 6. Express Uygulama Yapılandırması → `gorev-6-app-entry/`
- [x] 7. Sunucu Başlatma Giriş Noktası → `gorev-7-server-listen/`
