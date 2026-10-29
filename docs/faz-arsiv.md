# XFactor Faz Arşivi — Geçmişten Günümüze Geliştirme Zinciri

Derleme tarihi: **30 Ekim 2026**. Son incelenen commit: **`b3d7403` — 29 Ekim 2026**.

Bu dosya geçmiş  mimari yol haritası ve kapanış raporlarını tek kronolojik anlatıda birleştirir. Git geçmişi tarihleri ve entegrasyon sırasını destekler. Aynı işin farklı belgelerdeki tekrarları tek halkada toplanmıştır.

**Okuma kuralı:** Plan hedefi, uygulanmış değişiklik ve doğrulanmış teslim birbirinden ayrıdır. Buradaki sayılar tarihsel raporlardan aktarılmıştır; bu dosya oluşturulurken tüm platform testleri yeniden çalıştırılmış değildir. Arşiv metinlerindeki görev/onay/commit talimatları tarihsel bağlamdır, yeni çalışma emri değildir. Güncel kullanım için [kullanıcı kılavuzuna](../kullanici-kilavuzu.md) bakın.

## 1. Zincirin tamamı

**Başlangıç → P0-A → P0-B → P0-C → P1-A → P1-B → P1-C → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → gerçek proje denemeleri → yerel worker ve kurtarma → Ekim Faz 1 → Faz 2 → Faz 3 → Faz 4 → ana dala entegrasyon → belge birleştirmeleri.**

Bu bir tarihsel gelişim sırasıdır; bütün teknik bağımlılıkların doğrusal olduğunu ifade etmez. Örneğin ilk master planda P0-C, P0-A'ya; P1-C ise P0-B, P0-C ve P1-B'ye dayanır.

| Sıra | Tarih / dönem | Halka | Eklenen veya güçlendirilen yetenek |
| ---: | --- | --- | --- |
| 1 | 28–29 Ağustos 2026 | Başlangıç ve süreklilik | Ön temel, plan/kanıt defteri ve aşamalı yürütme düzeni |
| 2 | 30 Ağustos | P0-A | Durum makinesi, CAS ve sürümlü sözleşmeler |
| 3 | 30 Ağustos | P0-B | Fail-closed çalıştırma ve makine kanıtı |
| 4 | 30 Ağustos | P0-C | Hash ve bağımlılığa bağlı seçici checkpoint |
| 5 | 30 Ağustos | P1-A | Gereksinim–görev–dosya–kontrol izlenebilirliği |
| 6 | 30 Ağustos | P1-B | Gerçek servis, DB, API, browser ve smoke doğrulayıcıları |
| 7 | 30 Ağustos | P1-C | Sunucuda üretilen, hash'e bağlı temiz oda ZIP doğrulaması |
| 8 | 30–31 Ağustos | P2 | Domain, placeholder, contamination, güvenlik ve README denetimi |
| 9 | 31 Ağustos–2 Eylül | P3 | Kanıt API'leri, metrikler, kalite paneli ve etki analizi |
| 10 | 2–3 Eylül | P4 | Kanonik tamamlama, zorunlu kapılar ve değişmez makbuz |
| 11 | 4–5 Eylül | P5 | Güven zinciri, doğrulanmış indirme ve MFA oturum sınırı |
| 12 | 5 Eylül | P6 | Non-root üretim imajı ve tek HTTPS origin |
| 13 | 5 Eylül | P7 | Tahribatsız uzlaştırma, silme koruması ve SQLite dayanıklılığı |
| 14 | 6 Eylül | P8 | Kaynak/ağ sınırları, anahtar yenileme, CI ve erişilebilirlik |
| 15 | 6–10 Eylül | P9 | Ayrı execution worker ve R01–R24 denetim düzeltmeleri |
| 16 | 10–17 Eylül | Quiz-Master ve geliştirme araçları | Gerçek üretim denemesi, kabul engelleri, dev runner, DAG ve Graphify düzeni |
| 17 | 23–29 Eylül | Gerçek proje ve yönetim kabulü | Kütüphane teslimi, token sayacı, rol/CRUD ve Docker artefakt testleri |
| 18 | 1–2 Ekim | Yerel worker ve ajan ayrımı | Docker'sız profil, taşınabilir paket, x-agents ve LLM/onay iyileştirmeleri |
| 19 | 19–24 Ekim | Kurtarma ve işletim | Checkpoint koruma, yerel kabul, ZIP yaşam döngüsü, bütçeli onarım |
| 20 | 28 Ekim | Mimari Faz 1 | DAT-1..5 ve VER-1..5: veri ve doğrulama bütünlüğü |
| 21 | 28 Ekim | Mimari Faz 2 | ENG-1..7 ve AGT-1..5: motor/ajan/LLM güvenilirliği |
| 22 | 28–29 Ekim | Mimari Faz 3 | FE-1..4: frontend durumu ve DAG kronolojisi |
| 23 | 29 Ekim | Mimari Faz 4 | ENG-8 ve DAT-6: modül ayrıştırma ve doğrulama altyapısı |
| 24 | 29 Ekim | Ana dala entegrasyon | Faz 1–4 kapanışı, merge ve belge/grafik eşitleme |
| 25 | 29–30 Ekim, bu çalışma dizini | Belge düzenlemeleri | CLAUDE çalışma rehberi, birleşik kılavuz ve bu faz arşivi; henüz commit değil |

