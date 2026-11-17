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

30 Ekim sayısal kapsam denetimiyle ana politika kapıları ve sözleşmeye bağlı ek zorunlu kanıtlar arasındaki fark README/kılavuzda netleştirildi. CLAUDE.md'ye sayısal iddiaları kod, koşullu üretim yolları ve ilgili testlerle doğrulama; tarihsel sonuçları ve canlı koşu sayılarını ayırma kuralı eklendi. Bu açıklama tarihsel test sonuçlarını değiştirmez.

CLAUDE.md uygulama ayrıntılarını tekrarlamak yerine güncel kaynakları okuma ve çalışma kurallarına odaklandı. Operasyon, yerel worker paketi ve ZIP yaşam döngüsü kullanıcı kılavuzunun 12–14. bölümlerine birleştirildi; bağlantılar, paket README kaynağı ve Graphify düzeltildi. Bu faz arşivi iki tarihsel belge dizisini kronolojik olarak bir araya getirir. Kullanıcı kılavuzu depo köküne taşındı; ayrı roadmap raporları kaldırıldı, güncel gezinme bağlantıları faz arşivine yönlendirildi. Worker paketinin README kaynağı ve Graphify taraması yeni konuma uyarlandı.

**Kayıt kapsamı:** Bu belge düzenlemesi önceki son commit `b3d7403` sonrasındadır; kaynak kodda yeni bir ürün fazının kabulü değildir. Tarihsel platform testleri belge taşıma işleminin yeni test sonucu sayılmaz. İlgili belge/Graphify/paketleme kontrolleri yayın commit'inin doğrulamasında ayrıca değerlendirilir.

### Halka 26 — 30 Ekim: stok-takip duraklaması ve Manager kurtarma akışı

`c00d344` sonrasında canlı DB yalnız okunarak stok-takip duraklaması incelendi. İlk worker koşusunda Next prerender sırasında AuthProvider/useAuth hatası, hook lint hataları, oluşturulmayan demo hesapları, eksik yönetim runtime kanıtı ve wildcard CORS reddi görüldü. Bağımlılık kontrollerinin üreticisi zaman damgası/digest alanlarını eksik taşıdığı için başarılı işlemler de BLOCKED oluyordu. Worker'ın güvenli otomatik onarım kapsamı dışındaki bu hatalar Manager revizyonu gerektirirken arayüz ve sohbet aynı sözleşmeyle Resume öneriyor, tekrarlanan girişimler ilerleme sağlamıyordu.

Manager bağlamına onaylı yapılandırılmış plan ve son koşunun sınırlı hata akışları eklendi; düzeltme isteyen durum mesajları model yoluna yönlendirildi. Revizyon vetosunda Resume API'si yeni lease/girişim oluşturmadan durur, ortak arayüz kontrolü düğmeleri gizler ve sohbet revizyon/onay yolunu açıklar. Bağımlılık kontrolleri gerçek işlem gözleminin başlangıç/bitiş ve akış hash'lerini üretir; eksik kanıtı reddeden politika gevşetilmez. Yeni React/Express kapsamı Vite olarak seçilir; mevcut Next/Vite çelişkisi dosya yazmadan reddedilir.

**Doğrulama kapsamı:** Manager sohbet/revizyon/onay simülasyonu geçici DB ve executor/model mock'larıyla yapılır; canlı üretilen proje dosyaları değiştirilmez. Gerçek sağlayıcıyla ek sohbet denemesi, sözleşme/hata bağlamının Google'a aktarımı için özel kullanıcı onayı gerektiğinden otomatik onay incelemesinde engellendi; çağrı yapılmadı. Yerel worker fixture testinin başarısı canlı stok-takip projesinin teslim makbuzu yerine geçmez. Bu kayıt henüz commit edilmemiş çalışma ağacını anlatır.

30 Ekim kapanış doğrulaması: izole backend runner **149 süit geçti, hata yok**; P8.3/P8.4 Docker bulunmadığından atlandı. Manager kurtarma fixture'ı **9 senaryo** içerir; gerçek model veya gerçek üretim çalıştırmaz. Yerel worker komutu **159 test**, frontend **131 test** ve üretim build'i başarılıdır. Yerel worker roundtrip gerçek SQLite/API/Chromium kullanır; bağımlılık kontrollerinin zaman/digest alanlarını da denetler. Graphify çıkarımı ve test envanteri kontrolleri geçmiştir. Bu sayılar farklı kapsamları sayar, birbirine eklenmiş bir teslim kapısı toplamı değildir.

Son salt okunur canlı kontrolde, 29 Ekim 23:37 UTC'deki “yeni bir plan hazırla” sohbetinden oluşan ikinci sözleşmenin onay beklediği görüldü; yeni yürütme girişimi yoktu. Taslak seed/AuthProvider/CORS düzeltmelerini önerir, fakat ilk sözleşmedeki kritik stok/gösterge paneli gereksinimi yeni gereksinim listesinde korunmamıştır. Taslak bu nedenle eksiksiz kabul veya üretilmiş ürün kanıtı olarak sunulmaz; kapsamı onay öncesinde gözden geçirilmelidir.

30 Ekim ek kapsam düzeltmesi: İkinci stok taslağında REQ-5 gösterge panelinin AuthProvider maddesiyle değiştirilmesi üzerine hata kurtarma revizyonlarına sunucu tarafı kapsam karşılaştırması eklendi. Zorunlu iş ifadeleri/kimlikleri, yönetim kaynakları ve mevcut rol izinleri korunur; düzeltmeler yeni kimliklerle eklenir. Yinelenen kimlikler reddedilir. Tek model düzeltme turundan sonra eksik plan yayımlanmaz; önceden kaydedilmiş eksik taslak düğme ve sohbet onayında da engellenir. UI eski/yeni ifadeleri ve düzeltme mesajı hazırlama eylemini gösterir. Taslak yayınının RAPOR.md silmesi kaldırıldı. Hatasız elle duraklatılmış projedeki bilinçli özellik revizyonu korunur; terminal completed davranışı değiştirilmedi, kılavuzdaki aksi iddia düzeltildi.

Ek turda backend tam koşusu 149 süit geçti. Son kurtarma simülasyonu 21 senaryo geçti; frontend tam koşusu 132 test ve build geçti, daha sonra eklenen Header onay engeliyle ilgili seçili dosya 25 test geçti. Bu kapsam değişikliği için worker entegrasyonu yeniden çalıştırılmadı; yukarıdaki worker sonucu önceki turundur. Ek Google çağrısı yine otomatik onay incelemesinde engellendi, dış çağrı yapılmadı. Buna karşın 30 Ekim 00:02 UTC salt okunur canlı kontrolünde üçüncü taslağın REQ-1–REQ-5'i koruduğu, seed/AuthProvider/lint/CORS işlerini REQ-6–REQ-9'a ayırdığı ve onay beklediği görüldü; bu kayıt ajan tarafından üretim başlatıldığı veya teslim doğrulandığı anlamına gelmez.

### Halka 27 — 30 Ekim: canlı Manager teşhisi ve karma servis doğrulaması

Kullanıcının iki kollu canlı inceleme talebiyle alt ajan Chrome arayüzünden stok-takip Manager sohbetini yürüttü; gözlemci XFactor DB/kanıtlarını salt okunur inceledi. Üretilen proje dizininde elle dosya düzenlenmedi. 07:53 ve 08:01 UTC sohbetlerinde Manager önce seed/lint ile endpoint hataları arasında kanıtsız bağ kurdu; ikinci soruda rollback ve zincirleme neden iddialarını geri aldı. Sistem yönergesi kayıtlı kontrol nedenini, nedensel çıkarımı ve sözleşme/manifest ayrımındaki belirsizliği açıklayacak şekilde netleştirildi. Önceki halkadaki engellenen çağrılar tarihsel olaydır; bu yeni açıkça yetkilendirilmiş UI sohbetleri gerçekten gerçekleşti.

Kod incelemesi ve önce başarısız olan regresyonlar, Next.js + Express planının API scaffold'unu atladığını ve Next sayfasında doğrudan `<main>` bulunmamasının tarayıcı adresi çıkarımını engellediğini gösterdi. Karma servis algılama Next.js'i de kapsar; Docker şablonu iki servisi taşıyıp manifestten başlatır, bir servis çıktığında kardeşini kapatır. Tarayıcı servisi manifest türünden tanınır; sözleşmenin gerçek etkileşim gereksinimleri korunur. Yeni Express scaffold'u wildcard CORS üretmez. Mevcut dosyalar otomatik olarak üstüne yazılarak düzeltilmez.

