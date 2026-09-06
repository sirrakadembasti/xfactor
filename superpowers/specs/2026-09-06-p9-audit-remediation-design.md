# P9 — Kanıta Dayalı Düzeltme ve İzole Execution Tasarımı

## Durum ve kaynak

Yazılı tasarım kullanıcı tarafından “başla” ile onaylandı. Uygulama ve inceleme durumu bu plana ait SDD ledger'ında tutulur; bu tasarım tamamlanmış kod kanıtı değildir.

- Kullanıcı 2026-09-06 tarihinde hedefli sentez ardından kontrollü düzeltmeyi, yeni güvenlik sözleşmesini ve ayrı execution worker mimarisini seçti.
- Kaynak baseline: `83b29c8a3379d9bccf5b99b98f58a095217fe684` ve özgün çalışma ağacındaki commit edilmemiş uygulama değişiklikleri. Bu bir remote main denetimi değildir.
- İzole dal: `remediation/p9-audit`; worktree: `.worktrees/p9-audit-remediation`.
- Eski P0–P8 belgeleri tarihsel kanıttır; bu tasarımın aşağıda açıkça değiştirdiği davranışlar için otorite değildir.
- Bu belge tasarımdır; görev başına kod, komut ve review paketlerini içeren yürütülebilir plan, yazılı tasarım incelemesinden sonra hazırlanacaktır.

## Amaç

Güvenilmeyen üretilmiş kodu web uygulamasının yetkisinden ayırmak; gerçek bağımlılık kurulumu, build, servis ve tarayıcı doğrulamasından geçen aynı ZIP byte'larını teslim etmek; oturum, checkpoint, lease, UI ve veri bütünlüğü hatalarını gidermek. Tamamlanma iddiaları hazır PASS kayıtlarından değil gerçek davranıştan türetilir.

## Bağlayıcı kararlar

1. `completed` yalnız en güncel onaylı sözleşme, başarılı doğrulama, aynı artefakt kimliği ve kalıcı teslim kaydı ile oluşur. Diskte bulunan bilinmeyen dizin doğrulanmış sayılmaz.
2. Production WebSocket hedefleri yalnız same-origin veya açıkça yapılandırılmış güvenilir origin'lerdir; genel `wss:` izni kaldırılır.
3. Web backend Docker socket'i, daemon kimliği veya daemon yönetim yetkisi almaz. Execution worker ayrı güven sınırıdır.
4. Mevcut kullanıcı verileri otomatik silinmez, topluca yeniden sınıflandırılmaz. Tutarsız tarihsel kayıtlar raporlanır; veri değişiklikleri ayrı açık operasyon gerektirir.
5. Üretilmiş komutlar host üzerinde çalıştırılmaz. Worker veya izolasyon kullanılamıyorsa işlem `BLOCKED` olur; sessiz fallback yoktur.
6. Zorunlu gate; skipped, blocked, eksik veya sentetik kanıtla PASS olamaz. Güvenlik kontrolünü gevşeterek yeşil test elde edilmez.
7. Mevcut Node.js 22.23.2 ve npm 10.9.8 sözleşmesi korunur. Araç zinciri değişikliği gerekiyorsa ayrıca gerekçelendirilir; lockfile testleri gerçek kurulumla yapılır.
8. Mevcut commit edilmemiş altı uygulama dosyası kaybolmaz: codeGenerator, projectRoutes, buildVerifier, packageVerifier, placeholderVerifier, qualityPolicy. Uygulama öncesi izole baseline'a içerikleri/hash'leriyle taşınır; özgün ağaç, graphify silmeleri, kullanıcı DB'leri ve üretilmiş projeler değiştirilmez. Baseline değişiklikleri düzeltme commit'lerinden ayrı kaydedilir.
9. Bir görev tek uygulayıcıyla tamamlanır; bağımsız görev incelemesi gereksinim ve kalite kararlarını birlikte verir. Sonunda bütün dal incelemesi yapılır. Kullanıcı onayı olmadan merge/push yapılmaz.

## Sentez: hata, tasarım tercihi ve kanıt ayrımı

