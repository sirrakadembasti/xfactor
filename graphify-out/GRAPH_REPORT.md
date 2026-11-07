# XFactor kaynak haritası

Üretim tarihi: 2026-11-07T18:34:02.235Z

- 454 kaynak ve belge dosyası
- 3635 düğüm
- 9614 ilişki

## Düğüm türleri

| Tür | Adet |
|---|---:|
| Function | 1748 |
| Method | 1185 |
| SourceFile | 337 |
| EnvVar | 84 |
| Package | 55 |
| HttpRoute | 53 |
| HttpRequest | 41 |
| TestSuite | 32 |
| BackendService | 27 |
| Document | 23 |
| Class | 15 |
| EngineCore | 14 |
| FrontendComponent | 11 |
| AgentModule | 10 |

## İlişki türleri

| Tür | Adet |
|---|---:|
| calls | 3377 |
| contains | 3015 |
| imports_package | 1134 |
| imports | 959 |
| dynamic_imports | 395 |
| reads_env | 180 |
| runs | 177 |
| writes_env | 130 |
| registers_route | 53 |
| sends_request | 41 |
| requests_route | 34 |
| verifies | 20 |
| renders | 10 |
| defines | 6 |
| registers | 6 |
| composes_policy | 6 |
| inherits_policy | 6 |
| loads | 6 |
| uses | 6 |
| delegates_verification | 2 |
| uses_templates | 2 |
| mounts | 2 |
| delegates_routes | 2 |
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
| delegates_repair | 1 |
| executes_migrations | 1 |
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
