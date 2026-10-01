# Windows, Linux ve macOS için Docker'sız worker önerisi

Durum: araştırma ve tasarım önerisi; uygulama koduna henüz eklenmedi. Hedef, repoyu indiren kişinin ayrı sunucu kurmadan bağımsız kalite kontrollerini yerel bilgisayarda çalıştırabilmesidir. Mevcut Docker yürütücüsü çalışmaya devam eder. Admin girişi ve varsayılan kullanıcı bilgileri bu kapsamda değiştirilmez.

## Sonuç

Docker worker'ın kendisi değildir; mevcut worker'ın güvenli çalıştırma altyapısıdır. Bu altyapı değiştirilebilir. Node/npm/Chromium'u bilgisayarda bir script ile başlatmak tek başına aynı güvenlik sınırını sağlamaz. Üretilen proje, bağımlılıkları ve test scriptleri kullanıcının dosyalarına, anahtarlarına, ağına ve diğer süreçlerine erişememelidir.

Öneri: worker protokolünü koruyup yürütme altyapısını değiştirilebilir yapmak; Docker'sız tam testler için iş süresince açılan, paketle gelen küçük bir Linux VM kullanmak. Windows, Linux ve macOS aynı Linux test ortamını kullanır. Docker Desktop, Docker Engine, WSL dağıtımı veya sürekli açık bir servis gerekmez. Bunun karşılığında bilgisayarda desteklenen sanallaştırma altyapısı gerekir. Bu VM çözümü de kaynak tüketir; performans ve RAM tasarrufu ancak prototip ölçümüyle söylenebilir.

Sanallaştırma kullanılamayan bilgisayarlar için işletim sisteminin kendi sandbox'ına dayanan ikinci yöntem araştırılmalıdır. Güvenliği kanıtlanana kadar bu yöntem tam doğrulamaya eşdeğer sayılmaz. Hiçbir güvenli yürütme yöntemi kullanılamıyorsa statik kontroller çalışır; çalıştırılamayan testler başarılı gösterilmez. Böylece bütün desteklenen sistemlerde uygulama açılabilir; bütün bilgisayarlarda koşulsuz tam test sözü verilmez.

## Mevcut koda bağlantı

- `backend/executionClient.js`: `prepare_dependencies`, `verify_artifact`, iptal ve `/readyz` üzerinden yetenek sorgulama zaten var. Uzak adresler için HTTPS, yerel worker için loopback kullanılıyor.
- `execution/server.js`: token doğrulaması, iş kuyruğu, deadline, iptal ve sonuç kaydı yürütmeden ayrılmış durumda.
- `execution/runtime.js`: Docker komutları, imaj kontrolü, ağ, dosya ve kaynak sınırları burada yoğunlaşıyor. Yeni yürütücünün ana bağlantı noktası burasıdır.
- `execution/jobExecutor.js` ve `execution/browserRunner.cjs`: bağımlılık hazırlama ve gerçek tarayıcı kontrolleri yeni runtime'ın içinde çalıştırılabilir. Mevcut Chromium flags doğrudan host üzerindeki bir tarayıcıya kopyalanmamalıdır; konteyner güvenlik sınırına göre seçilmişlerdir.
- Mevcut iş kimliği, nonce, input SHA-256, contract hash ve revision bağları korunur. Yeni altyapı daha zayıf bir doğrulama sonucuyla artifact indirme kapısını açmaz.

## Üç yaklaşımın karşılaştırması

| Yöntem | Kullanıcı kurulumu | Tam uygulama testleri | Temel sınır |
|---|---|---|---|
| İş süresince açılan taşınabilir Linux VM — önerilen ortak runtime | İmzalı worker paketi; gerektiğinde işletim sistemi sanallaştırma özelliği | Node, native npm bağımlılıkları, SQLite/Prisma, servisler ve Chromium aynı Linux ortamında | Sanallaştırma kapalı, erişim yasak veya bellek yetersiz olabilir |
| Her işletim sisteminin yerel sandbox'ı | Paketlenmiş Node/Chromium ve platforma özel güvenlik yardımcıları | Platform uyumluluğu ve izolasyon testleri geçerse | Windows/Linux/macOS için ayrı güvenlik tasarımı; ağ ve kaynak sınırları aynı değildir |
| Script, Node izinleri veya WASM ile sınırlandırılmış kontrol | En az kurulum | Statik analiz ve bazı saf mantık testleri | Genel npm scriptleri, backend, native modüller ve gerçek tarayıcı testlerinin güvenli eşdeğeri değildir |

