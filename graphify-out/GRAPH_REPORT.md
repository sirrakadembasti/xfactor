# XFactor kaynak haritası

Üretim tarihi: 2026-10-24T15:27:16.611Z

- 472 kaynak ve belge dosyası
- 2978 düğüm
- 7687 ilişki

## Düğüm türleri

| Tür | Adet |
|---|---:|
| Function | 1444 |
| Method | 829 |
| SourceFile | 276 |
| Document | 109 |
| EnvVar | 82 |
| Package | 52 |
| HttpRoute | 48 |
| HttpRequest | 36 |
| TestSuite | 32 |
| BackendService | 24 |
| Class | 15 |
| FrontendComponent | 11 |
| AgentModule | 10 |
| EngineCore | 10 |

## İlişki türleri

| Tür | Adet |
|---|---:|
| calls | 2596 |
| contains | 2354 |
| imports_package | 995 |
| imports | 723 |
| dynamic_imports | 351 |
| reads_env | 165 |
| runs | 148 |
| writes_env | 130 |
| registers_route | 48 |
| sends_request | 36 |
| requests_route | 29 |
| verifies | 20 |
| renders | 10 |
| defines | 6 |
| registers | 6 |
| composes_policy | 6 |
| inherits_policy | 6 |
| loads | 6 |
| uses | 6 |
| mounts | 2 |
| calls_ai | 2 |
| reads | 1 |
| executes_waves | 1 |
| manages_files | 1 |
| triggers_scaffold | 1 |
| runs_review_loop | 1 |
| dispatches_agents | 1 |
| guards_states | 1 |
| guards_protocol_io | 1 |
| qualifies_task_ownership | 1 |
| persists_reviewed_checkpoints | 1 |
| routes_bounded_owner_repairs | 1 |
| triggers_workflow | 1 |
| reads_docs | 1 |
| persists_state | 1 |
| records_worker_rejections | 1 |
| loads_current_rejections | 1 |
| resolves_with_fresh_evidence | 1 |
| guards_recovery_metadata | 1 |
| authenticates | 1 |
| secures | 1 |
| persists_projects | 1 |
| reconciles_disk | 1 |
| validates_revisions | 1 |
| delegates_execution | 1 |
| dispatches_jobs | 1 |
| http_and_ws | 1 |
| computes_layout | 1 |
| consumes_api | 1 |
| validates_contracts | 1 |
| enforces_quality | 1 |
| delegates_verification | 1 |
| runs_security_checks | 1 |
| checks_database | 1 |
| verifies_apis | 1 |
| executes_sandbox | 1 |
| enforces_traceability | 1 |
| queries_verification | 1 |
| validates_schema | 1 |
| manages_websockets | 1 |
| launches_server | 1 |
| launches_worker | 1 |
| handles | 1 |

## Yorum sınırları

İçe aktarma, çağrı, HTTP rota/isteği ve dosya içerme ilişkileri AST taramasından gelir; mimari ilişkiler üreticide tanımlanmış açıklamalı bağlantılardır. Çağrı bağı yalnızca statik olarak tek hedefe çözülen durumlarda çizilir. İstemci isteği ile sunucu rotası bağı, yöntem ve yolun tek bir rotayla eşleştiği durumlarda çıkarımdır. Çalışma zamanı davranışı, tüm veri akışı ve dinamik değerler bu haritadan tek başına doğrulanamaz.

- [Etkileşimli ilişki haritası](graph.html)
- [Güncel dosya ağacı](GRAPH_TREE.html)
- [Ham JSON](graph.json)
