# Python ortamı ve Node/Bun/Chromium ile Docker'sız worker araştırması

30 Eylül 2026. Kapsam: Windows, Linux ve macOS için yerel bağımsız kalite testlerinin Docker olmadan yürütülmesi. Bu belge araştırma sonucudur; worker'ın çalışma altyapısı değiştirilmedi. Admin ve varsayılan kullanıcı bilgilerine dokunulmadı.

## Karar

İşlevsel testlerin Docker olmadan çalışması mümkündür. Mevcut projeye en uygun başlangıç, paketle gelen sabit sürümlü **Node + npm + Playwright + Chromium** ve ayrı bir yerel worker sürecidir. Python veya Bun bu testleri yönetmeye yardımcı olabilir, ancak sırf farklı dil/runtime seçmek güvenlik izolasyonunu sağlamaz.

Bağımsızlık ve izolasyon farklı özelliklerdir: testleri üretilen projeden ayrı, operatöre ait runner yürütebilir; runner aynı kullanıcı hesabıyla kod çalıştırıyorsa kod yine kullanıcının dosya, ağ ve süreç yetkilerine sahip olabilir. İşletim sistemi sandbox'ı veya VM eklenmeden Docker'a eşdeğer izolasyon iddiası yapılamaz.

## 1. Python ve environment

`venv`/`virtualenv`, Python interpreter ve Python bağımlılıklarını ayırır. Python paket sürümlerinin birbirine karışmasını önler. Ayrı kernel, kullanıcı hesabı, dosya sistemi, ağ veya kaynak kotası oluşturmaz. Ortamı aktive etmek çalıştırılan koda daha az işletim sistemi yetkisi vermez.

Python worker şu işleri yapabilir: iş kuyruğu, HTTP/API kontrolleri, dosya/hash kontrolleri, Python projelerinde pytest, subprocess yönetimi ve Playwright ile tarayıcı otomasyonu. Üretilen Node uygulamasının build/backend süreci için ayrıca uygun JavaScript runtime gerekir; Python ortamı Node'u kendiliğinden içine almaz. JavaScript bağımlılıkları da Python `site-packages` içine kurulmuş bağımlılıklara dönüşmez.

Mevcut worker JavaScript'tir. Sadece Docker'ı kaldırmak için Python'a yeniden yazmak ikinci bir dil/runtime, yeni paketleme ve protokol uyumluluğu çalışması getirir. Python projeleri üretme desteği eklenirse işe özel bir venv mantıklıdır; JavaScript worker'ın güvenliğini sağlamak için venv yeterli değildir. Oluşturulmuş venv dizinini başka bilgisayara kopyalamak genel taşınabilir kurulum yöntemi değildir; ortam hedef bilgisayarda kilitlenmiş bağımlılıklardan yeniden oluşturulmalıdır.