Docker'ın yerine Podman kurdurmak da bütün bilgisayar sorununu çözmez: Windows/macOS'ta yine Linux VM altyapısı gerekir. Uzak worker mevcut protokolle mümkündür, ancak bu önerinin yerel çalışma hedefinin yerine geçmez; sadece isteğe bağlı destek yoludur.

## Kullanıcının izleyeceği akış

1. Repoyu açar ve XFactor'ı başlatır. Uygulama worker platformunu ve mimarisini tespit eder.
2. İlk kullanımda uygun imzalı worker paketi, runtime imajı ve sürüm manifesti HTTPS üzerinden indirilir; hash ve imza doğrulanır. Kullanıcıya indirme boyutu ve gerekli disk alanı gösterilir. Tamamen çevrimdışı kurulum için aynı paket ayrı bir arşiv olarak sunulur.
3. Tanılama Node kurulu mu sorusuyla yetinmez: sanallaştırmaya erişim, iş dizini sınırı, ağ engelleme, süreç ağacı kapatma ve kaynak sınırlarını zararsız kendi kendine testlerle doğrular.
4. Kalite kontrol başlatılınca yalnızca o işe ait runtime açılır. Backend işi mevcut worker API'sine gönderir. Kullanıcı ayrıca Docker veya terminal komutlarıyla uğraşmaz.
5. Gerçek build, uygulama servisi, API/rol/veri tutarlılığı ve Chromium testleri çalışır. Panel aşama, hata ve çalıştırılamayan testleri gösterir.
6. Başarı, hata, iptal ve deadline sonunda runtime ve bütün çocuk süreçleri kapatılır; sadece sınırlandırılmış rapor ve gerekli kanıtlar alınır. İş dizini temizlenir; başka projeye ait dosyalar silinmez.

Buradaki otomatik kurulum ve yeni panel davranışları öneridir; mevcut sürüm bunları sağlamaz.

## Taşınabilir VM tasarımı

### Paket ve platform

İmzalı host yöneticisi + sabit sürümlü QEMU veya uygun platform sanallaştırma yardımcı programı + salt okunur Linux taban disk + worker araçları. Node/npm, Chromium, gerekli işletim sistemi kitaplıkları ve desteklenen native modüller guest içinde bulunur. Lisans bildirimleri, SBOM, sürüm manifesti ve güvenlik güncelleme mekanizması paket kapsamındadır.

| Host | İlk araştırılacak hızlandırıcı | Kurulum engeli |
|---|---|---|
| Windows x64 | Windows Hypervisor Platform / WHPX | BIOS sanallaştırması veya Windows özelliği kapalıysa açmak yönetici yetkisi ve yeniden başlatma gerektirebilir |
| Linux x64/arm64 | KVM | `/dev/kvm` erişimi ve dağıtım politikası |
| macOS Intel / Apple Silicon | Hypervisor Framework / HVF | İmzalama, entitlement ve host/guest mimari uyumu |

Windows ARM64 ilk sürüm için ayrıca doğrulanacak kapsamdır; x64 paketin emülasyonla çalışması destek kanıtı sayılmaz. Test edilmemiş OS sürümü ve mimari destekleniyor diye ilan edilmez.

Kritik sınır: QEMU'nun TCG yazılım emülasyonu, resmi güvenlik politikasında güvenlik izolasyonu garantisi veren yol değildir. Sanallaştırma yokken TCG'ye sessiz geçiş yapılıp tam güvenli test sonucu üretilemez. Seçilecek yayın sürümünün hızlandırıcı, machine ve device güvenlik desteği ayrı doğrulanmalıdır; geliştirme dokümanındaki bir seçenek yayın sürümünde var kabul edilmez.

### Dosyalar ve iletişim

- Host home dizini, proje kökü, Docker soketi, SSH agent, clipboard ve kullanıcı kimlik bilgileri guest'e bağlanmaz.
- Proje arşivi limitli IPC üzerinden aktarılır; path traversal, symlink, arşiv bombası ve toplam açılmış boyut sınırları korunur.
- Her iş ayrı yazılabilir disk/çalışma alanı kullanır; taban disk değişmez. Host'ta yalnızca bu işin doğrulanmış mutlak dizinine erişilir.
- Guest'te uygulama ve tarayıcı localhost üzerinden konuşur. Test kullanıcısı yetkisizdir; host worker tokenı ve LLM anahtarları guest'e verilmez. Yalnızca işe özel sentetik rol kimlik bilgileri kullanılır.
- Guest dış ağı varsayılan olarak kapalıdır. Guest yönetim konsolu uygulama koduna açılmaz. Sonuç kanalı uzunluk sınırı, iş kimliği ve schema doğrulamasıyla işlenir; guest çıktısı komut olarak çalıştırılmaz.

