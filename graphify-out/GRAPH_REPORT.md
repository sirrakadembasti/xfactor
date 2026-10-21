# XFactor kaynak haritası

Üretim tarihi: 2026-10-21T19:37:10.395Z

- 450 kaynak ve belge dosyası
- 2769 düğüm
- 6992 ilişki

## Düğüm türleri

| Tür | Adet |
|---|---:|
| Function | 1322 |
| Method | 764 |
| SourceFile | 270 |
| Document | 99 |
| EnvVar | 82 |
| Package | 52 |
| HttpRoute | 48 |
| HttpRequest | 36 |
| TestSuite | 32 |
| BackendService | 22 |
| Class | 15 |
| FrontendComponent | 11 |
| AgentModule | 10 |
| EngineCore | 6 |

## İlişki türleri

| Tür | Adet |
|---|---:|
| calls | 2257 |
| contains | 2167 |
| imports_package | 962 |
| imports | 671 |
| dynamic_imports | 285 |
| reads_env | 161 |
| runs | 144 |
| writes_env | 126 |
| registers_route | 48 |
| sends_request | 36 |
| requests_route | 29 |
| verifies | 20 |
| defines | 17 |
| renders | 10 |
| registers | 9 |
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
| handles | 1 |

## Yorum sınırları

İçe aktarma, çağrı, HTTP rota/isteği ve dosya içerme ilişkileri AST taramasından gelir; mimari ilişkiler üreticide tanımlanmış açıklamalı bağlantılardır. Çağrı bağı yalnızca statik olarak tek hedefe çözülen durumlarda çizilir. İstemci isteği ile sunucu rotası bağı, yöntem ve yolun tek bir rotayla eşleştiği durumlarda çıkarımdır. Çalışma zamanı davranışı, tüm veri akışı ve dinamik değerler bu haritadan tek başına doğrulanamaz.

- [Etkileşimli ilişki haritası](graph.html)
- [Güncel dosya ağacı](GRAPH_TREE.html)
- [Ham JSON](graph.json)
