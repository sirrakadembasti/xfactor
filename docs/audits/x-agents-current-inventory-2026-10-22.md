# x-agents -> backend güncel bağlantı envanteri

Bu tablo önceki [düzeltme öncesi envanterin](x-agents-markdown-inventory-2026-10-22.md) yerini tarihsel olarak almaz; `b8799ef` sonrasındaki çalışma dalının gerçek okuyucularını kaydeder. Test adları kapsam referansıdır; çalıştırma sonuçları [kapanış kaydında](x-agents-completion-2026-10-22.md) ayrıca tutulur.

## Ortak yükleme ve yetki sınırı

`backend/agents/agentPaths.js:readAgentDocument` yalnız sabit `x-agents/` kökündeki izinli dosyaları okur. Bilinmeyen ad, eksik dosya, symlink/junction, normal dosya olmayan içerik, gerçek yol kaçışı ve 128 KiB üstü boyut reddedilir. `agentLoader.loadAgentPrompt` ilk YAML frontmatter'ı kaldırır; kalan metin 50 karakterden uzun olmalıdır. `loadOrkestrasyonTalimatnamesi` kırpılmış tam metnin 100 karakterden uzun olmasını ister. Bunlar politika metninin anlamsal doğruluğunu kanıtlamaz; bozuk/anlamsız ama yeterince uzun bir Markdown için genel semantik doğrulayıcı yoktur.

`loadAgentSystemPrompt(role)` **tam anayasa + tam temizlenmiş rol** birleştirir. Açık öncelik metni kod/şema doğrulayıcılarını, onaylı sözleşmeyi ve role özel çıktı kapsamını belirtir. Bu öncelik, model davranışının mutlak garantisi değildir; mekanik sınırları aşağıdaki doğrulayıcılar uygular. Proje Markdown'ları güvenilir politika yerine kullanılamaz; yükleme hatasında üretilen proje belgesine veya gizli yedek isteme dönüş yoktur.

Altı rolün `SYSTEM_PROMPT` sabiti modül import'unda oluşur; `agents/index.js:AGENT_REGISTRY/getAgent` aynı dizeleri kullanır. Üretim politikasını yenilemek planlı backend restart gerektirir. Manager sohbeti `projectRoutes.buildManagerChatSystemPrompt` içinde yeniden okur. Ortak anayasa kesilmez; sağlayıcının toplam token limiti ayrı bir başarısızlık/kapasite sınırıdır, sessiz anayasa kısaltması değildir.

## Her Markdown için bağlantı