## 2. İlk temel ve P0–P3 zinciri

### Halka 1 — 28–29 Ağustos: temel ve süreklilik kaydı

Git'teki `59159d2` ilk güvenlik/telemetri/kalite temelini, `290f245` Director şartname kurtarmasını kaydeder. `4164592` süreklilik defteri öncesi referanstır; `42a3eae` plan ve süreklilik kayıtlarını ekler.

Master plan, durum güvenliğinden başlayıp bağımsız çalıştırma, izlenebilirlik ve teslim kanıtına ilerleyen bağımlılık zincirini tanımlar. Planın hazırlanması tek başına bu işlerin uygulanmış olduğunun kanıtı değildir; sonraki makbuzlar ayrı değerlendirilir.

### Halka 2 — 30 Ağustos: P0-A, durum ve sözleşme güvenliği

- Migration 7 ile sözleşme, gereksinim, görev, onarım ve checkpoint temeli kuruldu.
- Ayrı durum makineleri ve `expectedRevision` ile CAS geçişleri eklendi.
- Manager planının DB'de sürümlü taslak/onaylı sözleşme olarak saklanması sağlandı.
- Desteklenmeyen yığın için capability engeli; ret/onarım kaydı ve sözleşme değişiminde checkpoint geçersizleştirme uygulandı.
- Eski plan alanından kanonik sözleşmeye geçiş yapıldı.

**Tarihsel kanıt:** P0-A makbuzunda 6/6 odaklı test ve 25/25 backend süiti. Kapanış commit'i `5cb7102`.

### Halka 3 — 30 Ağustos: P0-B, çalıştırma ve fail-closed doğrulama

- Sandbox arayüzü/adaptör kayıt sistemi kuruldu; kanıtlanmış kapasite olmadığında host fallback yerine engelleme benimsendi.
- Migration 8 doğrulama koşusu/kontrol ve komut kanıtı kayıtlarını ekledi.
- AST bağımlılık envanteri, paket/kilit dosyası, temiz kurulum, gerçek typecheck/build kontrolleri bağlandı.
- Eksik zorunlu kapı veya araç model onayıyla geçilemez hale getirildi.

**Tarihsel kanıt:** 15/15 odaklı test, 25/25 backend süiti; `707adc0`. Bu dönemin sandbox hedefi, Ekim'de ayrıca seçilen local-trusted profilinin OS izolasyonu sağladığı anlamına gelmez.

### Halka 4 — 30 Ağustos: P0-C, seçici checkpoint güvenliği

- Proje/görev/sözleşme/plan/görev tanımı/girdi/çıktı/kapı sürümüyle checkpoint kimliği kuruldu.
- İçerik hash'i ve CAS doğrulaması yürütücüye bağlandı.
- Gereksinim reddinden etkilenen görev ve aşağı akış bağımlılıkları seçici geçersizleştirildi; etkilenmeyen işler korunabildi.
- Disk TODO/cache ile kalıcı kayıt uzlaştırması eklendi.

**Tarihsel kanıt:** 9/9 odaklı test, 25/25 backend süiti; `4a89418`.

