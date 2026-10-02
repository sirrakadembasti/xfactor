# LLM çalışma ve eklenti doğrulaması — 2 Ekim 2026

## Doğrulanan nedenler

- Manager istemcisi eskiden 15 saniyede isteği kesiyordu. Manager isteği artık istemcinin genel kısa sınırını kullanmaz; backend profil sınırı geçerlidir. Çağıranın iptali ve açıkça verilen süre sınırı korunur.
- Bağlantı testi ile gerçek sohbetin yükü farklıdır. Kısa testin başarısı uzun mimari planın tamamlanacağını göstermez.
- Gerçek MiMo uzun plan denemesinde 9 mesaj / yaklaşık 18098 girdi karakteriyle 106758 ms sonunda 25655 karakter dönmüş, `finish_reason: length` bildirilmiştir. Bu cevap artık Manager için başarı sayılmaz: `LLM_TRUNCATED` döner, eksik plan kaydedilmez.
- Aynı etkin `mimo-v2.6-pro` profiliyle, düşünme otomatik ve Manager amacıyla kısa bir otel gereksinimi sorusu 14951 ms içinde 375 karakterlik tamamlanmış yanıt verdi. Bu deneme mevcut sohbeti/profili değiştirmedi. Farklı istek boyutları nedeniyle ölçümler doğrudan hız karşılaştırması değildir.
- Güncel Manager talimatlarıyla aynı otel sohbeti 8192 token bütçesinde tekrar kesildi (`LLM_TRUNCATED`, 132399 ms). 16384 token ve 240000 ms ile yapılan ayrı deneme 95171 ms içinde, 19962 karakterlik kesilmemiş sohbet yanıtıyla tamamlandı. Yanıt yapılandırılmış üretim planı olarak doğrulanmadı; bu ölçüm üretime onay veya tamamlanmış uygulama kanıtı değildir. Sohbet/veritabanı kayıtlarına mesaj eklenmedi. Değişken yanıt içeriği nedeniyle bütçeyi artırmak daha hızlı cevap garantisi değildir.
- Mevcut MiMo profili için sınırlar 16384 token / 240000 ms olarak ayarlandı; yeni profillerin varsayılanı 8192 / 120000 kalır. Etkin profil kimliği, model ve API anahtarının korunduğu doğrulandı. Ayar değişince eski profil testleri geçersizleşti; arayüzden yeni ayarlarla yeniden test edilebilir.
- Sandbox içindeki ağ denemesi başarısız oldu; gerçek ağ erişimiyle yeniden deneme başarılıydı. Bu sandbox hatası sağlayıcı arızasına kanıt değildir.
- İzole sunucu başlangıcı Windows ortamında 51.947 saniye sürdü. Eski 10/25 saniyelik hazır olma test sınırları bunu hata sayıyordu. Windows başlangıç testleri sınırlı 120 saniyeye kadar bekler; `TEST_BACKEND_READY_TIMEOUT_MS` ile ayarlanabilir. Üretim istek/worker süre sınırları değiştirilmedi.
- `localhost:5173`, IPv6 üzerinde ayrı Emlak Takip projesine; `127.0.0.1:5173` ise XFactor'a bağlanıyor. XFactor için açık IPv4 adresi kullanılmalıdır. Diğer uygulama durdurulmadı.

## Otel planı ve sohbetten onay düzeltmesi

Kullanıcının eklediği uzun yanıtın JSON'u doğrudan doğrulandı. İlk hata,
`management.resources.verification.retention` içinde ilişkili kayıt create/read
fixture'larının eksik olmasıdır. Silme sonrası alan değişimini bildiren
`deleteExpectation.kind: changed` / `value` de şemaya uymaz; doğru sözleşme
`kind: field` / `equals` kullanır. Bunlar normal model gecikmesinden ayrı uygulama
akışı hatalarıdır: eski router doğrulama hatasını sessizce yutuyor, planı
kaydetmiyor, buna rağmen Manager görünmeyen onay düğmesini tarif ediyordu.
Açıklamayla başlayan JSON planları kısa özete de dönüştürülmüyordu.

Sohbetten “varsayımlarla devam et” veya “planı onaylıyorum” artık mevcut owner
kontrolü, sözleşme onayı, capability kontrolü ve workflow lease işleyicisine bağlanır.
Bekleyen geçerli planda model çağrılmaz. Önceden gösterilmiş geçersiz taslak varsa
tam planı yeniden ürettirmek yerine doğrudan bir düzeltme çağrısı yapılır (120 saniye
sınırı). Düzeltme başarısızsa üretim başlamaz; neden sohbet ve logda gösterilir.
Tam planı tekrar yazdıran gerçek MiMo düzeltmesi 91368 ms / 23703 karakter
sonunda hâlâ doğrulanamadı. Ardından düzeltme yalnız eksik fixture/yolculuk
alanlarıyla sınırlandı: aynı ekteki plan için gerçek MiMo çağrısı **11462 ms /
1767 karakter** ile tamamlandı ve birleştirilmiş plan mevcut şemadan geçti.
Kaynaklar, roller ve silme politikaları eski taslaktan korunur; `changed/value`
eşanlamları aynı alan ve tipteki değerle `field/equals` biçimine çevrilir.
Bu denemede proje durumuna, sohbetine veya üretim dosyalarına yazılmadı.
Plan şemasının geçmesi, üretilmiş uygulamanın kalite kabulünden geçtiğini göstermez;
fixture ilişkilerinin gerçek veritabanı davranışı bağımsız kalite testinde sınanır.
Kesilmiş JSON'un kapanışını uydurarak onay verme kaldırıldı. Sohbette kısa özet,
ön yüzde açılabilir tam kapsam/kabul ayrıntıları bulunur. Düğmenin görünürlüğü yine
gerçek `pending_approval` durumuna bağlıdır.

