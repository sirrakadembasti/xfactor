# XFactor ajan dosyalarının ayrılması

**Amaç:** Platform ajan talimatları, anayasa ve protokol şablonlarını kökteki `x-agents/` altında toplamak; üretilen proje belgelerini platform istemlerinden ayırmak.

**Mimari:** Altı rol, anayasa ve beş şablon taşınır. Backend sabit, dosya adına göre izinli `x-agents` kökünü kullanır; `docs` veya proje belgelerine geri dönüş yapmaz. Proje çalışma kayıtları `projects/<id>/` altında kalır. Belgeler ve Graphify yeni yolları gösterir; üretim imajı ajan dizinini ayrıca içerir.

- [x] Ajan yükleyicisi için yanlış kök, traversal ve junction regresyonlarını başarısız doğrula.
- [x] Dosyaları taşı; yükleyici, altı rol, sohbet rotası, üretim imajı ve test referanslarını güncelle.
- [x] Proje kökünün ajan diziniyle örtüşmesini ve bağlantı üzerinden aynı dizine yönlenmesini reddet.
- [x] README, kullanıcı kılavuzu ve Graphify kaynak/ilişkilerini güncelle.
- [x] İlgili backend, güvenlik, disk protokolü ve Graphify testlerini çalıştır; geçici verileri dışarıda tutarak commit oluştur.

**Sınır:** Bu düzenleme dosya kaynaklarını ayırır; yerel worker için işletim sistemi izolasyonu iddiası sağlamaz. Admin/varsayılan kullanıcı bilgileri değiştirilmez.

## Doğrulama

- Windows üzerinde 16 farklı backend süiti geçti: ajan sözleşmeleri ve talimat eşleşmeleri, Manager sohbeti, üretim, dosya sahipliği, disk kurtarma, symlink izolasyonu, ZIP envanteri ve CI sözleşmesi dahil. İki koşuda 8/8 ve 8/8 süit, sıfır hata. Kanıt: `.tmp/x-agents-backend-validation.log` ve `.tmp/x-agents-backend-extended.log`.
- Altı yeni ajan belge sınırı testi geçti. Aynı adlı üretilen belge, bilinmeyen rol/traversal, ajan kökü junction'ı, eksik/kısa/büyük talimat, çakışan proje kökü ve proje klasörü bağlantısı kontrol edildi. Eski davranışlarda başarısız regresyon görüldü; düzeltmelerden sonra geçti.
- Worker paketleme süiti 19/19 geçti; paket çıktısının `x-agents` içine yerleştirilmesi araç çözümlemesinden önce reddedildi. Kanıt: `.tmp/x-agents-worker-packaging-validation.log`.
- Son talimat eşleşmesi, belge sınırı ve Graphify turu 3/3 süit geçti. Graphify JSON'da 12 taşınan dosyanın yeni düğümleri bulundu; eski ajan düğümleri bulunmadı ve tüm ilişkilerin uçları geçerliydi. Kanıt: `.tmp/x-agents-final-validation.log`.
- Üretim Dockerfile ajan dizinini ayrı kopyalayacak şekilde güncellendi; bu çalışma sırasında Docker imajı yeniden build/run edilmedi. Linux/macOS fiili test iddiası yapılmaz.
