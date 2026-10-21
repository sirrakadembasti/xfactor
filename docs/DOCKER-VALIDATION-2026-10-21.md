# Docker doğrulaması — 21 Ekim 2026

Windows bilgisayarında Docker CLI üzerinden gerçek Linux Engine, imaj ve konteyner testleri çalıştırıldı. Normal XFactor üretim/kalite profili Docker'sız kalır; bu kayıt isteğe bağlı Docker yürütme ve dağıtım yolunu doğrular.

## Başlangıç engeli ve bulunan hata

Docker CLI 29.8.1 kuruluydu; `desktop-linux` ve `default` bağlantılarında çalışan Engine yoktu. Bu bilgisayarda Engine sağlayıcısı Docker Desktop olduğundan `docker desktop start --detach` ile başlatıldı. Build/run/exec/test/temizlik CLI ile yürütüldü. CLI kullanılması Desktop'ın Engine sağlayan arka plan süreçlerini ortadan kaldırmaz.

İlk üretim HTTPS testi TLS proxy ağ alanı hatası verdi. Ayrı geçici konteynerde gerçek neden doğrulandı: backend açılışta `ERR_MODULE_NOT_FOUND: /app/execution/limits.js` ile çıkıyordu (çıkış 1, OOM değil). `verificationBudget.js` ortak limit modülünü kullanıyor, fakat üretim Dockerfile'ı bu modülü kopyalamıyordu.

Düzeltme, `execution/limits.js` ve ESM kapsamını belirleyen `execution/package.json` dosyalarını `/app/execution/` içine ekler. Worker servisi veya Docker daemon web imajına eklenmez. `test-p6-image-contract.mjs` artık gerçek konteynerde bütçe modülünü yükleyip 15 dakika varsayılanı ve 25 dakika üst sınırını denetler. Yeni kontrol düzeltmeden önce eksik modül nedeniyle başarısız, düzeltmeden sonra başarılı oldu.

## Son doğrulama sonuçları

| Kontrol | Sonuç |
|---|---|
| Worker imajı `docker build -t xfactor-worker-runtime -f execution/Dockerfile execution` | Başarılı |
| `test_p8_sandbox_limits.js`, Docker zorunlu | 4 başarılı, 0 hata; gerçek cgroup bellek 1 GiB, PID 100, CPU 2; timeout konteyneri temizlendi |
| `npm --prefix execution run test:docker` | 170 başarılı, 0 hata, 0 iptal, 0 atlama |
| `npm --prefix backend run test:docker:artifact` | Express ve Next fixture ZIP'lerinden iki imaj build ve ilk HTTP yanıtı başarılı |
| `node scripts/test-p6-image-contract.mjs` | Temiz build, bütçe modülü/limitleri, non-root kullanıcı, JSZip, frontend yerleşimi, volume/healthcheck ve kilit uyumsuzluğu reddi başarılı |
| `npm run test:production-image` | HTTPS SPA/API/WebSocket, doğrulanmamış ZIP reddi, doğrulanmış fixture ZIP özeti, non-root mount sınırları ve konteyner yenileme sonrası kalıcılık başarılı |

Worker paketi gerçek kimlik doğrulamalı HTTP hazırlama/doğrulama, Chromium rol yolculukları, izinli/yasak API yazmaları, arşiv/ağ sınırları, iptal ve temizlik kontrollerini içerir. Test limitleri gevşetilmedi. Express/Next artefakt testleri paketleme fixture'larıdır; keyfi bir tam uygulamanın işlevsel kabulü yerine geçmez.

## Tekrar çalıştırma ve sınırlar

Gerekli bileşenler: erişilebilir Linux Docker Engine, Docker CLI, imaj/paket indirmeleri için ağ erişimi, yeterli RAM/disk, depo Node/npm bağımlılıkları; HTTPS arayüz testi için kök Playwright sürümüne ait Chromium. Bu bilgisayarda ek Docker kurulumu gerekmedi. Codex sandbox'ının Docker build kilidi ve kullanıcı tarayıcı dizinine erişim kısıtları, izinli tekrar çalıştırmayla aşıldı; ürün hatası olarak sayılmadı.

Komutlar ve Engine başlatma/kapatma adımları [Docker kaynak profili kılavuzundadır](DOCKER-LOCAL-PROFILE.md). Yalnız `EXECUTION_WORKER_INTEGRATION=1` ayarlayıp `npm test` çağırmak yerine güncel `npm run test:docker` seçicisini kullanın. Engine kapalıyken Docker testleri için başarı sonucu üretilmez.

Testler geçici veritabanları, kullanıcılar ve fixture ZIP'leri kullandı. Canlı proje verileri ve yönetici/varsayılan kullanıcı bilgileri değiştirilmedi. **Otel uygulamasının teslim ZIP'i açılmadı veya çalıştırılmadı.** Yerel üretim kabulü ayrıca [Docker'sız worker raporunda](LOCAL-WORKER-VALIDATION-2026-10-21.md) kayıtlıdır. Test kaynakları denetlendi; geçici tanılama imajı kaldırıldı. Yerel `.tmp/` günlükleri Git'e eklenmez.

Test sonunda başlangıçta kapalı olan Docker Engine tekrar CLI ile kapatıldı; Docker süreçleri kalmadı. Ana XFactor backend'inin `/readyz` yanıtı `status: ready`, `executionCapacity: ready` olarak doğrulandı. Normal Docker'sız worker akışı çalışmaya devam etti.
