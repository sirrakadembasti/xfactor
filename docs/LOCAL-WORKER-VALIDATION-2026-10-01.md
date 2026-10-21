# Yerel worker doğrulaması — 1 Ekim 2026

> Bu dosya 1 Ekim tarihli paket/kaynak kabulünün tarihsel kaydıdır; aşağıdaki sayılar o kapsama aittir. Gerçek otel üretiminin tamamlanmış sonucu ve güncel süre/cache/readiness açıklamaları için [21 Ekim 2026 kabul raporunu](LOCAL-WORKER-VALIDATION-2026-10-21.md) okuyun.

Bu çalışma Docker çağırmadan Node 22.23.2, npm 10.9.8, Playwright Core 1.62.1 ve Chromium kullanan `local-trusted` worker'ı ekler. Admin ve varsayılan kullanıcı bilgileri bu çalışma kapsamında değiştirilmedi. Önceki çalışma değişiklikleri korunmuştur.

## Doğrulanan davranışlar

- Windows kaynak worker HTTP entegrasyonu: dependency hazırlama, lockfile/hash ve iş kimliği bağları, gerçek npm install/build/test, SQLite yazma/okuma, manager/viewer API yetkileri ve dört gerçek Chromium yolculuğu geçti. Hatalı ve sıfır testli projeler reddedildi; Docker sentinel çağrılmadı; iş workspace'leri ve servis portu temizlendi. Üç entegrasyon testi geçti.
- İlk toplu worker unit turu 111/111 geçti. Tüm son düzeltmelerden sonra unit ve gerçek yerel HTTP entegrasyonunu birlikte içeren güncel turda **129 test geçti; sıfır hata, sıfır iptal, sıfır skip** (425.8 saniye, çıkış kodu 0). Üretim token kuralı değiştirilmedi; yoğun yük altında tokensız açılış testi için süre sınırı 60 saniyeye düzeltildi.
- Windows Job Object helper: literal argv/stdin, çıkış kodu, süreç limitleri, descendant temizliği, parent crash watchdog ve derleyici iptali dahil yedi gerçek test geçti.
- Ek toplu turda, helper `CreateProcess` ile suspended root oluşturduktan sonra Job atamasından önce öldürülürse rootun yetim kaldığı nadir iptal yarışı bulundu. Canlı süreç/thread kanıtı ve kontrollü test kopyasında başarısız regresyon ile doğrulandı. Atomik `STARTUPINFOEX` / `PROC_THREAD_ATTRIBUTE_JOB_LIST` düzeltmesinden sonra sekiz helper testi, odaklı iptal testi ve son 111 testlik tur geçti. Eski takılan test zinciri kimliği tekrar doğrulanarak temizlendi; başka süreçlere dokunulmadı. Takılan eski tur başarı kanıtı olarak kullanılmaz.
- Hazır olma kontrolü artık gerçek sayfa, DOM ve JavaScript kanıtı gerektirir; beş renderer unit testi ve gerçek kaynak Chromium kontrolü geçti. Sadece launch/version/newContext sonucu yeterli sayılmaz.
- İlk paketleme testleri 14/14, logging ve renderer güncellemeleriyle odaklı tur 21/21 geçti. Paketli headless Chromium, sandbox açıkken gerçek sayfa/tıklama ve HTTP hazır olma kontrolünü geçti. Güncel SHA256 manifestinde 4048 dosya bulunur. Windows'ta izin hazırlığı yalnız sahip olunan geçici tarayıcı çalışma kopyasında salt okuma/çalıştırma izinleriyle sınırlıdır. Ayrı Chromium teşhis kopyası temizlendi.
- Gerçek paket denemeleri Chromium'un executable dizininde `debug.log` oluşturduğunu gösterdi. Bütünlük kontrolü gevşetilmedi. Native açılışlar `--enable-logging=stderr`, mutlak `os.devNull` yoluna `--log-file` ve `CHROME_LOG_FILE` kullanır. Önce diğer bütün hashler doğrulandıktan sonra yalnız bilinen browser logu temizlenerek paket yenilendi. Tam kabul, işler sonrası manifest doğrulamasını da gerektirir.
- Tarayıcı tanısı yalnız sabit aşama ve sınırlı adım numarası içerir; kullanıcı bilgisi, URL ve ham hata metni dışarı verilmez. Gerçek Windows denemelerindeki gezinme/kontrol zaman aşımı için native etkileşim 15, gezinme 30 saniye oldu. Docker 5 saniye, toplam yolculuk 90 ve native komut 95 saniye sınırları korunur; iş isteği bu süreleri değiştiremez. Tanı/süre regresyonlarında yedi test geçti.
- Backend guard/quality regresyonları geçti. Son test-infrastructure ve P9 pipeline turu iki suite, sıfır hata verdi.
- Frontend 71 test ve üretim build'i geçti. Kalite paneli yerel profili ve `osIsolation:false` bilgisini gösterir.
- Son bağımsız kaynak incelemelerinde açık önemli bulgu kalmadı. TAP yorumlarının test kanıtı olarak sayılması giderildi.

## Teslimat kabulü