02:19 yerel saatinde başlayan worker, 02:33'te değişen kanıt üreticisini belleğine almamıştı; backend'in izleme modu ayrı worker'ı yenilemiyordu. Aktif workflow/worker işi bulunmadığı doğrulanarak geliştirme servis grubu 11:10 yerel saatinde güncel kodla yeniden başlatıldı; canlı `/healthz` ve `/readyz` başarılı, `executionCapacity=ready` oldu. Manager'ın 08:07 UTC'de yayımladığı dördüncü taslakta REQ-1–REQ-9 korundu, servis koordinasyonu ve gerçek test kabulü eklendi; kapsam karşılaştırması geçerliydi. Taslak ve fixture testleri ürün teslim kanıtı sayılmaz; canlı yürütmenin sonucu ayrıca kaydedilir.

Bu turun seçili backend doğrulamasında 7 süit, Manager kurtarmada 21 fixture senaryosu, frontend'de 133 test ve üretim build'i geçti. Servis başlatıcısı gerçek Node alt süreçleriyle farklı port aktarımı ve kardeş süreç kapatmayı doğruladı; Docker imajı çalıştırılmış sayılmaz. Tam backend ve yerel worker koşuları ayrıca değerlendirilir.

Kullanıcının tekrar planların mevcut üretimi bozması kaygısı üzerine onay akışı ayrıca incelendi: yeni sözleşme onayı workflow önbelleğini sıfırlar ve sözleşmeye bağlı generation/checkpoint kimlikleri eski çalışmayla eşleşmez. Kapsam eşitliği kaynak eşitliği garantisi değildir. Kullanıcı mevcut üretimin korunmasını ve aynı onaylı sözleşmede yalnız yeniden doğrulama yolunun geliştirilmesini seçti; dördüncü taslak onaylanmadı. Yeni `/reverify` eylemi onaylı kimliği ve üretim kaydını kontrol edip lease/CAS korumasıyla yeni worker koşusu başlatır. Model, scaffold, kaynak yazma ve görev üretimi yolları çalışmaz; eski onarım kayıtları silinmez, kaynak envanteri koşu sonunda tekrar karşılaştırılır. Sonuç tanılamadır; otomatik teslim kabulü veya checkpoint'leri başka sözleşmeye taşıma değildir.

Bu yol eklenmeden önceki tam backend koşusu 149 süit ve yerel worker koşusu 159 test geçti. Yeni yola ait seçili backend testleri ayrıca çalıştırılmıştır; önceki tam koşu bu yeni özelliğin tam regresyon kanıtı olarak sunulmaz.

Canlı yeniden doğrulama `verification-ba482939-7e04-4f67-9b8a-d110d01db000`, 30 Ekim 08:48:44 UTC'de başarısız bitti. Dört bağımlılık kapısı (`package_json`, `lockfile`, `ast_import_inventory`, `clean_install`) artık PASS; TypeScript ve framework build de geçti. Seed sıfır hesap, lint, boş test koşusu, yönetim endpoint/rol oturumu, tarayıcı ve wildcard CORS hataları sürdü. Tanılama bunları kaynak değiştirerek onarmadı. Koşu öncesi/sonrası DB manifest karşılaştırmasında paket dosya yolları ve SHA-256 değerleri birebir aynıydı; tüm 41 checkpoint, 41 görev sahipliği kaydı, üretim önbelleği ve sözleşme kayıtları değişmedi. Bunların 9'u güncel onaylı üçüncü sözleşmeye, 32'si eski sözleşmeye aittir; birbirinin yerine kullanılmadı. Dördüncü taslak onaylanmadı, proje duraklatılmış kaldı.

Yeni tanılama mesajı eski hata metnini değiştirse bile açık worker engelleri normal Resume'u yeniden açmaz. API ve ortak UI kararı kalıcı onarım kayıtlarını da dikkate alır. Tanılama eski onarım kayıtlarını çözülmüş saymaz ve teslim makbuzu oluşturmaz. Tam regresyonda yakalanan kimliksiz bağlam koruması ve yeni API görünüm alanı beklentisi düzeltildi; aktif iş sırasında backend yeniden başlatılmadı.

### Halka 28 — 30 Ekim: kalite paneli bekleme durumları ve canlı worker ilerlemesi

Kullanıcı kalite panelinin geçmiş ve kontrol listelerinde sürekli yükleniyor kaldığını bildirdi. İlk geçmiş isteği reddedilince proje aidiyetinin yalnız başarıda işaretlenmesi, hata durumunu spinner'a dönüştürüyordu; boş/seçilmemiş/hatalı detay durumları da aynı biçimde karışıyordu. Bu durumlar ayrı gösterilir; polling başarıya döndüğünde eski uyarılar temizlenir. Eski projenin gecikmiş geçmiş, detay veya ilerleme yanıtları yeni projeye taşınmaz.

Worker komut tanıları zaten içeride tutuluyor, ancak çalışan işin GET yanıtına ve backend polling'ine aktarılmıyordu. Temizlenmiş faz/çalıştırıcı/zaman/çıkış kodu metaverisi kimlik doğrulanmış client callback'inden aktif girişime bağlı, sınırlı ve geçici sunucu kaydına alınır. Viewer yetkili `/execution-progress` uç noktası yalnız aynı proje, onaylı sözleşme ve aktif lease'e ait gözlemi verir. Eski girişim, yabancı proje ve özel argüman/ortam/çıktılar aktarılmaz. Bu kanal salt okunur tanılamadır; `verification_checks` veya kabul durumu oluşturmaz. Kalite paneli anlık ilerlemeyi nihai kontrol kanıtlarından ayrı gösterir; running/0-check durumu anlaşılır biçimde açıklanır. Yeniden doğrulama ana başlıkta üretim olarak etiketlenmez.

### Halka 29 — 1 Kasım: kaldığı yer denetimi ve gerçek başlangıç hatası

Git denetiminde son commit'in `c00d344` olduğu, 30 Ekim kurtarma/kalite paneli düzeltmelerinin henüz commit edilmemiş çalışma ağacında bulunduğu doğrulandı. Graphify raporu 30 Ekim üretimiydi; mimari bağlantılar kodla karşılaştırıldı. Önceki son test günlükleri 150 backend süiti geçerken WebSocket testinin rastgele seçilen portta Fetch'in `bad port` reddiyle kaldığını; yerel worker'da 160 testin ve frontend'de 140 test/build'in geçtiğini gösteriyordu. Bunlar tarihsel sonuçlardır.

1 Kasım canlı UI'da spinner kalkmış olmasına rağmen geçmiş ve ilerleme istekleri hâlâ hata veriyordu. Kök neden, `createProjectRouter` tarafından DB açılmadan bağlanan gözlemlenebilirlik/izlenebilirlik rotalarının `null` DB değerini yakalamasıydı. Testler önceden hazırlanmış DB kullandığı için bu yaşam döngüsü hatasını gizlemişti. Bağlantı istek işlenirken çözülür. Gerçek `server.js` alt süreciyle başlayan entegrasyon testi; geçmiş, detay/log, canlı ilerleme, metrikler, izlenebilirlik ve başka kullanıcının erişiminin reddini sınar. Düzeltme öncesi bu test 500 ile başarısız, sonrasında başarılıdır. Canlı panel üç geçmiş koşuyu, seçili kontrol ve log ayrıntılarını yeniden göstermiştir.

Alt ajan Manager'la teknik terim kullanmadan sohbet etti. Model eski işlemi bugün olmuş gibi anlattığı ve geçen derlemeyi başka bir hatayla karıştırdığı için bağlama gözlem zamanı, koşunun gerçek başlangıç/bitişi ve başarılı kontrol adları eklendi. Sade anlatım ajan yönergesine taşındı. Son kontrol tarihi/durum/eksik soruları ayrıca doğrudan kayıtlı koşudan sade yanıtlanır; yeni model, plan veya üretim çağrısı yapmaz. Düzeltme isteyen mesajlar normal Manager yolunda kalır. Eski koşu yeni gibi sunulmaz ve gelecek başarı garanti edilmez.

**Kapanış yol haritası:**

- [x] Commit, çalışma ağacı, Graphify ve canlı kayıtları karşılaştır; tarihsel testleri güncel sonuçtan ayır.
- [x] Soğuk başlangıçta kalite geçmişi ve ilerleme erişimini düzelt; yetki sınırlarını koru.
- [x] Manager'ın sade durum yanıtlarını gerçek tarihe ve aynı koşunun sonuçlarına bağla.
- [x] Son canlı sohbet ve bağımsız worker ilerlemesini tarayıcıda yeniden gözle; yeni planı onaylama.
- [x] Son kaynak sürümünde ilgili testleri ve frontend build'ini çalıştır; tam backend/Docker sınırını kaydet, Graphify ve kapanış kanıtını güncelle.
- [x] Çalıştırıcı cache korumasını bağımsız incelet; yayınlama ve kayıp-dosya yarışlarını düzelt.
- [ ] Defender sınıflandırmasını ve doğrulanmış native çalıştırıcı dağıtımını incele.
- [ ] Mevcut üretimi koruyan ürün onarımını onaylı kapsam ve dosya sahipliğiyle tasarla; kaynak değiştirmeyen yeniden doğrulamayı onarım sayma.

