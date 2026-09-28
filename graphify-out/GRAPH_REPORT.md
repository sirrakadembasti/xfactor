# XFactor kaynak haritası

Üretim tarihi: 2026-09-28T12:55:42.067Z

- 314 kaynak ve belge dosyası
- 2094 düğüm
- 5490 ilişki

## Düğüm türleri

| Tür | Adet |
|---|---:|
| Function | 1053 |
| Method | 534 |
| SourceFile | 197 |
| EnvVar | 60 |
| Package | 48 |
| HttpRoute | 38 |
| Document | 37 |
| HttpRequest | 33 |
| TestSuite | 32 |
| BackendService | 22 |
| Class | 14 |
| FrontendComponent | 11 |
| AgentModule | 9 |
| EngineCore | 6 |

## İlişki türleri

| Tür | Adet |
|---|---:|
| calls | 1743 |
| contains | 1663 |
| imports_package | 733 |
| imports | 546 |
| dynamic_imports | 257 |
| runs | 128 |
| reads_env | 110 |
| writes_env | 110 |
| registers_route | 38 |
| sends_request | 33 |
| requests_route | 25 |
| verifies | 20 |
| defines | 17 |
| renders | 10 |
| registers | 8 |
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
| triggers_workflow | 1 |
| reads_docs | 1 |
| persists_state | 1 |
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

## Yorum sınırları

İçe aktarma, çağrı, HTTP rota/isteği ve dosya içerme ilişkileri AST taramasından gelir; mimari ilişkiler üreticide tanımlanmış açıklamalı bağlantılardır. Çağrı bağı yalnızca statik olarak tek hedefe çözülen durumlarda çizilir. İstemci isteği ile sunucu rotası bağı, yöntem ve yolun tek bir rotayla eşleştiği durumlarda çıkarımdır. Çalışma zamanı davranışı, tüm veri akışı ve dinamik değerler bu haritadan tek başına doğrulanamaz.

- [Etkileşimli ilişki haritası](graph.html)
- [Güncel dosya ağacı](GRAPH_TREE.html)
- [Ham JSON](graph.json)
