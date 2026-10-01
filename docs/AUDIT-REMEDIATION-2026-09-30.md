# İnceleme sonrası düzeltmeler — 30 Eylül 2026

Kullanıcının onayladığı önceliklerle ilerlenmiştir. Admin girişi ve varsayılan kullanıcı bilgileri değiştirilmemiştir. `backend/auth.js`, `backend/routes/authRoutes.js` ve `backend/sessionAuth.js` için diff boş olarak doğrulanmıştır. Kullanıcının mevcut geçici dosyaları korunmuş; commit veya push yapılmamıştır.

## Giderilen bulgular

| Bulgu | Sonuç ve doğrulama |
|---|---|
| Üretim worker token fallback | Eksik veya bilinen geliştirme tokenıyla üretim worker'ı başlamaz; gerçek alt süreç testi. |
| Restore artifact yolları | DB, geçici staging yerine son hedef dizini kaydeder; restore edilen DB yolundan ZIP okunur. |
| WAL kaybına açık yedek | SQLite `VACUUM INTO` ile committed WAL dahil snapshot; açık WAL'daki yeni satır geri okunur. CLI `--offline` ile yazarların durdurulduğunu açıkça gerektirir. |
| Üretimde LLM anahtarı yazılamaması | Anahtar kalıcı data dizininde ayrı dosyada saklanır; yeniden başlatmada aynı anahtarla profil çözülür. |
| Eksik gerçek tarayıcı etkileşimi | Worker imajına bağımsız Chromium/Playwright runner eklendi. Rol oturumu, gerçek klavye/form etkileşimi, görünür sonuç, erişilebilir ad ve mobil taşma ölçülür. Yanlış rol ve eksik sonuç reddedilir. |
| Yanıltıcı worker readiness | Docker daemon veya sabit runtime imajı erişilemezse 503 ve kapasite false döner. |
| Deadline aşımı | Komut süresi kalan iş süresiyle sınırlanır; deadline sırasında çalışan iş abort edilir ve timeout kalıcılaştırılır. |
| DNS üzerinden SSRF | Provider bağlantısı HTTPS/public hostname gerektirir; tüm DNS cevapları socket lookup sırasında kontrol edilir. Özel, reserved ve karışık DNS cevapları gerçek HTTP connector üzerinden engellenir. |
| Büyük WebSocket mesajı | Transport sınırı 64 KiB; 65 KiB mesaj uygulamaya ulaşmadan 1009 ile kapanır. |
| JobStore sessiz veri kaybı | Bozuk dosyada başlangıç açık hatayla durur ve dosya korunur; interrupted terminal durum ve completedAt yeniden başlatmalar arasında kalır. |
| Erken indirme başarı kaydı | Başarı denetim kaydı tamamlanan aktarım callback'inde yazılır; başarısız dosya aktarımı başarı kaydı üretmez. |
| Testlerde bulunan ek TAP ayrıştırma hatası | npm `@1.0.0 test` banner'ı “0 test” sayılmaz. Gerçek sıfır test, sessiz veya sahte script reddi korunmuştur. |

Tarayıcı, Linux konteynerinde yazılabilir geçici HOME kullanır; init süreci kapanan çocukları toplar. GPU/zygote kapatılmış ve tek süreç modu seçilmiştir; her yolculuk ayrı bir tarayıcı başlatır. Güvenlik sınırı worker konteyneridir. 1 GiB / 2 CPU / 100 PID, read-only root, capability drop, no-new-privileges ve dış ağ kısıtları korunmuştur. API/frontend için ayrı localhost portları desteklenir. Kimlik bilgileri worker stdin üzerinden taşınır; argv veya ortam değişkenine eklenmez.

## Test kanıtları