**1 Kasım devam denetimi:** `verification-0aa6c74e-01bb-404b-ba2d-0271210dc94d` 10:38:50 Türkiye saatinde başarısız bitti. Bazı komutlar `spawn UNKNOWN` ile başlayamadı; bu, bu kontrollerin uygulamada kod hatası bulduğu anlamına gelmez. Önceki ürün sorunları bu koşuyla çözülmüş sayılmaz. Aynı Windows süreç yardımcısı ve uygulama sınırlarıyla, ayrı geçici tanılama alanında node/npm/npx başlatma başarılıdır; kesin canlı hata tetikleyicisi henüz doğrulanmamıştır. Kaynaklar, sözleşmeler, 41 checkpoint, 41 görev aidiyeti ve üretim önbelleği başlangıç kaydıyla eşleşir. Yalnız artefaktın bellekte yeniden hazırlanan kilit dosyası farklıdır.

Kalite paneli dört geçmiş koşuyu ve yeni koşunun ayrıntılarını yükledi; etkin iş bitince canlı alan beklemede kalmadı. Eksik kayıtlı hata nedeni sansürlenmiş `reason` alanıyla ayrıntıya eklendi; `timed_out=0` değerinin ekrana yalın `0` olarak basılması düzeltildi. Yeniden doğrulama yan menüde de doğru etiketlenir. “Yeni plan revizyonunu onaylayın” yönlendirmesi, onayın kaynakları yeniden üretebileceği ve yeniden doğrulamanın onarım yapmadığı açıklamasıyla değiştirildi. Gerçek sade “neden durdu, nasıl ilerleyebiliriz” sorusunun model yoluna düşmesi ayrıca testle üretilip kayıtlı durum yoluna alındı.

**Doğrulama kapsamı:** Son kaynak sürümünde 14 frontend dosyasındaki 142 test ve üretim build'i, 8 hedefli backend süiti ve native çalıştırıcı korumasının gerçek EXE yürütmeyen 7 testi geçti. Daha önceki aynı gün çalışmasında yerel süreç/iş görünümü için 19 test; izole gerçek worker HTTP/SQLite/Chromium akışında pozitif çalışma ile hatalı ve sıfır testli çalışmaların reddi dahil 5 test geçmişti. Bunlar son cache korumasının tam native entegrasyon tekrarı değildir. Aynı günün önceki tam backend çalışmasında 150 süit geçti, Docker sınır süiti zaman aşımına uğradı; ayrı tekrarda Docker kullanılamadığından gerçek konteyner adımları atlandı. İlk yoğun paralel yerel worker denemesi zaman aşımına uğramış, sırayla yapılan tekrar geçmişti. Defender bulgusu sonrası yeni native yürütme başlatılmadı. Bu sonuçlar stok uygulamasının teslim kabulü değildir.

**1 Kasım öğleden sonra tekrar:** Sade “neden durdu, mevcut çalışmamı kaybetmeden nasıl ilerleyebiliriz” mesajı canlı UI'da kayıtlı durum yolundan yanıtlandı; model kullanım sayısı artmadı. `verification-d64b7b19-974e-4985-96f3-934b60217114` 15:14:57 Türkiye saatinde aynı `spawn UNKNOWN` hatalarıyla bitti. Düşük yükte tekrarlanması, yalnız eşzamanlı test yükünü kök neden saymayı geçersiz kıldı. Kaynaklar, sözleşmeler, görev/checkpoint kayıtları ve üretim önbelleği yine korundu.

Değişmez ZIP ile sözleşmenin hash'leri canlı worker girdisiyle birebir karşılaştırıldı. Aynı girdinin doğrudan yerel tekrarında ve ayrı Bun → Node/IPC → HTTP worker, kalıcı test JobStore ve readiness içeren tekrarında süreçler başlatıldı; Prisma/TypeScript/derleme geçti, gerçek seed/lint/test/yönetim/tarayıcı eksikleri kaldı. Basit Node/npm/npx fixture'ı Bun/IPC altında da geçti; Bun tek başına kanıtlanmış neden değildir. Canlı worker'da kalmış alt süreç veya belirgin handle/bellek sızıntısı görülmedi. Bu aşamada Windows hata tetikleyicisi henüz doğrulanmamıştı; ardından aşağıdaki işletim sistemi koruma kayıtları bulundu.

Başlatma hatalarının özgün kod/errno bilgisini koruyan, yalnız sabit etiket/boolean/boyut bilgisi ekleyen `annotateSpawnFailure` eklendi. Özel argüman ve ortam değerlerinin sızmadığını sınayan regresyon dahil yerel süreç/iş görünümü dosyalarında 19 test geçti. Etkin backend girişimi ve worker işi olmadığı doğrulandıktan sonra yalnız XFactor geliştirme süreç ağacı kontrollü yeniden başlatıldı. Oturum ve kayıtlar korundu; `attempt-750efaef-cecf-4c76-8bb7-edc0b97098e4` altında kaynak koruyan yeni kontrol başlatıldı. Kurulum sonrası Prisma komutunun bu kez başladığı gözlendi; yeniden başlatma gözlemi, tanı kodunun temel nedeni onardığı iddiası değildir.

**Windows koruma kaydıyla teşhis:** Yalnız `windows-process-host-65cd2c90230ad606a295b588b8310038b6d954ea36a47e59f51e997aca8ec732.exe` adıyla filtrelenen Windows Defender Operational kayıtlarında 1 Kasım 10:38:01.568 ve 15:14:18.571 saatlerinde 1116 algılama; 10:40:58.886 ve 15:16:28.730 saatlerinde 1117 başarılı **Karantina** işlemi bulundu. Sınıflandırma `Trojan:Win32/Bearfoos.A!ml` idi. Öğleden sonraki `npm ci` bitişi 15:14:18.020 ile algılama ve sonraki `spawn UNKNOWN` hataları aynı zaman aralığındadır. Böylece hata, stok kodunun başarısız derlenmesi gibi yorumlanamaz; işletim sistemi korumasının platformun süreç yardımcısını engellediği kayıtlıdır. Koruma ayarı/istisnası veya karantina içeriği değiştirilmedi.

C# ve derleme betiği Git'teki `150fba2` kaynaklarıyla eşleşiyordu; kod incelemesinde süreç/job/handle yönetimi dışında ağ, kayıt defteri veya kalıcılık işlemi görülmedi. Bununla birlikte dosya adındaki özet **kaynak + betik** özetidir; karantinaya alınmış eski PE dosyasının birebir içeriğini veya zararsızlığını kanıtlamaz. Algılamanın yanlış pozitif olduğu ilan edilmedi. Doğrulanmış çalıştırıcı dağıtımı ve güvenlik sınıflandırmasının incelemesi açık iştir.

`verification-62218ebd-f898-4042-89af-07a1492c9ae7` 16:02:26 Türkiye saatinde tamamlandı: **27 PASS, 10 FAIL, 5 BLOCKED kontrol kaydı**; bunlar zorunlu kapı sayısı değildir. Bu koşuda `spawn UNKNOWN` yoktu. Prisma/TypeScript/derleme, servis canlılığı ve veritabanı yazımı geçti; sıfır kullanıcı hesabı, lint, hiç test çalışmaması, yönetim/tarayıcı ve wildcard CORS eksikleri teslimi engelledi. Onaylı sözleşme 3, bekleyen taslak 4, kaynaklar, 41 checkpoint/görev aidiyeti ve üretim önbelleği korundu. Proje duraklatılmıştır; tamamlama kabulü verilmedi.

**Tekrarlayan otomatik derlemeyi durdurma:** Eski `ensureWindowsProcessHost` kayıp EXE'yi ilk kurulum sayıp yeniden derleyebiliyordu. Yeni hazırlık kaydı kaynak ve PE özetini tutar; kayıtlı EXE kayıpsa `LOCAL_HOST_UNAVAILABLE`, değişmişse `LOCAL_HOST_INTEGRITY` ile durur, yerine başka EXE derlemez. `allowBuild:false` yalnız mevcut dosyayı doğrular; boş cache için derleme yapmaz. Yedi kayıp/değişiklik/eşzamanlılık/doğrulama testi çalıştırılmayan fixture baytlarıyla geçti. Hazırlık kaydı bir imza veya zararsızlık onayı değildir. Mevcut cache yalnız bu sıkı doğrulama moduyla kaydedildi; yeni bir EXE derlenmedi veya başlatılmadı. Etkin iş olmadığı doğrulanıp servisler korumayı yüklemek için yeniden açıldı; son UI gözleminde oturum, altı koşuluk geçmiş ve son sonuç korunmuş, etkin iş sıfırdı. Koruma bulgusu sonrası başka üretim/doğrulama başlatılmadı.