Kaynak: [Python venv dokümantasyonu](https://docs.python.org/3/library/venv.html). Güvenlik sınırı olmadığı sonucu, dokümante edilen paket ayrımının kapsamından ve aşağıdaki yerel dosya erişimi deneyinden çıkarılmıştır.

## 2. Node, Bun, Playwright ve Chromium

| Araç | Görevi | Worker'a katkısı | Sağlamadığı özellik |
|---|---|---|---|
| Node | JavaScript runtime | Mevcut worker/backend ve npm araçlarını çalıştırır | Varsayılan olarak kodu host dosya/ağ yetkilerinden izole etmez |
| npm | Paket yöneticisi | Mevcut package-lock ve npm ci protokolünü korur | Paket/script çalıştırmak için OS sandbox oluşturmaz |
| Bun | Runtime, paket yöneticisi, bundler ve test runner | İsteğe bağlı paket kurulumu veya worker yöneticisinin paketlenmesi | Tek başına genel OS güvenlik izolasyonu sağlamaz; Node ile bütün davranışları aynı değildir |
| Playwright + Chromium | Tarayıcı otomasyonu | Gerçek login, rol, form, klavye, görünür sonuç ve mobil kontroller | npm scriptlerini ve backend süreçlerini tarayıcı sandbox'ı içine almaz |

Node'un permission modeli ek korumadır, kötü niyetli kod için güvenlik garantisi olarak tanımlanmamıştır. İncelenen proje sürümü Node 22.23.2'dir; Node 26 dokümanındaki bütün izin seçenekleri bu sürümde varmış gibi kullanılamaz. Native modüller ve alt süreçler gerektiren build zincirlerinin yetkileri ayrıca değerlendirilmelidir. [Node 22.23.2 permissions](https://nodejs.org/download/release/v22.23.2/docs/api/permissions.html)

Bun bazı dependency lifecycle scriptlerini varsayılan olarak engeller ve trustedDependencies politikası sunar. Bu, dependency kurulumuna yönelik korumadır. Sonradan çalıştırılan build/test/backend kodunu host'tan izole etmez. Üretilen package.json içindeki trustedDependencies, worker'ın güven politikası olarak sorgusuz kabul edilmemelidir. [Bun lifecycle politikası](https://bun.com/docs/pm/lifecycle)

Bun ile kurulum yapıp Node ile çalıştırmak mümkündür; yine de package-lock/bun.lock, integrity, registry proxy, native binary ve tekrar üretilebilirlik sözleşmeleri kanıtlanmalıdır. Mevcut worker package-lock üretimi ve npm kurulum komutları kullanır. Bun'a geçiş bu nedenle sadece komut adını değiştirmek değildir. Bu araştırmada dependency kurulum hızı karşılaştırılmadı; ölçülmüş hızlanma oranı yoktur.

Bun `--compile` ile platforma özel bağımsız executable üretmeye yardımcı olabilir. Bu paketleme özelliği izolasyon sağlamaz; Chromium, hedef uygulamanın runtime'ı ve sistem kitaplıklarının dağıtımını ayrıca çözmek gerekir. [Bun executable paketleme](https://bun.com/docs/bundler/executables)

Playwright Windows, Linux ve macOS'ta yerel tarayıcı testlerini destekler. Desteklenen sürümler, doğru browser binary ve Linux sistem kitaplıkları kontrol edilmelidir. Chromium'un browser sandbox'ı backend/Node/Bun süreçlerini korumaz. Mevcut konteyner runner'ının `--no-sandbox` ve süreç bayrakları üretim amaçlı host runner'a aynen taşınmamalıdır. [Playwright platform desteği](https://playwright.dev/docs/intro), [browser bağımlılıkları](https://playwright.dev/docs/browsers)

## Bu bilgisayarda yapılan deneyler

Docker başlatılmadı. Yeni paket kurulmadı. Mevcut Node 22.23.2, Python 3.8.3 ve Bun 1.3.14 kullanıldı.

| Deney | Sonuç | Kanıtın sınırı |
|---|---|---|
| Gerçek venv içinden ortam dışındaki sentetik dosyayı okuma | venv aktif=true, dışarıdaki dosya okundu=true | venv'in dosya erişimini kısıtlamadığını gösterir |
| Normal Node ve Bun süreçlerinden aynı sentetik dosyayı okuma | İkisinde de okundu=true | İzin veya OS sandbox uygulanmayan süreçlerin davranışıdır; bir permission bypass testi değildir |
| `node --test tests/browserRunner.test.js` | 1 başarılı / 0 başarısız, yaklaşık 13.4 saniye | Gerçek Chromium, manager oturumu, form, klavye, mobil görünüm, anonymous denial, yanlış rol ve eksik sonuç kontrolleri; güvenilir fixture |
| `bun test tests/browserRunner.test.js` | 0 başarılı / 1 başarısız, 5 saniyelik runner timeout | Mevcut testin kurulu Bun sürümünde doğrudan geçmediğini gösterir |
| `bun test --timeout 30000 tests/browserRunner.test.js` | 0 başarılı / 1 başarısız, 30 saniyelik runner timeout | İlk başarısızlığın sadece 5 saniyelik varsayılanla açıklanamayacağını gösterir; kesin neden belirlenmedi |

Node tarayıcı denemesinin sandbox içinde ilk başlatılması `spawn EPERM` ile engellendi. Aynı test, host süreç başlatma izniyle tekrar çalıştırılınca geçti; bu harness kısıtı uygulama hatası olarak sayılmadı. Test fixture'ındaki Chromium bayrakları güvenlik izolasyonu kanıtı değildir. Python/Node/Bun dosya deneyi için yalnızca yeni ve rastgele isimli workspace dizinindeki sentetik dosya kullanıldı; deney sonunda dizin temizlendi.

Bun'un resmi güncel uyumluluk belgesi `node:test` için kısmi destek bildirir. Bu bilgi test runner uyumluluğunu ayrıca kanıtlama gereğini destekler; yukarıdaki timeout'un kesin kök nedeni olarak gösterilmez. Güncel belge ile kurulu Bun 1.3.14 aynı sürüm değildir. Bun hiçbir sürümde çalışamaz sonucu çıkarılamaz. [Bun Node uyumluluk belgesi](https://bun.com/docs/runtime/nodejs-compat)

Bu deney bütün üretilen uygulamaların build, native modül, Prisma/veritabanı, API ve tarayıcı testlerinin geçtiğini göstermez. Linux ve macOS bu bilgisayarda fiilen test edilmedi. Bu araştırma deneyi sırasında tam yerel worker entegrasyonu henüz yapılmamıştı; güncel kabul sonucu aşağıdadır.

## Uygulama sonucu — 1 Ekim 2026

Node + npm + Playwright + Chromium seçeneği uygulandı. `npm run dev:local` ile kalite kontrolleri Docker olmadan çalışır; Python veya Bun zorunlu değildir. Windows'ta güncel kaynak testleri 129/129, bağımsız pakette 33 kontrollük akış ve dört gerçek rol yolculuğu geçti. Aktif işte kapanış, geçici dizin temizliği ve iş sonrası paket bütünlüğü doğrulandı. Yukarıdaki araştırma deneyleri uygulama öncesi tarihsel bulgulardır; "henüz yapılmadı" ifadesi o tarihe aittir. Linux/macOS için CI vardır; bu bilgisayarda gerçek platform testi yapılmadı. Paket imzalı dağıtım olarak sunulmaz; SHA256 bütünlük kontrolü ve güvenilen kaynak gerektirir. [Kullanım](LOCAL-WORKER-PACKAGE.md) · [Kanıt ve sınırlar](LOCAL-WORKER-VALIDATION-2026-10-01.md).

## Araştırmada önerilen yerel worker akışı

1. Sürümü sabit, güvenilen kaynaktan edinilen paket, hedef OS ve mimariye uygun Node + npm + Chromium araçlarını sağlar. Bun ilk sürüm için zorunlu değildir. Kullanıcıdan ayrıca global Node/Python kurulumu istenmemesi hedeflenir.
2. Mevcut token, iş kimliği, nonce/hash, deadline, iptal ve job store protokolü korunur. Yerel worker yalnız loopback üzerinde dinler; kullanıcı LLM/SSH/üretim sırları işe aktarılmaz.
3. Her iş ayrı klasör ve geçici test veritabanı kullanır. Operatöre ait doğrulanmış dependency hazırlama, build, API/rol/veri tutarlılığı ve gerçek browser runner süreçleri sırayla çalıştırılır. Arşiv/path sınırları ve registry politikası korunur.
4. Native yürütücü gerçek komut exit code'larını ve bağımsız kanıtları toplar; üretilen projenin “başarılı” metnini tek başına kanıt saymaz. Çıktı/log sınırları, iptal ve süreç ağacı temizliği uygulanır. Native modüller, harici DB ve desteklenmeyen scriptler için açık engel nedeni döner.
5. Güvenilir proje kodu için bütün işlevsel testler yerel süreçlerle yürütülebilir. Bu, Docker'a eşdeğer izolasyon sertifikası değildir. Üretilen kod ve dependency scriptleri için OS sandbox profili kanıtlanmalı veya VM/Docker/uzak izole worker kullanılmalıdır.
6. Panel, işlevsel test sonucunu ve kullanılan izolasyon profilini ayrı gösterir. Mevcut backend kalite/indirme politikası otomatik olarak gevşetilmez. Eksik güvenlik koşulu tam güvenli onay olarak kaydedilmez.

Önceki VM önerisi Docker'a benzer güvenlik ve ortak Linux davranışını hedefliyordu. İşlevsel testleri çalıştırmanın kendisi VM gerektirmez. Hafif yerel kullanım için Node tabanlı native worker uygun araştırma yönüdür; Windows AppContainer/Job Objects, Linux Bubblewrap/cgroups ve macOS sandbox/VM profilleriyle güvenli kullanım ayrıca tamamlanmalıdır.

Docker'sız işlevsel worker ile Docker imajının build/run doğrulaması farklı kapsamlardır. Node, Bun veya Python runtime'ı bir Docker imajını kendiliğinden build edip konteyner olarak çalıştırmaz; bu son kontrol için uygun container/build altyapısı gerekir.

## İlk uygulama kapsamı

Önerilen sıra: Windows'ta Node native runtime prototipi → bağımlılık/build/API/SQLite ve mevcut manager/viewer fixture'larının uçtan uca doğrulanması → iptal/kalan süreç/dosya/ağ güvenlik testleri → Linux/macOS gerçek runner doğrulamaları → paketleme ve kalite paneli bağlantısı. Bun kurulumu/paketleme ayrı optimizasyon çalışmasıdır. Python desteği, Python projeleri üretme ihtiyacına göre ayrı adaptör olarak eklenebilir.

Bu araştırma sonucunda önerilen ana runtime Node'dur. Docker bağımlılığını kaldırmak için Python'a yeniden yazmak veya Bun'a topluca geçirmek gerekli değildir.
