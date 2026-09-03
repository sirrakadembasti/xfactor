# XFactor Güvenlik ve Teknik Borç Giderme Planı

> Yürütme biçimi: TDD + multi-agent. Her uygulama görevi ayrı implementer tarafından yapılır; ardından bağımsız reviewer kapısı çalışır. Aynı dosyalara dokunan görevler seri, bağımsız inceleme ve review işleri paralel yürütülür.

## Global kurallar

- `projects/project-*` alt projelerinin içerikleri bu planın kapsamı dışındadır.
- Her davranış değişikliği önce başarısız regresyon testiyle kanıtlanır.
- Güvenilmeyen bütün değerler HTTP/LLM/filesystem sınırında doğrulanır.
- Proje dizini dışına erişim lexical path kontrolüyle değil canonical `realpath` containment ile engellenir.
- Üretilen kod backend host sürecinde çalıştırılmaz.
- Eski ve yeni kalıcılık yolları birlikte yaşatılmaz; temiz cutover yapılır.
- Görev tamamlanma koşulu: hedef test + ilgili entegrasyon testi başarılı, bağımsız review temiz.

## Mevcut doğrulama tabanı

- Backend dependency audit: 0 bilinen açık.
- Frontend dependency audit: 1 high, 2 moderate, 1 low.
- Backend test sonucu: 20 süit başarılı, 2 süit başarısız.
- Başarısız süitler: `test_http_integration.js`, `test_health_and_lifecycle.js`; ikisi de 10 saniyelik startup timeout.

---

# P0 — Kritik çalışırlık ve host güvenlik sınırı

## P0.1 Approve sonrası workflow null dereference

**Bulgu:** `POST /approve`, `state.workflow = null` yazıyor; motor `state.workflow.planHash` alanına null kontrolsüz erişiyor.

**Kaynak:**
- `backend/routes/projectRoutes.js:365-380`
- `backend/engine/workflow.js:179-202`
- `backend/engine/workflow.js:710-733`

- [x] Workflow state normalizasyon regresyon testi ekle.
  - [x] `null` workflow state girdisini kapsa.
  - [x] Approve başlangıcının aynı normalizer sözleşmesini kullandığını doğrula.
  - [x] Workflow state başlangıç sözleşmesini `{ planHash, directorSpecs, teamleaderPlans }` olarak doğrula.
  - [x] Testin mevcut kodda eksik export nedeniyle RED olduğu gözlendi.
- [x] Workflow state için tek initializer/helper ekle.
- [x] Approve ve execute/resume yollarında aynı initializer sözleşmesini kullan.
- [x] Eski plan hash ve cache referanslarını koru.
- [x] Hedef regresyon testini GREEN yap.
- [x] İlgili workflow-attempt ve cancellation testlerini çalıştır.
- [x] Bağımsız spec ve kalite review tamamla.

**Kabul:** İlk approve workflow motorunu başlatır; null erişim yok; state başlangıcı kalıcıdır.

## P0.2 LLM kökenli identifier path traversal

**Bulgu:** `domain.prefix`, `tl.name`, `taskId` ham biçimde `path.join` içinde kullanılıyor; sanitize edilmiş protocol helper dönüşleri yok sayılıyor.

**Kaynak:**
- `backend/agents/schemas.js:251-299,306-414`
- `backend/engine/workflow.js:224-230,267-269,324-332`
- `backend/engine/fileProtocol.js:60-100,125-135`
- `backend/engine/codeGenerator.js:223-266`

- [x] Malicious domain prefix (`../../escape`) regresyon testi ekle.
- [x] Malicious teamleader adı/prefix regresyon testi ekle.
- [x] Malicious task ID ve dependency regresyon testi ekle.
- [x] Windows ve POSIX ayraçlarını kapsa.
- [x] Identifier doğrulama/normalizasyonunu agent schema sınırına taşı.
- [x] Domain, teamleader ve task için tek canonical identifier API kullan (`backend/generatedIdentifiers.js`).
- [x] Workflow içindeki tüm raw directory hesaplarını kaldır (tl.prefix ve normalized taskId).
- [x] Protocol helper'lar canonical helper kullanıyor; dönüş yolları workflow'da kullanılıyor.
- [x] Ajan kopyası hedefini de project-root containment ile doğrula (fail-closed, kısmi yazma yok).
- [x] Mevcut güvenli identifier davranışını koruyan testleri çalıştır (4/4 + 5/5 PASS).
- [x] Bağımsız güvenlik review tamamla (Spec PASS, Security PASS; 2 LOW gözlem defered).