| Kimlik | Kaynak / gözlem | Sınıflandırma ve işlem |
|---|---|---|
| R01 | sandboxRunner varsayılan Windows adapter kullanılamıyor; production image'da bwrap yok | Gerçek entegrasyon boşluğu; worker yolu ve kapasite denetimi |
| R02 | codeGenerator.listProjectTree lockfile dışlıyor ve UTF-8 okuyor; workflow ZIP girdisi bu liste | Paketleme/doğrulama sözleşme hatası; ayrı binary-safe artefakt envanteri |
| R03 | packageVerifier mevcut modül sayısıyla PASS üretiyor, computeDigest tanımsız | Yerel uncommitted değişiklikte çalıştırılarak doğrulandı; cache taklidi kaldırılır |
| R04 | qualityPolicy null adapter wrapper'ı README verifier'a gönderiyor; README build kurulumdan önce | Çalıştırılarak doğrulanan adapter hatası + sıralama kusuru; tek saf gate orchestration |
| R05 | DAG.dependencies Set, workflow ve task spec hash Array bekliyor | Gerçek fonksiyonlarla hash çakışması doğrulandı; tek temsil ve bağımlı dosya hash'i |
| R06 | Lease ISO ve CURRENT_TIMESTAMP karışımı; stale running satırı unique index'i tutuyor | Bellek içi SQL ile format/unique çatışması doğrulandı; atomik edinim ve fencing |
| R07 | Monaco CDN loader ile script-src self çelişiyor | İzole Chromium CSP ihlali doğrulandı; yerel editor/worker bundle |
| R08 | App async action/files/log batch yazımlarında proje kimliği koruması eksik | Çağrı zinciriyle saptandı; proje-scoped request kimliği ve temizleme |
| R09 | API istemcisi önceden abort edilmiş signal'ı aktarmıyor | Yan etkisiz fetch kontrolünde doğrulandı; pre-abort ve listener lifecycle |
| R10 | Parola reset/renew session iptal etmiyor | Kaynakla doğrulandı; atomik password+revocation, WS erişimi kesilir |
| R11 | MFA enrollment/recovery kullanıcı akışı yok; TOTP replay kaydı yok | Enrollment eski P5'te kapsam dışıydı, auth bypass değildir. Replay engeli bu güvenlik düzeltmesine dahildir; yeni enrollment/recovery ürünü ayrı kapsam olarak kaydedilir |
| R12 | Loopback rate-limit muafiyeti | Proxy koşuluna bağlı; tüm proxied kullanıcılar muaf iddiası yanlıştır. Muafiyet kaldırılır, doğru/yanlış forwarded-header senaryoları test edilir |
| R13 | Service ağı bridge/share-net, bwrap kaynak sınırları yok, output sınırsız, abort eksik | Worker network/resource/output/iptal sözleşmesiyle çözülür |
| R14 | Silme: durum ve disk rename DB transaction öncesinde; rollback geri taşımıyor | Veri bütünlüğü hatası; dayanıklı silme intent'i ve telafi/kurtarma |
| R15 | Reconciliation bilinmeyen dizini completed yapıyor | Eski P7 planı bunu açıkça emrediyordu. Kullanıcı yeni sözleşmeyi seçti; yalnız yeni import davranışı değiştirilir |
| R16 | Log retention timestamp sütunu yok, hata yutuluyor, scheduler çağrısı yok | SQL hatası doğrulandı; gerçek retention ve gözlenebilir hata |
| R17 | db.js legacy state/delete yolu ve import sırasında migration/recovery | Tek persistence authority + açık initialization lifecycle |
| R18 | Frontend binary API encoding alanını kullanmıyor; total-byte sınırı bir dosya aşılabiliyor | API/UI sözleşmesi ve gerçek byte limitleri düzeltilir |
| R19 | Audit root/frontend 0, backend 3 moderate qs/express/body-parser kaydı | Advisory var, remote exploit kanıtlanmadı; uyumlu kilitli güncelleme ve tekrar audit |
| R20 | Global dns.lookup override ve hard-coded fallback DNS | Ağ politikası sürprizi; varsayılan sistem resolver, gerekirse açık opt-in yapılandırma |
| R21 | Runner 102 test dosyasından 40'ını doğrudan listeliyor | 62 dosyanın listelenmemesi 62 davranışın testsiz olması değildir. Suite envanteri ve koşul/skip gerekçeleri açık olur |
| R22 | Production smoke fixture PASS kayıtlarını elle oluşturuyor | Geçerli servis yüzeyi testi; gerçek üretim kanıtı değildir. Gerçek worker pipeline senaryosu eklenir |
| R23 | JWT/session/sandbox/complete/test iddiaları belgelerle uyuşmuyor | Davranış doğrulandıktan sonra belgeler kaynakla eşlenir |
| R24 | Backup/restore genel öneri; aktif workflow drain sınırlı | Tutarlı backup/restore prosedürü, restore smoke ve sınırları belirli shutdown |