Önceki paket denemesinde gerçek uygulama doğrulaması ve dört rol yolculuğu geçti; kapanış/bütünlük kabulü tamamlanmadığı için bu deneme tam paket başarısı olarak sayılmaz.

Aktif iş kapanışı, sağlık kontrolünün iptal hatasını geçici hata olarak yutup 90 saniyelik döngüye devam etmesi nedeniyle launcher'ın 60 saniyelik zorla kapatma sınırına takıldı. Dört başarısız regresyonla kök neden doğrulandı. İptal kontrolü ve kesilebilir backoff düzeltmesinden sonra beş iptal/normal-retry testi ve mevcut üç sağlık testi geçti; geç gelen HTTP 200 iptal edilmiş işi başarılı sayamaz. Bağımsız incelemede önemli bulgu kalmadı.

Windows Chromium alt süreci, açık logging bayraklarına rağmen executable yanında log oluşturabiliyor. Dağıtım kaynağı değiştirilmeden tarayıcı paket dışındaki, kaynak/çıktı SHA'ları doğrulanmış benzersiz çalışma kopyasından açılır. Başlangıç hatası ve normal kapanış bu kopyayı temizler; kaynak veya kopya hash uyumsuzluğu, symlink ve paket içindeki state yolu reddedilir. İlgili regresyonlar ve bağımsız inceleme geçti.

Güncel paketin gerçek `--shutdown-only` kabulü **PASS**: HTTP hazırlama, gerçek canlı servis, iptalde worker çıkış kodu 0, portun yeniden bağlanabilmesi, iş workspace'i ve browser çalışma kopyasının temizliği, iş sonrası tam manifest doğrulaması başarılı. Kanıt: `.tmp/local-worker-package-shutdown-result.json` içinde `activeShutdown:true`, `bundleIntegrityAfterJobs:true`.

Güncel bağımsız paketin **tam kabulü PASS, çıkış kodu 0**: HTTP hazırlama/doğrulama, gerçek npm build ve iki Node testi, SQLite okuma/yazma, API rol izinleri, 33 kontrol ve dört Chromium rol yolculuğu başarılı. Hatalı arşiv hash'i reddedildi. Aktif ikinci işte normal kapanış, servis portu ve iş/browser dizinlerinin temizliği, ardından 4048 dosyanın tam manifest doğrulaması geçti. Kanıt: `.tmp/local-worker-package-result.json` içinde `prepareStatus:completed`, `verifyStatus:completed`, `activeShutdown:true`, `bundleIntegrityAfterJobs:true`; komut günlüğü `.tmp/local-worker-package-acceptance.log`. JavaScript fixture için uygulanamayan typecheck atlanır; zorunlu kontroller gevşetilmez.

Son güncel kaynak kabulü de **PASS**: `node scripts/test-worker.mjs --local-integration` komutu 129/129 test, sıfır hata/iptal/skip ve çıkış kodu 0 verdi. Gerçek kaynak HTTP entegrasyonunda hatalı ve sıfır testli projeler reddedildi; Docker sentinel çağrılmadı. Kanıt günlüğü `.tmp/local-worker-final-all.log`. Paket ve kaynak kontrolleri seri çalıştırıldı; Linux/macOS fiili testi olarak sayılmaz.

## Varsayılan başlatma düzeltmesi

Normal `npm run dev` artık Docker olmadan yerel worker seçer; `npm run dev:local` eşdeğer açık adıdır. Eski ortam değişkeni Docker dese de normal uygulama başlatması yerel profili seçer. `npm run dev:docker` Docker profilini açıkça seçer. Çelişen komut seçenekleri servis başlatılmadan reddedilir. Dört profil seçimi testi, yerel profil güven kontrolü ve üretim token kontrolü birlikte 6/6 geçti. Önceki 129 testlik kaynak kabulü bu yeni testleri içermez. Doğrudan worker sunucusu ayrı runtime/token yapılandırması gerektirir; düşük seviyeli güven kontrolleri değiştirilmedi.

Varsayılan uygulama başlatmasının profil ayarlarıyla gerçek Chromium hazır olma kontrolü geçti: `selectedRuntime:local`, `executionCapacity:true`, `executionProfile:local-trusted`, `osIsolation:false`. İlk denemede Codex sandbox'ının kullanıcı tarayıcı dizinine erişim kısıtı nedeniyle kontrol çalışamadı; izinli tekrar başarılı oldu.

## Platform ve güven sınırları

Windows üzerinde gerçek test yapıldı. Linux/macOS için platform kodu ve CI matrisi eklendi; bu bilgisayarda bu platformlar çalıştırılmadı. İlgili CI ve gerçek paket entegrasyonu geçmeden o platform için doğrulanmış release iddiası yapılmaz.

`local-trusted` işletim sistemi izolasyonu sağlamaz: üretilen kod worker hesabının yetkileriyle çalışır. Süreç ağacı kontrolü, ayrı HOME/cache/workspace ve arşiv sınırları bu gerçeği değiştirmez. Docker imajı üretimi/çalıştırılması ayrı altyapı kontrolüdür. Kullanım: [yerel worker paket kılavuzu](LOCAL-WORKER-PACKAGE.md).
