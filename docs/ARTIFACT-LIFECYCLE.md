# Proje klasörleri ve ZIP yaşam döngüsü

Bu belge `backend/services/artifactLifecycle.js`, proje silme/senkronizasyon
akışı ve `backend/scripts/artifact-maintenance.js` davranışını açıklar.

## Üç ayrı durum

`projects/<proje-id>/` üretimin kaynak klasörüdür. `backend/data/artifacts/`
merkezi ZIP deposudur; artifact kaydı ZIP'in proje/sözleşme kimliğini, SHA-256
özetini, boyutunu ve tarihsel kalite durumunu tutar. Aynı proje önekiyle birden
fazla ZIP bulunması farklı üretim veya doğrulama denemelerinden kaynaklanabilir;
ad benzerliği aynı içerik veya silinebilirlik kanıtı değildir.

Fiziksel bulunabilirlik kalite durumundan ayrıdır:

| Bulunabilirlik | Anlamı |
| --- | --- |
| `available` | Normal dosya mevcut; boyutu ve SHA-256 özeti kayıtla eşleşiyor. Tek başına kalite onayı değildir. |
| `missing` | Kayıtlı dosya bulunamıyor. Tarihsel `verified` kaydı değiştirilmez. |
| `hash_mismatch` | Dosyanın boyutu veya içeriği kayıtla eşleşmiyor. |
| `quarantined` | Kaynak yol boş; günlükteki karantina dosyasının boyutu ve SHA-256 özeti artifact kaydıyla eşleşiyor. Bu durum indirme onayı değildir. |
| `quarantine_missing` | Günlük taşımanın tamamlandığını söylüyor fakat karantina dosyası eksik, okunamıyor veya kayıtlı içerikle eşleşmiyor. |
| `unsafe_path` | Dosya/klasör beklenen türde değil veya sembolik bağlantı. |
| `unreadable` | Dosyaya erişim başarısız. |

Proje cevabı ayrıca hiç doğrulanmış aday yoksa `none`, dosya bulunmasına rağmen
güncel indirme kanıtı geçersizse `invalid_evidence` bildirebilir. İndirme için
fiziksel dosyanın bulunması, güncel sözleşme ve doğrulama/makbuz kanıtları birlikte
gerekir. Eksik ZIP yerine kaynaklardan yeniden paketleme eski doğrulama kanıtını
geri getirmez; yeni çıktı yeniden doğrulanmalıdır.

## Kaynak klasörü kaldırılırsa

Klasörün dışarıdan silinmesi veya taşınması, disk senkronizasyonunda eksik kaynak
olarak raporlanır. DB projesi, geçmiş kalite kayıtları ve ZIP'leri kendiliğinden
silinmez. Kök disk erişilemiyorsa envanter başarısız döner; toplu temizlik yapılmaz.
Önce sürücüyü, yapılandırılmış kökü ve klasörün taşınıp taşınmadığını kontrol edin.

Normal uygulama içi silme, tamamlama makbuzuyla korunan projeyi reddeder. Silmeye
izin verilen projede, artifact kayıtları kaldırılmadan önce sahip olunan merkezi
kök içindeki kayıtlı ZIP yolları ve beklenen hash'leri DB işleminde
`artifact_maintenance` günlüğüne alınır. Fiziksel dosya eksik veya bozuk olsa da
bu yolun kaydı korunur; gerçek içerik hash'i taşıma öncesinde kontrol edilir ve
uyuşmazlık/eksiklik işlemi `pending` bırakır. Kök erişilemiyorsa sahiplik kayıtları
silinerek devam edilmez. Günlük INSERT hatası üst işleme iletilir; proje silme
transaction'ı rollback olur. Kayıt başarılı proje silmesinden sonra da kalır.
DB silme işlemi commit olduktan sonra dosya taşıma denenir; bekleyen işlem
sonraki backend açılışında veya senkronizasyonda kurtarılır.

| Dosya | Karantina |
| --- | --- |
| Merkezi ZIP | `ARTIFACTS_ROOT/.quarantine/<işlem-kimliği>.zip` |
| `PROJECTS_ROOT/<proje-id>.zip` teslim kopyası | `PROJECTS_ROOT/.artifact-quarantine/<işlem-kimliği>.zip` |

