# Graphify görsel haritası: üretim ve kapsam

15–16 Kasım (Faz 4–5): Harita, Faz 4'ün modül ayrıştırmasını ve Faz 5'in yeni modüllerini içerir. Elle tanımlı düğümler `backend/scripts/generate_graph.js` içindedir.
- **Faz 4 modülleri:** `engine/workflowSupport.js` (workflow yardımcıları), `engine/stages/qualityStage.js` (statik denetim, onarım, Tester) ve `engine/stages/acceptanceStage.js` (bağımlılık hazırlığı ve kabul). Ayrıca onarım, inceleme ve yeniden doğrulama rotaları `routes/projectRepairRoutes.js`'e taşındı.
- **Faz 5 modülleri:** `routes/projectContractRoutes.js` (taslak reddi) ve kendi SQLite bağlantısıyla lease kalp atışı yazan `backend/workflowHeartbeatWorker.js`.
- **Test bağlantısı:** `test_graphify.js`, `workflow.js` → `workflowSupport.js` → `dag.js` import zincirini denetler.

Grafikte bir bağlantının bulunması, bir koşunun geçtiğini ya da `stok-takip-1`'in teslim edildiğini göstermez. Güncel düğüm ve bağlantı sayıları `GRAPH_REPORT.md`'dedir.