### Halka 5 — 30 Ağustos: P1-A, sözleşme izlenebilirliği

- Migration 9 ile artefakt ve tipli izlenebilirlik bağlantıları eklendi.
- Tek capability kayıt sistemi genişletildi; gereksinim/görev/dosya/kontrol matrisi kuruldu.
- Domain öğeleri, gereksinim kimlikleri, ajan şemaları ve istemler uyumlandı.
- Çekirdek gereksinimler önce planlandı; kaynak yazımı hedef dosya allowlist'iyle sınırlandı.

**Tarihsel kanıt:** 23/23 odaklı test, 25/25 backend süiti; `6cc3502`. Bağlantı matrisi bir runtime kabulü veya her gereksinim için zorunlu birebir eşleme garantisi değildir.

### Halka 6 — 30 Ağustos: P1-B, gerçek çalışma zamanı kontrolleri

Servis manifesti/port/env denetimi → süreç başlatma ve temizleme → liveness/readiness → DB hazırlığı → API ve DB yan etkisi → browser yolculuğu/kalıcılık → gerçek test suite → ortak smoke kapısı → kanıt birleştirme zinciri kuruldu.

**Tarihsel kanıt:** Dokuz odaklı dosyada 29 test, düzeltme sonrası 25 backend süiti. İlk regresyondaki Bun/node:sqlite test başlatma uyumsuzluğu `process.execPath` kullanımıyla giderildi. Temsilî commit'ler `978f021`–`e771539`.

### Halka 7 — 30 Ağustos: P1-C, ZIP temiz oda doğrulaması

- Artefakt repository, sunucu tarafında ZIP ve SHA-256 üretimi eklendi.
- Çıkarma sırasında traversal, link, ZIP bomb ve kota denetimleri uygulandı.
- Paketin belirli hash'ine bağlı temiz oda doğrulaması, durum geçişi ve frontend indirme akışı bağlandı.
- İstemci dosya listesinden teslim paketi üretmek yerine sunucudaki doğrulanmış artefakt esas alındı.

**Tarihsel kanıt:** 23 odaklı test, 25 backend süiti; `1d3a770`–`341e3ae`. Sonraki P4, tamamlama makbuzunu ayrıca kalıcı ve değişmez hale getirir.

### Halka 8 — 30–31 Ağustos: P2, kalite sertleştirmesi

Sekiz iş grubu/22 adım tamamlandı: domain modeli ve kullanımı; stub/ölü form/placeholder; şablon bulaşması; CORS/secret/auth/SQL güvenliği; README komut/port/build doğrulaması; çekirdek kapsamın önceliği ve istenmeyen özellik reddi; onarım hedef/config sınırları; kanıttan türetilen tamamlanma raporu.

**Tarihsel kanıt:** On P2 süitinde 81 test ve 25 backend regresyon süiti. Eksik production entegrasyonu ve placeholder imza uyumsuzluğu inceleme sırasında düzeltilmiş. Temsilî kapanış `f324cb9`.

### Halka 9 — 31 Ağustos–2 Eylül: P3, gözlemlenebilirlik

- Yetkili, salt okunur sözleşme/kanıt API'leri ve cursor sayfalama eklendi.
- Metrik/hata parmak izi ve gereksinim etkisi/seçici rebuild önizlemesi oluşturuldu.
- Değişmez kanıt kimliklerini koruyan redaksiyon ve eski çıktı metni sıkıştırması uygulandı.
- Kalite geçmişi paneli, izlenebilirlik DAG'ı ve rebuild önizleme arayüzü eklendi.
- Dosyadan başlayan etki analizi, snapshot tutarlılığı ve 10.000 görevli DAG senaryoları düzeltildi.

**Tarihsel kanıt:** P3 makbuzunda 60/60 odaklı kontrol, 25/25 backend süiti, 11 frontend testi ve 2 Chromium E2E; `ee5e9e5`.

## 3. P4–P9: teslim ve işletim zincirinin güçlenmesi

### Halka 10 — 2–3 Eylül: P4, kanonik üretim güvenliği