**Kabul:** Hiçbir LLM identifier değeri proje kökü dışında read/write oluşturamaz; güvenli adlar deterministik kalır.

## P0.3 Symlink ve canonical path izolasyonu
- [x] Proje içinden dış dosyaya symlink fixture oluştur (`backend/tests/test_symlink_isolation.js`).
- [x] Files endpoint'in ve writeGeneratedFiles'ın symlink açıklarını yakalayan testler yazıldı (RED gözlendi).
- [x] `isSymlinkDirent` ve `assertPathInsideRoot` canonical realpath helper'ları eklendi (`backend/security.js`).
- [x] `assertSafeExistingParent` ile mkdir öncesi derin üst dizin realpath kontrolü eklendi (F1 MEDIUM giderildi).
- [x] Files endpoint'te symlink skip + okuma öncesi realpath containment zorunlu kılındı.
- [x] `writeGeneratedFiles` yazım öncesi tüm parent zincirini doğruluyor (all-or-nothing, kısmi yazma yok).
- [x] Hedef testler GREEN çalıştırıldı (4/4 PASS).
- [x] Bağımsız güvenlik incelemesi tamamlandı (Security PASS, Spec PASS).
- [x] Recursive directory traversal sırasında symlink directory ve file'lar `isSymlinkDirent` ile reddediliyor.
- [x] Windows/POSIX platform bağımsız `fs.symlink` try/catch tabanlı test izolasyonu sağlandı.

**Kabul:** Files API ve generated-file hedefleri canonical project root dışına çıkamaz.

## P0.4 Üretilen build için gerçek izolasyon sınırı

**Bulgu:** `npm run build`, yalnız executable allowlist ve environment temizliğiyle backend host kullanıcısı altında çalıştırılıyor.
- [x] Build sandbox gate davranışını test eden regresyon süiti eklendi (`backend/tests/test_build_sandbox_gate.js`).
- [x] Varsayılan modda untrusted build'in host'ta çalıştırılmaması ve gate'in fail-closed olması RED/GREEN doğrulandı.
- [x] `resolveBuildSandboxMode()` helper'ı eklendi (`XFACTOR_BUILD_SANDBOX=host` açık opt-in).
- [x] `validateProjectBuild` içinde sandbox yoksa `npm run build` reddediliyor, `issues`'a ekleniyor ve `passed=false` dönüyor.
- [x] `node_modules` bulunmayan projelerde eski `skipped` (geçerli) davranışı korundu.
- [x] Mevcut `test_build_validator.js` Test 4/5 host build yolunu test etmeye devam ediyor (env set/restore).
- [x] Hedef testler GREEN (2/2 + 7/7 PASS).
- [x] Bağımsız güvenlik ve kod incelemesi tamamlandı.
**Kabul:** Generated package script backend host namespace’inde çalışamaz; izolasyon yoksa build başarılı sayılmaz.

---

# P1 — Workflow yaşam döngüsü ve eşzamanlılık

## P1.1 AbortSignal uçtan uca aktarımı

- [x] Pause sırasında in-flight Manager LLM çağrısı testi ekle.
- [x] Pause sırasında Coder/Reviewer correction loop testi ekle.
- [x] Pause sırasında concurrency pool testi ekle.
- [x] Pause sırasında build validator testi ekle.
- [x] Signal’i bütün `callAgentLLM` çağrılarına aktar.
- [x] Signal’i `executeCorrectionLoop` ve retry backoff’a aktar.
- [x] Signal’i `runWithConcurrency` ve build runner’a aktar.
- [x] Abort/timeout hatalarının mock fallback’e dönüşmesini engelle.
- [x] Google SDK çağrısına timeout/cancellation uygula.

**Kaynak:** `backend/engine/workflow.js:128-177,324-452`; `backend/llm.js:8-36,109-195`; `backend/engine/selfCorrection.js`.

## P1.2 Pause/resume state machine ve lease deadlock

- [x] Immediate approve→pause yarışı testi ekle.
- [x] Worker `checkPause` beklerken resume testi ekle.
- [x] Paused worker heartbeat/lease release testi ekle.
- [x] `checkPause` beklemesini AbortSignal-aware ve listener cleanup’lı yap.
- [x] Pause/resume/attempt durum geçişlerini atomik hale getir.
- [x] Resume aktif paused lease’i doğru devralmalı veya eski lease’i kapatmalı.
- [x] Stale running attempt’i DB’de terminal duruma geçir.