| Dosya / amaç / hedef | Gerçek okuyucu ve tetikleme | Mesaj rolü, tamlık, cache | Kodla zorlanan kural ve test |
|---|---|---|---|
| `manager.md`: kapsam ve plan, Manager | `agents/manager.js` -> `loadAgentSystemPrompt('manager')`; üretimde `buildManagerPrompt/parseManagerResponse`; sohbette `projectRoutes.buildManagerChatSystemPrompt` | `system`; frontmatter dışında tam; üretimde import cache, sohbette her kurulum | `schemas.validateManagerPlan`, sözleşme onay geçişleri. `test_docs_agent_sync.js`, `test_agent_contract_schemas.js`, `test_p0_a_contract_flow.js`, sohbet message-array testleri |
| `director.md`: domain şartnamesi, Director | `agents/director.js` import; workflow'da domain spec eksik/geçersiz olduğunda `callAgentLLM('director')` | `system`; frontmatter dışında tam; import cache | `normalizeDirectorSpec/validateDirectorSpec`, domain kapsam kontrolleri. `test_docs_agent_sync.js`, şema ve generation resume testleri |
| `teamleader.md`: tek dosyalı görev DAG'ı, Teamleader | `agents/teamleader.js` import; workflow'da takım planı oluşturma veya sınırlandırılmış yeniden planlama | `system`; frontmatter dışında tam; import cache | `validateTeamleaderTasks`, `validateTaskDependencies`, `validatePlanTasks`, sözleşme task projection. `test_agent_contract_schemas.js`, `test_p1_4_file_ownership.js`, `test_generation_resume.js`, `test_p3_observability.js` |
| `coder.md`: kaynak üretimi/onarımı, Coder | `agents/coder.js` import; workflow ilk üretim, `selfCorrection.executeCorrectionLoop`, statik/advisory onarım; worker reddinde `workerRepairs.executeWorkerRepairs` | `system`; frontmatter dışında tam; import cache. Görev ve kaynak bağlamı ayrı `user` verisidir | `validateCoderFiles`, tek hedef allowlist/kota/path/symlink sınırları, source commit fence; worker onarımında kalıcı tek çağrı rezervasyonu, tekil sahiplik ve tam kaynak CAS. `test_symlink_isolation.js`, `test_p2_repair_allowlist.js`, `test_worker_repairs.js`, lease ve generation resume testleri |
| `reviewer.md`: kaynak onayı/ret, Reviewer | `agents/reviewer.js` import; `selfCorrection.executeCorrectionLoop` sözdizimi geçerli çıktı için çağırır; worker onarımı sonrası workflow taze owner kaynağı/dependency bağlamıyla çağırır | `system`; frontmatter dışında tam; import cache. Yeni kod/görev/bağlam `user` | Normal üretimde AST ret ve en fazla iki Coder düzeltmesi; worker onarımında kaynak/finding bağlı kalıcı Reviewer kabulü gerekir. Olumlu model cevabı runtime PASS değildir. `test_quality_gate.js`, `test_agent_contract_schemas.js`, `test_docs_agent_sync.js`, `test_worker_repairs.js` |
| `tester.md`: statik proje değerlendirmesi, Tester | `agents/tester.js` import; workflow deterministik denetim ve sınırlı onarım sonrasında yerel `callAgent('tester')` üzerinden varsayılan `callAgentLLM`; worker onarımında taze static acceptance | `system`; frontmatter dışında tam; import cache. Manifesto/denetim özeti ve onarılmış kaynak `user` | JSON ayrıştırma/karar normalizasyonu ve deterministik veto; worker onarımında kalıcı kaynak bağlı kabul, worker kapıları ayrıca zorunlu. `test_generation_resume.js`, `test_quality_gate.js`, `test_workflow_failure_chat_event.js`, `test_worker_repairs.js`, worker completion testleri |
| `ORKESTRASYON-TALIMATNAMESI.md`: ortak politika, altı rol + sohbet | `agentLoader.loadOrkestrasyonTalimatnamesi` -> `loadAgentSystemPrompt`; bütün rol modülleri ve Manager sohbeti | Aynı `system` mesajında tam metin, bir kez; üretim import cache, sohbet yeniden okur. Eski 3000 karakter kesintisi kaldırılmıştır | Kendi başına yürütülebilir kural değildir. Şema, DAG, source fence, checkpoint, mandatory gate ve receipt doğrulayıcıları mekanik yetkidir. `test_docs_agent_sync.js` tam anayasa/rol içerme ve tek kez aktarımı, `test_agent_document_boundary.js` güvenilir dosya sınırı |
| `ALT-TALIMATNAME.md`: insan için domain belge şablonu | Çalışma zamanı okuyucusu **yok**; `fileProtocol.setupDirectorProtocol` Director JSON'undan gerçek belgeyi üretir | LLM system mesajına yüklenmez; dosya değişikliği serializer'ı değiştirmez | Gerçek JSON doğrulama ve protokol yazımı. `test_backend.js`, workflow protocol testleri; şablon tüketimi testi yoktur çünkü tüketim yoktur |
| `GOREV.md`: insan için görev kayıt biçimi | Çalışma zamanı okuyucusu **yok**; `setupRootProtocol/setupDirectorProtocol/setupTeamleaderProtocol/setupCoderProtocol` kod içi biçimleri kullanır | LLM system mesajına yüklenmez | Üretilen proje GOREV kayıtları kurtarmada veri olarak okunabilir (`readTasksFromTodoFile` ve görev açıklaması okuyucuları); platform talimatını değiştiremez. Protokol/kurtarma testleri |
| `TODO.md`: insan için ilerleme biçimi | Şablon okuyucusu **yok**; `fileProtocol.setup*`, `checkTodoItem/uncheckTodoItem/readTasksFromTodoFile` gerçek proje kayıtlarını yönetir | Platform system politikası değildir; görev kurtarma verisidir | TODO mutasyonları süreç içinde dosya başına sıralanır; checkbox tek başına tamamlanma kanıtı değildir. `test_p0_c_workflow_integration.js`, checkpoint testleri |
| `DURUM.md`: insan için durum biçimi | Şablon okuyucusu **yok**; `fileProtocol.writeDurum/isTaskCompleted/reconcileTaskCache` gerçek kayıtlarla çalışır | Platform system politikası değildir | Gerçek tamamlanma için checkpoint ve hash doğrulaması gerekir; şablon enum doğrulayıcısı değildir. `test_runtime_verification.js`, `test_p9_checkpoint_dependencies.js`, protokol testleri |
| `RAPOR.md`: insan için rapor biçimi | Şablon okuyucusu **yok**; `fileProtocol.writeRapor`, workflow rapor gövdeleri; Manager bağlamında `findFailedReports` gerçek raporları okur | Güvenilmeyen proje raporu bounded/redacted JSON `user` verisidir, `system` değildir | Rapor sayısı/okuma/derinlik/toplam bağlam sınırı, symlink ancestry reddi. `test_manager_error_telemetry.js`, `test_manager_chat_failures.js`; rapor varlığı acceptance değildir |
| `x-agents/README.md`: operatör açıklaması | Runtime prompt okuyucusu **yok** | İnsan rehberi; platform model talimatı sayılmaz | Doküman/kod karşılaştırması; bağlantı testleri gerçek rol/anayasa dosyalarını denetler |
| Kök `README.md`: kurulum ve mimari özeti, kullanıcı/geliştirici | Platform prompt okuyucusu **yok**; `backend/scripts/graphSource.js` statik graph envanterine alır | LLM system politikası değildir | Graph kaydı çalıştırma kanıtı değildir. Üretilen projenin kendi README'si farklı dosyadır; `verification/readmeVerifier.js` onu kontrol eder |
| `kullanici-kilavuzu.md`: kullanım/operasyon, kullanıcı | Platform prompt okuyucusu **yok**; Graphify statik envanteri | İnsan rehberi; çalışma zamanında üretim rolünü değiştirmez | Bu dalda eski rol/test iddiaları kodla karşılaştırılarak düzeltilir; rehber metni mekanik invariant değildir |
| `docs/OPERATIONS.md`: dağıtım ve sınırlar, operatör | Platform prompt okuyucusu **yok**; `backend/scripts/generate_graph.js` mimari düğüm olarak tanımlar | İnsan operasyon rehberi | Yerel worker yetkisi, politika cache'i ve devreye alma sınırları açıklanır; tek başına erişim kontrolü uygulamaz |
| `docs/audits/*.md`: bulgu/kanıt, bakım yapan geliştirici | Platform prompt okuyucusu **yok** | İnsan inceleme kaydı | Tablodaki kod/test referansları kanıttır; raporun kendisi runtime kuralı veya test çalıştırma sonucu değildir |