2 Kasım devamı: sınırlı kaynak onarımı ve ayrı inceleme akışı `controlledRepairs` / `controlledSemanticAuthority` / `controlledRepairAcceptance` üzerinden bağlanır. `controlledRepairLineage` yeni öneriye geçişte doğrulanmış kısmi kaynak/hata geçmişini korur. `requirementAssertionVerifier` gerçek baytları testten önce/sonra ölçer; `apiVerifier` nonce şablonunun render edilmiş tam değerini eşler. `processVerifier` sınırlı servis çıktısı ve cleanup öncesi erken çıkış gözlemi sağlar. Kurulum başarısızsa runChecks çalışma/semantik testlerini ve README build yürütmesini engeller; packageVerifier ve runtime zaman aşımında sınırlı çıktı ile tam akış hash/kesilme bilgisini korur. Docker entrypoint geçerli PORT/geçici JWT değerlerini iç süreç sınırında da korur. Tamamlanmış aşamaların bounded/redakte tanısı deadline durumunda özel diagnostics.phases içinde kalır; public komut görünümüne veya result.checks kabul kanıtına çevrilmez. Semantik gözlem, geçerli nihai kanıt ve tamamlama makbuzu ayrı yetkilerdir. O tarihteki harita 3.608 düğüm/9.547 ilişkiyle üretilmişti; güncel sayılar yalnız son `npm run graph` çıktısı olan `GRAPH_REPORT.md` dosyasından okunmalıdır. Canlı stokta yalnız üç kaynak hedefi uygulanmıştır; devam eden doğrulama veya grafikte bir bağlantının bulunması teslim kanıtı değildir. Ayrıntılar [Halka 31](../docs/faz-arsiv.md#halka-31--2-kasım-kısmi-onarımın-gerçek-yürütülmesi-ve-kanıt-zinciri) ve [devam planındadır](../docs/superpowers/plans/2026-11-01-controlled-repair.md).

1 Kasım denetimi: `projectObservabilityRoutes` ve `projectTraceabilityRoutes` DB bağlantısını istek zamanında çözer; gerçek soğuk başlangıç entegrasyonu kalite geçmişi/ilerleme yollarını kapsar. `managerStatusAnswer.buildRecordedVerificationAnswer` son durum ve tarih sorularını aynı onaylı sözleşmenin kalıcı kayıtlarından sade olarak yanıtlar; bu yol yeni üretim veya model çağrısı değildir. Son kapanış adımları ve kalan ürün onarım sınırı [Halka 29](../docs/faz-arsiv.md#halka-29--1-kasım-kaldığı-yer-denetimi-ve-gerçek-başlangıç-hatası) içindedir.

Kalite panelinin anlık veri yolu: `createWorkerServer` → `projectCommandProgress` → `createExecutionClient` callback'i → `recordExecutionProgress` → viewer kapsamlı `execution-progress` → `ExecutionProgress`. Bu yol kalıcı doğrulama kanıtı üretmez. `DashboardView` geçmiş/detay yükleme, hata, boş ve running/0-check durumlarını ayırır; gecikmiş proje yanıtlarını gizler.

Kontrol ayrıntılarında kayıtlı `reason` metni sunucuda sansürlenip sınırlanarak gösterilir; komut başlayamadığında boş stdout/stderr hata nedenini gizlemez. `Sidebar` yeniden doğrulamayı üretim olarak etiketlemez. Kurtarma uyarısı plan revizyonu onayının kaynakları yeniden üretebileceğini ve yalnız yeniden doğrulamanın onarım yapmadığını açıklar. Sade “neden durdu / nasıl ilerleyebiliriz” durum soruları da `buildRecordedVerificationAnswer` yoluna girer; açık düzeltme talepleri Manager yolunda kalır.

`localProcesses.annotateSpawnFailure` yerel süreç başlatma hatasında özgün kodu korur; çalıştırıcı/çalışma alanının varlığı, argüman/ortam boyutları ve süreç metaverisi gibi sınırlı tanı bilgisi ekler. Dosya yolu, argüman içeriği veya ortam değerleri eklemez. Bu tanı, başarısız kontrolü PASS yapmaz ve kaynak onarımı değildir.

`ensureWindowsProcessHost` kaynak + PE özeti içeren hazırlık kaydıyla kayıtlı çalıştırıcının kayıp/değişmiş olmasını ayırır; bu durumda otomatik yeniden derleme durur. `allowBuild:false` mevcut cache'i yürütmeden doğrular. Süreçler arası kilit doğrulama/derleme/yayını kapsar; kayıt atomik yayımlanır, rakip kurulumun veya karantinaya alınmış çalıştırıcının üzerine yazılmaz. Kilit bekleme iptal/deadline sınırına uyar; eski kilit otomatik devralınmaz. Bu kayıt kriptografik imza veya zararsızlık onayı değildir. 1 Kasım teşhisinde native yardımcı adına ait Defender algılama/karantina olayları ile komut başlatma hataları eşleştirildi; ayrıntı ve açık inceleme sınırı Halka 29'dadır. Üretilen proje dosyaları değiştirilmedi.

30 Ekim canlı stok-takip incelemesi: `detectProjectStack` Next.js + Express servis çiftini de tanır; `buildServiceLauncherContent` manifestteki süreçlerin ortak yaşam döngüsünü sağlar. `inferRuntimeChecks` Next.js tarayıcı servisini manifest türünden tanır. `reverify` rotası aynı onaylı sözleşme ve üretim kaydıyla yalnız yeni worker kanıtı alır; görev üretmez, kaynakları değiştirmez, onarım geçmişini veya teslim koşullarını atlamaz. Canlı sonuç, grafik bağlantılarından çıkarılamaz; çalışan sürüm ve doğrulama kayıtları ayrıca incelenir.

XFactor'ın güncel kaynak haritasını depo kökünde şu komutla oluşturun:

```bash
npm run graph
```

Komut `backend/scripts/generate_graph.js` dosyasını çalıştırır. Kaynak taraması ve AST/import analizi yereldir; bu komut LLM çağrısı yapmaz. Sonuçları:

| Dosya | Kullanım |
|---|---|
| `graph.json` | Kaynak dosyaları, semboller, bağımlılıklar ve küratörlü mimari bağlantılar |
| `graph.html` | Etkileşimli mimari ve kaynak haritası |
| `GRAPH_TREE.html` | Kaynak/dosya ağacı |
| `GRAPH_REPORT.md` | Oluşturulan kapsam, sayılar ve mimari özeti |

Harita `backend`, `frontend`, `execution`, `e2e`, `scripts`, `docs`, `x-agents` ve `llm-yonetimi` kaynaklarını kapsar. `projects/` altındaki üretilen uygulamalar, canlı `backend/data/`, `node_modules`, derleme çıktıları ve `.tmp` kanıtları platform haritasına katılmaz. Güncel düğüm/bağlantı sayıları üretilmiş rapordan okunmalıdır.

2 Kasım harita yenilemesi `generate_graph.js` ile yapıldı: JSON/HTML bağlantıları, benzersiz kimlikler ve dosya uçları denetlendi. Yeni kontrollü onarım, dependency-lock girdi kökeni, Türkçe politika/kanıt adayları ve checkpoint koruma testleri haritadadır. Bir modülün grafikte bulunması üretim kabulüne bağlandığı veya stok uygulamasının teslim edildiği anlamına gelmez. Açık entegrasyon sınırları [Halka 30](../docs/faz-arsiv.md#halka-30--2-kasım-docker-yeniden-doğrulaması-ve-sınırlı-onarım-hazırlığı) ve [devam planında](../docs/superpowers/plans/2026-11-01-controlled-repair.md) ayrılmıştır.

## Güncel iş akışını okuma

5 Kasım 2026 röntgeni: harita, commit edilmemiş 62 yeni dosyayı da içeren çalışma ağacından üretilir. Temiz bir klonda bu modüllerin bir kısmı bulunmaz. Kod, DB şeması, API eşleşmesi ve test bulguları ile yeni yol haritası [röntgen raporunda](../docs/rontgen-2026-11-05.md).

4 Kasım 2026 devralma haritası çalışma ağacındaki kaynakları gösterir. Henüz commit edilmemiş platform modülleri de haritaya girebilir. Stok-takip için son koşunun sonucu ve sıradaki görevler [faz arşivinde](../docs/faz-arsiv.md#halka-32--4-kasım-stok-takip-devralma-kaydı) kayıtlıdır.

30 Ekim 2026 sayısal kapsam açıklaması: `qualityPolicy.js:MANDATORY_GATES` 18 ana kapı içerir; `artifactEvidencePolicy.js` sözleşmeye bağlı ek zorunlu yönetim kanıtları ister. Grafikteki açıklamalar veya düğüm sayıları bir koşunun toplam zorunlu kontrol sayısını vermez. Ana kapı, koşullu kontrol, benzersiz ad ve kanıt satırı ayrımı [kullanıcı kılavuzunda](../kullanici-kilavuzu.md#11-18-zorunlu-kalite-kapısı-ve-temiz-oda-doğrulama-sistemi-politika-20) açıklanır.

Geliştirme geçmişinin P0–P9 ve Ekim Faz 1–4 halkaları [Faz Arşivinde](../docs/faz-arsiv.md) tek kronolojide birleştirilmiştir; eski yerel plan ve kanıtlar bu tarihsel özetin kaynaklarıdır.

30 Ekim 2026 belge birleştirmesiyle üretim işletimi, yerel worker paketi ve ZIP yaşam döngüsü [kullanıcı kılavuzunun 12–14. bölümlerine](../kullanici-kilavuzu.md#uretim-operasyon) taşındı. Harita eski üç ayrı belgeyi içermez; worker paketi birleşik kılavuzu README olarak taşır.

- `x-agents/`: güvenilen platform ajan talimatları; `docs/` işletim ve geliştirme belgeleridir. Projeye ait canlı protokol kayıtları `projects/<id>/` altında kalır.
- `backend/engine/workflow.js`, `resumeStage.js` ve `checkpointHelper.js`: onaylı sözleşme/plan ile eşleşen kod üretimini koruma ve kalite aşamasını tekrar yürütme.
- `backend/engine/recoveryAdvice.js` ve `backend/routes/projectRoutes.js`: Manager revizyon vetosunu Resume tekrarından ayırma, onaylı plan ve gerçek doğrulama hatalarını sınırlı sohbet bağlamına taşıma. `packageVerifier.js` gözlemlenen kontrollerin zaman ve akış hash kanıtlarını üretir. `test_manager_recovery_simulation.js` geçici DB ve model/executor mock'larıyla revizyon/onay yolunu sınar; canlı stok-takip teslim kanıtı değildir.
- `backend/verification/`: süre bütçesi, 18 ana zorunlu kapı, yönetim/rol ayrıntıları ve kabul edilmiş artefaktın kanıt kontrolü.
- `execution/`: bağımsız worker, yerel çalışma profili, gerçek Chromium/API testleri ve sınırlı komut teşhisleri.
- `frontend/src/components/`: proje oluşturma diyaloğu, sohbet ve kalite geçmişi/ayrıntı ekranları.
- `backend/routes/managerPlanScope.js`: hata kurtarma planlarında zorunlu iş ve yönetim kapsamını karşılaştırır. `projectRoutes.js` tek düzeltme turunu ve onay vetosunu uygular; `ChatView.jsx`/`Header.jsx` eksik taslakta onayı kapatır. Bu kontrol kelime/kimlik ve yapılandırılmış matris karşılaştırmasıdır; anlamsal LLM doğrulaması veya ürün teslim kanıtı değildir.

Harita statik bağlantıları gösterir; bir koşunun geçtiğini veya bir ZIP'in kabul edildiğini kanıtlamaz. Yerel worker doğrulama kapsamını [yerel worker paket kılavuzunda](../kullanici-kilavuzu.md#yerel-worker-paketi), kullanım adımlarını [kullanıcı kılavuzunda](../kullanici-kilavuzu.md) okuyun.

## Ayrı Python Graphify aracı

Python `graphify` aracının sorguları ve `manifest.json`/cache çıktıları bu deponun görsel üreticisinden ayrıdır. Kurulu sürümün desteklediği komutlar için `python -m graphify --help` kullanın. Python cache güncellemesi yukarıdaki dört dosyanın yeniden üretildiği anlamına gelmez; kaynak değişikliklerinden sonra `npm run graph` çalıştırın. Asistan entegrasyonu veya otomatik sorgulama, yalnız `graphify-out/` dizini bulunduğu için etkin kabul edilmez.

## Faz 1–4 Mimari İyileştirme ve Modülerleştirme Özeti (2026-10)

XFactor platformunda mimari yol haritası (`mimari-yol-haritasi.md`) kapsamında gerçekleştirilen 4 fazlık ana dönüşüm:

1. **Faz 1 (Doğrulama ve Execution Worker Hardening — `VER-1..5`):**
   - Bağımsız worker kanıt doğrulaması fail-closed hale getirildi; eksik digest/timestamp içeren koşular `BLOCKED` işaretlenir.
   - Otoriter backend hardening kapıları (`domain_entity_check`, `placeholder_check`, `contamination_check`, `security_baseline`) zorunlu kılındı.
   - Sentetik doğrulama ortam değişkenleri (`AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`) sandbox runner içinde korundu.
   - `requirement_check_links` yalnızca `PASS` durumundaki kontroller için atomik transaction ile bağlandı.

2. **Faz 2 (Orkestrasyon Motoru, Lease ve Kod Üretimi — `ENG-1..7`, `AGT-1..5`):**
   - `workflow.js` ve `selfCorrection.js` içinde `callAgent` enjeksiyon bütünlüğü sağlandı; 1. iterasyonda `validateCoderFiles` ile fail-closed denetim eklendi.
   - `workerRepairs.js` içinde 7-elemanlı `inputSignature` (`contract.id`, `contract.contract_hash`, `group.owner.spec`, `group.target`, `group.currentHash`, `group.fingerprints`, `digest(currentContext)`) ile kalıcı onarım kilitleri senkronize edildi.
   - `backend/llm.js` genelinde kesilmiş yanıtlar (`LLM_TRUNCATED`) tüm ajan rolleri için engellendi; Google REST fallthrough açığı kapatıldı.
   - `tester.js` içinde Babel AST import analizi ve `$executeRaw` büyük/küçük harf uyumsuzluğu giderildi.

3. **Faz 3 (Frontend Durum Yönetimi ve Canlı DAG Görselleştirmesi — `FE-1..4`):**
   - `dagLayout.js`: WebSocket canlı loglarında `id` bulunmadığında `created_at` zaman damgaları kullanılarak kronolojik sıralama korundu (tamamlanan düğümlerin tekrar çalışıyor durumuna dönmesi engellendi).
   - `App.jsx`: Sayfa açılışında otomatik `syncProjects` tetiklenmesi kaldırıldı; `verification_failed` ve `capability_blocked` durum rozetleri eklendi.
   - DAG düğüm/kenar türetimi `setLogs` saf durum güncelleyicisi içinden ayrıştırılıp `useEffect` reaktif akışına bağlandı.

4. **Faz 4 (Tanrı Modüllerin Parçalanması, Doğrulama Altyapısı İyileştirmeleri ve Sıfır Kırılma Re-Export Disiplini — `ENG-8`, `DAT-6`):**
   - `workflow.js`: Onarım döngüleri `backend/engine/stages/repairStage.js` modülüne, paket kilidi hazırlığı `backend/engine/stages/verificationStage.js` modülüne taşındı. `buildValidator.js` regex yerine AST tabanlı tip denetimine dönüştürüldü (`.toLowerCase()` kontrolü yalnız sayısal literal ve `TSNumberKeyword` tanımlayıcılarla sınırlandırıldı).
   - `codeGenerator.js`: Çok aşamalı Dockerfile/`.dockerignore` şablonları `backend/engine/templates/dockerTemplates.js` modülüne, Prisma/DB çift köprü ve auth şablonları `backend/engine/templates/prismaTemplates.js` modülüne taşındı.
   - `projectRoutes.js`: Gözlemlenebilirlik uç noktaları `backend/routes/projectObservabilityRoutes.js` modülüne, izlenebilirlik ve artefakt indirme uç noktaları `backend/routes/projectTraceabilityRoutes.js` modülüne taşındı; `graphSource.js` rota miras mekanizmasıyla (`mountsByFile`) AST bağlantıları korundu.
   - `db.js`: Mükerrer `assertWorkflowLease` silinerek `workflowAttempts.js` ile birleştirildi; 17 aşamalı (5 Kasım itibarıyla 18) `MIGRATIONS` dizisi `backend/db/migrations.js` modülüne taşındı.
   - Test/Doğrulama Altyapısı: `backend/tests/test_runner.js` ve `isolatedDb.js` şablon DB klonlama (`XFACTOR_TEMPLATE_DB_PATH`) ve paralel işçi havuzu (`XFACTOR_TEST_CONCURRENCY`) ile hızlandırıldı; `execution/tests/jobBoundary.test.js` ve `scripts/test-worker.mjs` kilitlenmeye dayanıklı zaman aşımı sınırlarıyla (`60s` birim / `600s` entegrasyon) güçlendirildi. 5 Kasım'da birim sınırı dosya başına `180s` yapıldı; process izolasyonunda sınır bütün dosyayı kapsıyor ve `localProcesses.test.js` yük olmadan da yaklaşık 51 sn sürüyor.
   - Tüm taşınan fonksiyonlar orijinal modüllerden sıfır kırılma (Zero-Breakage Re-Exports) garantisiyle dışa aktarılmaya devam etmektedir. Kapanış doğrulaması: **148/148 backend süiti**, **156/156 worker birim testi**, **159/159 yerel worker entegrasyon testi (`npm run test:local-worker`)** ve **130/130 frontend birim testi (14 dosya) + üretim build'i (1.702 modül)** sıfır hatayla geçti. Ayrıntılı kanıt raporları: [Faz 1](../docs/faz-arsiv.md#mimari-faz-1), [Faz 2](../docs/faz-arsiv.md#mimari-faz-2), [Faz 3](../docs/faz-arsiv.md#mimari-faz-3), [Faz 4](../docs/faz-arsiv.md#mimari-faz-4).
