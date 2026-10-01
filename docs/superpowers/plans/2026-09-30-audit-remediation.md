# İnceleme bulgularının giderilmesi

Amaç: Admin girişi ve varsayılan kullanıcı bilgilerini değiştirmeden incelemedeki kalan hataları doğrulamak ve gidermek.

Mevcut mimari korunacak. Her görevde önce regresyon testi çalıştırılıp beklenen hata görülecek, sonra en küçük düzeltme ve ilgili testler uygulanacak. Kullanıcı çalışma ağacındaki mevcut dosyalar korunacak; otomatik commit yapılmayacak.

- [x] Worker üretim token zorunluluğu: execution/server.js ve worker testleri.
- [x] Restore DB artifact yolları: backend/backupRestore.js ve test_p9_backup_restore.js; restore edilen DB üzerinden dosyayı okuyarak doğrula.
- [x] WAL dahil tutarlı SQLite yedeği: backupRestore.js ve CLI; açık WAL bağlantısındaki yeni satırın snapshot içinde bulunmasını doğrula. Dosya tutarlılığı için çevrimdışı CLI kullanımını zorunlu kıl.
- [x] LLM anahtarı: kalıcı, kullanıcı tarafından yazılabilen data dizininde anahtar sakla; tekrar başlatmada aynı anahtarı kullan, şifreli profil varsa kayıp anahtarı otomatik yenileme.
- [x] Worker readiness: Docker daemon ve sabit runtime imajını kontrol et; probe başarısızsa 503 döndür.
- [x] Yönetim tarayıcı yolculukları: gerçek izole tarayıcı üzerinden etkileşim, rol/oturum, sonuç ve erişilebilirlik kanıtı üret; eksik kanıtla PASS verme.
- [x] Deadline: kalan süreyi aşan komutları ve işleri iptal et; süre ve abort regresyonlarını çalıştır.
- [x] WebSocket: transport seviyesinde 64 KiB sınırı; büyük mesajın uygulamaya ulaşmadan reddedildiğini doğrula.
- [x] LLM DNS: tüm bağlantılarda özel IP çözümlemelerini engelle, DNS rebinding için çözümlemeyi bağlantıya bağla; sahte resolver ile özel/public adresleri doğrula.
- [x] JobStore: bozuk dosyada açık hata; yeniden başlatılan running işlerde completedAt ve kalıcı terminal durum; yeniden açarak doğrula.
- [x] Download denetimi: başarılı aktarım callback'inde kayıt; başarısız aktarımda başarı kaydı olmaması.
- [x] İlgili operasyon belgelerini güncelle ve uygun test grupları/build/diff kontrolünü çalıştır. Admin kodunda diff bulunmadığını doğrula.
- [x] Gerçek entegrasyonda bulunan npm sürüm banner / TAP sıfır-test ayrıştırma hatasını regresyon testiyle gider.

- [x] Önceki npm DNS/network hataları nedeniyle bekleyen `--no-cache` üretim imajı sözleşmesini yeniden çalıştır. Yeni backend dosyalarını geçici Git indeksiyle dahil eden güncel kaynak doğrulaması da geçti; gerçek Git indeksi korundu.

Sonuçlar ve Docker yeniden başlatmasında süren geçici soket sorununun sınırı: [düzeltme raporu](../../AUDIT-REMEDIATION-2026-09-30.md).