Teslim kopyasının SHA-256 özeti kayıtlı artifact ile eşleşmelidir. Her iki taşıma
kendi kaynak kökünde kalır; projects ve artifacts farklı disklerde olabilir.
Günlük `pending`, `quarantined` aşamalarını, kaynak/hedef yolunu, özeti ve hatayı
tutar. Kaynak taşınıp DB güncellemesi yarıda kalırsa kurtarma hedefteki özeti
doğrulayarak ilerler. Hash değişmesi veya koruma kazanılması taşıma işlemini
engeller. Dosyalar kalıcı olarak silinmez; otomatik purge ve otomatik geri yükleme
komutu yoktur. Karantina dizinlerini ve DB günlüğünü birlikte koruyun.

## Envanter ve kontrollü bakım

Komutları depo kökünden çalıştırın. Özel kurulumda backend ile aynı `DB_PATH`,
`PROJECTS_ROOT` ve `ARTIFACTS_ROOT` ortam değişkenlerini sağlayın. CLI backend'in
`.env` dosyasını kendiliğinden yüklemez.

```bash
node backend/scripts/artifact-maintenance.js
```

Varsayılan komut mevcut DB'yi salt okunur açar. Migration uygulamaz, klasör
oluşturmaz, dosya taşımaz. Projeleri, artifact bulunabilirliğini, kayıt dışı ZIP'leri,
mevcut bakım günlüğünü ve uygun yeni adayları JSON olarak raporlar.

Karantina yazımı için:

1. Güncel backend'i bir kez başlatıp migration 16'nın uygulanmasını sağlayın.
2. Backend ve worker'ı durdurun; aynı depoyu kullanan üretim süreci bırakmayın.
3. Envanteri inceleyin ve aşağıdaki komutlardan gerekeni çalıştırın.

```bash
# Uygun tüm yeni saklama ve yetim adayları
node backend/scripts/artifact-maintenance.js --quarantine --offline

# Yeni aday seçimini yalnız kayıt dışı ZIP'lerle sınırla
node backend/scripts/artifact-maintenance.js --quarantine --offline --orphans-only
```

`--offline` servisleri durdurmaz; operatörün durdurduğunu bildirir. CLI DB'de
`running` workflow görürse yazımı reddeder. `--orphans-only` daha önce günlüğe
alınmış bekleyen diğer işlemlerin kurtarılmasını engellemez.

Yeni aday koşulları:

- Kayıtlı `rejected` veya `superseded` ZIP: DB oluşturulma zamanından en az 7 gün
  geçmiş, dosya hash'i doğru, makbuzla korunmuyor, proje kayıtlı ve çalışan/silinen
  durumda değil.
- Kayıt dışı ZIP: dosya değişiklik zamanından en az 24 saat geçmiş ve hiçbir
  workflow çalışmıyor. `.tmp`, sembolik bağlantı ve kök dışındaki dosyalar bu
  kapsamda taşınmaz.
- Mevcut `pending`/`quarantined` kaynaklar yeni aday olarak tekrar eklenmez.

Bu süreler otomatik temizlik takvimi değildir. Senkronizasyon yeni saklama
adaylarını kendiliğinden kuyruğa almaz; yalnız mevcut bekleyen kayıtları tekrar
dener. Taşıma sırasında DB yazma kilidi altında güncel dosya referansları,
makbuzlar, durum, çalışan workflow ve SHA-256 yeniden kontrol edilir. Windows
yol kimliği karşılaştırması büyük/küçük harf farkını normalleştirir.

## İlk incelemede bulunan tarihsel durum

21 Ekim 2026 incelemesinde merkezi depoda 26 ZIP, DB'de 33 artifact kaydı vardı.
Merkezi ZIP'lerin 13'ü DB yoluyla eşleşmiyordu. Adları ve kaynak test kodu,
bunların önceki doğrudan `test_project_state_rehydration.js` çalıştırmalarında
üretilmiş test kalıntıları olduğunu doğruladı. Ortak test yardımcısı yalnız DB'yi
izole ediyor, varsayılan artifact köküne yazılan ZIP'ler geçici DB silindikten
sonra kalıyordu. Yardımcı artık DB/projects/artifacts/trash köklerini birlikte
izole eder; temizliği yalnız kendisine ait geçici dizinde yapar.

