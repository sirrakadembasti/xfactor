# emlak (Mimari Şartname)

Boss, hatanın kök nedeni çok net:

### 🔍 Hatanın Nedeni
API rotalarında (`src/app/api/categories/route.ts` vb.) Prisma veritabanı istemcisi `@/lib/db` yolundan import edilmeye çalışılmış, ancak projenin scaffold kurulumunda Prisma istemcisi `src/lib/prisma.ts` olarak (`prisma` adıyla) tanımlanmış. Yani dosya yolu uyuşmazlığı (`@/lib/db` vs `@/lib/prisma`) söz konusu.

Ben bir sohbet ajanı olduğum için şu anda doğrudan diskteki dosyaları arka planda değiştiremem. Bu sorunu çözmek için iki pratik yolumuz var:

---

### 🛠️ Seçenek 1: Yerelinde Tek Satırlık Hızlı Köprü (Önerilen)

Terminalinde veya kod editöründe `src/lib/` klasörü altına `db.ts` adında bir dosya oluşturup içine `prisma` istemcisini export etmen yeterlidir:

**`src/lib/db.ts`** dosyasını oluştur ve içine şunu yaz:
```typescript
import { prisma } from './prisma';

export const db = prisma;
export default prisma;
```

Bunu yaptığın anda hem `@/lib/db` hem de `@/lib/prisma` kullanan tüm API rotaları anında çalışır hale gelecektir.

---

### 🔄 Seçenek 2: Otonom DAG Motoru ile Baştan Temiz Üretim

Eğer tüm import yollarını, `sonner` bağımlılığını ve Prisma istemci referanslarını standartlaştırarak projenin sıfırdan ve hatasız derlenecek şekilde baştan üretilmesini istersen:

1. **Bağımlılıklar:** `sonner`, `lucide-react`, `prisma`, `@prisma/client`, `zod` paketleri `package.json` içine eksiksiz eklenecek.
2. **Veritabanı İstemcisi:** Tüm backend ve API rotalarında tek bir standart export (`@/lib/prisma` ve `@/lib/db`) sağlanacak.
3. **Admin & Vitrin:** Tüm CRUD ve filtreleme sayfaları eksiksiz oluşturulacak.

Revizyon planını hazırladım. Kodların DAG motoru tarafından sıfırdan üretilmesi için lütfen aşağıdaki **'Planı Onayla ve Başlat'** butonuna tıklayınız.