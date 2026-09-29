# `kutuphane-takip-sistemi-2` teslim denetimi

**Tarih:** 2026-09-27
**Kaynak:** `backend/data/deliveries/kutuphane-takip-sistemi-2.zip`
**Kapsam:** Teslimin bütünlüğü, kurulum/şema/seed/test/build, Docker ilk açılışı, API, veri kalıcılığı, güvenlik, doküman, arayüz ve XFactor kök nedenleri. XFactor uygulama kodu değiştirilmedi.

## Kaynak ve yöntem

ZIP 132.943 bayt ve SHA-256 `fa4de0c3590d1ee22919d0315cb318254b366ae135844c88033613b9f7f64f86`. 59 girişin CRC'si sağlam; tehlikeli yol veya symlink yok. Üretim makbuzu `completion-2c2a938f-37fc-4094-9241-1d254207e466`, aynı hash'li `artifact-e946bc50-2f04-48f1-a7dd-45a38bd80bad` ve `verification-64c92082-78b7-43cd-97fa-25fe8a3c1874` koşusuna bağlı. Bu, önceki **doğrulanmış** durumun gerçekten bu baytlara ait olduğunu gösterir; daha geniş davranışları ispatlamaz. [Bütünlük ve makbuz ayrıntıları](library-provenance.md).

Açılmış kardeş klasör ZIP'in birebir kopyası değildir: `Dockerfile` ve `next-env.d.ts` farklıdır; ayrıca `.env`, SQLite dosyası, `.next` ve `node_modules` içerir. Bu denetimin çalıştırma kaynağı yalnızca ZIP'ten `C:\Users\ahmet\AppData\Local\Temp\xfactor-library-audit-5i4x82vk` içine çıkarılan kopyadır. Yazılar geçici kopya, atılabilir container ve `xfactor-library-audit-data-20260927` volume'ü içinde kaldı. Docker container'ları yalnızca `127.0.0.1:43127/43128` portlarına bağlandı. Üretim veri tabanı sadece makbuz metaverisi için salt okunur açıldı.

## Gerçek yürütme sonuçları

| Kontrol | Komut/kanıt | Sonuç |
| --- | --- | --- |
| ZIP ve makbuz | Python `zipfile.testzip()`, SHA-256, salt okunur makbuz sorgusu | **Geçti**; CRC `None`, hash eşit |
| Yerel Windows kurulum | ZIP kopyasında `npm ci --ignore-scripts` | **Tamamlanmadı**; ilk deneme npm cache `EPERM`, yetkili tekrar uzun süre çıktı üretmeyince durduruldu. Bunu teslim hatası olarak saymıyoruz. |
| Temiz bağımlılık kurulumu | Atılabilir builder container içinde `npm ci --ignore-scripts` | **Geçti**; 153 paket kuruldu, çıkış 0. npm ayrıca 3 yüksek önem güvenlik uyarısı verdi. |
| Bağımlılık güvenliği | `npm audit --omit=dev --audit-level=high`; `npm ls deepmerge-ts --all` | **Kaldı**; tek zincir `prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5`, üç etkilenen paket ve çıkış 1. Uygulamadan sömürülebilir yol gösterilmedi. |
| Prisma | Atılabilir builder: `npx prisma validate && npx prisma db push && npm run prisma:seed` | **Geçti**; SQLite oluşturuldu, şema geçerli, seed tamamlandı |
| Birim testi | Aynı builder: `npm test` | **Geçti**; 1 test, 1 geçme, 0 hata. Yalnız ödünç/iade stok akışı kapsanıyor. |
| Tip kontrolü | Aynı builder: `npx tsc --noEmit` | **Geçti**, çıkış 0 |
| Üretim derlemesi | Orijinal Dockerfile'ın builder aşamasında `npm run build` | **Geçti**; Next 16.3.6 derleme ve TypeScript geçti, 12 statik sayfa üretildi |
| Orijinal Docker image | `docker build -t xfactor-library-audit:20260927 .` | **Kaldı**; `Dockerfile:14` içindeki `COPY --from=builder /app/public ./public`, mevcut olmayan `/app/public` için checksum hatası |
| Tanılama image'i | Yalnız geçici `Dockerfile.audit` içine `RUN mkdir -p public` eklenerek `docker build -f Dockerfile.audit -t xfactor-library-audit:patched .` | **Geçti**; orijinal teslimin Docker başarısı olarak değerlendirilmedi |
| İlk container açılışı | Tanılama image'iyle `docker run -d ... -p 127.0.0.1:43127:3000 ...`; `/` ve `/api/categories` | `/` **200**, API **500**. Günlükte Prisma `P2021`: `main.Category` tablosu yok. Container içinde `npx prisma db push` sonrası API **200**. |
| Entegrasyon/API | [Tekrar çalıştırılabilir HTTP probu](library_http_probe.py) | **17 adım geçti**: kategori/kitap/üye oluşturma, doğrulama ve çakışma, ödünç/iade, stok, çift iade, geçmiş silinmesi. Güvenlik kusurları aşağıda. |
| Kalıcılık | `xfactor-library-audit-data-20260927:/app/prisma` ile kategori oluşturma, container stop/rm, aynı volume ile yeni container, GET | **Geçti**; `cmuk02om60000ms0ixgqy15hg` kimlikli kategori yeni container'da mevcut. Volumesiz varsayılan komut kalıcılık sağlamaz. |
| Lint | Atılabilir builder'da `npm run lint` | **Kaldı**; Next 16 `next lint` ifadesini `/app/lint` dizini olarak yorumladı: `Invalid project directory` |
| Arayüz yolculuğu | Gerçek tarayıcıda `/loans?new=true` ile `/loans?modal=borrow` AX ağacı karşılaştırması | **Kaldı**; navbar hızlı bağlantısında form açılmadı, `modal=borrow` ile açıldı |