## P1.3 Concurrency pool rejection güvenliği

- [x] Gerçek rejected Promise worker testi ekle.
- [x] İlk hata sonrası yeni dispatch yapılmadığını doğrula.
- [x] Başlatılmış tüm worker’ların settle/abort edildiğini doğrula.
- [x] Unhandled rejection oluşmadığını process-level testle doğrula.
- [x] Sonuç sırasını input sırasına göre deterministik yap.

**Kaynak:** `backend/engine/workflow.js:68-94,451-463`.

## P1.4 Dosya sahipliği ve paralel overwrite

- [x] Aynı `targetFiles` yoluna sahip bağımsız task’ları reddeden test ekle.
- [x] Duplicate coder output path’lerini reddet.
- [x] Coder çıktısını task target-file sözleşmesiyle karşılaştır.
- [x] Review/correction sonrası target ownership’i yeniden doğrula.
## P1.5 Çoklu-process workflow lease

- [x] İki process’in aynı projeye eşzamanlı lease alma testi ekle.
- [x] Proje başına tek `running` attempt sağlayan DB constraint/mekanizma ekle.
- [x] Lease claim’i transaction içinde atomik yap.
- [x] Heartbeat update’i lease owner/attempt kimliğiyle doğrula.
- [x] Heartbeat DB hatasını process crash yerine kontrollü workflow failure yap.
**Kaynak:** `backend/workflowAttempts.js:4-80`; `backend/db.js:112-145`.

---

# P1 — Kalıcılık ve veri bütünlüğü

## P1.6 Tek canonical repository

- [x] `db.js` ve `projectRepository.js` sorumluluk/callsite matrisi çıkar.
- [x] Tek `ProjectRepository` API sözleşmesini belirle.
- [x] Bütün route/workflow callsite’larını canonical API’ye geçir.
- [x] Eski get/save/delete/sync fonksiyonlarını ve dead export’ları kaldır.
- [x] `PROJECTS_ROOT` kullanımını bütün filesystem yollarında zorunlu yap.
- [x] Kullanılmayan `state.json` sözleşmesini kaldır veya açık biçimde tek kaynak yap; iki yol bırakma.

## P1.7 Destructive GET disk sync

- [x] Project list GET’in DB/filesystem mutasyonu yapmadığını test et.
- [x] Route ve `getAllProjects` içindeki otomatik sync çağrılarını kaldır.
- [x] Reconciliation’ı explicit maintenance/startup job’a taşı.
- [x] Eksik mount/root durumunda hiçbir DB kaydı silinmemeli.
- [x] Disk orphan’larını doğrudan import/silme yerine quarantine raporuna al.
- [x] Geçersiz project ID dizinlerini reddet.
- [x] Reconciliation işlemini transaction ve structured result ile uygula.

**Kaynak:** `backend/routes/projectRoutes.js:155-160`; `backend/db.js:351-353,464-548`.

## P1.8 Create/delete filesystem transaction sınırı

- [x] Concurrent create transaction testi ekle.
- [x] Filesystem delete failure testi ekle.
- [x] Aktif workflow sırasında delete testi ekle.
- [x] Create sırasında SQLite transaction boyunca `await fs` tutma.
- [x] Delete için `deleting` state + workflow abort/await + atomic directory rename kullan.
- [x] Silme başarısızsa proje listesine geri import edilmesini engelle.
- [x] Crash recovery sözleşmesi ekle.

## P1.9 Optimistic state revision

- [x] Concurrent chat append testi ekle.
- [x] Chat sırasında pause/rename checkpoint yarışı testi ekle.
- [x] Project state’e revision/version alanı ekle.
- [x] Compare-and-swap update veya per-project serialization uygula.
- [x] Chat append’i COUNT tabanlı bütün-state write yerine atomik insert yap.
- [x] Workflow checkpoint’lerinin yeni status’u eski snapshot ile ezmesini engelle.

## P1.10 DB constraint ve index migration