Önceki alt incelemelerdeki yanlış genellemeler taşınmayacak: safe extraction ve gerçek Docker cgroup testleri vardır; invalidated checkpoint'leri reddeden kontrol vardır; mevcut strict download gate yalnız proje status alanına güvenmez. Ham subagent gözlemleri final bulgu değildir.

## Mimari seçenekler ve seçilen yaklaşım

- Yalnız lokal yamalar: küçük değişiklik, fakat web/daemon yetki paylaşımını ve runtime dağıtım boşluğunu çözmez.
- Backend'e Docker socket bağlamak: basit deployment, fakat internetten erişilen kontrol düzlemine daemon yetkisi verir. Kullanıcı bu seçeneği seçmedi.
- Ayrı execution worker: ek deployment bileşeni; görev aktarımı, iptal ve evidence için açık sözleşme gerekir. Kullanıcının seçimi budur. Redis/Kubernetes veya çok düğümlü platform dönüşümü gerektirmez.

### Kontrol düzlemi

Mevcut Express/React uygulaması kullanıcı/session/project yetkilendirmesini, onaylı contract'ı, revision'ı, job ownership'ini, kalıcı verification run/check/receipt kayıtlarını ve indirmeyi yönetir. Kullanıcı istekleri Docker komutu, host path, image adı veya daemon parametresi gönderemez. Backend worker sonuçlarını job/contract/artifact kimlikleriyle eşleştirir; worker yanıtı doğrudan completed state yazma izni değildir.

### Execution düzlemi

Ayrı worker yalnız private bağlantıda erişilir. Production bağlantısı TLS doğrulamalı ve ayrı servis kimliğiyle authenticated olur; kullanıcı session cookie'si worker kimliği yerine geçmez. Worker credential'ı generated-code ortamına aktarılmaz. Worker'ın platform DB'sine, web secrets dizinine veya kullanıcı proje mount'una erişimi yoktur. İş girdisi boyut sınırlı içerik + SHA-256 + sabit operation/contract bilgisiyle taşınır; host path referansı kabul edilmez.

Worker'ın daemon'ı da güven sınırının parçasıdır: web uygulamasının çalıştığı host'un rootful daemon'ını paylaşmak tam ayrım sayılmaz. Production'da worker'a ayrılmış execution host/VM veya eşdeğer izole daemon gerekir. Windows/Docker Desktop yerel kullanımında bu sınır ve VM/daemon sahipliği belgelenir; yerel düzen production izolasyonu diye sunulmaz.

### İş türleri ve kanıt

Dar iş türleri: bağımlılık hazırlama ve artefakt doğrulama. Genel amaçlı shell HTTP endpoint'i yoktur. Üretilmiş manifest/package komutları güvenilmeyen girdi olarak yalnız sandbox içinde çalışır. Üretim sırasındaki statik analiz web sürecinde yapılabilir; üretilmiş program çalıştıran her eski yol worker'a taşınır.

- Bağımlılık hazırlama, paket manifestinden gerçek araç zinciriyle lockfile üretme/doğrulamayı yapar; lifecycle scripts kapalıdır. Backend yalnız beklenen lockfile çıktısını ve doğrulanmış içeriğini kabul eder, rastgele dosya yazma talimatı kabul etmez.
- Teslim ZIP'i oluşturulurken gerçek lockfile dahil edilir. Final verification bu ZIP'i yeniden açar; npm projelerinde `npm ci --ignore-scripts` kullanılır. Eksik/uyumsuz lockfile final verification sırasında onarılmaz.
- Mevcut modül sayısı, package-lock metin araması veya cache varlığı tek başına kurulum kanıtı değildir. Cache kullanılırsa lock digest, toolchain ve içerik bütünlüğüne bağlıdır; cache miss gerçek kuruluma gider.
- Kurulum ağ erişimi yalnız onaylı registry/proxy içindir. Build/test/service aşamalarına genel dış ağ veya host/LAN erişimi verilmez. Manifestteki servisler aynı işe ait izole ağda konuşabilir; health/browser prober bu sınır içinde yer alır.
- CPU 2.0, RAM 1 GiB, swap toplamı 1 GiB, PID 100 mevcut sınırları korunur. `/tmp` 64 MiB sınırı workspace kotası diye sunulmaz. Job workspace kapasitesi ayrıca sınırlandırılır; stdout/stderr akışları sabit byte tavanıyla yakalanır ve kesilme metadatası taşır.
- İptal/deadline bütün child/container/service kaynaklarını sonlandırır. Backend iptali worker tarafından onaylanmadığında tamamlanmış kabul edilmez; expired/cancelled job sonucu receipt üretemez.
- Worker sonuçları gerçek başlangıç/bitiş, exit code, stdout/stderr digest, gate producer, toolchain ve input artifact digest içerir. Parent bunları en güncel contract/revision ve job nonce ile doğrular. Geç gelen/başka işe ait sonuç reddedilir.
- Tek authoritative verification run kimliği kullanılır; iç içe checksiz verified run oluşturulmaz.