Windows'ta kanıtlanmamış izolasyon engellendi; yürütülebilir kontroller ortak sınırdan geçirildi. Doğrulama/artefakt durumları ve türetilmiş kanıtlar sıkılaştırıldı. Tamamlama ve indirme aynı yetkili kanıt kontrolüne bağlandı. Migration 10, proje CAS geçişiyle aynı transaction'da yazılan ve UPDATE/DELETE edilemeyen `completion_receipts` kaydını ekledi.

**Tarihsel kanıt:** 18 odaklı güvenlik testi, 25 backend süiti; doğrulanmış commit `cb151c5`. Bu makbuzlu tamamlama temeli sonraki fazlarda korunur.

### Halka 11 — 4–5 Eylül: P5, kritik güven zinciri ve MFA

Kanıtsız host yürütmesi kapatıldı, artefakt/tamamlama kimliği birleştirildi, tarayıcı indirmesi yalnız doğrulanmış sunucu paketine bağlandı. MFA açık hesapta geçerli TOTP gelmeden oturum oluşturulmaması sağlandı.

**Tarihsel kanıt:** Frontend 21 test; Chromium güven zinciri senaryolarında 2 geçiş; kayıtlı tam Chromium koşusunda 4 geçiş. Odaklı worker, artefakt ve MFA regresyonları mevcut. Kapanış `70888c7`.

### Halka 12 — 5 Eylül: P6, üretimde işletilebilirlik

ZIP sahipliği backend'e taşındı; production SPA fail-closed sunuldu. Non-root imaj, frontend/API/WebSocket için tek HTTPS origin, Caddy proxy, kalıcı volumeler ve health/readiness yüzeyi oluşturuldu. Gerçek container smoke; doğrulanmamış indirme reddi, doğrulanmış ZIP hash'i ve container yenileme sonrası kalıcılığı gözledi.

**Tarihsel kanıt:** P6 makbuzu imaj sözleşmesi ve `test:production-image` için başarılı komutlar kaydeder; kapanış `4e5583d`. Deterministik fixture/seed kullanımı her kullanıcı uygulamasının gerçek kabulü yerine geçmez.

### Halka 13 — 5 Eylül: P7, veri mimarisi ve dayanıklılık

Tahribatsız reconciliation ve tek repository otoritesi; makbuzlu teslimler için RESTRICT silme koruması; SQLite WAL/busy timeout; onay yanıtı hizalaması; boyut sınırlı binary/base64 files API; yığına uygun README üretimi eklendi.

**Tarihsel kanıt:** 36 backend süiti, 21 frontend testi/build, Chromium 4 geçiş/1 atlanan kayıtlı. `UNIQUE projects.id` test fixture sorunu düzeltilip tekrar sınanmış. Kapanış `403ba8b`.

### Halka 14 — 6 Eylül: P8, güvenlik ve CI

CPU/bellek/PID/ağ sınırları, MFA AES-GCM saklama/anahtar yenileme, güvenli CSP, iptal listener temizliği, saatlik oturum bakımı ve erişilebilir bağlantı/hata durumları eklendi. Audit, backend/frontend/E2E ve production-image işleri engelleyici CI sözleşmesine bağlandı.

**Tarihsel kanıt:** Makbuzun controller tarafından sağlanan bölümünde 40 backend süiti, 27 frontend testi/build, Chromium 4 geçiş/1 atlanan ve production smoke başarısı kayıtlıdır. Yerelde Docker kapalı olduğunda zorunlu cgroup koşusu başarısız olmuş; makbuz CI'da gerçek cgroup kontrolünün geçtiğini bildirir, sayısal ölçümler çalışma dizinine aktarılmamıştır. Kapanış `47a0717`. Yerel skip ile gerçek Docker kanıtı eş tutulmaz.

### Halka 15 — 6–10 Eylül: P9, ayrı worker ve R01–R24

On iki görevde:

1. Bearer token ve job/contract/run kimlikli worker API/backend istemcisi.
2. Ayrı runtime ve ağ politikası.
3. Doğrulama pipeline'ı ve gerçek bağımlılık kanıtı.
4. Binary-safe ZIP, sıkıştırma/çıkarma sınırları ve artefakt cutover.
5. DAG bağımlılık kimliği ve tam checkpoint çıktıları.
6. Lease zamanları, atomik kurtarma ve gecikmiş yazma fencing'i.
7. Oturum iptali, parola yarışı, TOTP replay ve proxy sınırları.
8. Monaco'nun o dönem yerel bundle edilmesi ve tarayıcı origin sınırları.
9. Proje/oturum bazlı frontend asenkron istek iptali.
10. Açık DB başlatma/kapatma ve recoverable `.trash` silmesi.
11. Bağımlılık/DNS/test envanteri, yedek/restore ve sınırlı kapanış.
12. Gerçek API/worker sınırından deterministik production pipeline kanıtı.