Bu akış izole test veritabanında doğrulandı: açıklama + JSON özeti, açık onayla
`implementing` geçişi, tek executor çağrısı, tekrar onayda ikinci yürütmenin olmaması,
editor yetkisiyle onayın reddi, eski taslağın tek çağrıyla onarılması, geçersiz
taslak ve hayali düğme söyleminin hata olarak gösterilmesi. Altı ilgili backend
grubu ve ayrı HTTP entegrasyonu geçti. Sohbet arayüzü 7/7 test ve frontend build
başarılı. Gerçek otel projesinin üretimi bu izole testlerde başlatılmadı.
Son canlı kontrolde backend 8000 portunda dinlemiyordu; mevcut geliştirme watch
sürecine yeniden yükleme tetiklendi. Ardından backend `/healthz` ve frontend
`127.0.0.1:5173` HTTP 200 verdi. Gerçek `otel-takip-1` kaydı hâlâ `planning`
durumunda; eski hatalı yanıt silinmedi ve kullanıcının sohbet komutu otomatik
tekrar oynatılmadı. Yeni onay mesajı güncel düzeltme/onay akışını kullanır.

## Yapılan değişiklikler

LLM yönetimi bağımsız `llm-yonetimi/` paketine ayrıldı. Projeler dizinindeki `F:/projeler/llm-yonetimi` kopyası kendi manifesti, kilit dosyası, testleri, örnek sunucusu ve entegrasyon README'siyle teslim edilir. Ana uygulamadaki uyumluluk katmanı mevcut profil/anahtar yollarını korur. Kullanıcı verileri bağımsız pakete taşınmaz.

Profil bazlı süre, token ve düşünme ayarları; ayrı bağlantı/sohbet testleri; revizyon çakışması ve geç gelen test sonucu koruması; çift işlem kilidi; güvenli hata kodları ve tanılama süresi eklendi. MiMo otomatik düşünmesi Manager için kapalı, üretim ajanlarında sağlayıcı varsayılanıdır. Açık seçimler korunur. Günlük Manager sohbetine kısa yanıt ve gereksiz plan tekrarından kaçınma talimatı eklendi; zorunlu plan şeması korunur.

API anahtarları AES-256-GCM ile sunucuda saklanır; yönetici/CSRF ve DNS/socket özel ağ korumaları sürer. Ham sağlayıcı hata metni Manager kullanıcı yanıtına veya Manager hata kaydına aktarılmaz. Eski kullanılmayan sayfa kopyaları kaldırıldı. README, kullanıcı kılavuzu ve Graphify haritası güncellendi. Yönetici ve varsayılan kullanıcı bilgileri değiştirilmedi.

## Doğrulama ve sınırlar

Frontend: 85 testten 84'ü son geniş taramada geçti; yeni test etiketlerine uyarlanan LLM grubu son hedefli taramada 8/8 başarılı oldu. Üretim build'i geçti. Eklenti: beş bağımsız test geçti. Backend: LLM yönetimi 18, runtime kontrolü 7 test; Manager hata davranışı, HTTP, sağlık, WebSocket, statik sunum, CI ve Graphify test grupları doğrulandı. Geniş taramada 133 grup ilk geçişte başarılıydı; üç başarısız entegrasyon grubu kök nedenleri giderildikten sonra yeniden başarılı çalıştı.

Bağımsız klasörde `npm ci` başarılı: 70 paket, 0 bildirilen güvenlik açığı. `npm test` 5/5 geçti. Örnek sunucu ana uygulamadan ayrı açıldı; oturumsuz 401, yönetici sayfası ve JavaScript, CSRF 403, profil kaydı, şifreli disk verisi ve anahtarsız profil listesi doğrulandı. Kaynak/teslim kopyasının 14 dosyası SHA-256 ile eşleşti. Geçici deneme verisi temizlendi.

Modelin temel gecikmesi, sağlayıcı yükü/kotası, ağ/proxy ve işletim sistemi yükü uygulama tarafından garanti edilemez. Süreyi büyütmek hızlandırma değildir. Uzun isteklerde kontrollü token bütçesi ve daha kısa kapsam gerekir. Bu testler bütün gelecek sağlayıcı çağrılarının başarı garantisi değildir. Docker görüntüsü bu çalışma kapsamında yeniden build edilmedi.

Parametre adı ve sınır kapsamı [Xiaomi Chat API belgesiyle](https://mimo.mi.com/docs/en-US/api/chat) doğrulandı: `max_completion_tokens` görünür çıktı ve düşünme tokenlarını kapsar. [Sağlayıcının hız sınırı belgesi](https://mimo.mi.com/docs/en-US/api/guidance/rate-limit) yoğunlukta gecikme veya 429 oluşabileceğini belirtir.