## Artefakt ve veri sözleşmesi

IDE dosya listesi teslim paketinin otoritesi değildir. Paketleme binary buffer'ları korur, lockfile dahil eder, normalize edilmiş relative path ve symlink sınırlarını uygular. Gerekli dosya limit nedeniyle sığmıyorsa sessiz eksik ZIP yerine açık hata verir. Artefakt temp dosyaya yazılıp atomik yayımlanır; DB/file işlemi yarım kalırsa idempotent recovery/orphan cleanup yalnız sahip olunan artefakta uygulanır.

Proje silmede durable intent önce kaydedilir; çalışma durdurulur, dizin taşınır, DB silme commit edilir ve trash temizlenir. Her aşama tekrar çalıştırılabilir. Commit öncesi hata mevcut state/path'i korur veya belgelenmiş kurtarılabilir intent bırakır; receipt yarışı sonradan proje dizinini kaybettiremez. Receipt kontrolünü aşan legacy delete yolu kaldırılır.

Bilinmeyen disk dizinleri doğrulanmamış olarak operatöre raporlanır veya mevcut güvenli başlangıç durumuyla içe alınır; yeni bir completed shortcut oluşturulmaz. Tarihsel completed kayıtlar için yalnız tutarsızlık raporu üretilir.

DB açma/migration/recovery server ve CLI başlangıcında açıkça çağrılır; yardımcı modül import'u live DB oluşturmaz. Tek canonical repository state transitions/CAS uygular. Lease tarihleri tek UTC temsilindedir; stale termination ve acquire transaction içinde yapılır. Owner/attempt fencing olmadan heartbeat veya final state kabul edilmez.

## Authentication ve frontend sözleşmesi

Parola yenileme/reset, hash güncellemesi ve bütün session iptalini tek transaction içinde yapar. Yanlış mevcut parola hiçbir değişiklik yapmaz. HTTP ve WebSocket sonraki yetkili işlemde erişimi reddeder; mümkün olan yerel socket'ler hemen kapatılır. TOTP'nin tüketilmiş time-step'i transaction/CAS ile tutulur; iki eşzamanlı replay session üretemez. MFA enrollment/recovery için yeni ürün akışı bu hataların düzeltilmesiyle karıştırılmaz; mevcut eksiklik açıkça belgelenir.

Monaco ve worker kaynakları Vite bundle/same-origin üzerinden sunulur; CDN izni açarak CSP gevşetilmez. Her asenkron proje yanıtı request/project kimliğiyle eşleşmeden state'e yazılmaz. Project switch/logout; pending log batch, dosyalar, activeFile ve ilgili in-flight işleri temizler. Abort edilen çağrılar tekrar gönderilmez; listener'lar tamamlanmada kaldırılır. Binary içerik metin editörüne verilmez; desteklenen görseller güvenli preview, diğer binary dosyalar açık binary durumuyla gösterilir.

## Uygulama dilimleri ve bağımlılık sırası

1. Baseline/provenance ve mevcut test izolasyonunun güvenilirliği. Kullanıcı verisi çalıştırma dışında kalır.
2. Worker transport/job yaşam döngüsü, kapasite/kimlik denetimi ve fail-closed backend client.
3. Worker sandbox ağ, kaynak, output ve iptal sınırları; gerçek local Docker proof.
4. Saf verification orchestration, gerçek dependency install ve README/build sırası; mevcut generated execution caller'larının worker'a taşınması.
5. Binary-safe artefakt envanteri, lockfile, tek run kimliği, temiz odadan receipt'e gerçek yol.
6. DAG spec/input hash ve lease/fencing düzeltmeleri.
7. Parola/session/TOTP replay/rate-limit düzeltmeleri.
8. Yerel Monaco, proje-scoped async state, API abort ve binary dosya görünümü.
9. Canonical persistence, explicit initialization, silme recovery, reconciliation ve retention.
10. Bağımlılık/DNS/operasyon düzeltmeleri; test envanteri, CI ve gerçek production senaryosu.
11. Restore/shutdown proof, doküman sentezi ve bütün dal bağımsız incelemesi.