**Git kanıtı:** `fd7cebe`, `5dd6c1e`, `78270f1`, `f042aef`, `557cf14`, `10a7e3f`, `f1f2f8f`, `e4a2713`, `85286aa`, `0d344d2`, `82a9990`. P9 metni toplu R01–R24 kapsam anlatımıdır; her madde için yeni canlı kabul yapılmış gibi yorumlanmamalıdır. Monaco gibi tarihsel özellikler güncel arayüz envanteri sayılmaz.

## 4. Gerçek üretim denemeleri ve Ekim'e geçiş

### Halka 16 — 10–17 Eylül: Quiz-Master ve geliştirici akışları

İlk korunan kaynak LLM timeout'u sonrası eksikti: öğrenci sınav domain'i, sayfalar, giriş/rol yolculukları, süre/puan/sonuç akışları tamamlanmamıştı. Lockfile/paket tutarsızlığı, tanımsız bcryptjs/jose, sıfır hesap üreten seed, TypeScript/Zod sorunları ve bitmeyen build saptandı. Forensic ZIP yalnız kaynak byte eşleşmesini kanıtladı.

14 Eylül kaydı platformda Windows preload URL, dosyaya bağlı statik bulgu/onarım, bağımlılık temizliği ve Next hedef yol normalizasyonunu anlatır. React 18/Zod 3/Tailwind 3 uyumu, worker cache/bellek, manifest/smoke ve kök App Router iskele düzeltmeleriyle canlı denemede install/Prisma/seed-account/typecheck/build/smoke/test komutu geçmiştir.

**Açık kalan:** Gereksinimler kalıcı traceability tablolarına yazılmadığı ve çalıştırılabilir API/browser tanımları eksik olduğu için nihai kabul tamamlanmamış, makbuz sayısı sıfır kalmıştır. Bu proje arşivde completed değildir. Eski `faz.md` içindeki tekrar eden olumlu alt test listeleri bu son durumu geçersiz kılamaz.

**Tarih ayrımı:** Makbuzun düzeltme bölümü 14 Eylül etiketlidir; aynı platform düzeltmelerini kaydeden `f28249e` commit'i 16 Eylül tarihlidir. İşlem kaydı ile commit tarihi aynıymış gibi birleştirilmedi. Eski faz özeti bu commit'in yerelde master'a fast-forward alındığını bildirir; bu entegrasyon Quiz-Master'ın kalan ürün kabul engellerini kapatmaz.

16–17 Eylül git zinciri; CI/test fixture ve açık DB yaşam döngüsü düzeltmeleri, birleşik dev runner/kurumsal DNS (`2a1b27c`), disk–DB keşfi (`819f2d4`), Manager hata telemetrisi, altı rolün gerçek DAG görünümü (`52ba2d6`), pause başlangıç yarışı, sidebar/.trash ve proje revizyonlarıyla devam eder. `b353129` graph komutunu, `4acf422` worker'ın 8099 portunu, `f94bb66` slug/kısa numaralı proje klasörlerini; `fc15417` auth/seed standartlarını kaydeder. Bu dönemdeki host fallback veya disk senkronizasyonu gibi ara çözümler sonraki güvenlik fazlarıyla değişmiştir; commit başlığı güncel davranış talimatı değildir.

### Halka 17 — 23–29 Eylül: gerçek proje, yönetim ve LLM iyileştirmeleri

Git; sentetik eski artefaktları gizleme, worker readiness/poll/süre sınırları, üretim çıktılarından secret/env/yerel DB temizliği, Prisma SQLite yolu ve kalıcı kanıt kaynaklarını düzeltme zincirini gösterir. 24 Eylül `27912c2` kütüphane teslimini doğrulanmış olarak kaydeden rapordur; bu arşiv o ZIP'i yeniden kabul etmez.