- Backend tam çalıştırması: 132 paketten 131 geçti; kalan güvenlik paketindeki eski HTTP mock URL'si yeni HTTPS sınırına uyarlandı ve 6 kontrolü yeniden geçti. Son seçilmiş regresyon çalıştırmasında 13 paket / 0 hata; ek TAP test paketi 10 kontrol / 0 hata. DNS platform resolver regresyonu ayrıca 3/3 geçti.
- Frontend: 70 birim testi geçti; üretim build'i geçti.
- Uygulama Chromium E2E: 4 geçti; üretim ortamı gerektiren 1 senaryo normal E2E'de atlandı ve ayrı üretim smoke testinde çalıştırıldı.
- Üretim Docker smoke: HTTPS SPA/API/WebSocket, doğrulanmış ZIP indirme ve konteyner değişiminde kalıcılık geçti.
- Worker: `EXECUTION_WORKER_INTEGRATION=1 npm test` tam çalıştırması 53 test / 0 hata / 0 atlanan. Gerçek HTTP prepare/verify roundtrip, izole Chromium, rol yetkisi/veri değişikliği, arşiv güvenliği, deadline/iptal ve ağ izolasyonu dahildir.
- Sonrasında uygulama servisiyle birlikte Chromium çalıştıran fixture genişletildi ve ek PID baskısı giderildi. Son imajla bağımsız izole tarayıcı ve uygulama içindeki manager/viewer pozitif/negatif etkileşimleri: 3 test / 0 hata. Bu ek kontrol, tam suite sonrası yapılan Linux tarayıcı ayarını doğrular.
- Backend ve execution `npm audit --audit-level=moderate`: 0 açık.
- CI sözleşmesi, JS syntax ve `git diff --check` kontrolleri geçti.
- Güncel kaynaklarla üretim Docker smoke testi tekrar çalıştırılarak geçti.

## Operasyon etkileri ve doğrulama sınırı

1. Üretim worker için operatör tarafından belirlenmiş `EXECUTION_WORKER_TOKEN` gerekir.
2. CLI yedeğinden önce yazan servisler durdurulmalı ve `--offline` kullanılmalıdır. Çalışan servis için yalnızca quiesce sağlayan lifecycle ile backup API uygundur.
3. LLM profil deposu ve `llm-encryption.key` ayrı güvenli yedeklenmelidir; proje snapshot'ı bunları kapsamaz. Anahtar kaybedilirse şifreli profiller kurtarılamaz.
4. Önceki npm registry DNS/network hataları nedeniyle bekleyen `--no-cache` üretim imajı sözleşme testi yeniden çalıştırılarak geçti. İlk çalıştırmanın ardından, henüz Git tarafından izlenmeyen `backend/llm-auth/providerTransport.js` ve `backend/routes/artifactDownload.js` dosyaları yalnızca geçici bir Git indeksine dahil edildi ve güncel kaynaklarla ikinci çalıştırma da çıkış kodu 0 ile geçti. Non-root kullanıcı, JSZip import'u, frontend runtime düzeni, volume'lar, healthcheck ve lockfile uyumsuzluğunun reddi doğrulandı. Gerçek Git indeksi SHA-256 karşılaştırmasıyla korundu; geçici indeks temizlendi. Build önbelleği kullanılmadı; mevcut taban imajı kullanılabilir.
5. Bu çalışma kapsamı kullanıcı tarafından hariç tutulan varsayılan admin bilgileri riskini ortadan kaldırmaz.

README, kullanıcı kılavuzu, LLM yönetim belgesi, operasyon belgesi ve Graphify kaynak açıklamaları güncellenmiştir. Graphify görsel haritaları ve JSON yeniden üretilmiştir.

## Sonraki temiz build doğrulamasında Docker durumu

Docker yeniden başlatılırken geçici `dockerInference` soket hatası tekrarlandı. Bu nedenle önceki soket onarımı kalıcı çözüm olarak kabul edilmez. Docker kapalıyken yalnızca geçici soket klasörleri yedek adlarıyla taşındı; imaj ve volume depolarına dokunulmadı. Engine 29.2.0, 2 CPU ve 4107382784 bayt bellek ile hazır hale geldikten sonra yukarıdaki iki temiz imaj sözleşme testi geçti. Yerel kaynak profili, yeniden başlatma sınırlaması ve worker'ın bu profil altındaki test sonuçları [Docker kullanım notlarında](DOCKER-LOCAL-PROFILE.md) kayıtlıdır.

