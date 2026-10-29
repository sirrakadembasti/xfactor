# Graphify görsel haritası: üretim ve kapsam

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

## Güncel iş akışını okuma

- `x-agents/`: güvenilen platform ajan talimatları; `docs/` işletim ve geliştirme belgeleridir. Projeye ait canlı protokol kayıtları `projects/<id>/` altında kalır.
- `backend/engine/workflow.js`, `resumeStage.js` ve `checkpointHelper.js`: onaylı sözleşme/plan ile eşleşen kod üretimini koruma ve kalite aşamasını tekrar yürütme.
- `backend/verification/`: süre bütçesi, 18 ana zorunlu kapı, yönetim/rol ayrıntıları ve kabul edilmiş artefaktın kanıt kontrolü.
- `execution/`: bağımsız worker, yerel çalışma profili, gerçek Chromium/API testleri ve sınırlı komut teşhisleri.
- `frontend/src/components/`: proje oluşturma diyaloğu, sohbet ve kalite geçmişi/ayrıntı ekranları.

Harita statik bağlantıları gösterir; bir koşunun geçtiğini veya bir ZIP'in kabul edildiğini kanıtlamaz. Yerel worker doğrulama kapsamını [yerel worker paket kılavuzunda](../docs/LOCAL-WORKER-PACKAGE.md), kullanım adımlarını [kullanıcı kılavuzunda](../docs/kullanici-kilavuzu.md) okuyun.

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
   - `db.js`: Mükerrer `assertWorkflowLease` silinerek `workflowAttempts.js` ile birleştirildi; 17 aşamalı `MIGRATIONS` dizisi `backend/db/migrations.js` modülüne taşındı.
   - Test/Doğrulama Altyapısı: `backend/tests/test_runner.js` ve `isolatedDb.js` şablon DB klonlama (`XFACTOR_TEMPLATE_DB_PATH`) ve paralel işçi havuzu (`XFACTOR_TEST_CONCURRENCY`) ile hızlandırıldı; `execution/tests/jobBoundary.test.js` ve `scripts/test-worker.mjs` kilitlenmeye dayanıklı zaman aşımı sınırlarıyla (`60s` birim / `600s` entegrasyon) güçlendirildi.
   - Tüm taşınan fonksiyonlar orijinal modüllerden sıfır kırılma (Zero-Breakage Re-Exports) garantisiyle dışa aktarılmaya devam etmektedir. Kapanış doğrulaması: **148/148 backend süiti**, **156/156 worker birim testi**, **159/159 yerel worker entegrasyon testi (`npm run test:local-worker`)** ve **130/130 frontend birim testi (14 dosya) + üretim build'i (1.702 modül)** sıfır hatayla geçti. Ayrıntılı kanıt raporları: [Faz 1](../docs/roadmap-reports/faz-1-rapor.md), [Faz 2](../docs/roadmap-reports/faz-2-rapor.md), [Faz 3](../docs/roadmap-reports/faz-3-rapor.md), [Faz 4](../docs/roadmap-reports/faz-4-rapor.md).