### Bağımlılıklar

İlk kurulum ve yeni bağımlılıklar için internet gerekir. Sonraki işler, eksiksiz doğrulanmış cache varsa çevrimdışı çalışabilir. Cache yokken çevrimdışı tam build garantisi verilmez.

Mevcut registry kısıtlarını koruyan güvenilir bir broker yalnızca izin verilen registry kaynaklarından paket indirir; redirect/DNS hedeflerini ve lockfile integrity değerlerini doğrular. Proje koduna genel host ağı açılmaz. Paket scriptleri host üzerinde çalıştırılmaz. Native kurulum veya build adımları gerekiyorsa izole guest içinde, izin politikasıyla yürütülür. Git URL, harici binary indirimi ve özel registry gerektiren bağımlılıklar açıkça desteklenmiyorsa engel sebebi raporlanır.

### Kaynaklar ve kapanış

VM için ayrılan RAM yalnız başına host süreç tüketimine üst sınır değildir. Host yöneticisi de platforma uygun süreç/bellek kısıtlarıyla çalıştırılmalıdır. Guest içinde ayrıca CPU/RAM/PID/disk ve iş deadline sınırları uygulanır. Tek aktif iş ilk sürüm varsayımıdır.

Hafif kontroller ve tam uygulama için ayrı kaynak profilleri kullanılabilir; mevcut runtime'ın bazı tam uygulama işleri 4 GiB istemektedir. 8 GB bilgisayarda her tam uygulamayı 1 GiB ile test edebiliriz varsayımı yapılmaz. Bellek yetmiyorsa test timeout'u uygulama hatası gibi sunulmaz: altyapı kapasitesi yetersiz olarak raporlanır. İş bitişinden sonra arka planda VM bırakılmaz.

## Sanallaştırma kullanılamıyorsa yerel sandbox araştırması

### Windows

AppContainer/LPAC ile dosya ve yetki erişimini sınırlandıran native yardımcı; Job Objects ile süreç ağacı, kaynak limitleri ve toplu kapatma. Sadece bu işe ait klasör ACL'si açılır. Ağ ve localhost iletişimi ayrıca doğrulanır; loopback istisnası gerekiyorsa bu otomatik olarak güvenli/no-admin çözüm sayılmaz. Paketlenmiş Node ve Chromium'un bu profil altında gerçek projeyi çalıştırabilmesi prototip koşuludur.

### Linux

Bubblewrap, user/mount/PID/network namespaces, seccomp ve desteklenen cgroup limitleri. Unprivileged user namespaces bazı dağıtımlarda kapalı olabilir; cgroup delegasyonu ve AppArmor politikası değişebilir. Sadece `bwrap` binary'sinin varlığı readiness için yeterli değildir.

### macOS

İmzalı App Sandbox yardımcı ve doğru sandbox inheritance; Node/Chromium çocuk süreçleri için gerçek imzalama ve çalıştırma deneyleri. Ağ client entitlement'ı tek başına hedef bazlı dış ağ allowlist'i sağlamaz. Genel ağ yetkisini açarak tam izolasyon sağlandı denemez. Kaynak sınırı, süreç ağacı ve localhost/dış ağ ayrımı prototipte çözülemezse macOS için VM yolu gerekir. Kullanımdan kalkmış `sandbox-exec` temel üretim altyapısı yapılmaz.

Üç sistemde de `node:vm`, `child_process`, geçici klasör veya yalnız Node permission flags kötü niyetli proje koduna karşı yeterli güvenlik sınırı kabul edilmez.

## Kalite paneli ve sonuç güvenilirliği

Önerilen genişletilmiş readiness bilgisi: runtime tipi/sürümü, OS/mimari, gerçek izolasyon yetenekleri, kaynak kapasitesi, eksik koşullar ve çalıştırılabilir test grupları. Alan isimleri uygulama planında mevcut schema ile uyumlu kesinleştirilir; burada yeni endpoint varmış gibi davranılmaz.