**Bağımsız inceleme:** İlk cache korumasında iki sürecin hazırlık kaydı ve EXE yayını arasında yarış bulundu; çalıştırılmayan rakip dosyalarla yeniden üretildi. Cache doğrulama/derleme/yayınlama süreçler arası kilitle sıralanır, tamamlanmış kayıt atomik ve üzerine yazılmadan yayımlanır. Derlemeden sonra başka hazırlık yeniden denetlenir; kaybeden kurulum kazanan veya karantinaya alınmış dosyayı tekrar yayımlamaz. Dosyanın hash okunurken kaybolması da aynı unavailable hatasına çevrilir. Bekleyen çağrının iptali başka kurulumun kilidini kaldırmaz; terk edilmiş kilit otomatik devralınmaz. Yedi test ve ikinci salt okunur inceleme sonrasında önemli açık bulgu kalmadı. Kilit sahibi çökerse operatör incelemesi gerektiren kullanılabilirlik sınırı korunur.

**Açık işler:** Native yardımcıya ait Defender sınıflandırmasını ve doğrulanmış dağıtım yolunu incelemek; ardından mevcut üretimi koruyan, gereksinim/dosya sahipliği açık bir ürün onarımı tasarlamak. Kalite panelinin erişim/durum görünürlüğü ile kaynak değiştirmeyen kontrol yolu düzeltilmiştir; bu, stok uygulamasının ürün eksiklerinin onarıldığı anlamına gelmez.

**Ürün onarımının ayrı sınırı:** Stok projesinde sıfır deneme hesabı, lint, boş test koşusu, çalışma sözleşmesi ve güvenlik hataları henüz giderilmiş sayılmaz. Mevcut onaylı sözleşmede REQ-1/REQ-6/REQ-9 için görev bağlantısı bulunmadığı salt okunur DB incelemesinde görüldü; bu dosyalara güvenli otomatik onarımın sahibi varmış gibi davranılmamalıdır. Aynı sözleşmede yeniden doğrulama, eksik işleri üretmez veya eski checkpoint'leri yeni sözleşmeye taşımaz. Kaynak değiştiren hedefli onarım için onaylı kapsam, dosya sahipliği ve bağımsız kabul adımları birlikte tasarlanmalıdır; yeni tam plan onayı mevcut üretimi korumanın eşdeğeri değildir. Üretilen proje dizinine elle girilmedi veya dosyaları değiştirilmedi.

### Halka 30 — 2 Kasım: Docker yeniden doğrulaması ve sınırlı onarım hazırlığı

Native yardımcıya müdahale edilmeden Docker profiliyle gerçek doğrulama sürdürüldü. Aynı sözleşme ve birebir paket tanımına ait kayıtlı lockfile, yalnız bağımlılık girdisi olarak yeniden kullanılabilir; yeni ZIP, koşu, worker ve bütün kontroller yine yenidir. Girdi kökeni ayrı kaydedilir. Komut ilerlemesi kabul kanıtından ayrıdır; readiness bütçeleri ve registry proxy'nin geç/yarım yanıt sınırları hedefli testlerle düzeltildi.

`verification-84a843af-11af-4262-ad89-199381e96649` 2 Kasım 03:54:07–04:01:33 İstanbul saatinde 28 PASS / 9 FAIL / 5 BLOCKED kontrol kaydıyla bitti. Platformun seed parola/PATH düzeltmesi gerçek koşuda çalıştı; iki demo hesabı doğrulandı. Yönetim API/giriş bağlantısı, lint, tarayıcı akışları, sıfır çalışan test ve CORS eksikleri sürüyor. Bu sayılar zorunlu temel kapı sayısı veya teslim kabulü değildir. Salt okunur denetimde sözleşmeler, 41 checkpoint, 41 tarihsel aidiyet kaydı ve üretim önbelleği korundu; karşılaştırılan paket kaynaklarında yalnız lockfile farkı var.

Geçerli checkpoint'in diagnostic FAIL/throw nedeniyle yanlış geçersizleşmesi izole testle üretildi; kaynak koruyan yol bunu artık yapmaz, normal doğrulama davranışı korunur. Dört backend süiti geçti. Kalite/sohbet ekranının 37 testi geçti; gerçek UI'da sekiz koşu ve kontroller yüklendi, sonsuz spinner görülmedi. Eski öneri yeni koşudan sonra başlatılamaz. Model bağlantı hatası ve eksik kapsamlı öneri kaynak değişikliği başlatmadı; rota bunları güvenli, sınırlı 400/409/503 yanıtlarıyla gösterir.

Türkçe üretim politikası, statik metin aday envanteri ve isteğe bağlı DOM kanıt sınırı geliştirildi. Editable/kapalı shadow/teknik-token istisnaları eksik kanıtla PASS veremez; 23 sınır/evaluator/etkileşim testi geçti. Gerçek Chrome etkileşim testi stok ürününün Türkçe olduğunun kanıtı değildir. Sonraki kapsam düzeltmesi worker'ın boş/blanket PASS yolunu ve smoke üzerinden toplu sahipliği kaldırdı; backend kendi DB kapsamını normalize edilmiş somut kanıtla değerlendirir. Opaque kanıt ve yürütme kanıtı eksik ownership kaynağı reddedilir. Dokuz izole backend regresyon süiti geçti, bağımsız incelemede ilgili Important bulgu kalmadı. Gerçek gereksinim-assertion eşlemeleri, dil kanıtının ürün kabulüne entegrasyonu, eski politika/makbuz geçişi ve controlled repair teslim kapanışı açık işlerdir; bunlar tamamlanmış sayılmaz.

Canlı sınırlı öneri hazırlanması sürdürülür; tam plan onayı ve DAG yeniden üretimi kullanılmaz. Kaynaklara elle müdahale edilmedi, canlı kaynak onarımı henüz başlamadı. Kesin devam noktası ve açık işler [onarım planında](superpowers/plans/2026-11-01-controlled-repair.md); native inceleme sınırı [güven notunda](security/native-worker-trust-20261102.md) kayıtlıdır.

### Halka 31 — 2 Kasım: kısmi onarımın gerçek yürütülmesi ve kanıt zinciri

Manager'ın hazır önerisi kapsamı tamamladı ancak başarılı seed'e yedek parola eklemeyi önerdiği için başlatılmadı. Manager'a son başarılı kontroller de verildi; başarılı seed, kendisine ait kayıtlı FAIL yokken plan ve başlangıç denetiminde korundu. Son yedi hedefli öneri seed'i dışarıda bıraktı. Alt ajan günlük Türkçe ile Manager görüşmesini tamamladı. Kalite panelinde sekiz geçmiş koşu, 42 eski kontrol ve sıfır sonsuz yükleme mesajı canlı doğrulandı.

İlk deneme, ilgisiz export envanterinin bağlam bütçesini doldurması nedeniyle ilk model çağrısından önce durdu. Kayıtlı ZIP'in izole kopyasında tekrarlandı; sınırlı görev artık yalnız tam gerekli kaynak/ref/schema/auth bağlamını ister. Sonraki gerçek onarım ilk üç hedefi uyguladı; dördüncüde kesilen model yanıtı yazılmadı. Uzun dosya çıktı bütçesi ve Reviewer/Tester ortak bağlamı sınırları genişletildi; sessiz ücretli tekrar yapılmaz.

Kısmi kaynağın yeni bağımsız kontrolü 16:12:55–16:24:24 İstanbul aralığında 40 PASS / 10 FAIL / 11 BLOCKED kontrol satırı kaydetti. API'nin önekli fixture değerlerini çıplak nonce ile arayan platform hatası düzeltildi; doğru önekli kayıt, yanlış korelasyon ve 403 arkasında yazma senaryoları sınandı. Erken servis çıkışı kontrollü cleanup öncesi sınırlı tanı çıktısıyla görünür olur. Failed ürün koşusundaki gerçek dil gözlemi ayrı aksiyon makbuzuyla bağlanır; aggregate PASS değildir.

Assertion kanıtı testten önce/sonra gerçek kaynak baytlarını ölçer. Eski kaynak/koşu, eksik ölçüm, kesilmiş TAP veya değiştirilmiş kanıt kabul edilmez. Yeni öneriye geçişte kısmi kaynak ve özgün hata zinciri düz ve sınırlı lineage ile korunur; yalnız doğrulanmış kökenli ilgili bulgular güncel tam PASS ve semantik kabul sonrasında atomik kapanabilir. İlgisiz hatalar korunur.