25 Eylül kurtarma/doğrulama durumu ve README kapı kanıtı; 27 Eylül token sayacı (`e3399e6`); 28 Eylül yönetim/rol üretim kapıları, ZIP'ten Docker kabul testi ve kalite paneli (`2f73d83`, `8dcac7a`, `490bc3b`); 29 Eylül LLM yönetimi, anahtar başlatma ve test izolasyonu güçlendirildi.

### Halka 18 — 1–2 Ekim: Docker'sız worker ve ajan talimat ayrımı

`150fba2` Docker'sız gerçek kalite kontrollerini, `5e07481` geliştirmede yerel varsayılanı, `8b00ded` platform talimatlarının x-agents ayrımını, `0df825c` LLM/onay sertleştirmesini kaydeder.

**Sınır:** local-trusted gerçek komut/API/Chromium kontrolleri çalıştırır, OS izolasyonu sağlamaz. Önceki Docker fazlarının garantisi yerel profile otomatik taşınmaz. Paket aynı OS/mimari için kabul edilmelidir.

### Halka 19 — 19–24 Ekim: kurtarma, yaşam döngüsü ve onarım

- 19 Ekim `56dcc5e`: devamda checkpoint koruma.
- 21 Ekim `9859d63`, `c021c4e`: native doğrulama ve paylaşılan limitler. Kılavuzdaki tarihsel otel koşusu 22 uygulama testi, 8 browser yolculuğu, 205 PASS/170 zorunlu ayrıntı kaydı bildirir; son teslim ZIP'i ayrıca çıkarılıp çalıştırılmamıştır.
- 22 Ekim `4273484`: fiziksel ZIP bulunabilirliği/kalite ayrımı, kalıcı karantina günlüğü. 18 dosya karantinaya alınmış; önceden eksik 20 ZIP geri kazanılmamıştır.
- 22 Ekim `b8799ef`, `7c4f864`, `05580db`: talimat/kurtarma sınırları, sınırlı transport retry, güncel kaliteyi tarihsel PASS'ten ayırma.
- 24 Ekim `5c08264`: iş akışı sahipliği ve kanıtlı onarım; `2814a2c`, `0ac96f6` kapanış/kurtarma belgeleri; `139f240` ana dala entegrasyon.