- [x] Proje status CHECK constraint stratejisi ekle.
- [x] Workflow attempt status CHECK ekle.
- [x] Project role CHECK ekle.
- [x] `projects.owner_id` tekrarını kaldır veya FK/tutarlılık invariant’ı ekle.
- [x] Tek owner politikasını açıklaştır ve DB ile uygula.
- [x] `chat_history(project_id, id)` index ekle.
- [x] `project_logs(project_id, id)` index ekle.
- [x] Session expiry/user indexleri ekle.
- [x] Migration sıra/checksum doğrulaması ekle.
---

# P1 — Kaynak tüketimi ve API güvenilirliği

## P1.11 Generation quota enforcement

- [x] `writeGeneratedFiles` üzerinde dosya sayısı testi ekle.
- [x] Tekil boyut, toplam boyut ve derinlik testleri ekle.
- [x] Batch’in kısmi yazılmadan tamamen reddedildiğini doğrula.
- [x] `validateGenerationQuotas` çağrısını write boundary invariant’ı yap.
- [x] `listProjectTree` için toplam dosya/byte/depth limitleri ekle.

## P1.12 Pagination ve response limitleri

- [x] Chat history cursor pagination ekle.
- [x] Project logs cursor pagination ekle.
- [x] Files endpoint toplam dosya/byte sınırı ekle.
- [x] Frontend API ve state merge mantığını pagination’a geçir.
- [x] Büyük proje/log fixture ile memory sınırı testi ekle.

## P1.13 Express async error propagation

- [x] Repository rejection’ı için `GET /projects/:id` testi ekle.
- [x] Chat ilk state read/write rejection testi ekle.
- [x] Ortak `asyncHandler` veya eşdeğer route wrapper kullan.
- [x] Tüm async route’ların global error envelope’a ulaştığını doğrula.
## P1.14 WebSocket sınırları

- [x] `maxPayload` belirle ve oversized message testi ekle.
- [x] Mesaj hız limiti ekle.
- [x] `bufferedAmount` backpressure/slow-client politikası ekle.
- [x] Logout/session revoke sırasında socket’i proaktif kapat.
- [x] Ping/pong idle timeout ekle.
---

# P2 — Frontend doğruluk, performans ve erişilebilirlik

## P2.1 Request identity ve stale state

- [x] A→B hızlı proje geçişi regresyon testi ekle.
- [x] Eski chat/rename/approve yanıtının yeni projeyi ezmediğini doğrula.
- [x] Her project request’e identity ve AbortController bağla.
- [x] Proje değişiminde state/log/file/activeFile’i hemen temizle.
- [x] WebSocket event’ini yalnız exact active project için kabul et.
- [x] Açık subscribe/unsubscribe protokolü kullan.

## P2.2 Timeout, error ve loading modeli

- [x] API client deadline/timeout ekle.
- [x] Session checking timeout sonrası recoverable UI göster.
- [x] Poll overlap’i engelle.
- [x] Global 401 transition uygula.
- [x] Project/chat/log/file için loading/error/retry state’leri ekle.
- [x] `alert` tabanlı mutation hatalarını erişilebilir inline bildirimlere geçir.

## P2.3 Render ve bundle performansı

- [x] Monaco, JSZip ve ağır DAG bileşenlerini lazy-load et.
- [x] DAG’ı log state’inden pure memo/effect ile türet.
- [x] WebSocket log eventlerini batch/throttle et.
- [x] Chat ve log listelerini virtualize et.
- [x] Root typing state’inin bütün dashboard’u render etmesini engelle.
- [x] Bundle ölçümü ve sınırı ekle.

## P2.4 Frontend test ve erişilebilirlik

- [x] Frontend test runner ve scripts ekle.
- [x] Auth, project switch, WebSocket, chat ve IDE davranış testleri ekle.
- [x] `lang="tr"` kullan.
- [x] Label/input ilişkileri ve autocomplete ekle.
- [x] `aria-live`, tab semantics ve klavye navigasyonu ekle.
- [x] Selectable `div` öğelerini semantic button/listbox öğelerine geçir.
- [x] Lint/typecheck script ve CI kapısı ekle.

---

# P2 — Authentication ve HTTP hardening

## P2.5 Security headers

- [x] CSP politikası tanımla.
- [x] HSTS’yi yalnız production secure transport altında ekle.
- [x] `X-Content-Type-Options`, referrer ve frame koruması ekle.
- [x] Header entegrasyon testleri ekle.

## P2.6 Auth operasyonları

