# XFactor ajan Markdown envanteri — 22 Ekim 2026

Bu rapor, düzeltmelerden önce yapılan salt okunur kaynak incelemesini kaydeder. İnceleme sırasında üretim veya LLM çağrısı yapılmadı; kullanıcı projeleri, sır dosyaları ve kabul edilmiş otel ZIP'i açılmadı. Bu raporun oluşturulması dışında değişiklik yapılmadı. Testler bu alt incelemede çalıştırılmadı; aşağıdaki test referansları mevcut kapsamı gösterir, yeni bir PASS iddiası değildir. Satır numaraları inceleme anındaki kaynağa aittir; sonraki düzeltmelerde kayabilir.

## Sonuç

Altı rol Markdown dosyası gerçek sistem istemidir. Beş protokol şablonu çalışma zamanında okunmaz; gerçek Markdown kayıtlarını JavaScript üretir. Ana orkestrasyon anayasası yalnız Manager sohbet istemine eklenir ve orada ilk 3.000 karaktere kesilir. Üretim ajanlarına anayasa genel bir katman olarak aktarılmaz. Bu nedenle dosyanın varlığı, tam metninin bütün ajanlara uygulandığı anlamına gelmez.

## Güvenilir yükleyici ve öncelik

[agentPaths.js](../../backend/agents/agentPaths.js#L5) güvenilir kökü sabit `x-agents/` dizinine bağlar. İzin listesi altı rol, anayasa ve beş şablondur. [readAgentDocument](../../backend/agents/agentPaths.js#L17) bilinmeyen dosyayı, bağlantılı kökü/dosyayı, normal dosya olmayan girdiyi, gerçek yolla kökten kaçışı ve 128 KiB üzerindeki dosyayı reddeder. Proje kökü ile ajan kökünün doğrudan veya gerçek yol üzerinden çakışması [assertProjectsSeparateFromAgents](../../backend/agents/agentPaths.js#L52) tarafından reddedilir.

[loadAgentPrompt](../../backend/agents/agentLoader.js#L7) ilk YAML frontmatter bloğunu kaldırır, metni kırpar ve 50 karakterden uzun olmasını ister. Kalan rol metnini tam döndürür. [loadOrkestrasyonTalimatnamesi](../../backend/agents/agentLoader.js#L17) bütün kırpılmış anayasa metnini döndürür ve 100 karakter alt sınırı uygular. Eksik/geçersiz talimatta istisna oluşur; başka dizine veya kod içi yedek isteme dönüş yoktur. Bu denetimler anlamsal doğrulama veya politika tutarlılığı denetimi değildir.

Üretim rol sabitleri modül yüklenirken oluşturulur ve [AGENT_REGISTRY](../../backend/agents/index.js#L16) içinde saklanır. Rol dosyası değişince üretim isteminin yenilenmesi için backend yeniden başlatılmalıdır. Sohbet Manager dosyası ve anayasa ise istem hazırlanırken yeniden okunur. Kaynakta anayasa ile rol arasında açık bir çatışma önceliği veya genel politika birleştirme işlevi bulunmaz. Sohbette rol metni, anayasa alıntısı ve sonradan eklenen kurallar aynı `system` mesajındadır; yalnız metin sırası mekanik bir politika önceliği değildir.

## Dosya bazında envanter

| Dosya | Gerçek okuyucu / tüketici | Tetiklenen aşama ve öncelik | Tamlık, önbellek ve geri dönüş |
|---|---|---|---|
| [manager.md](../../x-agents/manager.md) | [manager.js:4](../../backend/agents/manager.js#L4), ayrıca [projectRoutes.js:265](../../backend/routes/projectRoutes.js#L265) | Üretim Manager planı ve kullanıcıyla Manager sohbeti; `system` | Frontmatter dışında tam. Üretim modül önbelleği, sohbet her kurulumda yeniden okur. Geçersizse istisna. |
| [director.md](../../x-agents/director.md) | [director.js:4](../../backend/agents/director.js#L4) | Domain şartnamesi; `system`; çağrı [workflow.js:786](../../backend/engine/workflow.js#L786) | Frontmatter dışında tam, modül önbelleği, yedek istem yok. |
| [teamleader.md](../../x-agents/teamleader.md) | [teamleader.js:4](../../backend/agents/teamleader.js#L4) | DAG görev planlama; `system`; [workflow.js:867](../../backend/engine/workflow.js#L867) | Frontmatter dışında tam, modül önbelleği, yedek istem yok. |
| [coder.md](../../x-agents/coder.md) | [coder.js:4](../../backend/agents/coder.js#L4) | İlk kod üretimi, Reviewer düzeltmesi, hedefli statik onarım; `system` | Frontmatter dışında tam, modül önbelleği. İlk çağrı [workflow.js:995](../../backend/engine/workflow.js#L995), düzeltme [selfCorrection.js:121](../../backend/engine/selfCorrection.js#L121). |
| [reviewer.md](../../x-agents/reviewer.md) | [reviewer.js:4](../../backend/agents/reviewer.js#L4) | Coder çıktı incelemesi; `system`; [selfCorrection.js:66](../../backend/engine/selfCorrection.js#L66) | Frontmatter dışında tam, modül önbelleği. Parser hatalı kaynakta LLM incelemesi yerine deterministik ret uygulanır. |
| [tester.md](../../x-agents/tester.md) | [tester.js:7](../../backend/agents/tester.js#L7) | Statik QA tavsiyesi; `system`; [workflow.js:1263](../../backend/engine/workflow.js#L1263) | Frontmatter dışında tam, modül önbelleği. Runtime/ZIP kabulünün yerine geçmez. |
| [ORKESTRASYON-TALIMATNAMESI.md](../../x-agents/ORKESTRASYON-TALIMATNAMESI.md) | [agentLoader.js:17](../../backend/agents/agentLoader.js#L17), tek çalışma zamanı çağrısı [projectRoutes.js:266](../../backend/routes/projectRoutes.js#L266) | Yalnız Manager sohbeti; rol metninden sonra aynı `system` mesajı | Yükleyici tam okur; [çağıran ilk 3.000 karakteri ekler](../../backend/routes/projectRoutes.js#L270). Her sohbet isteminde yeniden okuma. Üretim rollerine genel aktarım yok. |
| [ALT-TALIMATNAME.md](../../x-agents/ALT-TALIMATNAME.md) | İzin listesinde; çalışma zamanı şablon okuyucusu yok | İnsan için domain belge biçimi | Gerçek içerik Director JSON sonucundan gelir; [fileProtocol.js:74](../../backend/engine/fileProtocol.js#L74) kaydeder. Şablon değişikliği sonucu değiştirmez. |
| [GOREV.md](../../x-agents/GOREV.md) | İzin listesinde; çalışma zamanı şablon okuyucusu yok | İnsan için görev belge biçimi | Gerçek dosyalar [fileProtocol.js:39](../../backend/engine/fileProtocol.js#L39), [85](../../backend/engine/fileProtocol.js#L85), [115](../../backend/engine/fileProtocol.js#L115), [143](../../backend/engine/fileProtocol.js#L143) içindeki koddan oluşur. |
| [TODO.md](../../x-agents/TODO.md) | İzin listesinde; çalışma zamanı şablon okuyucusu yok | İnsan için ilerleme tablosu / checkbox biçimi | Gerçek tablolar [fileProtocol.js:43](../../backend/engine/fileProtocol.js#L43), [91](../../backend/engine/fileProtocol.js#L91), [118](../../backend/engine/fileProtocol.js#L118) içinde üretilir. |
| [DURUM.md](../../x-agents/DURUM.md) | İzin listesinde; çalışma zamanı şablon okuyucusu yok | İnsan için durum belge biçimi | Gerçek biçimi [writeDurum](../../backend/engine/fileProtocol.js#L155) üretir. Şablondaki enum çalışma zamanı doğrulayıcısı değildir. |
| [RAPOR.md](../../x-agents/RAPOR.md) | İzin listesinde; çalışma zamanı şablon okuyucusu yok | İnsan için tamamlanma raporu biçimi | [writeRapor](../../backend/engine/fileProtocol.js#L308) çağıranın metnini yazar. Rapor gövdeleri örneğin [workflow.js:1132](../../backend/engine/workflow.js#L1132) içinde oluşturulur. |
| [README.md](../../x-agents/README.md) | Ajan istem yükleyicisi yok | Operatör rehberi | İnsan belgesi; rol önbelleğini, kaynak ayrımını, OS sandbox sınırını ve statik/runtime ayrımını açıklar. |

Şablonların izin listesinde bulunması kullanılmaları anlamına gelmez. Üretim kodunda `readAgentDocument` çağrıları yalnız rol yükleyicisi ile anayasa yükleyicisindedir.

## Gerçek anayasa ve istem zinciri

```text
Manager sohbeti HTTP işleyicisi
  -> buildManagerChatSystemPrompt (projectRoutes:151)
  -> loadAgentPrompt('manager') (265; temizlenmiş tam metin)
  -> loadOrkestrasyonTalimatnamesi() (266; tam okuma)
  -> constitution.slice(0,3000) (270)
  -> proje durumu / hata / raporlar / sohbet ve plan kuralları
  -> system mesajı (465)
  -> geçmiş ve güncel kullanıcı mesajı (466-469)
  -> managerResponder

Üretim
  -> getAgent(role)
  -> önbellekteki yalnız rol SYSTEM_PROMPT
  -> callAgentLLM (workflow:445-464)
  -> runLLMTaskWithRetry
  -> sağlayıcı

Reviewer düzeltmesi
  -> Reviewer rol SYSTEM_PROMPT + yeni kod / görev / kaynak görüntüsü
  -> ret varsa Coder rol SYSTEM_PROMPT + ilk görev istemi / geri bildirim
```

İncelenen anayasa 10.716 karakterdir. İlk 3.000 karakter, açılış akış diyagramındaki `RAPOR.md & READ…` yakınında biter. Ayrıntılı 1–4 bölümleri, rol yetki sınırları, auth ilkeleri ve kurtarma açıklamaları Manager sohbetine ulaşmaz. Aynı ilkelerin rol belgelerinde kısmen tekrar edilmesi anayasanın aktarılmasıyla aynı şey değildir.

Üretim çağrısının iki mesajı [workflow.js:459](../../backend/engine/workflow.js#L459) içindedir. Düzeltme çağrılarında da yalnız ilgili rol istemleri vardır: [selfCorrection.js:75](../../backend/engine/selfCorrection.js#L75) ve [121](../../backend/engine/selfCorrection.js#L121). Bu noktalarda anayasa eklenmez.

## Proje belgeleri ve model bağlamının ilişkisi

Rol Markdown'ları klasör açmayı, görev dosyası okumayı ve rapor yazmayı ajan sorumluluğu olarak anlatır. Gerçek dosya işlemlerini merkezi backend yapar; modele ağırlıklı olarak bellekten hazırlanmış metin/JSON gönderilir.

| Aktarım | Gerçek veri | Sınır / önemli ayrım |
|---|---|---|
| Manager → Director | Domain adı/açıklaması ve `plan.talimatname`; [director.js:5](../../backend/agents/director.js#L5) | Ana şartname metni tam eklenir. Director'ın kendi disk görevini araçla okuması yoktur. |
| Director → Teamleader | `directorSpec.altTalimatname`, misyon, onaylı gereksinimler ve planlama bağlamı; [teamleader.js:5](../../backend/agents/teamleader.js#L5) | [workflow.js:778](../../backend/engine/workflow.js#L778) disk alt şartnamesini kontrol eder; istemde kullanılan değer [867](../../backend/engine/workflow.js#L867) içindeki `directorSpec.altTalimatname` değeridir. |
| Teamleader planlama bağlamı | Dosya envanteri, mevcut görevler, eski görev adayları, eksik kapsam | [workflow.js:861](../../backend/engine/workflow.js#L861): en fazla 400 dosya, 100 mevcut görev, 100 eski aday; eski açıklama başına 2.000 karakter. |
| Teamleader → Coder | Biçimlenmiş görev açıklaması, tek hedef dosya ve disk kaynak görüntüsü; [workflow.js:975](../../backend/engine/workflow.js#L975) | Kaynak görüntüsü tam proje değildir. |
| Coder → Reviewer | Yeni üretilen kod, görev ve aynı kaynak görüntüsü; [reviewer.js:5](../../backend/agents/reviewer.js#L5) | Yeni hedef kod eski disk içeriğinin önündedir; bu açık istem talimatıdır. |
| Proje → Tester | Kabul metni, çıkarılmış manifesto, statik denetim özeti; [tester.js:1175](../../backend/agents/tester.js#L1175) | Gerçek istem bütün kaynak içeriğini içermez. Model başına ilk 8 alan [1198](../../backend/agents/tester.js#L1198), ilk 15 iç modül bağlantısı [1212](../../backend/agents/tester.js#L1212). |

[buildCoderProjectContext](../../backend/engine/coderContext.js#L49) varsayılan 96 KiB bütçeyle mevcut diskten veri toplar. Prisma şemaları, bağımlılık hedefleri ve runtime/auth sözleşmeleri önceliklidir. Dosya tam alınır veya açıkça atlanan dosya olarak raporlanır; bazı ikincil kaynaklarda tam dosya yerine AST export bildirimleri alınır. `.env`, sır benzeri dosyalar, ajan talimatları ve protokol Markdown'ları dışlanır. Bu tasarım açıkça sınırlı bağlamdır; modelin bütün projeyi okuduğu iddia edilmemelidir.

## Mekanik uygulama ve test matrisi

| Kural | Mekanik uygulama / yalnız istem ayrımı | Mevcut test kanıtı |
|---|---|---|
| Güvenilir kaynak, geçersiz dosyada durma | [agentPaths.js:17](../../backend/agents/agentPaths.js#L17), [agentLoader.js:7](../../backend/agents/agentLoader.js#L7) uygular | [test_agent_document_boundary.js:37](../../backend/tests/test_agent_document_boundary.js#L37): doğru kaynak, traversal, junction, eksik/kısa/büyük dosya |
| Proje/ajan dizin ayrımı | [agentPaths.js:52](../../backend/agents/agentPaths.js#L52) gerçek yollarla uygular | [test_agent_document_boundary.js:64](../../backend/tests/test_agent_document_boundary.js#L64), [82](../../backend/tests/test_agent_document_boundary.js#L82) |
| Altı rol metninin yüklenmesi | Modül sabitleri ve registry uygular | [test_docs_agent_sync.js:45](../../backend/tests/test_docs_agent_sync.js#L45) ile altı tam metin eşitliği |
| Tam anayasanın aktarılması | Uygulanmaz; sohbet alıntısı 3.000 karakter, üretimde yok | [test_docs_agent_sync.js:99](../../backend/tests/test_docs_agent_sync.js#L99) yalnız `prompt.length > 50` denetler; aktarımı kanıtlamaz |
| Şablonların gerçek çıktıyı belirlemesi | Uygulanmaz; biçimler kod içindedir | [test_backend.js:720](../../backend/tests/test_backend.js#L720) gerçek protokol üretimini test eder; güvenilir şablon tüketimini değil |
| Tek hedef dosya | [schemas.js:733](../../backend/agents/schemas.js#L733) tam bir hedef dosya zorunluluğu uygular | [test_agent_contract_schemas.js](../../backend/tests/test_agent_contract_schemas.js), [test_quiz_runtime_remediation.js:249](../../backend/tests/test_quiz_runtime_remediation.js#L249) istem içerikleri |
| Gereksinim / DAG bağımlılığı | [workflow.js:828](../../backend/engine/workflow.js#L828), [director.js:24](../../backend/agents/director.js#L24) doğrular | Şema ve kalite kapısı süitleri; yalnız Markdown'a bırakılmaz |
| Frontend girişleri / yönetim kapsamı | [director.js:58](../../backend/agents/director.js#L58) ve domain kapsam doğrulayıcıları uygular | Üretim kalite / remediation süitleri; her ürün davranışını tek başına kanıtlamaz |
| Hedef allowlist ve sahiplik | [codeGenerator.js:284](../../backend/engine/codeGenerator.js#L284), nihai yazım [workflow.js:1071](../../backend/engine/workflow.js#L1071) | [test_p1_4_file_ownership.js](../../backend/tests/test_p1_4_file_ownership.js) |
| Syntax / Reviewer veto | [selfCorrection.js:35](../../backend/engine/selfCorrection.js#L35), [schemas.js:779](../../backend/agents/schemas.js#L779), [workflow.js:1026](../../backend/engine/workflow.js#L1026) | Kalite kapısı / şema testleri |
| Düzeltme sayısı | `maxRetries=2`: ilk çıktıdan sonra iki düzeltme, en fazla üç inceleme; [selfCorrection.js:35](../../backend/engine/selfCorrection.js#L35) | Kod mekanik sınırdır; belgelerdeki “iki tur” ifadesi belirsizdir |
| Kalıcı kanıttan sonra görev tamamlanması | Checkpoint önce, DURUM/TODO sonra; [workflow.js:1098](../../backend/engine/workflow.js#L1098) | [test_runtime_verification.js:94](../../backend/tests/test_runtime_verification.js#L94), [test_quality_gate.js:825](../../backend/tests/test_quality_gate.js#L825): RAPOR varlığı tek başına başarı değildir |
| Statik Tester ile runtime/ZIP ayrımı | [workflow.js:1263](../../backend/engine/workflow.js#L1263); worker kapıları ayrı | Bu rapor worker kabulünü yeniden çalıştırmadı; [tester.md](../../x-agents/tester.md) kapsamı doğru sınırlar |
| Mimari kalite / bileşen kompozisyonu / varsayımsal hatadan kaçınma | Esasen istem talimatları; bazı AST/build denetimleri destekler | Anahtar kelime testi davranışın bütün projelerde gerçekleştiğini kanıtlamaz |

## Kanıtlanmış boşluklar ve belge tutarsızlıkları

1. **Anayasa kısmi ve yalnız sohbet katmanında.** Kaynakla doğrudan kanıtlanır. Bütün ajanların tam anayasa aldığı yönündeki yorum geçersizdir. Bunun ürün gereksinimi ihlali olup olmadığı hedef sözleşmeye bağlıdır.
2. **Beş şablon yürütülebilir kaynak değildir.** Dosyalar insan rehberidir. [Kök README:35](../../README.md#L35) içindeki izinli dosyaların “sistem istemi olarak” okunması ifadesi bu ayrımı yeterince açık yapmaz.
3. **Anayasada eski kurallar vardır.** [Anayasa:89](../../x-agents/ORKESTRASYON-TALIMATNAMESI.md#L89) 1–2 hedef dosya der; çalışan doğrulayıcı tam bir dosya ister. [Anayasa:70](../../x-agents/ORKESTRASYON-TALIMATNAMESI.md#L70) tarihli sürümler sayar; Manager/Director merkezi stabil sürüm çözümlemesini ister. Build anlatımı `node_modules` varsa yerel build yaklaşımını korur; güncel runtime kanıtı bağımsız worker'a bağlıdır.
4. **Tester belge görevi çatışır.** [tester.md](../../x-agents/tester.md) README üretimini görev sayar; [buildTesterPrompt:1229](../../backend/agents/tester.js#L1229) kesinlikle README/Markdown üretmemesini ve JSON dönmesini ister. Gerçek README'yi merkezi [workflow.js:1427](../../backend/engine/workflow.js#L1427) oluşturup [1450](../../backend/engine/workflow.js#L1450) yazar. Bu, README'nin yokluğu değil, rol anlatımının gerçek uygulamayla ayrışmasıdır.
5. **DURUM enum şablonu gerçek değerleri kapsamıyor.** Şablonda `BEKLEMEDE / DEVAM_EDIYOR / BLOKE / TAMAMLANDI` bulunur; üretimde `BASLADI`, `CALISIYOR`, `BASARISIZ` de yazılır. Şablon bir enum doğrulayıcısı değildir.
6. **Anayasa testi zayıftır.** İsmi anayasa yüklenmesini söylese de yalnız istem uzunluğunu denetler; anayasa tümüyle kaldırıldığında bile uzun Manager metniyle geçebilir. Tam anayasa ve downstream rol aktarımı için test bulunmadı.

## Riskler ve tasarım sınırları

- **Kanıtlanmış istismar değildir:** Proje raporları ve telemetri [Manager sistem mesajına](../../backend/routes/projectRoutes.js#L157) doğrudan yerleştirilir. [findFailedReports](../../backend/routes/projectRoutes.js#L89) eşleşen `RAPOR.md` dosyalarını tüm içerikleriyle, toplam bayt/adet sınırı olmadan toplar. Bu güvenilmeyen içerik için istem enjeksiyonu ve bağlam büyümesi yüzeyi oluşturur; bu incelemede exploit denenmedi. Güvenilir ajan yükleyicisinin sağlam dosya sınırı bu farklı bağlam yüzeyini otomatik korumaz.
- **Tasarım ayrımı:** Statik Tester onayı çalışan uygulama veya kabul edilmiş ZIP kanıtı değildir. Güncel [x-agents README](../../x-agents/README.md) ve [tester.md](../../x-agents/tester.md) bu ayrımı açıklar; bu bir hata olarak sınıflandırılmamalıdır.
- **Belgelenmiş sınır:** Dizin ayrımı OS sandbox değildir. `local-trusted` worker mevcut hesap yetkileriyle çalışır. [OPERATIONS:233](../OPERATIONS.md#L233) ve [x-agents README:15](../../x-agents/README.md#L15) bunu belirtir. [Dockerfile:35](../../Dockerfile#L35) ajan dosyalarını kopyalar; [40](../../Dockerfile#L40) çalışma kullanıcısını değiştirir. Bu, yerel worker yetkilerinin kısıtlandığı anlamına gelmez.
- **İstem önceliği riski:** Rol, anayasa alıntısı ve kod içi ek kuralların aynı sistem mesajına konması çatışmaları deterministik çözmez. Doğrulayıcılar mevcutsa mekanik sonuç belirlenir; yalnız istemde kalan kuralların hangisinin model tarafından seçileceği garanti edilmez.

## Okunan ilişkili belgeler

[Kök README](../../README.md), [x-agents README](../../x-agents/README.md), tüm `x-agents/*.md` dosyaları, [ajan ayrımı planı](../superpowers/plans/2026-10-01-x-agents-separation.md), [OPERATIONS ajan sınırı](../OPERATIONS.md#L233) ve [REPOSITORY-CLEANUP](../REPOSITORY-CLEANUP.md) ile ilgili kaynak/test bölümleri karşılaştırıldı. Eski planlardaki PASS kayıtları bu incelemenin güncel test çıktısı olarak sunulmadı.
