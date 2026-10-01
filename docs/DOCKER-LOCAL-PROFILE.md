# Yerel Docker kaynak profili

## Güncel kullanım — 1 Ekim 2026

Kalite kontrolleri için `npm run dev:local` ile Node/npm/Playwright/Chromium tabanlı yerel worker seçilir; Docker Desktop veya Engine gerekmez. Bu belge aşağıdaki tarihsel Docker kaynak ayarlarını ve Docker profili/imaj build-run işlemlerini anlatır. `npm run dev` çalışma zamanı ayrıca seçilmedikçe Docker profilinde kalır. Yerel worker kurulumu ve güven sınırları için [paket kılavuzunu](LOCAL-WORKER-PACKAGE.md), gerçek test sonuçları için [doğrulama raporunu](LOCAL-WORKER-VALIDATION-2026-10-01.md) okuyun.

30 Eylül 2026 tarihinde 8 GB RAM / 4 mantıksal işlemcili Windows bilgisayarında uygulanan ayarlar.

## Yapılandırma

Docker profili seçildiğinde Docker Desktop yerel Linux Engine sağlayıcısıdır; worker container ve uygulama imajı işlemleri Docker CLI üzerinden yürütülür. CLI kullanımı Desktop'ın arka plan süreçlerini kendiliğinden kaldırmaz. Yerel kalite profili bu altyapıyı kullanmaz.

`C:\Users\ahmet\.wslconfig`:

```ini
[wsl2]
memory=4GB
processors=2
swap=2GB

[experimental]
autoMemoryReclaim=dropCache
```

Bu sınırlar bilgisayardaki bütün WSL2 dağıtımlarına uygulanır. 4 GB bellek üst sınırı önceki varsayılan sınıra yakındır; RAM kullanımının yarıya indiği anlamına gelmez. İşlemci sayısı Engine tarafından 4 yerine 2 olarak görülür. Önbellek geri kazanımı açıkça belirtilmiştir; WSL'nin varsayılanı da `dropCache` idi.

Docker ayarlarında otomatik başlatma kapalı tutuldu, boşta tasarruf süresi 120 saniyeye ayarlandı, varsayılan WSL dağıtımı entegrasyonu kapalı tutuldu. WSL altında Resource Saver CPU tüketimini azaltır; bellek geri kazanımı WSL tarafından yönetilir.

## CLI ile kullanım

```powershell
docker desktop start --detach
docker info
```

İlk komut başlatmayı tetikler; Engine'in hazır olduğunu ikinci komut doğrular. Başlangıç bu bilgisayarda birkaç dakika sürebilir. `docker info` başarısızken build veya worker başlatılmamalıdır.

Worker imajı ve testleri:

```powershell
docker build -t xfactor-worker-runtime -f execution/Dockerfile execution
cd execution
$env:EXECUTION_WORKER_INTEGRATION='1'
npm test
```

Depo kökünde uygulama imajı build / çalıştırma / HTTPS testi:

```powershell
npm run test:production-image
```

Bu test geçici uygulama ve TLS proxy konteynerleri oluşturur; test sonunda kendi kaynaklarını temizler. Üretilen uygulamaların bağımsız kalite kontrolleri worker'ın mevcut Docker izolasyonu içinde kalır.

İşler tamamlandığında, çalışan konteynerleri kontrol ederek Engine'i kapatmak için:

```powershell
docker ps
docker desktop stop --timeout 120
```

Kapatma çalışan konteynerleri de durdurur. Normal kullanımda `--force` yerine düzenli kapatma kullanılmalıdır.

## Açılış hatası ve yedekler

### Güncel durum: 4.93.0 ile yeniden başlatma doğrulandı

Docker Desktop 4.59.0.217644, resmi imzası ve SHA-256 değeri doğrulanan installer ile 4.93.0.240920 sürümüne yerinde yükseltildi. Docker'ın 4.90.0 sürüm notlarında takılı kalan soket sonrası açılış hatasına ilişkin Windows düzeltmesi bulunuyor. Upgrade sonrası ilk açılış ve iki normal CLI kapat/aç döngüsü, soket klasörlerini yenilemeden geçti. Her üç açılışta `docker info` Engine 29.8.1 / 2 CPU / yaklaşık 4 GB bellek bildirdi ve mevcut worker imajından ağsız, read-only, non-root konteyner çalıştırıldı. Mevcut 4 imaj ve 10 volume erişilebilir kaldı.

İlk açılış WSL hazırlığı nedeniyle yaklaşık 8 dakika sürdü. İkinci açılış 155.3 saniye, üçüncü 61.3 saniye içinde hazır oldu. Üçüncü kontrol komutunun sonundaki yanlış kabuk ifadesi ayrı bir PowerShell hatası oluşturdu; Docker Engine ve konteyner kontrolü ayrıca tekrar çalıştırılıp çıkış kodu 0 ile doğrulandı. Bu sınırlı gözlem, her gelecekteki açılış veya bilgisayar yükü için süre garantisi değildir.