Bu halkadaki işletim ayrıntıları [birleşik kılavuzun 12–14. bölümlerindedir](../kullanici-kilavuzu.md#uretim-operasyon).

<a id="mimari-fazlar"></a>

## 5. İkinci faz dizisi: 28–29 Ekim mimari iyileştirmeleri

**Adlandırma ayrımı:** Buradaki Faz 1–4, yukarıdaki P1–P4 ile aynı çalışma değildir. Mimari yol haritası 28 bulguyu `ENG-1..8`, `VER-1..5`, `DAT-1..6`, `AGT-1..5`, `FE-1..4` olarak sınıflandırır. Yol haritasının hazırlık/Faz 0 anlatımı bağımsız bir yeni ürün teslimi sayılmaz.

<a id="mimari-faz-1"></a>

### Halka 20 — 28 Ekim: Faz 1, veri ve doğrulama bütünlüğü

- DAT-1: Diskten canlandırmada durum makinesi, makbuzlu completed ve sözleşme şeması denetimi (`e5c2036`).
- DAT-2: Sohbetten revizyon durumları ve eşzamanlı chat kilidi (`1b99ed9`).
- DAT-3: Sohbet geçmişinin offset/çift yazma yüzünden bozulmasını önleme (`06eac30`).
- DAT-4/5: Checkpoint invalidated durumu ve tek proje oluşturma otoritesi (`33a35fb`).
- VER-1/2/5: Fail-closed kanıt, yetkili hardening ve atomik persistence (`8312c09`, `3bdd580`).
- VER-3/4: Sentetik build ortamını koruma, kurulum sonrası ağ yaşam döngüsü (`1f23a32`); mimar düzeltmeleri `fc4bfc3`.

Kaynak: [Faz 1 raporu](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-1-rapor.md).

<a id="mimari-faz-2"></a>

### Halka 21 — 28 Ekim: Faz 2, motor ve ajanlar

- ENG-1/3: İlk iterasyondan hedef dosya denetimi ve tüm yollarda enjekte callAgent (`fa738a3`).
- ENG-2/6/7: Pause/abort/erken çıkışta sahte completed lease engeli, concurrency sırası (`23db9c0`).
- ENG-4: Onarım girdisinde sözleşme hash'i ve gruplar arasında güncel kaynak bağlamı (`0610de8`).
- ENG-5: Vite+Express+Prisma için Dockerfile ve README (`59d01b9`).
- AGT-1/3: Kaçış/JSON/dosya çıkarımı ve geçersiz Director cevabının reddi (`1b51504`).
- AGT-2/5: Tüm rollerde truncated ret ve Google REST fallthrough'un kapatılması (`51aa584`).
- AGT-4: Babel AST import denetimi ve Prisma ham sorgu isimlerinin tanınması (`744a675`). Regresyon hizalaması `621697e`.

Kaynak: [Faz 2 raporu](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-2-rapor.md).

<a id="mimari-faz-3"></a>

### Halka 22 — 28–29 Ekim: Faz 3, frontend ve DAG

ID'siz WebSocket olaylarında zaman damgasıyla kronoloji korundu (`c0cd824`). Frontend mount sırasında otomatik disk sync kaldırıldı; verification_failed/capability_blocked rozetleri eklendi (`ce20cfa`). DAG node/edge türetimi setLogs updater yan etkilerinden useEffect'e taşındı; DAG testleri Vitest kapsamına alındı (`c7a445b`).

Kaynak: [Faz 3 raporu](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-3-rapor.md).

<a id="mimari-faz-4"></a>

### Halka 23 — 29 Ekim: Faz 4, modülerleştirme ve kapanış

| Önceki ana modül | Ayrılan sorumluluk | Commit |
| --- | --- | --- |
| workflow.js | stages/repairStage.js, stages/verificationStage.js | `cb06eaf` |
| codeGenerator.js | templates/dockerTemplates.js, templates/prismaTemplates.js | `ea581eb` |
| projectRoutes.js | projectObservabilityRoutes.js, projectTraceabilityRoutes.js | `50445ce` |
| db.js | db/migrations.js; lease kontrolünün tek otoritesi | `85a612e` |

Mevcut dışa aktarımlar re-export ile korundu. `eb65a80`, Docker artefakt testlerinin fail-closed ifadelerini ve yedi bileşenli onarım imzasını hizaladı. `e083263` grafiği eşitledi. `528ed58`, AST kontrolünün geçerli `.toLowerCase()` çağrılarını hatalı reddetmesini düzeltti; şablon DB klonlama/paralel backend runner ve worker test timeout'larını güçlendirdi.

Kaynak: [Faz 4 raporu](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-4-rapor.md).

### Tarihli doğrulama tablosu

| Kapanış | Backend süiti | Worker birim testi | Yerel worker entegrasyonu | Frontend birim testi | Build |
| --- | ---: | ---: | ---: | ---: | --- |
| Faz 1, 28 Ekim | 148 | 156 | 159 | 120 / 13 dosya | 1.702 modül |
| Faz 2, 28 Ekim | 148 | 156 | 159 | 120 / 13 dosya | 1.702 modül |
| Faz 3, 29 Ekim | 148 | 156 | 159 | 129 / 14 dosya | 1.702 modül |
| Faz 4, 29 Ekim | 148 | 156 | 159 | 130 / 14 dosya | 1.702 modül |

Faz 1/2 E2E anlatımları, simülasyon ve gerçek worker kanıtı ayrılmadan yeni bir uygulama teslim kabulü sayılmaz. Faz 4 yerel roundtrip gerçek SQLite/API/Chromium ve manager/viewer pozitif/negatif dört yolculuk içerir; fixture JavaScript'tir, gerçek TypeScript derlemesi kanıtı değildir. Rapordaki 28 ayrıntı kontrolü 28 üst düzey kalite kapısı anlamına gelmez; üst düzey zorunlu politika 18 kapıdır. Kapanışta Docker motoru bulunmadığından P8.3/P8.4 atlanmıştır; yerel başarı yeni Docker kabulü değildir.

### Halka 24 — 29 Ekim: rapor, merge ve kaynak eşitleme

`3f8d651` Faz 4 kanıt raporunu, `41a5977` README/kılavuz/operasyon/grafik kapanışını güncelledi. **`915359d`**, arch/roadmap-2026-10 dalını main'e birleştirdi. **`b3d7403`**, CLAUDE.md eklenmesi ve docs düzeni/bağlantı/metrik/grafik eşitlemesini kaydeder. Eski faz raporlarının sonundaki “merge onayı bekleniyor” ifadeleri bu merge öncesine ait tarihsel durumdur.

### Halka 25 — 29–30 Ekim: belge birleştirmesi ve kök kılavuza geçiş

CLAUDE.md uygulama ayrıntılarını tekrarlamak yerine güncel kaynakları okuma ve çalışma kurallarına odaklandı. Operasyon, yerel worker paketi ve ZIP yaşam döngüsü kullanıcı kılavuzunun 12–14. bölümlerine birleştirildi; bağlantılar, paket README kaynağı ve Graphify düzeltildi. Bu faz arşivi iki tarihsel belge dizisini kronolojik olarak bir araya getirir. Kullanıcı kılavuzu depo köküne taşındı; ayrı roadmap raporları kaldırıldı, güncel gezinme bağlantıları faz arşivine yönlendirildi. Worker paketinin README kaynağı ve Graphify taraması yeni konuma uyarlandı.

**Kayıt kapsamı:** Bu belge düzenlemesi önceki son commit `b3d7403` sonrasındadır; kaynak kodda yeni bir ürün fazının kabulü değildir. Tarihsel platform testleri belge taşıma işleminin yeni test sonucu sayılmaz. İlgili belge/Graphify/paketleme kontrolleri yayın commit'inin doğrulamasında ayrıca değerlendirilir.

## 6. Kaynak kapsamı ve belirsizlikler

- `docs/faz -arsiv/faz.md`: Eski P0–P9 genel özeti; Quiz-Master düzeltme/test listeleri tekrar eder. Bu dosyada tekilleştirildi.
- `docs/faz -arsiv/implementation-plans/00-MASTER-EXECUTION-PLAN.md` ve 01–14 numaralı planlar: Bağımlılık, kapsam ve görev hedefleri. Plan snippet'leri güncel çalıştırma komutu olarak kullanılmamalıdır.
- `docs/faz -arsiv/implementation-evidence/P0-A.md`–`P9.md`: Aşama bazlı tarihsel makbuzlar. `SELF` alanı bu arşivde gerçek commit SHA'sına dönüştürülerek uydurulmadı.
- `docs/faz -arsiv/implementation-evidence/QUIZ-MASTER.md`: Olumlu alt testlere rağmen nihai kabulün eksik kaldığını belirten özel kayıt.
- `docs/faz -arsiv/implementation-evidence/INDEX.md`: P4'te duran eski indeks. P5–P9'un yokluğu başarısızlık kanıtı değildir; ilgili kayıtlar ayrıca okundu. Master durum tablosu P8'de biter; P9 ayrı plan/kanıt ve git geçmişiyle izlendi.
- [Mimari yol haritası](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/mimari-yol-haritasi.md), [Faz 1](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-1-rapor.md), [Faz 2](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-2-rapor.md), [Faz 3](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-3-rapor.md), [Faz 4](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-4-rapor.md): İkinci faz dizisinin bulgu/görev/test/commit kaynağı.
- Git geçmişi: Ağustos başlangıcı, Eylül geçişleri, Ekim merge tarihleri ve commit kimlikleri. Commit başlığı tek başına test PASS kanıtı değildir.

`docs/faz -arsiv/` yerel klasörü mevcut .gitignore kuralıyla takip dışıdır; yeni `docs/faz-arsiv.md` aynı kurala girmez. Bu dosya ana tarihsel anlatıyı kendi içinde taşır; takip dışı kaynaklara dosya linkiyle zorunlu okuma bağımlılığı kurmaz. Birleştirilen ayrı roadmap raporları güncel ağaçtan kaldırılmıştır; yukarıdaki kalıcı Git bağlantıları eski raporları `b3d7403` sürümünde gösterir. Takip dışı yerel arşiv yayın bağımlılığı değildir. Tarih verilmemiş kayıtlara dosya mtime'ından yapay tarih atanmadı; dönemler makbuz ve ilgili git zincirinden çıkarıldı.