HTTP probu çalıştırılmadan önce **ayrı bir elle ön kontrol** olarak `docker inspect` ile container kimliği `5026e7d14af...`, adı ve yalnız loopback `43127` port bağı doğrulandı. Betik hedefi bu porta sabitler ve çağıranın verdiği atılabilir container işaretini denetler; kendi başına Docker kimliğini doğrulamaz. Test verileri yalnız atılabilir veritabanında kaldı. Komutlar, çıkış kodları ve belirleyici günlük parçaları [yürütme kaydında](library-execution-ledger.md) saklandı.

## Öncelikli bulgular ve XFactor karşılıkları

### P0 — Orijinal Docker teslimi build edilemiyor

ZIP'in `Dockerfile:14` satırı `/app/public` kopyalar; ZIP'te `public/` yoktur ve builder bunu oluşturmaz. Orijinal image build çıkış 1 ile bitti. Açılmış kardeş klasördeki Dockerfile'ın `mkdir -p public` eklemesi, ZIP'in bu hatasını gizler. XFactor'un [Next.js Docker şablonu](../../backend/engine/codeGenerator.js#L798-L827) aynı kopyalama desenini üretir. **Öneri:** Şablonda dizini açıkça oluşturmak veya yalnız mevcut statik varlığı kopyalamak; ardından nihai ZIP'ten önbelleksiz image build ve run'ı zorunlu kapı yapmak.

### P0 — API'ler kimliksiz istemciye üye verisi ve mutasyon sunuyor

Oturumsuz `GET /api/members` **200**, `POST /api/categories` **201**, `POST /api/members` **201**, `DELETE /api/members/:id` **200** döndü. ZIP'te `User` modeli ve `requireAuth`/`requireAdmin` yardımcıları var, ancak route'lar bunları çağırmıyor; üye e-posta/telefon alanları API yanıtında yer alıyor. Dağıtım erişimi açık ise gizlilik ve bütünlük riski yüksek. **Öneri:** Ürünün açık/kısıtlı erişim kararını sözleşmede netleştirip kısıtlı senaryoda tüm okuma ve yazma route'larına oturum/rol denetimi eklemek. XFactor doğrulamasına oturumsuz isteğin **401/403**, yetkili isteğin başarılı olduğu negatif testleri koymak. Bu açığın hangi üretim aşamasında doğduğu şimdilik çıkarımdır; kesin şablon bağlantısı saptanmadı.

### P1 — Üye silme, iade edilmiş ödünç geçmişini kaldırıyor

ZIP `src/app/api/members/[id]/route.ts:164-177`, etkin ödüncü engelledikten sonra tüm `Loan` kayıtlarını `deleteMany` ile siler. HTTP probunda iade edilmiş ödünç önce **200**, üye silindikten sonra **404** oldu. README ilişkili kayıtların silinmesinin reddedilebileceğini söyler; UI onayı ise geçmişin silineceğini belirtir. **Öneri:** Üyeyi pasifleştirerek geçmişi tutmak veya yalnız açık bir veri saklama/silme politikası altında kademeli silmek; sözleşme, UI ve README'yi birleştirmek. XFactor test kapısına “iade sonrası üye işlemi geçmişi korur” gibi ürün kararıyla uyumlu bir vaka eklemek.

### P1 — Doğrulama kapısı kapsamı, “verified” etiketini fazla genişletiyor