Seçili backend regresyonları ve dört frontend paketi (76 test), frontend build'i ve Graphify görünüm eşleşmesi geçti. Bunlar bütün test envanterinin çalıştırılması değildir. 16:43:55'te yalnız yeniden doğrulama başlatıldı; 16:49'da canlı panelde komutlar ve çalışan bağımlılık kurulumu görüldü. Stok uygulaması teslim edilmiş sayılmaz. Üretilen gerçek proje dizinine elle girilmedi veya müdahale edilmedi; üç kaynak değişikliği yalnız XFactor'ın izinli atomik yazıcısıyla yapıldı. Kesin koşu kimlikleri ve açık kabul sınırları [devam planında](superpowers/plans/2026-11-01-controlled-repair.md).

### Halka 31 devamı — kurulum hatasını ürün hatasından ayırma

2 Kasım 20:43–20:55 İstanbul koşusunda npm ci 10 dakikada zaman aşımına uğradı; eksik next/tsx nedeniyle sonraki servis kapanışları ürün kusuru sayılmadı. Kurulum başarısızken README build, servis ve davranış/semantik yürütmeleri BLOCKED kalır; statik belge denetimi sürer. Geliştirme toplam bütçesi açık operatör değerini koruyarak 25 dakika, temiz kurulum komutu bu sınır içinde 15 dakikadır. Komut zaman aşımı sınırlı çıktı, toplam byte, kesilme ve tam akış digestleriyle korunur. İlgili backend ve sahte Docker runtime/profil regresyonları geçti; bu sonuç tüm depo testleri değildir. Yeni gerçek kaynak-koruyan koşu 21:42 İstanbul başladı; son durum ve kimlikleri devam planında izlenir. Panel geçmişi ve çalışan/0-nihai-kontrol görünümü gerçek tarayıcıda doğrulandı. Manager ayrı ajanla sade durum sohbetinde kullanıcıdan teknik işlem beklenmediğini doğru anlattı. Güncel Graphify: 3.602 düğüm/9.533 ilişki; JSON/iki HTML görünümü, uçlar ve kimlikler eşleşti.

22:07 genel süre sınırına takılan koşunun ardından gerçek Docker entrypoint iç sınırında PORT/geçici JWT kaybı VM testiyle doğrulandı ve düzeltildi. Prisma validate motor indirmeleri 150–155 saniye sürdüğünden yalnız bu faz 300 saniye üst sınırına alındı. Build hata çıktısı ve tam akış metadata korunur; süre dolsa da tamamlanan aşamaların özel bounded/redakte tanısı kalır, kabul kanıtı sayılmaz. Worker yeniden başlatıldı ve aynı kaynakla yeni koşu 22:18:51 İstanbul başladı; teslim henüz tamamlanmadı. Kesin güncel durum devam planının son kaydındadır.

### Halka 32 — 4 Kasım: stok-takip devralma kaydı

`7893b21a` koşusu, önceki kaynaklarda ürün ve stok hareketi API'lerini, dört rol akışını ve sistem testi komutunu doğruladı. Sonraki iki dosyalık test onarımı gereksinim kanıtı üretmek için `tests/test-helper.ts` ve `tests/system.test.js` hedeflerini kullandı. `71a98917` temiz kurulumda `ECONNRESET` ile kapandı.

Son kayıt `3269a25b` (4 Kasım 11:50 İstanbul, sözleşme 3), 21 PASS, 7 FAIL ve 7 BLOCKED kontrol satırı içeriyor. Test yardımcısının ürün ve stok hareketi çağrıları servis türleriyle eşleşmediğinden TypeScript ve derleme durdu. Web servisi hazır olmadı. Güncel sistem testi, API ve tarayıcı kanıtı ile gereksinim ve Türkçe arayüz kabulü açık. Proje duraklatılmış durumda. Kullanıcı isteğiyle yeni test veya koşu başlatılmadı. [Ayrıntılı devam kaydı](superpowers/plans/2026-11-01-controlled-repair.md).

### Halka 33 — 5 Kasım: platform röntgeni ve yeni yol haritası

Belgeler, Graphify ve git geçmişi kodla karşılaştırıldı. 18 ana kapı, 17 migrasyon, 180 dosyalık test envanteri ve `3269a25b` koşusunun 21/7/7 dağılımı koddan ve canlı DB'den doğrulandı. Yaklaşık 150 dosyalık çalışma commit edilmemiş durumda. Bu çalışma üç backend süitini kırdı. Güvenlik, şema ve API tarafında da açık bulgular var. Yeni yol haritası Faz 0–5 olarak tanımlandı. `stok-takip-1` için sözleşme 4 taslağı `pending_approval` hâlinde bekliyor. Röntgen aşamasında kaynak değiştirilmedi; yalnız belgeler hizalandı. [Röntgen raporu](rontgen-2026-11-05.md).

Aynı gün Faz 0 tamamlandı. Commit edilmemiş çalışma altı commit'e bölündü ve [PR #3](https://github.com/sirrakadembasti/xfactor/pull/3) ile `main`'e alındı (merge `17bac2e`). Dört CI koşusu boyunca şu hatalar düzeltildi:
- `main`'de 29 Ekim'den beri süren CI kırmızısı.
- Kapsamsız worker izlenebilirliği yüzünden normal doğrulamaların hiç kabul edilememesi (PR içi gerileme).
- Takma adlı geçici dizin nedeniyle macOS ve Windows'ta yerel worker hatası.
- Ubuntu Chromium sandbox'ı.
- `npm audit` bildirimleri.
- Eskimiş E2E ve Docker tarayıcı testleri.

Son koşuda beş CI işinin hepsi yeşil; `production-image` işi ilk kez çalıştı ve geçti.

### Halka 34 — 6 Kasım: Faz 1 güvenlik sertleştirmesi