Upgrade öncesi Docker kapalıyken veri diski ve ayarlar `F:\DockerBackups\before-4.93.0-20260930-201004` dizinine yedeklendi. `docker_data.vhdx` 15257829376 bayt; kaynak ve yedek SHA-256 değerleri aynı: `970E242127C80BABB09248BFD183C8DFFD97931CD94FDE7F694DEDA63B5AA48E`. Yedek ayrıca `settings-store.json` ve `.wslconfig` içerir. Bu dosyalar hassas bilgi barındırabileceğinden depoya eklenmez. VHDX geri yükleme ancak Docker tamamen kapalıyken ve mevcut verilerin üzerine yazmanın etkisi değerlendirilerek yapılmalıdır.

### 4.59.0 dönemindeki geçici onarım

Yeniden başlatmada Windows, Docker'ın `dockerInference` ve `engine.sock` geçici soketlerini erişilemez olarak raporladı. Docker kapalıyken yalnızca bu soketlerin geçici klasörleri tarihli yedek adlarıyla taşındı; imaj, konteyner ve volume depolarına dokunulmadı. Sonraki açılışta Engine 29.2.0, 2 CPU ve 4107382784 bayt bellek raporladı.

İsteğe bağlı Docker AI özelliği (`EnableDockerAI`) kapatıldı. Bu değişiklik Docker'ın AI yardım özelliğini kapatır; projenin LLM sağlayıcı ayarlarını değiştirmez. Aynı soket hatası Docker'ın hata kayıtlarında da bildirilmiştir.

Sonraki temiz build doğrulaması için 4.59.0 yeniden başlatıldığında `dockerInference` hatası tekrarlandı. Bu nedenle eski sürümde soket klasörlerini yenilemek kalıcı çözüm olarak kabul edilmedi. Docker kapalıyken iki geçici soket klasörü tekrar yedek adlarıyla taşındı ve Engine 29.2.0'ın hazır olduğu doğrulandı. O aşamadaki uygulama testlerinin geçmesi, yeniden başlatma sorununun çözüldüğü anlamına gelmiyordu; sonraki 4.93.0 yükseltmesinin doğrulaması yukarıda ayrı kayıtlıdır.

Orijinal Docker ayar dosyası yedeği:

`C:\Users\ahmet\AppData\Roaming\Docker\settings-store.json.before-resource-tuning-20260930-174851.bak`

Geri almak için Docker tamamen kapalıyken bu dosya `settings-store.json` üzerine kopyalanabilir. Önceden `.wslconfig` bulunmuyordu; oluşturulan dosyanın kaldırılması WSL kaynak varsayılanlarına dönülmesini sağlar. WSL ayar değişiklikleri bütün WSL2 dağıtımları durup tekrar başladıktan sonra uygulanır.

## Bu profil altında doğrulama

Aşağıdaki sonuçlar, yükseltme öncesi Engine 29.2.0 çalıştırmalarına aittir. Yeni Engine testleri ayrı kaydedilir.

- `execution` dizininde `EXECUTION_WORKER_INTEGRATION=1 npm test`: 53 test, 52 başarılı, 1 readiness zaman aşımı, 0 atlanan test. Gerçek Chromium, manager/viewer akışları, bağımlılık hazırlama, Docker izolasyonu, ağ ve arşiv güvenliği, iptal ve temizleme kontrolleri geçti.
- Başarısız HTTP roundtrip testi aynı profil ve değiştirilmemiş sınırlarla tek başına tekrar çalıştırıldı: `node --test tests/jobRoundtrip.integration.test.js`, 1 başarılı / 0 başarısız. İlk suite çalışması tamamen başarılı olarak raporlanmaz; yük altında readiness gecikmesi görüldü.
- Tekrar testinde Windows yaklaşık 463 MB boş fiziksel RAM raporladı. 8 GB bilgisayarda bellek baskısı sürmektedir; ölçülmüş bir hızlanma veya RAM tasarrufu oranı iddia edilmez. Ağır testler ve build işlemleri seri çalıştırıldı.
- `npm run test:production-image`: ilk denemede uygulama imajı build edildi, Caddy pull işlemi Docker Hub TLS handshake zaman aşımında kaldı. İkinci deneme çıkış kodu 0 ile tamamlandı: health/readiness, ZIP oluşturma/açma, HTTPS SPA/API/WebSocket, doğrulanmamış indirme reddi, doğrulanmış ZIP hash'i, non-root dosya sınırları ve konteyner yeniden oluşturma sonrası kalıcılık geçti. Testin bütün build / pull / run / exec / temizleme işlemleri CLI ile yapıldı.
- Test sonunda çalışan konteyner bulunmadığı doğrulandı. `docker desktop stop --timeout 120` başarılı oldu; son kontrolde Docker Desktop ve backend süreçleri kapalıydı. Kaynak ve tasarruf ayarlarının dosyalarda korunduğu yeniden doğrulandı.
- Sonraki doğrulamada `node scripts/test-p6-image-contract.mjs` iki kez geçti. İkinci çalıştırma, yeni backend dosyalarını geçici Git indeksi üzerinden temiz bağlama dahil etti ve gerçek Git indeksinin değişmediğini doğruladı. Her iki sözleşme testinde build `--no-cache` ile yapıldı. Ardından üretim HTTPS ve konteyner kalıcılığı testi de yeniden geçti. Bu testlere başlarken tekrarlayan soket hatası için geçici onarım gerekti; yeniden başlatma sorunu kalıcı olarak çözülmüş sayılmaz.

