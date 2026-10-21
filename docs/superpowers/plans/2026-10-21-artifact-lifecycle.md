# Artifact yaşam döngüsü uygulama planı

**Amaç:** Proje klasörleri, kayıtlı ZIP çıktıları ve fiziksel dosyalar arasındaki tutarsızlıkları görünür kılmak ve güvenli karantina ile gidermek.

**Onay:** Kullanıcı, önceki yanıttaki envanter → eksik çıktılar → ortak silme yaşam döngüsü → eksik klasör güvenliği → saklama/karantina sırasını uygulamamızı istedi.

**Mimari:** Salt okunur envanter modülü kimlik, mutlak yol ve SHA-256 ile eşleştirir. Fiziksel bulunabilirlik, tarihsel kalite durumundan ayrıdır. Proje silme işlemi veritabanı transaction'ında bağımsız bir artifact bakım kuyruğu oluşturur; kuyruk proje satırından bağımsız kalır ve yeniden çalıştırılabilir. Dosyalar kalıcı silinmez, merkezi kökün altındaki karantinaya alınır.

**Sınırlar:** Tamamlanma makbuzları ve bunlara bağlı çıktılar korunur. Eksik proje klasörü otomatik silme sebebi değildir. Kök dizin erişilemiyorsa bakım yapılmaz. ZIP açılmaz/çalıştırılmaz. Admin bilgileri ve kullanıcının surec-raporu.md silme değişikliği korunur.

## Uygulama sırası

- [x] İzole fixture testleri: eksik/hash uyuşmayan dosya, aynı önekli ayrı çıktılar, sahipsiz dosya, kök erişim hatası, makbuz koruması, symlink/dış yol, yarıda kalmış karantina.
- [x] `backend/services/artifactLifecycle.js`: envanter, güvenli yol kontrolü, bekleyen bakımın devamı, saklama adayları ve karantina.
- [x] `backend/db.js`: proje silinmesinden sonra kalan bağımsız bakım kuyruğu migration'ı.
- [x] `backend/projectRepository.js`: silme transaction'ında çıktı kayıtlarını kuyruğa alma; sonrasında ve recovery sırasında devam ettirme; çıktı bulunabilirliği.
- [x] `backend/services/reconciliationService.js`: eksik klasörleri silmeden artifact envanteri ile senkronizasyon sonucu.
- [x] Yönetici API ve ön yüzde eksik çıktı bilgisi; salt okunur varsayılan bakım CLI'sı.
- [x] Canlı envanteri incele; kanıtlanabilen sahipsiz eski dosyaları karantinaya al. Kayıp verified çıktıları yalnız doğru hash ile geri eşleştir; bulunamazsa açıkça raporla.
- [x] İlgili silme, migration, sync, frontend testlerini çalıştır; README/kullanıcı kılavuzu/operasyon belgeleri ve graphify haritasını güncelle; diff incelemesi.

**Saklama:** Makbuzlu ve verified çıktılar otomatik bakım kapsamı dışındadır. Kayıtsız dosyalarda en az 24 saat, rejected/superseded kayıtlarda en az 7 gün beklenir. Çalışan üretimi bulunan projelerde kayıtlı çıktı bakımı yapılmaz. Karantina otomatik boşaltılmaz; geri alma kimlik/yol/hash kanıtı içerir.