Bunlar iş sırası gruplarıdır; her birinin bağımsız reddedilebilir, somut dosya/API/test kapsamlı görevleri yürütülebilir planda ayrılır. Hiçbir yüksek risk maddesi sessizce ertelenmez. Yeni ürün kapsamı olan MFA enrollment/recovery ve yatay cluster dönüşümü ayrı olarak adlandırılır; mevcut güvenlik iddiasıyla gizlenmez.

## Kabul ve doğrulama

- Kullanıcı DB/proje kökleriyle test çalıştırılmaz. Her entegrasyon testi DB, projects, artifacts ve worker jobs için izole fixture kullanır.
- Hata düzeltmelerinin tekrar üretimi önce mevcut kaynakta başarısız, sonra düzeltilmiş davranışta başarılı olur; gereksiz metin/plumbing assertion'ları yerine tüketici davranışı sınanır.
- Artefakt: npm lockfile + binary görsel içeren kaynak ZIP'e girer; extract sonrası SHA-256 aynıdır; eksik lockfile, tamper, stale contract, yanlış run ve iptal edilmiş job indirilemez/tamamlanamaz.
- Worker: yok/yanlış kimlik/kötü TLS/başka job sonucu reddedilir; generated code platform DB/secret/daemon socket/host-LAN'a erişemez; kurulum registry erişimi build ağını açmaz; deadline/abort sonunda kaynaklar temizlenir.
- DAG: yalnız dependency identity veya upstream file bytes değişince downstream checkpoint geçersiz olur; ilgisiz değişiklik çalışmayı gereksiz yeniden başlatmaz.
- Lease: karışık tarih biçimi migration/read normalization ile ele alınır; taze heartbeat korunur; stale lease atomik geri alınır; eski worker yeni attempt'i bitiremez.
- Auth: reset öncesi session reset sonrası reddedilir; TOTP replay iki session üretmez; proxy arkasında dış istemci loopback muafiyeti kazanmaz.
- UI: production CSP altında gerçek Monaco editor görünür; A'nın geciken cevap/log/dosyaları B'ye yazılmaz; logout sonrası eski cevap auth/state'i geri getiremez.
- Data: her silme failure noktasından kurtarma; receipt yarışı; missing disk DB satırını silmeme; gerçek eski log satırı temizleme; import'un DB dosyası oluşturmaması.
- CI: her test dosyası ya çalışır ya açık kategori/gerekçeyle envanterde yer alır; sessiz atlama yok. Runner üst seviye hatası nonzero çıkar. Surface smoke testi korunur ama gerçek pipeline testi yerine sunulmaz.
- Tam deterministik pipeline proof, hazırlanmış PASS DB kayıtları kullanmadan gerçek worker kurulum/build/service/browser kontrollerini çalıştırır. LLM'e bağımlı tam üretim ayrıca gerçek sağlayıcıyla izole örnek proje üzerinde gözlenir; credential/harcama izni yoksa bu engel açıkça raporlanır ve deterministik fixture LLM kanıtı diye sunulmaz.
- Restore edilen yedekte DB, projeler ve artefakt kimlikleri tutarlıdır; receipt-linked indirme korunur. Shutdown çalışan işi tamamlandı diye kaybetmez.
- Her görev: uygulayıcı raporu + ayrı gereksinim/kalite incelemesi. Final: bütün dal diff incelemesi ve kalan bulgular için açık karar. Merge/push ayrı kullanıcı kararıdır.

## Tasarım incelemesi

- Kullanıcı tarafından seçilen iki karar açıkça işlendi: yeni güvenlik sözleşmesi ve ayrı worker.
- Eski planın completed/WSS talimatlarıyla çelişki açıkça supersede edildi; geçmiş kanıtlar yeniden yazılmıyor.
- Kaynak hatası ile tarihsel tasarım tercihi ve koşullu risk ayrıldı.
- Worker'a host daemon paylaşarak sahte izolasyon sağlanması dışlandı.
- Kullanıcı verisi ve dirty baseline korunması tanımlandı.
- Bu belgede kod uygulanmış, testler geçmiş veya production hazır iddiası yoktur.