## Engine 29.8.1 ile yeni test çalıştırması

- Tam worker paketi: `EXECUTION_WORKER_INTEGRATION=1 npm test`, 53 test / 49 başarılı / 4 başarısız / 0 atlanan, yaklaşık 797 saniye. Başarısız sonuçlar üretim token alt sürecinin 2 saniyelik başlangıç sınırı, manager tarayıcı yolculuğu, 10 saniye içinde kaynak yaratılmasını bekleyen deadline fixture'ı ve başarısız alt testleri özetleyen üst testtir. Bu tam çalıştırma başarılı olarak raporlanmaz.
- Değiştirilmemiş token testi tek başına tekrar geçti: 1/1. Süre yaklaşık 1989 ms ile 2000 ms sınırına çok yakındı. Deadline temizlik kontrolü ayrı çalıştırmada geçti. Tarayıcı ayrı ilk tekrarda farklı bir manager yolculuğunda tekrar başarısız oldu; bu nedenle tek seferlik hata kabul edilmedi.
- Tarayıcı tanılamasına yalnızca güvenli hata sınıfı eklendi: `TimeoutError` zaman aşımı olarak, diğer hatalar genel hata olarak gösterilir. Parola/token/uygulama gövdesi rapora yazılmaz. Yeni gizlilik testi önce eksik fonksiyon nedeniyle başarısız oldu, değişiklikten sonra 1/1 geçti. İş, tarayıcı, CPU/RAM/PID ve token güvenlik sınırları değiştirilmedi.
- Yeni tanılamayla gerçek manager/viewer pozitif/negatif tarayıcı akışı tekrar çalıştırıldı: alt test ve üst test dahil 2 başarılı / 0 başarısız, yaklaşık 119 saniye. Bu seçilmiş kontrolün geçmesi, önceki tam paketin başarısız sonucunu veya yük altında tekrar riskini ortadan kaldırmaz; ilk tarayıcı hatasının kesin nedeni bu başarılı tekrarda belirlenemedi.
- Bir ölçümde Windows yaklaşık 428 MB boş fiziksel bellek raporladı. RAM baskısı gözlendi; bütün hataların tek sebebinin RAM olduğu kanıtlanmadı.
- Tam paket sonrasında bir test registry proxy konteyneri ve son kontrolde dört boş test install ağı kalmıştı. Sahiplik etiketi `xfactor.owner=execution` ve ağların bağlı konteynerinin bulunmadığı doğrulanarak yalnızca bu kaynaklar CLI ile kaldırıldı. Yoğun yük altında otomatik temizlemenin güvenilirliği ayrıca izlenmelidir; bu çalışma otomatik temizleme kodunu değiştirmedi.
- `npm run test:production-image`, yeni Engine üzerinde çıkış kodu 0 ile tamamlandı: health/readiness, ZIP oluşturma/açma, HTTPS SPA/API/WebSocket, doğrulanmamış ZIP reddi, doğrulanmış ZIP digest, non-root mount sınırları ve konteyner yeniden oluşturma sonrası veri kalıcılığı geçti. Build/run/exec ve test temizliği CLI üzerinden yürütüldü.
- Son kontrolde aktif konteyner ve worker sahiplik etiketli ağ kalmadı. `docker desktop stop --timeout 120` çıkış kodu 0 ile tamamlandı; Docker Desktop/backend süreçleri kapandı. Upgrade sonrasında kaynak ayarları, AutoStart=false, AutoPauseTimeoutSeconds=120, EnableIntegrationWithDefaultWslDistro=false ve EnableDockerAI=false korundu. `git diff --check` ve JS syntax geçti; admin giriş dosyalarının diff'i boş kaldı.

## Kaynaklar

- [Docker Resource Saver](https://docs.docker.com/desktop/use-desktop/resource-saver/)
- [Microsoft WSL yapılandırması](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
- [Docker Desktop CLI](https://docs.docker.com/reference/cli/docker/desktop/)
- [Windows geçici soket hata kaydı](https://github.com/docker/desktop-feedback/issues/531)
- [Docker 4.90.0 Windows soket düzeltmesi](https://docs.docker.com/desktop/release-notes/#4900)