Önceki makbuz gerçekten bu ZIP'i `verified` olarak kaydetmiş olsa da Docker build bugün kaldı ve doğrulama kapsamı bu kusuru yakalamadı. [qualityPolicy.js](../../backend/verification/qualityPolicy.js#L509-L555) çalışma zamanı kapısını bulunan üyeler üzerinden birleştirir; tüm uygulanabilir üyelerin mevcut olmasını aramaz. [databaseVerifier.js](../../backend/verification/databaseVerifier.js#L14-L29) dosya varlığını bağlantı/yazma kanıtı sayar. [apiVerifier.js](../../backend/verification/apiVerifier.js#L57-L77) 2xx POST/GET ve POST yanıtını kalıcı veritabanı mutasyonu olarak kabul eder. [browserVerifier.js](../../backend/verification/browserVerifier.js#L1-L73) çoğunlukla HTML/öğe denetler; tıklama/form etkileşimi yoktur. **Öneri:** Kapı üyelerini sözleşmeye göre zorunlu kılmak, eksik kanıtı `blocked` saymak; DB/API testlerinde önce/sonra kayıt ve yeniden açılış kalıcılığı; gerçek tarayıcıda kritik kullanıcı yolculukları; nihai ZIP'in Docker build/run sonucu. Bu, kaynak kodu ve bu teslimin gözlenen açıklıkları arasındaki güçlü ilişkidir; tek tek geçmiş worker iç yürütmesinin yeniden inşası değildir. [İzleme notu](library-xfactor-trace.md).

### P2 — Hızlı ödünç bağlantısı ve erişilebilirlik eksikleri

Navbar `/loans?new=true` adresine gider, sayfa yalnız `modal=borrow` sorgusunda form açar. Gerçek tarayıcı AX ağacı bu farkı gösterdi. Ayrıca statik kaynakta `#main-content` skip-link hedefi yok; ödünç filtreleri ve modal denetimleri için erişilebilir ad/etiket ve dialog/fokus semantiği eksikleri saptandı. **Öneri:** Tek URL sözleşmesi, otomatik tarayıcı yolculuğu ve klavye/erişilebilirlik testi. [Kaynak incelemesi](library-product-static.md).

### P2 — Lint komutu ve teslim durumu metni tutarsız

`package.json` `next lint` çağırır; teslimde çözümlenen Next 16.3.6 bunu desteklemedi ve lint çıkış 1 oldu. `next: "latest"` gibi kayan sürümler bu tür uyumsuzlukların tekrarını kolaylaştırır. `DURUM.md` ise ZIP'te bulunmayan `api/listings` dosyalarından ötürü `BASARISIZ` derken makbuz bu ZIP'i `verified` gösterir. **Öneri:** Üretim sonunda sabit sürüm/kilit ile `npm run lint` dahil komutları çalıştırmak; durum dosyasını tam artefakt hash'i ve gerçek son doğrulama sonucundan üretmek. Scaffold ve test altyapısı riski [izleme notunda](library-xfactor-trace.md).

### P2 — Kilitli Prisma araç zincirinde yüksek önem güvenlik uyarısı

`npm audit` çıkış 1 verdi: `prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5` zincirinde 3 yüksek önem uyarısı. [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), `deepmerge-ts` sürümlerinin `<8.0.0` kısmında döngüsel nesne grafikleriyle yığın taşmasını tanımlar; sıradan JSON bunu tek başına oluşturmaz. Bu teslimin API'lerinde bu koşula erişilebilen bir yol gösterilmedi. **Öneri:** Prisma/kilit dosyasını uyumlu düzeltilmiş sürümlere yükseltme ve sonra temiz install, test, build, audit tekrarını kabul kapısı yapmak; otomatik `npm audit fix` uygulamamak. XFactor üreticisinin kayan bağımlılık ve son ZIP güvenlik taraması politikası gözden geçirilmeli.

## Sınırlar ve sonraki kabul ölçütleri

Geçici Dockerfile onarımı yalnız çalışma davranışlarını test etmeyi sağladı; orijinal Docker build sonucu **kaldı**. Taze `npm ci --ignore-scripts` kilit uyumunu doğruladı; normal `npm ci` Docker katmanında önbellekten geldiği için postinstall aşamasının bu koşuda önbelleksiz tekrarını kanıtlamaz. Birim takımı yalnız bir test içeriyor. Erişilebilirlik için kapsamlı axe veya tüm sayfaların klavye turu yapılmadı. Graphify grafiği 1.989 düğüm ve 5.327 bağ ile kaynak gezinmesini destekledi; Python Graphify CLI kurulu değildi, JSON üzerindeki sorgular ve gerçek kaynak okuması kullanıldı. Statik çağrı grafiği çalışma zamanı kanıtı sayılmadı.

İlk değişiklik paketi için kabul ölçütleri: ZIP'ten temiz Docker build/run; boş volume'de belgelenmiş ilk kurulumla API 200; oturumsuz PII ve mutasyon istekleri reddi; iade geçmişinin ürün politikasına uygun korunması; navbar hızlı bağlantısının form açması; lint/test/tsc/build kapılarının gerçek yürütmeyle geçmesi; XFactor `verified` kararının eksik kapı, 2xx fakat kalıcı olmayan POST ve etkileşimsiz UI sahte olumlusunu reddetmesi. Bu rapor öneridir; XFactor kodunda otomatik değişiklik yapılmadı.