Bu paragraf 4.59.0 dönemindeki durumu kaydeder. Sonrasında resmi paketle Docker Desktop 4.93.0.240920 / Engine 29.8.1'e yükseltildi. Veri VHDX'i ve ayarlar yükseltmeden önce yedeklendi; VHDX kaynak/yedek SHA-256 değerleri karşılaştırıldı. Yeni sürümde ilk açılış ve iki normal CLI kapat/aç döngüsü, elle soket klasörü yenilemeden `docker info` ve mevcut imajdan gerçek konteyner çalıştırma ile geçti. Bu doğrulama, aşağıdaki yeni worker test sonuçlarından ayrı değerlendirilir.

Bu temiz build doğrulamalarının ardından `npm run test:production-image` yeniden çalıştırıldı ve çıkış kodu 0 ile tamamlandı: health/readiness, HTTPS SPA/API/WebSocket, ZIP oluşturma/açma, doğrulanmamış indirme reddi, doğrulanmış ZIP hash'i, non-root dosya sınırları ve konteyner yeniden oluşturma sonrası kalıcılık geçti. Test sonunda çalışan konteyner kalmadığı ve geçici Git indeksinin temizlendiği doğrulandı. `git diff --check` geçti; admin dosyalarının diff'i boş kaldı.

## Engine 29.8.1 sonrası worker doğrulamasının sınırı

Tam worker paketinin yeni Engine üzerinde çalıştırılması 53 test / 49 başarılı / 4 başarısız / 0 atlanan sonucuyla tamamlandı. Üç alt kontrol (token alt sürecinin 2 saniyelik başlangıç sınırı, manager tarayıcı yolculuğu, deadline fixture'ında kaynak oluşturma) ve bunları özetleyen üst test başarısız oldu. Token ve deadline kontrolleri seçilmiş tekrarlarda geçti. Tarayıcı ilk ayrı tekrarda başka bir manager yolculuğunda tekrar başarısız oldu; kimlik bilgilerini göstermeyen güvenli hata sınıfı tanılaması eklendikten sonra gerçek manager/viewer pozitif/negatif akışı 2/2 geçti. Yeni tanılama gizlilik testi 1/1 geçti; üretim timeout ve kaynak sınırları değiştirilmedi. Sonuç, tam worker paketi tamamen kararlı demek için yeterli değildir. Bir test proxy konteynerinin otomatik temizlemeden sonra kalması da gözlendi ve sahiplik etiketi doğrulanarak CLI ile temizlendi. Ayrıntılar [Docker kullanım notlarında](DOCKER-LOCAL-PROFILE.md) kayıtlıdır.

Windows, Linux ve macOS için Docker'sız yerel worker seçenekleri [ayrı araştırma taslağında](superpowers/specs/2026-09-30-portable-worker-options.md) açıklanmıştır. Bu taslak bir uygulama değişikliği veya üç platformda tamamlanmış destek değildir; mevcut worker Docker yürütücüsünü kullanmaya devam eder.

Üretim uygulaması imajı aynı yeni Engine üzerinde `npm run test:production-image` ile yeniden test edildi ve çıkış kodu 0 ile geçti. HTTPS SPA/API/WebSocket, ZIP digest, non-root mount sınırları ve konteyner değişiminde veri kalıcılığı doğrulandı. Bu başarılı smoke testi worker tam paketinin yukarıdaki başarısız sonuçlarını değiştirmez.

Son kontrolde worker sahiplik etiketi taşıyan dört boş test install ağı da bulundu. Sahiplikleri ve bağlı konteyner bulunmadığı doğrulanarak temizlendi. Otomatik cleanup kodu bu çalışmada değiştirilmedi; bu bulgu yeni test kararlılığı sınırlamaları arasında korunur.