[PR #4](https://github.com/sirrakadembasti/xfactor/pull/4) ile `main`'e alındı (merge `70882b9`). Değişiklikler:
- Üretim, varsayılan `admin/xfactor` hesabını artık oluşturmuyor. Hiç yönetici yoksa ya da varsayılan parola kullanılıyorsa açılış durduruluyor. Geliştirme davranışı aynı.
- `dev:docker` profilindeki sabit worker token'ı kaldırıldı; iki geliştirme profili de her koşuda rastgele token üretiyor.
- Worker iş iptali, iş durumu okuması gibi `projectId` ile sınırlandı ve bütün worker yanıtları JSON olarak işaretlendi.

Yerelde backend 176/176 süit, worker 205/205 test ve yerel worker entegrasyonu 208/208 test geçti. Beş CI işinin hepsi yeşil. Docker gerektiren üretim imajı kabulü yalnız CI'da çalıştı. Kullanıcı kararıyla asgari parola uzunluğu 6'da kaldı.

### Halka 35 — 6 Kasım: Faz 2 şema bütünlüğü (migrasyon 18)

Migrasyon 18, şemayı tek kanonik biçime taşıdı:
- Proje yetkisi yalnız `project_owners`'tan okunuyor.
- Durum ve rol alanları CHECK ile sınırlandı.
- Attempt, koşu ve mesaj bağlantıları FK ile korunuyor.
- Kullanılmayan iki tablo kaldırıldı.

Tablo yeniden kurulumu için migrasyon koşucusu, FK denetimini işlem dışında kapatıp commit öncesi `foreign_key_check` ile doğrulayacak şekilde genişletildi.

İnceleme sırasında üç gizli tutarsızlık bulundu ve kökten düzeltildi:
- Statik denetim onarım kayıtları `run_id` alanına attempt kimliği yazıyordu. Yeni açık `origin` sütunuyla ayrıldılar.
- Sahibi verilmeyen projelere sahte bir `legacy-local-owner` kullanıcısı yazılıyordu.
- `running` proje durumu hiç var olmadığı hâlde sorgularda ölü dal olarak duruyordu.

Canlı veritabanı önce `VACUUM INTO` ile yedeklendi. İki test kullanıcısı silindi, eski veri dosyaları yedek dizinine taşındı, ardından migrasyon uygulandı: satır sayıları aynı, 0 FK ihlali.

Doğrulama: backend 177/177 süit, worker 205/205 test, yerel worker entegrasyonu 208/208, frontend 153/153; E2E 4 geçti, 1 atlandı. Zaman biçimi birleştirme kullanıcı kararıyla açık bırakıldı.

7 Kasım'da [PR #5](https://github.com/sirrakadembasti/xfactor/pull/5), beş CI işinin hepsi yeşilken `main`'e alındı (merge `e348566`).

### Halka 36 — 7 Kasım: Faz 3 API sözleşmesi

Faz 3 dört maddeyle uygulandı:
- Lease bırakma artık geçersiz terminal durumu açıkça reddediyor ve veritabanı hatalarını sessizce yutmuyor; bu, Faz 2'nin migrasyon 18 CHECK'leriyle ortaya çıkan bir riskti.
- Worker istemcisinin her isteği varsayılan bir zaman aşımıyla sınırlandı.
- Gözlemlenebilirlik yanıt şekilleri tek modülde toplandı ve bir sözleşme anlık görüntüsü testiyle korundu.
- Arayüzün kullanmadığı dokuz uç, kullanıcı kararıyla iç ve teşhis API'si olarak belgelendi.

README'deki Kalite Paneli anlatımı koda göre düzeltildi. Testler sırasında makinedeki dış yük bazı süitleri zaman aşımına uğrattı; aynı süitler yük azalınca geçti.

14 Kasım'da CI'ın `ubuntu-26.04` imajına geçtiği görüldü. Bu imajda `bwrap` kurulu geldiği için "sandbox yok" varsayan iki test düştü. Testler, makineden bağımsız olarak kullanılamaz bir adapter verecek biçimde düzeltildi; ürün kodu değişmedi.

14 Kasım'da [PR #6](https://github.com/sirrakadembasti/xfactor/pull/6), beş CI işinin hepsi yeşilken `main`'e alındı (merge `ec299fe`).

### Halka 37 — 14–15 Kasım: Faz 4 modül disiplini

- Onarım, bağımsız inceleme ve yeniden doğrulama rotaları `projectRepairRoutes.js`'e taşındı.
- `workflow.js`'in yardımcıları `workflowSupport.js`'e; kalite/Tester ve kabul aşamaları `stages/qualityStage.js` ile `stages/acceptanceStage.js`'e ayrıldı. `workflow.js` 1.834 satırdan 920'ye indi.
- `executionClient.js` backend stiline getirildi.
- Kaynak metni denetleyen güvenlik testleri yeni aşama modüllerini de kapsayacak şekilde genişletildi.

`agents/tester.js` ve `services/reconciliationService.js` kullanıcı kararıyla bu fazda bölünmedi.

15 Kasım'da [PR #7](https://github.com/sirrakadembasti/xfactor/pull/7), beş CI işinin hepsi yeşilken `main`'e alındı (merge `c25e721`).

### Halka 38 — 15 Kasım: Faz 5 başlangıcı, sözleşme taslağı reddi

Faz 5'e başlamadan önce `stok-takip-1`'in onay bekleyen sözleşme 4'ü onaylı sözleşme 3 ile karşılaştırıldı. Fark dar: REQ-10 (ayrık 3000/3001 portları) ve REQ-11 (`npm test` duman testi) eklenmiş, şartname somutlaştırılmış. Sonradan oluşturulan kullanıcıların parola güvenliği kuralı ise yalnız seed hesaplarına daralmış. Kullanıcı sözleşme 3 ile devam etmeye ve taslağı reddetmeye karar verdi.

Uygulamada bekleyen bir taslağı reddetmenin yolu yoktu; tek ret fonksiyonu projeyi `capability_blocked` durumuna kilitliyordu. Bu yüzden sahip yetkili `POST /api/projects/:id/contracts/:revision/reject` ucu (`routes/projectContractRoutes.js`) ve arayüzde **Taslağı Reddet** düğmesi eklendi. Proje yanıtı artık her durumda `pendingContract` alanını taşıyor; böylece duraklatılmış projelerde bekleyen taslak da görünüyor.

Sözleşme 4, canlı veritabanının `VACUUM INTO` yedeği alındıktan sonra bu uçla, proje sahibinin kimliğiyle reddedildi. Sonuç: sözleşme 3 `approved`, sözleşme 4 `rejected`, proje `paused` (revizyonu değişmedi) ve sohbete ret kaydı düştü.

### Halka 39 — 15 Kasım: Onarım önerisi bağlamı

`stok-takip-1` için sınırlı onarım önerisi dört denemede de hazırlanamadı:
- Gemini'de önce süre aşımı, sonra 503, sonra token kesilmesi.
- Minimax'te 240 saniyelik süre aşımı.

Önerinin istemi, gerçek verilerle ve LLM yerine saplama verilerek ölçüldü: yaklaşık 46.000 token. Asıl kusur bağlamın yanlış seçilmesiydi:
- Tip hatasının olduğu `tests/test-helper.ts` hiç gönderilmiyordu, çünkü seçici yalnız `*.test.*`/`*.spec.*` dosyalarını test kabul ediyordu.
- Yardımcının çağırdığı servis ve validasyon dosyaları bütçe dışında kalıyordu; bütçeyi öne alınan büyük rota dosyaları dolduruyordu.

Önceki onarımın yanlış servis imzalı yardımcı üretmesinin nedeni de büyük olasılıkla buydu.

`buildRepairSourceFacts` artık bütçeyi şu sırayla dolduruyor: başarısız kontrol çıktısında adı geçen dosyalar (`failedCheckSourcePaths`), teşhis edilen testler, servis ve validasyonlar, yapılandırma, kontrolcüler, rotalar. Öneri süresi, profil süresi ile 240 saniyeden büyük olanı alıyor ve LLM katmanının 300 saniyelik sınırını geçmiyor (`repairProposalTimeoutMs`). Yeniden ölçümde yardımcı, dört servis ve dört validasyon istemde. İstemin boyutu değişmedi, çünkü bütçe aynı.

### Halka 40 — 15 Kasım: stok-takip onarım turları ve platform düzeltmeleri

Sınırlı onarım turlarında `tests/test-helper.ts` ve `src/app.ts` onarıldı. En iyi koşu `cf9d06d6`: 67 PASS; derleme, lint, servisler, API ve tarayıcı geçti. Turlar şu platform hatalarını ortaya çıkardı:
- Minimax'in varsayılan "max" düşünmesi Manager, onarım Coder'ı ve bağımsız inceleme çağrılarını süre ya da token sınırına takıyordu. Bu çağrılar artık düşük düşünme istiyor; inceleme Coder'la aynı 240 sn bütçeyi alıyor.
- `npm test`, koşunun demo parolalarını almıyordu ve sandbox `PASSWORD` anahtarlarını siliyordu. Parolalar artık dar bir `ephemeralEnv` kanalıyla geçiyor.
- Sağlıklı yürütmeler kilit kontrolünde düşürülüyordu (`execution_fenced`). Kalp atışı ayrı bir `worker_thread`'e taşındı, ama sorun bir olayda daha yaşandı: iş parçacığının yazımı veritabanı kilidinde bekletiliyordu. Kök neden henüz bulunmadı; tanılama logları (`workflow.lease_check_failed`, `workflow.heartbeat_write_*`) eklendi. Sonraki iki koşuda olay yaşanmadı.

Açık kalanlar:
- Yerel Windows worker'da testlerin `spawn('npm')` çağrısı ENOENT veriyor; XFactor bunu ortam engeli sayıyor.
- Docker koşularında npm `ECONNRESET` hatası görüldü.
- Bağımsız inceleme, admin ürün oluşturma başarısı gözlenmediği için kabul etmedi.
- Proje `paused` durumda duruyor, `GET /:id/logs` ise `paused` durumunda her çağrıda logları diskten yeniden kuruyor (yaklaşık 6,5 sn).

### Halka 41 — 16 Kasım: Docker turları ve PR #8

Docker worker'a geçildi. Doğrulama hattında dört düzeltme yapıldı:
- Uygulamanın test süiti 5 dakika alıyor (`c35777c`).
- Adaptör hata fırlattığında testin tam çıktısı korunuyor (`9bb0b5a`).
- Başarısız TAP vakaları onarım önerisine gönderiliyor (`f9cee10`).
- Coder'a bir kez biçim düzeltme hakkı verildi (`8c870fe`).

En iyi koşu `39be2bde`: 83 PASS; uygulamanın 20 testinden 19'u geçti. Tek hata, Next.js'in React 18 uyarısını içeren `stderr`'i boş bekleyen testti. Sonraki üç minimax onarım turu geriledi; son koşu `cd49324b` 20 PASS'te kaldı.

Platform düzeltmeleri [PR #8](https://github.com/sirrakadembasti/xfactor/pull/8) ile beş CI işinin hepsi yeşilken `main`'e alındı (merge `6e852a0`). `stok-takip-1` `paused` duruyor ve teslim edilmedi.

### Halka 42 — 16–17 Kasım: orta seviye modelle onarım döngüsü

Kullanıcı kararı: XFactor, orta seviye bir modelle (MiniMax profili) de ürün çıkarabilmeli. Ret nedenleri modele geri verilmeli, kurallar gevşetilmemeli. `faz-5/stok-takip-onarim` dalında şu düzeltmeler yapıldı:
- **Öneri düzeltme turları:** Kurala uymayan öneri, kesin ret nedeniyle Manager'a en çok iki kez geri gönderiliyor (`REPAIR_PROPOSAL_CORRECTION_ROUNDS`). Önceki turların ret nedenleri de mesajda yer alıyor; böylece model iki kural arasında gidip gelmiyor. Davranış referansı ret mesajı ilgili yolu adıyla veriyor.
- **Bağlam bütçesi ayrıntısı:** Bir hedefin referansları Coder bağlamını (192 KB) aşarsa model, hedef ve otomatik eklenen dosyaların gerçek bayt boyutunu, kalan yeri ve önerdiği referansların boyutunu görüyor.
- **Sözdizimi denetimi:** Coder'ın JS/TS çıktısı `@babel/parser` ile ayrıştırılıyor. Ayrıştırılamayan çıktı modele hata satırıyla bir kez geri gönderiliyor; ikinci hatada onarım duruyor ve dosya yazılmıyor. Daha önce kaynakta kalan bir `\n` dizisi bütün koşuyu derleme hatasına düşürmüştü.
- **Değişmeyen hedef:** Coder bir hedefi aynen döndürürse deneme `unchanged` olarak kaydediliyor ve onarım sürüyor. Hiçbir hedef değişmediyse onarım duruyor.
- **Tip denetimi sondası:** İncelemeden önce worker'da yeni `typecheck_artifact` işi çalışıyor: kayıtlı kilit dosyasıyla kurulum, varsa `prisma generate`, ardından `tsc --noEmit` (`runTypecheckProbe`, `controlledTypeProbe.js`). Hatası olan her değişmiş hedef, hata satırlarıyla bir kez daha Coder'a gidiyor. Sonda yalnız yol göstericidir: doğrulama koşusu, kontrol ya da kabul kanıtı üretmez. Kullanılamazsa adım loglanıp atlanıyor.
- **Fikstür kanıtı:** API fikstürü kayıt oluşturamazsa kanıt; HTTP durumunu, sözleşme alanlarını ve yanıttaki `error`/`message`/`errors`/`details` alanlarını taşıyor.
- **Onarım geçmişi kontrol noktası:** Geçmiş 32 kayda ulaşınca en eski 16 kayıt doğrulanıp tek bir kontrol noktasında toplanıyor (`compactLineage`). Kontrol noktası; özet hash, katlanan kayıtların köken kimlikleri ve sonraki plan bağını taşıyor. Yalnız ilk kayıt olabilir ve köken satırları hâlâ eşleşmeli. Geçmiş doğrulanamazsa öneri 500 yerine 409 (`CONTROLLED_REPAIR_LINEAGE_BLOCKED`) ile reddediliyor. Bu işten önce canlı DB'nin yedeği alındı (`backend/data/maintenance-backups/pre-lineage-checkpoint-20261116T175857Z.db`).
- **Eski bağımlılık kökeni:** Güncel `package.json` ile artık eşleşmeyen bir hazırlık kaydı, geçmiş zincirini geçersiz saymıyor; ilgili kayıt açık kalıyor.

Koşu dizisi: 83 → 77 → 19 → 21 → 80 → 21 → 82 (sonda bir tip hatası yakaladı) → süre aşımı → `76dccdd0`: 83 PASS, 4 FAIL, 3 BLOCKED. Bu son koşuda servisler, smoke ve üç tarayıcı kapısı ilk kez birlikte geçti. Kalan gerçek hata uygulamanın test süitinde: iki tarayıcı testi "Promise resolution is still pending" ile bitiyor. Gereksinim, dil ve izlenebilirlik kontrolleri son bağımsız incelemeyi bekliyor (bir hak kaldı). Test çıktısı kanıtı baştan yaklaşık 16 KB'ta kesiliyor; sondaki hook hatası kaybolabiliyor.

17 Kasım'daki onarım turu (plan `0ac94194`, altı hedef) beş dosyayı yazdıktan sonra altıncı hedefte "Onarım bağlamı eksik." ile durdu. `tests/browser-journey.test.js`, aynı turda yeni oluşturulan `tests/repair-fixture.ts`'i referans alıyordu. Öneri anındaki ölçüm yalnız var olan dosyaları saydığı için bağlam yaklaşık 186 KB görünmüştü; dosya yazıldıktan sonra 196,5 KB'a çıktı. Düzeltme: öneri ölçümü, ölçülen hedeften önce yazılacak ve onun bağlamına giren her dosya için 16 KB pay ayırıyor (`controlledRepairBatchGrowth`, `CONTROLLED_BATCH_FILE_RESERVE_BYTES`). Ret ayrıntısı bu payı ve henüz olmayan dosyaları adıyla bildiriyor. Aynı ölçüm onarım başlarken de uygulanıyor.

### Halka 43 — 17 Kasım: altyapı hatası kaynak hatası sayılmıyor (Y1)

`docs/yol-haritasi-2026-11-17.md` B-1: bir `npm ci` 502'si `clean_install` FAIL ve 10 BLOCKED kapı üretmiş, bunlar açık `worker_rejection` kaydı olup Devam Ettir'i "Manager revizyonu gerekir" ile kapatmıştı (`stok-takip-1`'de 92 açık kayıt). `faz-6/y1-altyapi-hatasi` dalında:
- `packageVerifier.js:isTransientRegistryFailure`: `E502/E503/E504`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `ENOTFOUND`, `socket hang up` geçici sayılır; `ERESOLVE`, `ETARGET`, `E404`, `EINTEGRITY` varsa sayılmaz.
- `clean_install`: geçici hatada komut kalan süre içinde **bir kez** yeniden denenir (iptalde ve zaman aşımında denenmez). İlk denemenin özeti `evidence.retries`'a yazılır. İkinci deneme de geçici hatayla biterse kontrol `blocked` olur ve `evidence.classification = 'infrastructure'` taşır; PASS üretilmez.
- `workerFailures.js`: sınıf worker kanıtından okunur. Yalnız altyapı blocker'ı varsa (ürün bulgusu ve başka blocker yok) kayıt `classification: 'infrastructure'` yazılır; aşağı akış BLOCKED kapılar sonuç sayılır. Karışık durumda eski `ambiguous` davranışı korunur. `loadOpenWorkerRepairBatch` bu kayıtları `issues`'a koymaz, `infrastructureIssues` olarak ayrı döndürür; böylece `recoveryRevisionRequired` ve `priorWorkerBlockers` tetiklenmez.
- `artifactVerifier.js`: yeni koşu oluşturulurken aynı sözleşmenin açık altyapı kayıtları çözülür (açık kayıt teslimi bloke ettiği için gerekli). `acceptanceStage.js`: başarısız koşunun hata metni altyapı nedenini taşır, `Worker repair requires Manager revision:` öneki kullanılmaz.
- Yeni `origin` değeri eklenmedi; şema değişmedi. Testler: `test_infrastructure_failure_classification.js` (yeni) ve `test_worker_repairs.js` (altyapı hattı).

### Halka 44 — 17 Kasım: test çıktısı kanıtında baş ve kuyruk (Y4)

B-4: Worker ilk 1 MiB'ı, backend ilk 16 KB'ı tutuyordu; TAP çıktısının sonundaki `not ok` blokları ve özet kayboluyordu (`76dccdd0`'daki iki tarayıcı testi gibi). `faz-6/y4-test-cikti-kuyrugu` dalında:
- `execution/outputRetention.js`: ilk yarı sabit, son yarı halka tampon. İşaret (`…[kesildi: N bayt]…`) bayt bütçesinin dışında, yalnız metne eklenir.
- `execution/runtime.js:captureChildOutput` (Docker) ve `execution/localProcesses.js` (yerel) bu tamponu kullanır. `stdout/stderrBytes`, `*Sha256` (tüm akış), `*Truncated` anlamı ve kesilmiş çıktının `passed: false` sayılması aynen kaldı.
- `backend/verification/workerFailures.js:bounded`: sınır içindeyse olduğu gibi; aşarsa baş + işaret + kuyruk, toplam sınırı aşmaz (işaret sınıra dahil). Redaksiyon kesmeden önce uygulanmaya devam ediyor. Yanıt şekli değişmedi.
- Testler: `test_worker_check_log_tail.js` (yeni), `execution/tests/runtime.test.js` ve `localProcesses.test.js` (eski "yalnız baş" beklentileri baş+kuyruğa güncellendi, kuyruk testleri eklendi).

### Halka 45 — 17 Kasım: transaction içinde `await` kalmadı (Y2)

B-2: backend tek paylaşılan `node:sqlite` bağlantısı kullanıyor; `BEGIN IMMEDIATE` açıkken gerçek disk I/O `await`'i olay döngüsünü başka isteklere açıyor, kalp atışı iş parçacığının yazımını da kilitte bekletebiliyordu. `faz-6/y2-transaction-await` dalında:
- `repositories/artifactRepository.js:withArtifactTransaction` senkron oldu; `work()` bir `Promise` döndürürse transaction geri alınır ve `Artifact transaction callback must be synchronous.` hatası verilir.
- `utils/archive.js:createProjectZip`: ZIP önce `fs.rename` ile son konuma taşınıyor (transaction dışında), sonra `createArtifact` ve `addArtifactFile` kayıtları senkron transaction'da yazılıyor. Kayıt başarısız olursa mevcut `catch` son dosyayı siliyor.
- `services/reconciliationService.js`: kopya transaction kaldırıldı, paylaşılan senkron yardımcı kullanılıyor. `rehydrateProjectStateFromDisk` ve `rehydrateProjectLogsFromDisk` senkron çekirdeğe (`...Sync`) ve ince `async` sarmalayıcıya bölündü; dışa aktarımlar ve davranış aynı. Tamamlanmış projenin ZIP kurtarması (gerçek dosya I/O) artık `recoverCompletedProjectArtifact` ile **transaction commit edildikten sonra** yapılıyor (`autoRegisterDiscoveredProjects` ve `reconcileProjectsWithDisk`).
- **Düzeltilen gizli hata:** ZIP kurtarması eskiden bu iki döngünün açık transaction'ı içinde çalışıyordu; içerdeki ikinci `BEGIN IMMEDIATE` hata verip yutuluyordu. Bu yüzden otomatik kayıt/senkron sırasında tamamlanmış projeler için artefakt hiç oluşmuyordu. Yeni test eski kodda kırmızıydı.
- `test_transaction_await_boundary.js` statik koruma: `backend/` altında `BEGIN` ile `COMMIT` arasında `await` arar; izin listesi yalnız `writeProjectState` çağrılarıdır (`saveProjectState` içinde gerçek I/O yok, yalnız mikro-görev boşluğu). Yol haritasındaki isteğe bağlı 6. adım (senkron `saveProjectStateInTransaction`) yapılmadı; bu satırlar izin listesinde duruyor.

### Halka 46 — 17 Kasım: kilit hatası ölçümü (Y3a)

B-3 (`workflow.execution_fenced`) kök nedeni hâlâ ölçülmedi; bu halka yalnız ölçüm ekler, davranışı değiştirmez. `faz-6/y3a-kilit-olcumu` dalında:
- `db.js:measureTransaction(label, fn, { now, sink, thresholdMs })`: tam bir `BEGIN…COMMIT` bloğunu çalıştıran senkron fonksiyonu sarar, kendisi transaction açmaz. Süre 1.000 ms'yi aşarsa `db.transaction_slow` uyarısı yazar: `{ label, ms, caller }` (`caller`: yığının 5 çerçevesi). Hata fırlasa da ölçer ve hatayı yeniden fırlatır.
- Sarılan noktalar: `saveProjectState` (`projectRepository.js`), `commitWorkflowSource` (`workflowAttempts.js`), `commitVerificationContext`, `saveProjectLog` ve artefakt transaction'ı. Artefakt noktası yol haritasındaki `utils/archive.js` yerine `repositories/artifactRepository.js:withArtifactTransaction`'dır (Y2'den sonra `createProjectZip` ve uzlaştırma aynı yardımcıyı kullanıyor). Her biri mevcut gövdeyi değiştirmeden sarmalayıcıyla ölçülür; `saveProjectState` hâlâ `Promise` döndürür.
- `projectRepository.js:noteLargeWorkflowState`: `workflow_state` 256 KB'ı aşarsa proje başına süreç ömründe bir kez `workflow.state_large` yazar: `{ projectId, bytes, topKeys }` (en büyük üç üst düzey anahtar ve baytları).
- Her iki log da stdout/stderr'e gider. **Bulgu için** bir sonraki gerçek koşunun terminal çıktısı gerekir (`db.transaction_slow`, `workflow.state_large`, `workflow.lease_check_failed`, `workflow.heartbeat_write_slow`). Çıktı alınmadan Y3b (lineage tablosu, migrasyon 19) kararı verilmez.
- Testler: `test_db_transaction_measurement.js` (sahte saatle yavaş/hızlı/hatalı transaction, `state_large` eşiği ve tekrar yazmama, beş noktanın sarıldığı, gerçek `saveProjectState` ile `state_large`).

### Halka 47 — 17 Kasım: Worker iş deposu hafifledi (Y7)

B-5: `execution/jobStore.js` her komut olayında bütün iş dosyasını (~7,9 MB, 24 saat boyunca `archiveBase64`/`packageJsonBase64` dahil) senkron yeniden yazıyor ve olay döngüsünü bloke ediyordu. `faz-6/y7-worker-is-deposu` dalında:
- **Terminal işte yük silinir:** `completed`, `failed`, `cancelled`, `failed_timeout` ve `failed_interrupted` durumuna geçen işin `archiveBase64`/`packageJsonBase64` alanları silinir; kimlik alanları, sonuç ve `inputSha256` kalır. Dosya yüklenirken eski kayıtlardaki yükler de silinir (bir kez yeniden yazılır). Yürütücü işin kopyasıyla çalıştığı için çalışan iş etkilenmez.
- **Tekrar gönderim:** Silinen yükün yerine `inputDigest` (yükün SHA-256'sı) saklanır. Terminal bir işe aynı kimlik ve aynı girdiyle yeniden `insertJob` `exists` döner; farklı `inputSha256`, nonce, sözleşme ya da aynı iddia edilen özetle farklı bayt `Duplicate jobId with different input` hatası verir. Yol haritası yalnız `inputSha256` karşılaştırmasını öneriyordu; `prepare_dependencies` için bu özet paket baytlarına sunucuda bağlanmadığından, baytların özetini de karşılaştırmak mevcut tam karşılaştırma garantisini korur.
- **Tanılama yazımı birleşir:** Komut ve faz olayları en çok 1 sn'de bir yazılır (`saveCoalesceMs`). Sessiz bir dönemdeki ilk olay hemen yazılır (çökmede kaybolmaz; mevcut kurtarma testi bunu gerektirir), aynı aralıktaki sonrakiler tek bir sonda yazımda birleşir. `beginDiagnostics`, `insertJob`, terminal geçiş ve `close()` hemen yazar; `close()` bekleyen yazımı temizleyip son kez yazar. Yüz olaylık bir seri en çok iki yazım üretir.
- **Çökme kurtarma değişmedi:** `running` iş yeniden yüklenince `failed_interrupted` olur. Birleştirilmiş son olaylar çökmede en fazla bir saniyelik tanılama kaybedebilir; kabul kanıtı değildir.
- Testler: `execution/tests/jobStoreLightweight.test.js` (yeni, 7 test) ve mevcut `jobStoreRecovery.test.js` (değişmedi, geçiyor).

## 6. Kaynak kapsamı ve belirsizlikler


- `docs/faz -arsiv/faz.md`: Eski P0–P9 genel özeti; Quiz-Master düzeltme/test listeleri tekrar eder. Bu dosyada tekilleştirildi.
- `docs/faz -arsiv/implementation-plans/00-MASTER-EXECUTION-PLAN.md` ve 01–14 numaralı planlar: Bağımlılık, kapsam ve görev hedefleri. Plan snippet'leri güncel çalıştırma komutu olarak kullanılmamalıdır.
- `docs/faz -arsiv/implementation-evidence/P0-A.md`–`P9.md`: Aşama bazlı tarihsel makbuzlar. `SELF` alanı bu arşivde gerçek commit SHA'sına dönüştürülerek uydurulmadı.
- `docs/faz -arsiv/implementation-evidence/QUIZ-MASTER.md`: Olumlu alt testlere rağmen nihai kabulün eksik kaldığını belirten özel kayıt.
- `docs/faz -arsiv/implementation-evidence/INDEX.md`: P4'te duran eski indeks. P5–P9'un yokluğu başarısızlık kanıtı değildir; ilgili kayıtlar ayrıca okundu. Master durum tablosu P8'de biter; P9 ayrı plan/kanıt ve git geçmişiyle izlendi.
- [Mimari yol haritası](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/mimari-yol-haritasi.md), [Faz 1](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-1-rapor.md), [Faz 2](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-2-rapor.md), [Faz 3](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-3-rapor.md), [Faz 4](https://github.com/sirrakadembasti/xfactor/blob/b3d7403/docs/roadmap-reports/faz-4-rapor.md): İkinci faz dizisinin bulgu/görev/test/commit kaynağı.
- Git geçmişi: Ağustos başlangıcı, Eylül geçişleri, Ekim merge tarihleri ve commit kimlikleri. Commit başlığı tek başına test PASS kanıtı değildir.

`docs/faz -arsiv/` yerel klasörü mevcut .gitignore kuralıyla takip dışıdır; yeni `docs/faz-arsiv.md` aynı kurala girmez. Bu dosya ana tarihsel anlatıyı kendi içinde taşır; takip dışı kaynaklara dosya linkiyle zorunlu okuma bağımlılığı kurmaz. Birleştirilen ayrı roadmap raporları güncel ağaçtan kaldırılmıştır; yukarıdaki kalıcı Git bağlantıları eski raporları `b3d7403` sürümünde gösterir. Takip dışı yerel arşiv yayın bağımlılığı değildir. Tarih verilmemiş kayıtlara dosya mtime'ından yapay tarih atanmadı; dönemler makbuz ve ilgili git zincirinden çıkarıldı.