- **Tam doğrulama:** gerekli bütün gruplar gerçek runtime'da yürüdü ve geçti.
- **Test başarısız:** koşullar sağlandı, uygulama/test beklentisi başarısız oldu.
- **Altyapı engeli:** güvenli runtime, kaynak veya bağımlılık bulunamadı; proje test edildi diye gösterilmez.
- **Kısmi kontrol:** statik kontroller geçti; build/API/tarayıcı gibi gerekli kontroller çalışmadı.
- **İptal / süre aşımı:** kanıtlar korunur, bütün süreçler kapatılır; başarı üretilmez.

Backend kalite politikası tam doğrulamayı gerekli tuttuğu sürece kısmi kontrol indirme/üretim onayına dönüştürülmez. UI rengi veya frontend ifadesi tek başına güvenlik kapısı değildir.

## Kabul testleri

| Grup | Zorunlu kanıt |
|---|---|
| Fonksiyon | Bağımlılık hazırlama, gerçek build, API ve veritabanı, manager/viewer yetki kontrolleri, Chromium etkileşimleri |
| Dosya | Host home/SSH/config okunamaz; iş dışına yazılamaz; arşiv ve symlink kaçışı reddedilir |
| Ağ | İnternet, LAN, metadata IP, DNS/redirect kaçışı ve host servisleri engellenir; guest içi gerekli localhost çalışır |
| Kaynak | Bellek/CPU/PID/disk/log taşması sınırlandırılır; host kullanılabilir kalır |
| Lifecycle | İptal, deadline, worker çökmesi ve uygulama kapanışı sonrasında çocuk süreç/VM kalmaz |
| Kanıt | Sahte başarı, başka işin nonce/hash'i, eksik gerçek testler ve eski rapor reddedilir |
| Dağıtım | Normal kullanıcı, imza/hash bozulması, eksik sanallaştırma, çevrimdışı eksik cache ve düşük disk senaryoları |
| Platform | Windows x64, Linux x64/arm64, macOS Intel/Apple Silicon gerçek makinelerde ayrı sonuçlar |

Mevcut Docker testlerinin yalnızca mock ile yeni adaptöre taşınması yeterli değildir. Bu bilgisayardaki Windows testleri Linux/macOS başarı kanıtı sayılmaz; diğer platformlar için gerçek cihaz veya uygun CI runner gerekir.

## Uygulama sırası

1. İlk prototip: Windows'ta VM hızlandırıcı erişimi, sentetik Node/Chromium projesi, ağsız iletişim, iptal ve host dosyalarına erişim reddi. Mevcut Docker worker ile aynı fixture sonuçlarını karşılaştır; süre ve tepe RAM ölç.
2. Runtime arayüzünü mevcut yürütmeden ayır: readiness, iş başlatma, komut çalıştırma, dosya aktarımı ve kapanış. Docker adaptörünü geri dönüş seçeneği olarak koru.
3. Aynı VM prototipini Linux KVM ve macOS HVF üzerinde kanıtla; mimari paketlerini üret.
4. İmzalı dağıtım, cache/broker, kendi kendine tanılama ve kalite panelindeki açık engel nedenlerini tamamla.
5. Sanallaştırmasız native sandbox prototiplerini platform başına değerlendir. Yalnız güvenlik ve fonksiyon kabul testleri geçen profil tam doğrulama sağlayabilir.

Bu sıra önce en zor varsayımı test eder. Üç platform prototipi ve güvenlik kapıları geçmeden Docker bağımlılığı varsayılan kurulumdan kaldırılmaz. Docker'sız worker testleri ile üretilen uygulamanın Docker imajının build/run testleri farklı kapsamlardır: Docker imajı doğrulamak için ayrıca erişilebilir bir Docker/uyumlu build ve container runtime gerekir.

## Birincil kaynaklar

- [QEMU güvenlik politikası: hızlandırıcı, TCG ve host kaynak sınırları](https://www.qemu.org/docs/master/system/security.html)
- [QEMU platform ve hızlandırıcı matrisi](https://www.qemu.org/docs/master/system/introduction.html)
- [Microsoft AppContainer izolasyonu](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation)
- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [Bubblewrap proje dokümantasyonu](https://github.com/containers/bubblewrap)
- [Apple App Sandbox ve inheritance](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html)
- [Apple ağ client entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.network.client)
- [Node permission modelinin güvenlik kapsamı](https://nodejs.org/api/permissions.html)
- [Node VM güvenlik sınırı değildir](https://nodejs.org/api/vm.html)
