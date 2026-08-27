# Backend Domain Alt Talimatnamesi (ALT-TALIMATNAME.md)

## 1. Mimari ve Teknolojik Standartlar
- **Runtime & Framework:** Next.js (App Router) API Routes (`src/app/api/...`)
- **Veritabanı & ORM:** Prisma ORM ile SQLite (`file:./dev.db`)
- **Validasyon:** Zod şemaları ile istek gövdesi doğrulamaları
- **Format:** Tüm API yanıtları standart JSON formatında dönmelidir (`{ success: boolean, data?: any, error?: string }`).

---

## 2. Veri Modelleri (Prisma Schema - `prisma/schema.prisma`)

### 2.1 `Category` Modeli
- `id`: String (cuid)
- `name`: String (örn. 'Daire', 'Villa', 'Arsa', 'Ticari', 'Rezidans')
- `slug`: String (unique)
- `icon`: String? (Lucide icon adı)
- `description`: String?
- `properties`: Property[] ilişkisi
- `createdAt`, `updatedAt`: DateTime

### 2.2 `Property` Modeli
- `id`: String (cuid)
- `title`: String (İlan Başlığı)
- `slug`: String (unique)
- `description`: String (Açıklama, Markdown/HTML destekli)
- `type`: String ('FOR_SALE' | 'FOR_RENT')
- `status`: String ('ACTIVE' | 'PASSIVE' | 'SOLD' | 'RENTED')
- `price`: Float
- `currency`: String (Default 'TRY')
- `categoryId`: String (Category FK)
- `category`: Category ilişkisi
- `city`: String
- `district`: String
- `neighborhood`: String?
- `address`: String?
- `latitude`: Float?
- `longitude`: Float?
- `areaGross`: Int (m² Brüt)
- `areaNet`: Int? (m² Net)
- `roomCount`: String (örn. '3+1', '2+1', '1+0')
- `bathroomCount`: Int (Default 1)
- `buildingAge`: Int?
- `floorNumber`: Int?
- `totalFloors`: Int?
- `heating`: String? (Kombi Doğalgaz, Yerden Isıtma vb.)
- `balcony`: Boolean (Default false)
- `furnished`: Boolean (Default false)
- `parking`: Boolean (Default false)
- `isFeatured`: Boolean (Default false - Vitrin/Öne Çıkan)
- `isOpportunity`: Boolean (Default false - Fırsat İlanı)
- `images`: String (JSON string array veya ilişkisel `PropertyImage`)
- `features`: String? (JSON string array: site içi özellikler, havuz, güvenlik vb.)
- `viewsCount`: Int (Default 0)
- `inquiries`: Inquiry[] ilişkisi
- `createdAt`, `updatedAt`: DateTime

### 2.3 `Inquiry` (Müşteri İletişim / Teklif Talepleri)
- `id`: String (cuid)
- `propertyId`: String? (Property FK - opsiyonel, genel mesajlar için null)
- `property`: Property? ilişkisi
- `name`: String
- `email`: String
- `phone`: String
- `message`: String
- `status`: String ('NEW' | 'READ' | 'CONTACTED' | 'ARCHIVED')
- `type`: String ('GENERAL' | 'PROPERTY_INQUIRY' | 'PRICE_OFFER')
- `createdAt`: DateTime

### 2.4 `Setting` (CMS / Site Ayarları)
- `id`: String (cuid)
- `key`: String (unique)
- `value`: String (JSON veya text)
- `group`: String (örn. 'general', 'contact', 'hero', 'social')

---

## 3. REST API Endpoint'leri

### 3.1 İlanlar (`/api/properties`)
- `GET /api/properties`: Çok kriterli filtreleme & sayfalama
  - Query Parametreleri: `type` (FOR_SALE, FOR_RENT), `category`, `city`, `district`, `minPrice`, `maxPrice`, `roomCount`, `isFeatured`, `isOpportunity`, `search`, `page`, `limit`, `sort`
- `POST /api/properties`: Yeni ilan ekleme (Admin)
- `GET /api/properties/[idOrSlug]`: Tekil ilan detay bilgisi ve görüntülenme artırma
- `PUT /api/properties/[id]`: İlan güncelleme
- `DELETE /api/properties/[id]`: İlan silme

### 3.2 Kategoriler (`/api/categories`)
- `GET /api/categories`: Kategorileri ve her kategorideki aktif ilan sayısını getirir.
- `POST /api/categories`: Yeni kategori oluşturma.

### 3.3 İletişim & Talepler (`/api/inquiries`)
- `POST /api/inquiries`: İlan veya iletişim sayfasından yeni talep oluşturma.
- `GET /api/inquiries`: Talepleri listeleme (Admin).
- `PATCH /api/inquiries/[id]`: Talep durumu güncelleme (READ/CONTACTED).
- `DELETE /api/inquiries/[id]`: Talep silme.

### 3.4 Site Ayarları & CMS (`/api/settings`)
- `GET /api/settings`: Site iletişim, hero ve banner ayarlarını döner.
- `PUT /api/settings`: Ayarları toplu veya tekil güncelleme (Admin).

### 3.5 Dashboard & İstatistikler (`/api/analytics`)
- `GET /api/analytics`: Toplam ilan, satılık/kiralık sayıları, aktif/pasif oranları, son gelen talepler ve vitrin dağılımı.

---

## 4. Tohumlama (Seed Verisi)
- `prisma/seed.ts` dosyası ile en az 10-15 adet zengin, gerçekçi Türkiye emlak piyasası verisi (İstanbul, İzmir, Ankara, Antalya konumlu daire, villa, rezidans, ticari mülkler, Unsplash emlak görselleri ile) oluşturulmalıdır.
- Varsayılan site ayarları (`siteTitle`, `companyName`, `phone`, `whatsapp`, `email`, `address`, `heroTitle`, `heroSubtitle`) eklenmelidir.