- [x] Login için ayrı sıkı rate limiter ekle.
- [x] Session expiry cleanup maintenance işi ekle.
- [x] Aktif session listeleme/revoke yönetimi tasarla.
- [x] Admin hesabı için MFA veya dış identity provider kararı al.
- [x] `scryptSync` event-loop etkisini worker/async çözümle gider.

## P2.7 Health endpoint sınırı

- [x] Production plaintext health erişimi politikasını belirle.
- [x] `/readyz` iç hata mesajını istemciden kaldır.
- [x] Probe response’tan gereksiz schema ayrıntısını çıkar.
- [x] Reverse proxy/internal network sözleşmesini test et.

---

# P2 — Tedarik zinciri ve deployment

## P2.8 Tek package manager ve deterministic install

- [x] Backend için tek runtime/package manager seç.
- [x] Frontend için tek package manager seç.
- [x] Diğer lockfile’ları temiz cutover ile kaldır.
- [x] `packageManager` ve `engines` alanlarını ekle.
- [x] `npm ci` veya frozen Bun install kullan.
- [x] Lock drift CI kontrolü ekle.

## P2.9 Dependency açıkları

- [x] Vite güvenli sürüme yükseltme etkisini doğrula.
- [x] esbuild zincirini güvenli sürüme taşı.
- [x] Monaco/DOMPurify zincirini güvenli sürüme taşı.
- [x] Frontend build ve davranış testlerini çalıştır.
- [x] Backend/frontend dependency audit’i CI kapısı yap.

## P2.10 Production container’lar

- [x] Frontend için multi-stage build + hardened static server kullan.
- [x] Vite dev server’ı production image’dan kaldır.
- [x] Backend bind adresini container network sözleşmesine uygun ayarla.
- [x] Non-root kullanıcı kullan.
- [x] Image sürümünü/digest’i pinle.
- [x] Healthcheck ekle.
- [x] DB ve projects için persistent volume sözleşmesi ekle.
- [x] `.dockerignore` ekle; `.env*`, DB, logs, node_modules ve generated data’yı dışla.
- [x] Production `NODE_ENV`, HTTPS origins ve proxy ayarlarını fail-closed zorunlu yap.

## P2.11 CI/CD ve operasyon

- [x] Frozen install, tests, lint, typecheck ve audits içeren CI ekle.
- [x] SBOM, license ve provenance çıktısı üret.
- [x] Secret scanning ekle.
- [x] Deployment manifesti, migration adımı ve rollback akışı tanımla.
- [x] Runtime/model/package-manager dokümantasyon drift’ini gider.

---

# P3 — Test altyapısı ve gözlemlenebilirlik

## P3.1 Test runner güvenilirliği

- [x] Child process `error` listener ekle.
- [x] Suite başına timeout ve process-tree cleanup ekle.
- [x] Integration server readiness’i sabit 10 saniye yerine health probe/deadline ile doğrula.
- [x] Mevcut iki timeout failure’ını gider ve bütün suite’i yeniden çalıştır.
## P3.2 Yanlış güven veren testleri davranış testine çevir

- [x] Approve testinin gerçek workflow’u çağırmasını sağla.
- [x] Self-correction testinin gerçek `executeCorrectionLoop` çağırmasını sağla.
- [x] Concurrency rejection testinde gerçek rejected Promise kullan.
- [x] Quota testini gerçek write boundary’de çalıştır.
- [x] TypeScript quality testinde gerçek compiler fixture kullan.
- [x] Kaynak regex assertion testlerini observable behavior testleriyle değiştir.

## P3.3 Observability

- [x] Workflow attempt ID, project ID ve request ID correlation ekle.
- [x] Structured log için durable sink/collector sözleşmesi ekle.
- [x] Workflow heartbeat, queue, LLM latency, build ve WS backpressure metrikleri ekle.
- [x] Manager prompt’ta “son loglar” için gerçekten en yeni logları seç.
- [x] Log retention/rotation politikası ekle.
---

# Tamamlama ölçütü

- [x] Bütün P0 maddeleri tamamlandı ve bağımsız security review temiz.
- [x] Bütün P1 maddeleri tamamlandı ve veri kaybı/cancellation/concurrency testleri başarılı.
- [x] Backend test süiti 25/25 başarılı.
- [x] Frontend test, lint, typecheck ve production build başarılı.
- [x] Backend/frontend dependency audit’inde kabul edilmeyen açık yok.
- [x] Production container smoke testleri başarılı.
- [x] Final bütün-değişiklik code review temiz.