20 kayıtlı ZIP'in fiziksel yolu bulunamadı; bunların 5'i tarihsel `verified`
durumundaydı. Kayıtlar güncel merkezi kökü gösteriyordu. `projects`,
`backend/data` ve `.tmp` altındaki kapsamlı ZIP yol aramasında eşleşen alternatif
bulunmadı. Bu inceleme silinme nedenini kanıtlamaz; daha geniş bir yedek veya
başka disk aramasının yerine geçmez. Eksik ZIP'ler bu çalışma ile geri kazanılmış
sayılmaz. Makbuz/kalite geçmişi korunur ve eksik dosya indirilebilir gösterilmez.

Bu sayılar bakım öncesi tarihsel envanterdir; karantina işleminin tamamlandığı
veya bütün testlerin geçtiği iddiası değildir. Güncel durumu CLI raporundan ve
`artifact_maintenance` günlüğünden kontrol edin. Kabul edilmiş otel teslim ZIP'i
bu bakım için açılmaz, çıkarılmaz veya çalıştırılmaz.

## 22 Ekim 2026 uygulanan bakım

Backend ve worker durdurularak bakım öncesi tutarlı DB yedeği, mevcut 26 merkezi
ZIP ve envanter raporu şu yerel dizine alındı:

```text
backend/data/maintenance-backups/2026-10-22-artifact-lifecycle/
  projects.db
  artifacts/
  inventory-before.json
  inventory-after.json
```

Yedek, geçici temizlikten etkilenmemesi için kalıcı veri dizinine taşındı ve
Git dışında tutuluyor. Gerçek proje çıktıları ve DB kayıtları içerdiği için
erişimini sınırlandırın; `.tmp` temizliği bu yedeği silmez.
Yedek DB kullanıcı ve proje verileri içerir; Git'e veya herkese açık bir yere
yüklenmemelidir. Bu paket tüm proje kaynaklarının ya da LLM profilleri ve
şifreleme anahtarlarının tam yedeği değildir.

Bakım sonucunda 18 ZIP karantinaya taşındı: doğrulanan 13 tarihsel test kalıntısı
ve `emlak-yonetim-1` projesinin saklama koşullarını karşılayan 5 eski `rejected`
paketi. Merkezi kökte tümü otel projesine ait 8 ZIP kaldı. İşlem sonu envanterinde
kayıt dışı ZIP sayısı 0, bekleyen işlem 0, hata 0 ve karantinadaki kayıtlı artifact
sayısı 5 idi. Kalıcı ZIP silme uygulanmadı.

Önceden eksik 20 kayıtlı ZIP ve bunların içindeki tarihsel 5 `verified` çıktı
geri kazanılmadı. Bunlar karantinaya alınan 18 dosya ile karıştırılmamalıdır.

Kabul edilmiş otel paketinin merkezi dosyası ve `projects/` altındaki teslim
kopyası aynı SHA-256 özetini korudu:

```text
b209f6f4cb4b0aae6e8274b03a853090fd635828d72bc035919b11611e83eb1a
```

Her iki dosya yalnız hash kontrolünden geçirildi; ZIP açılmadı, çıkarılmadı veya
çalıştırılmadı. Servisler yeniden başlatıldıktan sonra DB şeması 16, backend
readiness hazır, worker hazır ve frontend HTTP 200 olarak gözlendi.

Son doğrulama: frontend'de 118 test ve üretim derlemesi başarılı. Backend'in son
tam koşusunda 146 süit başarılı, 0 başarısız (507,07 saniye). İlk koşuda kalan
sohbet denetim süitinin eski metin ve şema 15 beklentileri yeni envanter mesajı
ve şema 16 ile güncellendi. Günlük yazım hatasında rollback, commit sonrası
yarım taşıma kurtarması, Windows yol harf farkı, aktif üretim, kök erişim hatası,
symlink/junction ve sahiplik değişimi korumaları da bu koşuda doğrulandı.
Docker'a ihtiyaç duyan gerçek cgroup/timeout kontrolleri bu koşuda atlandı;
bu kayıt yeni bir Docker doğrulaması değildir.

Yedek DB ile karşılaştırmada 5 proje, 16 sözleşme, 33 artifact ve 4 tamamlanma
makbuzu korundu. Karantinadaki 18 dosyanın her biri günlükteki SHA-256 ile
eşleşti; kaynak yollarında kopya kalmadı. Canlı eksik 20 dosya geri kazanılmış
sayılmaz; yeniden üretim yeni bir kalite koşusu ve yeni kanıt gerektirir.
