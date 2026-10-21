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
