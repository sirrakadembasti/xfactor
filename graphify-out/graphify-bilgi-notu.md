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

Harita statik bağlantıları gösterir; bir koşunun geçtiğini veya bir ZIP'in kabul edildiğini kanıtlamaz. Gerçek otel üretiminin sonucunu [21 Ekim 2026 kabul raporunda](../docs/LOCAL-WORKER-VALIDATION-2026-10-21.md), kullanım adımlarını [kullanıcı kılavuzunda](../kullanici-kilavuzu.md) okuyun.

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

4. **Faz 4 (Tanrı Modüllerin Parçalanması ve Sıfır Kırılma Re-Export Disiplini — `ENG-8`, `DAT-6`):**
   - `workflow.js`: Onarım döngüleri `backend/engine/stages/repairStage.js` modülüne, paket kilidi hazırlığı `backend/engine/stages/verificationStage.js` modülüne taşındı. `buildValidator.js` regex yerine AST tabanlı tip denetimine dönüştürüldü.
   - `codeGenerator.js`: Çok aşamalı Dockerfile/`.dockerignore` şablonları `backend/engine/templates/dockerTemplates.js` modülüne, Prisma/DB çift köprü ve auth şablonları `backend/engine/templates/prismaTemplates.js` modülüne taşındı.
   - `projectRoutes.js`: Gözlemlenebilirlik uç noktaları `backend/routes/projectObservabilityRoutes.js` modülüne, izlenebilirlik ve artefakt indirme uç noktaları `backend/routes/projectTraceabilityRoutes.js` modülüne taşındı; `graphSource.js` rota miras mekanizmasıyla AST bağlantıları korundu.
   - `db.js`: Mükerrer `assertWorkflowLease` silinerek `workflowAttempts.js` ile birleştirildi; 17 versiyonlu `MIGRATIONS` dizisi `backend/db/migrations.js` modülüne taşındı.
   - Tüm taşınan fonksiyonlar orijinal modüllerden sıfır kırılma (Zero-Breakage Re-Exports) garantisiyle dışa aktarılmaya devam etmektedir.
