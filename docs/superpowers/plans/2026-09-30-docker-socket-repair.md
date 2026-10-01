# Docker yeniden başlatma hatasının giderilmesi

Kapsam: Windows üzerindeki Docker Desktop 4.59.0'ın tekrar açılışta `dockerInference` / `engine.sock` AF_UNIX soketi nedeniyle çökmesi. Worker ve uygulama işlemleri CLI üzerinden kalır; imaj/volume verileri ve mevcut 2 CPU / 4 GB WSL profili korunur.

Kanıt: Önceki iki çalıştırma arasında normal CLI kapatmasının ardından aynı hata tekrarlandı. Geçici klasörleri yeniden adlandırmak bir açılışı sağlıyor, ancak tekrarı engellemiyor. Docker'ın resmi 4.90.0 sürüm notlarında takılı kalan soket sonrası açılış hatası düzeltmesi bulunuyor. İncelenen güncel sürüm 4.93.0.

- [x] Kurulu sürümü, hata günlüklerini, resmi sürüm notlarını ve Windows soket sürücüsü sürümünü incele.
- [x] Docker kapalıyken veri VHDX'ini ve ayarları yedekle; VHDX yedeğini SHA-256 ile karşılaştır. Yedek: `F:\DockerBackups\before-4.93.0-20260930-201004`, 15257829376 bayt, kaynak/yedek SHA-256 `970E242127C80BABB09248BFD183C8DFFD97931CD94FDE7F694DEDA63B5AA48E`.
- [x] Resmi 4.93.0 paketini indir; resmi SHA-256 ve Docker Authenticode imzasını doğrula. Paket: `C:\Users\ahmet\AppData\Local\Temp\DockerDesktop-4.93.0-240920.exe`, 627791792 bayt, SHA-256 `C139124C9CF71477DC565C3C0EA5A18F90B93D68EBE9AAA848A065960416C0BC`, imza `Valid`, yayıncı `Docker Inc`.
- [x] Mevcut all-users kurulumunu aynı WSL2 backend ile yerinde güncelle. Docker Desktop 4.93.0.240920 kuruldu; installer çıkış kodu 0. Fabrika sıfırlaması, uninstall veya veri silme uygulanmadı.
- [x] Elle soket klasörü yenilemeden ilk açılışı ve en az iki normal kapat/aç döngüsünü gerçek `docker info` ve konteyner çalıştırma ile doğrula. Üç açılışta Engine 29.8.1 / 2 CPU ve gerçek worker konteyneri doğrulandı. İkinci açılış 155.3 s, üçüncü 61.3 s; ilk açılış güncelleme sonrası WSL hazırlığı nedeniyle daha uzundu.
- [x] Mevcut worker imajı ve volume listesini doğrula; gerçek worker ve üretim uygulaması testlerini seri çalıştır. 4 imaj / 10 volume korundu. Worker tam paket 49/53 başarılı (başarısız üst test dahil 4 hata); token/deadline ve gerçek manager/viewer seçilmiş tekrarları geçti. Üretim imajı smoke çıkış kodu 0. Tam worker paketi tamamen başarılı ilan edilmedi.
- [x] Sonucu ve geri alma/yedek konumunu yerel Docker dokümanına kaydet. Yalnızca test edilen kapsam için başarı bildir. Son test kaynakları temizlendi; aktif konteyner ve worker ağı kalmadığı kontrolünden sonra normal CLI stop çıkış kodu 0 ile tamamlandı. Docker Desktop/backend süreçleri kapalı; AutoStart=false, idle=120 s, WSL entegrasyonu=false ve DockerAI=false korundu. Worker tam paket kararlılığı ve otomatik cleanup kalıntıları açık sınırlamalar olarak raporlandı.

Resmi kaynak: https://docs.docker.com/desktop/release-notes/#4900

Başarısızlık durumunda yeni hata günlüğü incelenir. Yeni sürümle de aynı kernel soket hatası oluşursa güncelleme başarılı diye sorunun çözüldüğü iddia edilmez.