## Gerçek çağrı zinciri

Temel kaynak noktaları: [readAgentDocument](../../backend/agents/agentPaths.js#L17), [rol okuyucu](../../backend/agents/agentLoader.js#L7), [anayasa okuyucu](../../backend/agents/agentLoader.js#L17), [tam birleştirici](../../backend/agents/agentLoader.js#L24), [registry tüketicisi](../../backend/agents/index.js#L55), [Manager sohbet politikası](../../backend/routes/projectRoutes.js#L203), [ayrı veri mesajı](../../backend/routes/projectRoutes.js#L176), [LLM retry](../../backend/engine/llmTaskRetry.js#L70), [sağlayıcı adaptörü girişi](../../backend/llm.js#L120), [Reviewer düzeltme döngüsü](../../backend/engine/selfCorrection.js#L15). Bunlar bu dalın inceleme anındaki satırlardır; baseline raporundaki eski satırlarla karıştırılmamalıdır.

```text
x-agents/ORKESTRASYON-TALIMATNAMESI.md + <role>.md
  <- agentPaths.readAgentDocument (sabit güvenilir kök)
  <- agentLoader.loadOrkestrasyonTalimatnamesi + loadAgentPrompt
  <- agentLoader.loadAgentSystemPrompt(role)
  <- agents/{manager,director,teamleader,coder,reviewer,tester}.js SYSTEM_PROMPT
  -> agents/index.getAgent(role)
  -> workflow.callAgentLLM veya selfCorrection.executeCorrectionLoop
  -> llmTaskRetry.runLLMTaskWithRetry: system politika + user görev/veri
  -> llm.generateLLMResponse -> yapılandırılmış sağlayıcı adaptörü

Manager sohbeti:
projectRoutes sohbet handler
  -> buildManagerChatSystemPrompt -> loadAgentSystemPrompt('manager')
  -> buildManagerChatContext -> bounded/redacted JSON user verisi
  -> managerResponder -> generateLLMResponse
  (hatalı plan yanıtı onarım çağrısında aynı yetki ayrımı)
```

Workflow üretiminde `callAgent` yerel dispatch değişkeninin varsayılanı `callAgentLLM`'dir; bu fonksiyon registry'den güvenilir `systemPrompt` alıp görev retry/adaptör zincirine verir. İzole entegrasyon testleri modül çağrısında ajan/worker servislerini enjekte edebilir. Bu test seam'i bir HTTP/model çıktısı alanı veya eksik talimatta fallback değildir; sahte transport kullanan testler gerçek sağlayıcı/worker çalıştırma kanıtı sayılmaz.

Worker ret bağlantısı ayrı bir rol veya yeni güvenilir Markdown yükleyicisi oluşturmaz:

```text
execution local/Docker süreç gözlemi -> buildVerifier -> artifactVerifier
  -> workerFailures.normalizeWorkerCheckLog / summarizeWorkerRejection
  -> transaction içinde recordWorkerRejection -> repair_issues
normal Resume -> loadOpenWorkerRepairBatch (kaynak mutasyonundan önce)
  -> workerRepairs.planWorkerRepairs / executeWorkerRepairs
  -> mevcut güvenilir Coder system prompt + finding/kaynak user verisi
  -> son commit transaction'ında source/lease/sözleşme CAS
  -> deterministik audit -> kalıcı taze Reviewer -> kalıcı taze Tester
  -> yeni worker rezervasyonu / artefakt / run / job / nonce
  -> verificationCli -> resolveWorkerRepairIssues -> kanonik tamamlanma
```

Bu otomatik yol yalnız tam, normal çıkışlı, kesilmemiş TypeScript derleyici diagnostic'lerini ve mevcut projected tekil dosya sahibini kabul eder. Belirsiz, altyapı, sahipliği eksik/çakışan veya kaynakla uyuşmayan ret, Manager revizyonu gerektirir. Kontrat başına 64 Coder rezervasyonu, owner/hedef başına iki değişen girdi denemesi, batch başına sekiz hedef ve 64 finding sınırı vardır. Her rezervasyon `maxAttempts:1` ile en fazla bir provider çağrısı tüketir. Taze Reviewer/Tester/worker aşamaları da kalıcı rezervasyon taşır; belirsiz sonuç otomatik yeniden ücretlendirilmez. Kaynakla bağlı kaydedilmiş başarılı statik sonuçlar ve tam yeni worker kanıtı tekrar çağrı yapmadan kurtarılabilir; eski/pre-repair PASS bu yetkiyi vermez. `test_worker_repairs.js` bu kontrol akışını gerçek repository/workflow/verifier ve sahte ajan/worker transport'u ile sınar; gerçek derleyici veya tarayıcı çalışması kanıtı değildir. İlgili fonksiyonlar `backend/verification/workerFailures.js`, `backend/engine/workerRepairs.js`, workflow'daki `reviewer_acceptance`/`static_acceptance`/`worker_verification` aşamaları ve `verificationCli.recoverVerifiedWorkerRepair` içindedir.

Somut çağrı noktaları: [log normalizasyonu](../../backend/verification/workerFailures.js#L18), [ret özeti](../../backend/verification/workerFailures.js#L58), [kalıcı ret](../../backend/verification/workerFailures.js#L84), [normal Resume preflight](../../backend/engine/workflow.js#L854), [sahiplik planı](../../backend/engine/workerRepairs.js#L53), [bütçeli Coder yürütmesi](../../backend/engine/workerRepairs.js#L119), [taze Reviewer rezervasyonu](../../backend/engine/workflow.js#L1434), [taze Tester rezervasyonu](../../backend/engine/workflow.js#L1474), [worker rezervasyonu](../../backend/engine/workflow.js#L1719), [kanıtla issue çözümü](../../backend/engine/workerRepairs.js#L218), [kanıt tamamlandıktan sonraki crash kurtarması](../../backend/verification/verificationCli.js#L17). Bu satırlar son kaynak değişikliğinde yeniden kontrol edilmelidir.

## Aktarılan verinin sınırları

Gerçek proje protokol kayıtları `protocolIO.js` üzerinden dosya başına en fazla 2 MiB okunur/yazılır. Üretim çağrıları `strict:true`, proje kökü ve güncel source fence taşır; symlink/junction ve proje dışı yollar reddedilir. TODO güncellemeleri süreç içinde dosya başına sıralanır; süreçler arası yetki SQLite lease/commit sınırından gelir. Migration 17 eski checkpoint kanıtını yeniden etiketlemez: yeni kayıtlar sözleşme/domain/takım/görev kimliğine bağlıdır; eski kayıt yalnız tam ve tekil sahiplik kanıtıyla kullanılabilir. Bunlar prompt yönergeleri değil, backend I/O ve kanıt kurallarıdır.

Senkron kurtarma da aynı sınırı kullanır: `reconciliationService` başlık/state/plan/chat/log/görev metadata okumalarını `protocolIO.createProtocolRecoveryReader` ve `readProtocolFileSync` üzerinden yapar. Önceki doğrudan filesystem okuyucuları son bağımsız incelemede dış sentinel içeriğiyle başarısızlık olarak kanıtlandı. Yeni okuyucu kök/ancestor/leaf bağlantılarını ve dosya başına boyutu kontrol eder; dizin taraması derinlik ve entry sınırı taşır. Kurtarma logları yerel task ID yerine tam domain/takım/görev node kimliğiyle tekilleştirilir. `test_reconciliation_boundary.js` gerçek kurtarma fonksiyonlarında bağlantı/boyut/traversal, iki takım ve tarihsel log idempotence sınırlarını doğrular. Bu kayıtlar yine proje verisidir, güvenilir `system` talimatı veya bağımsız runtime kanıtı değildir.

- Teamleader planlama bağlamı en fazla 400 mevcut dosya, 100 mevcut görev ve 100 eski görev adayı içerir; eski açıklama başına 2000 karakter sınırı vardır. Atlanan adetler belirtilir.
- `coderContext.buildCoderProjectContext` varsayılan 96 KiB bütçeyle dosya veya AST export özeti toplar. Projenin tamamının okunduğu varsayılamaz; `.env`, sır benzeri dosyalar, güvenilir ajan politikası ve protokol kayıtları kaynak bağlamından dışlanır.
- `tester.buildTesterPrompt` manifesto modelinde ilk 8 alanı ve ilk 15 iç bağlantıyı kullanır; tüm kaynak kodunu veya çalıştırılmış test sonucunu temsil etmez.
- `projectRoutes.buildManagerChatContext` toplam 32 Ki karakter, rapor başına 4 KiB, en fazla 8 rapor ve aramada 200 entry/8 derinlik sınırını uygular. Son bağlam geçerli JSON kalır; kırpılan verinin tamamının model tarafından görüldüğü iddia edilmez.
- LLM görev katmanındaki retry en fazla üç sağlayıcı çağrısıdır; yalnız geçici sağlayıcı/transport hatalarında uygulanır. Bu dalda görev katmanı adaptöre `maxTransportAttempts:1` geçirir; Google bu yolda doğrudan native REST kullanır. Böylece tek ajan görevindeki iç içe HTTP retry çarpımı kaldırılır. `test_llm_task_retry.js` gerçek görev -> adaptör -> fake HTTP sınırında OpenAI, Anthropic ve Google için başarısızlıkta toplam üç istek ve üçüncü istekte başarılı kurtarmayı ölçer. Doğrudan sohbet çağrısının kendi adaptör retry/fallback politikası ayrıdır. Hatalı JSON/şema cevabı sırf parse hatası diye yeniden ücretli görev çağrısına çevrilmez. Reviewer onarım bütçesi ve kalıcı advisory onarım bütçesi farklı mekanizmalardır.

## Yalnız prompt düzeyinde kalanlar

### Bağlantıyı kanıtlayan somut testler ve sınırları

| Sınır | Doğrudan assertion kaynağı | Kanıtlamadığı şey |
|---|---|---|
| Altı rolün tam anayasa ve tam rol metnini aynı kompozisyonda alması | [`test_docs_agent_sync.js:34`](../../backend/tests/test_docs_agent_sync.js#L34), altı rol için ayrı çağrılar; sıra, tek kopya ve registry eşitliği | Modelin her kuralı anlamsal olarak uygulaması |
| Manager sohbetinin aynı tam politikayı alması | [`test_docs_agent_sync.js:114`](../../backend/tests/test_docs_agent_sync.js#L114) | Üretim import cache'inin dosya değişince kendiliğinden yenilenmesi |
| Aynı adlı proje belgesinin güvenilir talimat yerine geçmemesi | [`test_agent_document_boundary.js:37`](../../backend/tests/test_agent_document_boundary.js#L37) | Genel prompt injection bağışıklığı |
| Rol adı/traversal, linked kök, proje/ajan kökü çakışması | [`test_agent_document_boundary.js:47`](../../backend/tests/test_agent_document_boundary.js#L47), `:56`, `:64`, `:82` | İşletim sisteminde düşmanca bir sürecin tüm dosya yarışlarının engellenmesi |
| Eksik/kısa/aşırı büyük rolün fallback olmadan reddi | [`test_agent_document_boundary.js:71`](../../backend/tests/test_agent_document_boundary.js#L71) | Her dosya tipi ve her anayasa hata varyantının ayrı testi olduğu |
| Proje başlığının system'e yükseltilmemesi; hata onarımında da ayrım | [`test_manager_chat_failures.js:64`](../../backend/tests/test_manager_chat_failures.js#L64) | Tüm sohbet geçmişi için toplam token bütçesi |

Bu satırlar kaynakta incelenen assertion'lardır. Son koşunun süit sayısı, sonucu ve tarihi kapanış kaydında ayrıca belirtilir; test dosyasının varlığı çalıştırılmış test sayılmaz. Ortak boyut/tip guard'ının diğer dalları ve import sonrası cache davranışı ayrıca belirtilmedikçe kaynak incelemesiyle doğrulanmıştır.

Kodun sade/kompakt olması, iyi isimlendirme, gelecekteki tüm iş kuralı hatalarını yakalama veya modelin her çelişkili metni doğru yorumlaması genel mekanik garantiler değildir. Tek dosya, sahiplik, onay, dosya sınırı, lease, checkpoint ve worker kanıtı kodla zorlanır. `local-trusted` worker OS kullanıcısının yetkisiyle çalışır; klasör ayrımı OS sandbox oluşturmaz. Genel semantik Markdown doğrulaması veya prompt injection bağışıklığı iddia edilmez.

## Prompt tarafından okunmayan belgelerin açık listesi

`x-agents/ALT-TALIMATNAME.md`, `GOREV.md`, `TODO.md`, `DURUM.md`, `RAPOR.md` izin listesinde olmalarına rağmen runtime şablon okuyucusu tarafından kullanılmaz. `x-agents/README.md`, kök `README.md`, `kullanici-kilavuzu.md`, `docs/OPERATIONS.md` ve bu inceleme raporları da LLM politika kaynağı değildir. Statik graph envanterine girme, prompt'a yüklenme anlamına gelmez. Bu dosyaların eksikliği doğrudan ajan politikası fallback'ı tetiklemez; insan belgeleri/graph üretimi kendi hata davranışına sahiptir. Üretilen proje içindeki aynı adlı dosyalar ayrı, güvenilmeyen girdilerdir.

## Hata yaşam döngüsü ve giderilen metin çelişkileri

Rol veya anayasa dosyası başlangıç import'unda eksik/geçersizse modül değerlendirmesi durur. Registry bütün rolleri import ettiği için yalnız kullanılacak rolün bozulması şart değildir; başka bir rolün hatası da registry/route yüklenmesini durdurabilir. Dosya import sonrasında değiştirilir/silinirse mevcut üretim prompt sabiti cache'de kalır. Taze Manager sohbet kompozisyonu yalnız Manager rolünü ve anayasayı yeniden okur: bunların geçerli değişikliklerini alır, eksik/geçersiz olmaları durumunda hata verir. Örneğin başlangıçtan sonra Coder dosyasının silinmesi tek başına taze Manager kompozisyonunu bozmaz. Bu ayrım kaynakla doğrulanmıştır; tüm cache mutasyon senaryolarının ayrı çalışma testi olduğu iddia edilmez.

Bu dal `teamleader.md` frontmatter'ındaki eski “1–2 dosya” ifadesini tam bir dosyaya, Reviewer'ın belirsiz “iki tur” ifadesini ilk çıktı + en fazla iki düzeltmeye, TODO şablonundaki alt-ajan dosya yazımı anlatımını merkezi backend güncellemesine çevirmiştir. DURUM şablonu örnek durum listesidir; enum otoritesi olarak sunulmaz. Önceki çelişkilerden frontmatter zaten prompt'a gönderilmiyordu; bu düzeltme insan/tooling anlatımını da tutarlı yapar.

## İnceleme kapsamının sınırı

Bu kayıt tüm 13 `x-agents` Markdown'ını, ana loader/registry/rol çağrı zincirlerini ve belirtilen README/kılavuz/OPERATIONS mimari-kurtarma bölümlerini kapsar. Önceki dört audit raporu ve onaylanan plan bu çalışmanın girdileridir. Repository'deki bütün tarihsel tasarım planlarının veya ilgisiz operasyon ayrıntılarının eksiksiz yeniden incelendiği iddia edilmez. Graphify'da görünme de bir belgenin model tarafından okunduğunu kanıtlamaz.

23 Ekim kapanış incelemesi ayrıca README, kullanıcı kılavuzu ve OPERATIONS'ın tamamını ve tüm 13 ajan Markdown'ını bölüm bölüm okudu; rol/şema/durum/harita anlatımındaki ek çelişkiler bu dalda düzeltildi. Bu genişletilmiş belge okuması, bağlantılı bütün tarihsel planların veya her kaynak dosyanın tamamının yeniden incelendiği anlamına gelmez. Son test ve harita sonuçları kapanış kaydının ayrı doğrulama günlüğündedir.
