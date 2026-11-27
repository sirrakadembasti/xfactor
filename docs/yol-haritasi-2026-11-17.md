# XFactor Mimari İnceleme ve Yol Haritası — 17 Kasım 2026

> **Bu belge kimin için?** XFactor'ı daha önce hiç görmemiş, bu konuşmanın bağlamına sahip olmayan ve herhangi bir sağlayıcının modeliyle çalışan bağımsız bir kodlama ajanı için. Belgeyi baştan sona okuyan ajan:
> 1. uygulamanın ne yaptığını ve nasıl çalıştığını öğrenir (§1–§2),
> 2. güvenle çalışma kurallarını bilir (§3),
> 3. bugünkü durumu ve hataları görür (§4–§5),
> 4. sıradaki işleri adım adım uygular (§6–§7).
>
> Ajanın dosya okuma/yazma, kabuk komutu çalıştırma ve `git` kullanma yeteneği olduğu varsayılır. Komutlar Windows PowerShell için yazıldı; bash karşılıkları gerektiğinde verildi.

**Doğrulama zemini:**
- Dal `faz-5/stok-takip-onarim` @ `8d13ab2`, üzerinde commit edilmemiş değişiklikler var (§5, B-11).
- Ortam: Windows 11, Node 22.23.2.
- Canlı veritabanı yalnız salt okunur okundu. Sayılar 17 Kasım 2026 ~06:30 UTC itibarıyla geçerli ve sonraki koşularla değişir.

**Satır numaraları hakkında:** Verilen `dosya:satır` değerleri 17 Kasım itibarıyla doğrudur. Kod değişince kayabilir. Her zaman **fonksiyon adıyla** ara, satırı yalnız ipucu olarak kullan.

---

## İçindekiler

1. Uygulamayı tanı
2. Ortamı kur, çalıştır, gözlemle
3. Çalışma kuralları (zorunlu)
4. Kısa teşhis ve vaat–gerçek karşılaştırması
5. Bulgular (B-1 … B-11)
6. Yol haritası: genel bakış
7. Görevler (Y0 … Y9)
8. Bu incelemenin kapsamı

Ekler: A (canlı DB okuma betiği), B (transaction tarama betiği), C (görev raporu şablonu)

---

## 1. Uygulamayı tanı

### 1.1 XFactor nedir?

XFactor, kullanıcının doğal dilde anlattığı bir yazılımı **otonom olarak üreten ve bağımsız olarak doğrulayan** bir platform. Kullanıcı tarayıcıda "Manager" adlı yapay zekâ ajanıyla sohbet eder. Manager bir plan, yani **sözleşme** önerir. Kullanıcı onaylayınca bir ajan hiyerarşisi kodu üretir. Ayrı bir **Execution Worker** süreci üretilen projeyi temiz bir ortamda kurar, derler, çalıştırır, API ve tarayıcı testlerinden geçirir. Bütün zorunlu kontroller geçerse bir **tamamlama makbuzu** yazılır ve kullanıcı ZIP'i indirebilir.

Temel ilke **fail-closed**: kanıt eksik veya belirsizse sonuç PASS sayılmaz, teslim yapılmaz.

### 1.2 Bileşenler

| Bileşen | Dizin | Port | Görevi |
|---|---|---|---|
| Frontend | `frontend/` (React 18 + Vite) | 5173 | Sohbet, Kalite Paneli, Canlı DAG, Loglar. Ana dosya: `frontend/src/App.jsx`; API istemcisi: `frontend/src/services/api.js` |
| Backend (orkestratör) | `backend/` (Express, ESM, `node:sqlite`) | 8000 | REST API, WebSocket, ajanlar, iş akışı motoru, kalite politikası, SQLite |
| Execution Worker | `execution/` | 8099 | Token korumalı iç servis. `prepare_dependencies`, `verify_artifact`, `typecheck_artifact` işlerini Docker'da veya yerelde çalıştırır |
| Ajan talimatları | `x-agents/` | — | Rollerin sistem istemleri (`manager.md`, `coder.md` …) ve orkestrasyon anayasası |
| LLM yönetimi | `llm-yonetimi/` | — | Sağlayıcı profilleri (şifreli), arayüzdeki **LLM Yönetimi** sayfası |
| Üretilen projeler | `projects/<proje-id>/` | — | XFactor'ın ürettiği uygulamalar. **Elle dokunulmaz** |
| Veri | `backend/data/` | — | `projects.db` (canlı SQLite), `artifacts/` (ZIP'ler), `maintenance-backups/` |
| Belgeler | `README.md`, `kullanici-kilavuzu.md`, `docs/`, `graphify-out/` | — | Kullanım, faz arşivi, mimari grafik |

### 1.3 Ana akış

```
Kullanıcı ── sohbet ──▶ Manager (plan/sözleşme taslağı)
                │ "Planı Onayla"
                ▼
      project_contracts (status=approved)        ← sözleşme
                │ POST /approve veya /resume → lease alınır (workflow_attempts)
                ▼
   backend/engine/workflow.js: executeProjectTasks
     1. Root protokol + iskele (package.json, tsconfig …)
     2. Director (her domain için şartname)
     3. Teamleader (görevleri tek dosyalık atomik parçalara ve DAG'a böler)
     4. Coder + Reviewer döngüsü (DAG dalgaları, eşzamanlılık 2) → task_checkpoints
     5. Kalite aşaması: statik denetim + Tester  (engine/stages/qualityStage.js)
     6. Kabul aşaması                            (engine/stages/acceptanceStage.js)
        a. Worker: prepare_dependencies → package-lock.json
        b. ZIP oluştur (utils/archive.js) → artifacts
        c. Worker: verify_artifact → verification_runs + verification_checks
        d. Zorunlu kapılar PASS ise → completion_receipts → status=completed
```

Hata olursa proje `paused` olur ve `last_error` yazılır. Kullanıcının üç kurtarma yolu var:
- **Devam Ettir** (`POST /resume`): kaldığı yerden sürdürür.
- **Yalnız Yeniden Doğrula** (`POST /reverify`): kaynağı değiştirmeden yeni worker kanıtı alır.
- **Sınırlı onarım** (`/repair-proposal` → `/repair` → `/repair-review`): yalnız listelenen dosyaları yeniden yazar. Bkz. §1.4.

### 1.4 Kavram sözlüğü

| Terim | Anlamı | Nerede |
|---|---|---|
| **Sözleşme (contract)** | Onaylı plan JSON'u: gereksinimler, domainler, yönetim/tarayıcı kapsamı. Revizyonludur. Durumlar: `pending_approval`, `approved`, `superseded`, `rejected` | `project_contracts`, `backend/contracts/` |
| **Girişim (attempt) / lease** | Bir projeyi aynı anda yalnız bir yürütmenin işlemesini sağlayan kilit. Kalp atışı 5 sn'de bir yazılır, 30 sn yazılmazsa lease bayat sayılır | `workflow_attempts`, `backend/workflowAttempts.js` |
| **Fence (çit)** | Her yazımdan önce lease'in, sözleşmenin ve proje durumunun hâlâ geçerli olduğunu doğrulayan kontrol. Geçersizse `WORKFLOW_LEASE_FENCED` | `assertWorkflowLease`, `commitWorkflowSource`, `commitVerificationContext` |
| **`workflow.execution_fenced`** | Çit tutmadığı için yürütmenin kendini durdurduğu log olayı | `engine/workflow.js` |
| **Checkpoint** | Bir Coder görevinin girdi/çıktı özetleri. Devam ederken değişmemiş görev yeniden üretilmez | `task_checkpoints`, `engine/checkpointRepository.js` |
| **Doğrulama koşusu (verification run)** | Worker'ın bir ZIP üzerindeki tek doğrulaması. Durum: `running`, `failed`, `verified` | `verification_runs` |
| **Kontrol (check) / kapı (gate)** | Koşudaki tek bir sonuç satırı. `status`: PASS, FAIL, BLOCKED, NOT_APPLICABLE. `applicability`: MANDATORY / OPTIONAL | `verification_checks` |
| **18 zorunlu ana kapı** | `package_json`, `lockfile`, `ast_import_inventory`, `clean_install`, `typecheck`, `framework_build`, `requirement_traceability`, `service_manifest`, `database_verification`, `api_contract`, `browser_journey`, `smoke_gate`, `test_infrastructure`, `domain_entity_check`, `placeholder_check`, `contamination_check`, `security_baseline`, `readme_check` | `projectRepository.js:P4_MANDATORY_GATES`, `verification/qualityPolicy.js:MANDATORY_GATES` |
| **Ek zorunlu kontroller** | Yönetim/tarayıcı/anlamsal ayrıntı kapıları (`requirement_assertions`, `ui_language_evidence` …) | `verification/artifactEvidencePolicy.js` |
| **Artefakt** | Üretilen projenin ZIP'i ve SHA-256'sı. Durum: `draft` → `built` → `verification_pending` → `verified`/`rejected` → `superseded` | `artifacts`, `repositories/artifactRepository.js` |
| **Tamamlama makbuzu** | Teslimin kalıcı kanıtı. Değiştirilemez (trigger korumalı) | `completion_receipts` |
| **Onarım kaydı (repair issue)** | Açık bir hata. `origin`: `static_audit`, `worker_rejection`, `verification_blocker`. Açık kayıt varken teslim yapılamaz | `repair_issues`, `verification/workerFailures.js` |
| **Sınırlı onarım (controlled repair)** | Manager'ın önerdiği en çok 12 tek dosyalık hedefin Coder tarafından yeniden yazılması ve ardından yeni doğrulama | `engine/controlledRepair*.js`, `routes/projectRepairRoutes.js` |
| **Bağımsız (anlamsal) inceleme** | Gereksinim/izlenebilirlik ve Türkçe arayüz kanıtı için ayrı LLM incelemesi. Hakkı sınırlı | `engine/controlledSemantic*.js`, `POST /repair-review` |
| **Lineage** | Onarım turlarının geçmişi; `workflow_state.controlledRepair.lineage` içinde | `engine/controlledRepairLineage.js` |
| **`generationCompletion`** | Kod üretiminin aynı sözleşme/plan için bittiğini gösteren işaret. Varsa Devam Ettir üretimi atlar | `workflow_state`, `engine/resumeStage.js` |
| **Manager revizyonu gerekir** | `last_error` `Worker repair requires Manager revision:` ile başlıyorsa veya açık ürün dışı worker kaydı varsa Devam Ettir kapanır | `routes/projectRoutes.js:recoveryRevisionRequired` |

### 1.5 Proje durumları

`backend/engine/stateMachine.js:PROJECT_STATUS`:
`planning`, `pending_approval`, `contract_approved`, `implementing`, `implementation_finished`, `verification_pending`, `verification_running`, `verification_failed`, `paused`, `failed`, `build_verified`, `runtime_verified`, `acceptance_verified`, `artifact_verified`, `completed`, `capability_blocked`.

Silme protokolü ayrıca geçici `deleting` durumunu yazar. Girişim durumları (`WORKFLOW_STATUS`): `running`, `completed`, `rejected`, `failed`, `aborted`, `stale_terminated`, `paused`. Bu değerler migrasyon 18'de CHECK ile sabitlendi. **Yeni değer eklemek migrasyon gerektirir.**

### 1.6 Önemli dosyalar (giriş noktaları)

| Konu | Dosya |
|---|---|
| Sunucu kurulumu, rotaların bağlanması | `backend/server.js` |
| DB bağlantısı ve migrasyon koşucusu | `backend/db.js`, `backend/db/migrations.js` |
| Proje durumu kaydetme, teslim kanıtı | `backend/projectRepository.js` (`saveProjectState`, `assertVerifiedArtifactRunEvidence`, `completeVerifiedProject`) |
| Lease ve kalp atışı | `backend/workflowAttempts.js`, `backend/workflowHeartbeatWorker.js` |
| İş akışı motoru | `backend/engine/workflow.js`, `engine/workflowSupport.js`, `engine/stages/*.js` |
| Worker istemcisi | `backend/executionClient.js` |
| Worker sonucunu kabul/ret | `backend/verification/artifactVerifier.js`, `verification/workerFailures.js`, `verification/qualityPolicy.js` |
| Paket kurulum kontrolü | `backend/verification/packageVerifier.js` |
| Proje rotaları | `backend/routes/projectRoutes.js`, `projectRepairRoutes.js`, `projectContractRoutes.js`, `projectObservabilityRoutes.js`, `projectTraceabilityRoutes.js` |
| Worker sunucusu ve iş deposu | `execution/server.js`, `execution/jobStore.js`, `execution/jobExecutor.js`, `execution/runtime.js` (Docker), `execution/localProcesses.js` (yerel) |
| Test koşucusu ve envanteri | `backend/tests/test_runner.js`, `backend/tests/testInventory.js`, `backend/tests/preloadDatabase.js` |
| Mimari grafik | `npm run graph` → `graphify-out/` (`backend/scripts/generate_graph.js`) |

Daha fazla ayrıntı için: `README.md`, `kullanici-kilavuzu.md`, `docs/faz-arsiv.md` (kronolojik geçmiş), `docs/rontgen-2026-11-05.md` (önceki röntgen, Faz 0–5).

---

## 2. Ortamı kur, çalıştır, gözlemle

### 2.1 Önkoşullar

- Node **22.23.2** (`package.json:engines`) ve npm **10.9.8** (`packageManager`). Farklı npm sürümü lockfile'ı değiştirebilir; `npm ci` kullan, `npm install` ile lockfile'ı değiştirme.
- Git. Docker isteğe bağlı (yalnız Docker worker profili ve Docker süitleri için).
- Bağımlılık kurulumu: `npm ci` (kök), `npm --prefix backend ci`, `npm --prefix frontend ci`, `npm --prefix execution ci`, `npm --prefix llm-yonetimi ci`.
- Yerel worker araçları için bir kez: `npm run worker:local:setup -- --install`.

### 2.2 Uygulamayı başlatma

```powershell
npm run dev            # backend 8000 + frontend 5173 + yerel worker 8099 (Docker'sız, rastgele worker token)
npm run dev:docker     # aynısı, Docker worker profiliyle
```

- **Sağlık:** `GET http://127.0.0.1:8000/healthz` (süreç canlı), `GET /readyz` (DB, depolama ve worker kapasitesi). Worker hazır değilse 503.
- **Önemli:** Başlatmadan önce 8000/8099/5173 portlarını kontrol et. Kullanıcının kendi oturumu çalışıyor olabilir. Bu durumda **ikinci kopya başlatma, çalışan süreçleri durdurma**; kullanıcıya sor.
- Backend logları yapılandırılmış JSON satırları olarak **stdout/stderr**'e yazılır (`backend/observability.js:writeStructuredLog`). Dosyaya yazılmaz. `npm run dev` terminal çıktısını oku.
- Worker iş deposu (dev): `%TEMP%\xfactor-dev-worker-jobs.json` (`execution/server.js`, `EXECUTION_WORKER_DB`).

### 2.3 Giriş ve API çağrısı

Kimlik doğrulama HttpOnly çerezle (`xfactor_session`) yapılır. Durum değiştiren her istekte CSRF koruması iki şey ister: `x-xfactor-csrf: 1` başlığı ve izinli bir `Origin` (`backend/security.js:isValidCsrfRequest`; varsayılan izinli kökenler `backend/.env.example:ALLOWED_ORIGINS`).

```powershell
$base = 'http://127.0.0.1:8000'
$h = @{ 'x-xfactor-csrf' = '1'; 'Origin' = 'http://127.0.0.1:5173' }
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
# Parolayı kullanıcıdan iste; geliştirme varsayılanı admin/xfactor değiştirilmiş olabilir. Parolayı dosyaya veya loga yazma.
Invoke-RestMethod "$base/api/login" -Method Post -WebSession $s -Headers $h -ContentType 'application/json' -Body (@{ username = 'admin'; password = '<PAROLA>' } | ConvertTo-Json)
Invoke-RestMethod "$base/api/projects/stok-takip-1" -WebSession $s
Invoke-RestMethod "$base/api/projects/stok-takip-1/verification-runs" -WebSession $s
```

Bash karşılığı:

```bash
curl -c jar -H 'x-xfactor-csrf: 1' -H 'Origin: http://127.0.0.1:5173' -H 'Content-Type: application/json' -d '{"username":"admin","password":"<PAROLA>"}' http://127.0.0.1:8000/api/login
```

**Proje uçları** (hepsi `/api/projects` altında, `backend/routes/`):

| Uç | Yetki | Gövde | İş |
|---|---|---|---|
| `GET /:id` | viewer | — | Proje durumu (`status`, `last_error`, `pendingContract`, …) |
| `GET /:id/verification-runs`, `GET /:id/verification-runs/:runId` | viewer | — | Koşu geçmişi ve kontroller |
| `GET /:id/repair-issues` | viewer | — | Açık/çözülmüş onarım kayıtları |
| `POST /:id/resume` | owner | — | Devam Ettir. Manager revizyonu gerekiyorsa 409 `MANAGER_REVISION_REQUIRED` |
| `POST /:id/pause` | owner | — | Duraklat |
| `POST /:id/reverify` | owner | `{ contractId }` | Yalnız yeniden doğrula |
| `POST /:id/repair-proposal` | owner | `{ contractId }` | Sınırlı onarım önerisi (LLM çağrısı) |
| `POST /:id/repair` | owner | `{ contractId, proposalHash }` | Öneriyi uygula ve doğrula (LLM + worker) |
| `POST /:id/repair-review` | owner | `{ contractId, proposalHash }` | Bağımsız inceleme (hakkı sınırlı) |

İsteğe bağlı `X-XFactor-Action-Id` başlığı aynı eylemin ağ tekrarını idempotent yapar. `contractId`'yi `GET /:id` yanıtından veya Ek A betiğinden al.

### 2.4 Canlı veritabanını güvenle okuma

Canlı DB: `backend/data/projects.db` (WAL). **Yalnız salt okunur bağlantıyla** oku. Ek A'daki betiği depo dışında bir geçici dizine kaydet ve şöyle çalıştır:

```powershell
node --no-warnings <betik-yolu>\xf-db-read.mjs backend/data/projects.db stok-takip-1
```

Canlı DB'ye yazma (UPDATE/DELETE, migrasyon) yalnız kullanıcı onayıyla ve önce `VACUUM INTO` yedeği alınarak yapılır. Yedek yöntemi: `docs/rontgen-2026-11-05.md`, Faz 2 bölümü.

### 2.5 Testler

```powershell
# Seçili backend süitleri (TERCİH EDİLEN)
$env:XFACTOR_TEST_RUNNER_FILES="test_a.js,test_b.js"; npm --prefix backend test; Remove-Item Env:\XFACTOR_TEST_RUNNER_FILES
# Tam backend süiti (~180 süit; boş makinede ~4-6 dk, yük altında 17 dk+ ve sahte zaman aşımları)
npm --prefix backend test
npm --prefix execution test          # worker birim testleri
npm --prefix frontend run test:unit  # frontend (vitest)
npm --prefix frontend run build
npm run test:local-worker            # gerçek yerel worker entegrasyonu (uzun)
npm run test:e2e                     # Playwright; 8000/5173 portları boş olmalı
```

Bash: `XFACTOR_TEST_RUNNER_FILES=test_a.js,test_b.js npm --prefix backend test`

- **Asla çıplak `node --test backend/tests/x.js` çalıştırma.** Testler `test_runner.js`'in verdiği geçici `DB_PATH`, `PROJECTS_ROOT`, `ARTIFACTS_ROOT`, `TRASH_ROOT`, `XFACTOR_TEMPLATE_DB_PATH` değerlerine ihtiyaç duyar. Bunlar olmadan canlı veriye dokunabilirler.
- Yeni `backend/tests/test_*.js` dosyası eklersen `backend/tests/testInventory.js` içindeki `names` dizisine de ekle. Yoksa koşucu hata verir.
- Bir süit tam koşuda düşüp tek başına geçiyorsa bunu "yük kaynaklı" diye raporla, "geçti" diye raporlama (bkz. B-7).
- **CI** (`.github/workflows/ci.yml`) beş iş çalıştırır: üç işletim sisteminde `local-worker`, `test` (audit + backend + frontend + build + E2E + Docker) ve `production-image`. `main`'e birleştirme yalnız beş iş yeşilken ve kullanıcı onayıyla yapılır.

---

## 3. Çalışma kuralları (zorunlu)

Kaynak: `CLAUDE.md` (proje anayasası). Çelişki olursa `CLAUDE.md` kazanır.

1. **Kod otoritedir.** Belge, grafik ve kod çelişirse kodu esas al, çelişkiyi raporla ve belgeyi koda göre düzelt.
2. **Onay olmadan yapılmayacaklar** (belgede 🔒 ile işaretli):
   - dosya silme;
   - DB şeması veya migrasyon değişikliği;
   - canlı DB'ye yazma;
   - toplu refactor;
   - yeni npm paketi;
   - `git commit`, `git push`, PR açma, birleştirme;
   - LLM maliyeti doğuran canlı koşu başlatma (`/resume`, `/reverify`, `/repair*`).
3. **Fail-closed:** Sahte PASS, gevşek uyumluluk katmanı veya kural gevşetme yok. Belirsiz durum BLOCKED/FAIL kalır.
4. **`projects/` altındaki üretilen kaynaklara elle dokunma.** Ürün onarımı yalnız XFactor'ın kendi akışıyla yapılır.
5. **Cerrahi değişiklik:** Yalnız görevin gerektirdiği satırları değiştir. Yandaki kodu "iyileştirme". Kendi değişikliğinin kullanılmaz bıraktığı import ve değişkenleri temizle.
6. **Önce test:** Hata düzeltmede önce hatayı yeniden üreten testi yaz, kırmızı gör, sonra düzelt.
7. **Stil:**
   - ESM `import`/`export`, noktalı virgül, tek tırnak, LF satır sonu.
   - Girinti: backend ve execution'da 4 boşluk (execution'da bazı dosyalar 2; dosyanın mevcut stiline uy), frontend'de 2 boşluk.
   - Arayüz metni, hata mesajı ve ajan talimatı Türkçe; kod sembolleri, durum sabitleri ve log anahtarları İngilizce.
   - Türkçe karakterleri (ç, ğ, ı, İ, ö, ş, ü) doğru yaz.
8. **Bağımlılık:** Yerleşik Node modüllerini tercih et (`node:crypto`, `node:sqlite`, `node:fs/promises`, `node:test`).
9. **Git düzeni:**
   - Her görev (Y-numarası) için güncel `faz-5/stok-takip-onarim` (veya kullanıcının söylediği taban) üzerinden ayrı bir dal aç: `faz-6/y1-altyapi-hatasi` gibi.
   - Değişiklikleri commit etmeden bırak ve kullanıcıdan onay iste.
   - Commit mesajı İngilizce, Conventional Commits biçiminde (`fix(verification): …`).
   - Not: `faz-5/stok-takip-onarim` dalı uzakta (origin) henüz yok.
10. **Her görevin sonunda:**
    1. İlgili testler.
    2. `npm run graph`.
    3. `test_graphify.js` ve `test_p9_runner_inventory.js`.
    4. Davranış değiştiyse `README.md`, `kullanici-kilavuzu.md` ve `docs/faz-arsiv.md` (yeni bir "Halka" girdisi).
    5. Ek C şablonuyla rapor.
11. **Dur ve sor:**
    - beklenmeyen dosya değişikliği gördüğünde;
    - bir test senin değişikliğin dışında kırıldığında;
    - görev bu belgedeki varsayımla çelişen bir kodla karşılaştığında;
    - kabul ölçütü ancak bir kuralı gevşeterek karşılanabiliyorsa;
    - canlı veriye veya kullanıcının çalışan servislerine dokunman gerekiyorsa.
12. **Gizli bilgiler:** Parola, API anahtarı ve worker token'ını kod, log, commit veya rapora yazma.

---

## 4. Kısa teşhis ve vaat–gerçek karşılaştırması

### 4.1 Teşhis

XFactor'ın **kabul tarafı güçlü, üretim ve onarım tarafı zayıf.**

- Kalite kapıları, temiz oda ZIP doğrulaması, makbuz ve lease/fence mekanizmaları tasarlandığı gibi çalışıyor: sahte teslim oluşmuyor, 4 proje gerçek makbuzla teslim edildi.
- Orta/büyük bir uygulamayı (Next.js + Prisma + rol yönetimi, 14 gereksinim) bütün kapılardan geçirene kadar yakınsatamıyor. `stok-takip-1` 29 Ekim'den beri ~88 girişim, ~60 koşu ve sağlayıcının bildirdiği ~13 M giriş token'ından sonra hâlâ teslim edilmedi.
- Bunun bir kısmı modelden değil **platformdan** kaynaklanıyor:
  - altyapı hataları kaynak hatası sayılıyor ve kurtarmayı kapatıyor (B-1);
  - kilit hatası açık (B-3);
  - test çıktısının sonu kayboluyor (B-4);
  - gerileyen onarım geri alınamıyor (B-9).

### 4.2 Canlı kayıtlar (17 Kasım ~06:30 UTC)

| Proje | Durum | Sözleşme | Girişim | Doğrulanmış koşu | Makbuz |
|---|---|---|---|---|---|
| `stok-takip-mvp-1` | completed | 4 gereksinim | 1 | 1 / 2 | ✅ |
| `todo-app-1` | completed | 4 | 22 | 2 / 5 | ✅ |
| `kutuphane-takip-sistemi-2` | completed | 5 (api/browser/database) | 5 | 2 / 13 | ✅ |
| `otel-yonetim-uygulamasi-1` | completed | 22 (yönetim/tarayıcı), 9 revizyon | 22 | 1 / 8 | ✅ |
| `emlak-yonetim-1` | paused (25 Ekim'den beri) | 4 | 32 | 0 / 7 | ❌ 22 açık kayıt |
| `stok-takip-1` | paused | 14 (yönetim/tarayıcı), sözleşme 3 | ~88 | 0 / ~60 | ❌ |
| `test-6-debug-1` | planning | 1 | 0 | — | — |

### 4.3 README vaatleri

| Vaat | Durum | Kanıt |
|---|---|---|
| 6 rollü orkestrasyon | ✅ | `engine/workflow.js:executeProjectTasks` |
| DAG dalgalarıyla paralel üretim | ✅ (eşzamanlılık sabit 2) | `workflow.js` `CONCURRENCY_LIMIT` |
| 18 zorunlu kapı, fail-closed | ✅ | `projectRepository.js:P4_MANDATORY_GATES` |
| Temiz oda ZIP + makbuz olmadan indirme yok | ✅ | `assertVerifiedArtifactRunEvidence`, 4 makbuz |
| Küçük/orta CRUD üretimi | ✅ (4 teslim) | §4.2 |
| Yönetim paneli + rol yolculukları olan büyük uygulama | ⚠️ Bir kez başarıldı (otel). `stok-takip-1` ve `emlak` takılı | §4.2 |
| Sınırlı onarımla toparlanma | ⚠️ Mekanizma var, yakınsamıyor (koşu dizisi 83 → 77 → 19 → 21 → 80 → 21 → 82 → … → 20 PASS) | B-9 |
| Orta seviye modelle (MiniMax) ürün | ❌ Henüz kanıtlanmadı | `stok-takip-1` |
| "Kalp atışı … sağlıklı yürütmeyi düşürmez" (README:30) | ⚠️ Fazla güçlü; kök neden açık | B-3 |
| Docker'sız yerel worker (Windows) | ⚠️ `spawn('npm')` ENOENT yeniden üretildi (27.11); neden B-10'da | B-10 |
| Üretilen projeye Dockerfile | ✅ Şablon var. Her ZIP'in Docker build'i doğrulanmıyor (README de söylüyor) | README:185 |

---

## 5. Bulgular

Önem: 🔴 Kritik · 🟠 Yüksek · 🟡 Orta · ⚪ Düşük. "Doğrulandı" = kod veya canlı veriyle teyit edildi. "Hipotez" = ölçüm gerekir.

### B-1 🔴 Altyapı hatası kaynak hatası sayılıyor ve Devam Ettir'i kapatıyor (doğrulandı)

**Olay:** 17 Kasım 06:21 UTC koşusu (`verification-a0e40be7…`) kaynaktan bağımsız bir nedenle düştü. `npm ci` sırasında registry proxy'si `npm error code E502 … 502 Bad Gateway - GET http://192.168.0.2:3128/zod-validation-error` döndü. Sonuç: `clean_install` FAIL, 10 zorunlu kapı BLOCKED. Bir önceki turun onardığı kaynaklar hiç sınanamadı.

**Zincir:**
1. `backend/verification/packageVerifier.js` (`clean_install` kontrolü, ~satır 240-277): `npm ci` başarısız olunca `status: 'failed'`. Yalnız `SANDBOX_UNAVAILABLE` `blocked` sayılıyor. Geçici ağ hatası için yeniden deneme yok.
2. `backend/verification/workerFailures.js:summarizeWorkerRejection` (~82-105): typecheck dışındaki her başarısız kontrol `blockers` listesine giriyor. `parseTypecheckDiagnostics` (~56-63) `infrastructure` sınıfını tanıyor, ama bu sınıf sonraki adımlara taşınmıyor.
3. `workerFailures.js:recordWorkerRejection` (~108-126): blocker'ları **açık** `repair_issues` kaydı yapıyor (`kind: 'worker_verification_blocker'`, `classification: 'ambiguous'`, `origin: 'worker_rejection'`).
4. `backend/routes/projectRoutes.js:recoveryRevisionRequired` (~112-118): açık ve `worker_product_failure` olmayan **herhangi bir** worker kaydı varsa `true` döner. Bu durumda `POST /resume` 409 `MANAGER_REVISION_REQUIRED` verir (~989), arayüz de Devam Ettir'i gizler (`frontend/src/utils/canResumeProject.js`).
5. `engine/workflow.js` (~898) ve `engine/stages/acceptanceStage.js` (~266): `last_error` `Worker repair requires Manager revision:` ile başlıyor.

**Etkisi:**
- Tek bir ağ kesintisi projeyi Manager revizyonu yoluna kilitliyor.
- `stok-takip-1`'de 92 açık `worker_rejection` kaydı birikti.
- Hem kullanıcı hem model ağ sorununu kod hatası sanıyor.
- Benzer bir geçici hata deseni zaten var: `verification/buildVerifier.js` (~56-72), Prisma `ECONNRESET` için.

### B-2 🟠 Veritabanı transaction'ı `await` boyunca açık kalıyor (doğrulandı)

Backend tek bir paylaşılan `node:sqlite` bağlantısı (`backend/db.js:db`) kullanıyor. `BEGIN IMMEDIATE` açıkken gerçek bir I/O `await`'i olursa olay döngüsü başka istekleri çalıştırır. O isteklerin SQL'i bu transaction'a karışır (birlikte geri alınabilir) ya da "cannot start a transaction within a transaction" hatası verir. Bu sırada kalp atışı iş parçacığının ayrı bağlantısı da yazma kilidini bekler.

| Yer | `await` edilen | Risk |
|---|---|---|
| `backend/utils/archive.js:createProjectZip` (~105-119) → `repositories/artifactRepository.js:withArtifactTransaction` (~3-13) | `fs.rename` (gerçek disk I/O) | 🟠 Her doğrulamada |
| `backend/services/reconciliationService.js` (~54-64 `withArtifactTransaction` kopyası; ~1086-1097 ve ~1203-1212 `rehydrateProjectStateFromDisk`) | disk I/O | 🟡 Açılış ve senkronizasyon |
| `routes/projectRoutes.js` (~550, ~859, ~1014-1045, ~1094), `projectRepairRoutes.js` (~317, ~416, ~485-493), `projectContractRoutes.js` (~33) | `writeProjectState(..., { inTransaction: true })` | ⚪ `saveProjectState`'in içinde gerçek `await` yok, yalnız mikro-görev boşluğu |

Ek B'deki betik bu listeyi yeniden üretir.

### B-3 🟠 Kilit hatası (`workflow.execution_fenced`) hâlâ açık (hipotez)

**Belirti:** Sağlıklı yürütmeler, kalp atışı 39–91 sn yazılamadığı için düşüyor (bkz. `CLAUDE.md §5`). Kalp atışı ayrı bir iş parçacığına taşındı (`workflowAttempts.js:startLeaseHeartbeat`, `workflowHeartbeatWorker.js`; TTL 30 sn, aralık 5 sn, `busy_timeout` 5 sn). Son olayda yazım, ana iş parçacığı kilidi bıraktıktan sonra gerçekleşti. Yani kilit uzun tutuluyor.

**Adaylar (ölçülmedi):**
1. B-2'deki transaction'lar.
2. **Dev `workflow_state`:** `stok-takip-1` için ~576 KB, bunun ~531 KB'ı `controlledRepair.lineage`, ~30 KB'ı `dependencyInputs`. `saveProjectState` (`projectRepository.js`, ~705-834) her çağrıda JSON'un tamamını yeniden yazıyor; proje revizyonu 845.
3. WAL dosyası 5,5 MB (checkpoint baskısı).

**Bulgu (18 Kasım, `c3657cb6` koşusu):** Kök neden büyük olasılıkla diskte. Proje bir 5400 devirli sabit diskte (`F:`), boşta tek bir fsync'li `COMMIT` p50 66 ms; koşu sırasında kanıt transaction'ı 28,6 sn, kalp atışı yazımları 2–14 sn sürdü. Ayrıntı: faz arşivi Halka 50. Aşağıdaki aday listesi bu bulguyla birlikte okunmalı.

Tanılama logları (`workflow.lease_check_failed`, `workflow.heartbeat_write_failed`, `workflow.heartbeat_write_slow`) **stdout/stderr'e** yazılıyor (§2.2). Kalıcı dosya yok; olay sırasında terminal çıktısı saklanmazsa kaybolur.

### B-4 🟡 Test çıktısı kanıtı yalnız baştan tutuluyor (doğrulandı)

İki katmanda **yalnız baş** tutuluyor:
1. **Worker:** `execution/runtime.js:captureChildOutput` (~196-213; Docker) ve `execution/localProcesses.js` (`RETAIN_BYTES = 1 MiB`, ~9 ve ~129). İlk 1 MiB tutuluyor, fazlası atılıyor ve `stdoutTruncated: true` yazılıyor.
2. **Backend:** `backend/verification/workerFailures.js:bounded` (~13-17) ve `normalizeWorkerCheckLog` (~18-23), `maxStreamBytes = 16384`. `artifactVerifier.js` (~455-468) bu sonucu `verification_checks.evidence_json`'a yazıyor. Yani kayıtlı kanıt, çıktının ilk 16 KB'ı.

TAP çıktısında hata özeti ve `not ok` blokları **sonda** olduğu için kayboluyor. Örnek: `76dccdd0` koşusunda iki tarayıcı testi "Promise resolution is still pending" ile bitti, ama bağlam görünmüyor.

### B-5 🟡 Worker iş deposu her olayda bütün dosyayı yeniden yazıyor (doğrulandı)

- `execution/jobStore.js:_save` (~48-53) her çağrıda tüm işleri `writeFileSync` ile yazıyor. Bu, her komut olayında da oluyor (`recordCommandDiagnostic`, ~118-135).
- Kayıtlar `archiveBase64` ve `packageJsonBase64`'ü 24 saat tutuyor (~61).
- Bugünkü dosya 7,9 MB: her komut olayı MB'larca senkron disk yazımı demek ve worker'ın olay döngüsünü bloke ediyor.

### B-6 🟡 Bayat açık onarım kayıtları (doğrulandı)

- `kutuphane-takip-sistemi-2` `completed`, ama `superseded` sözleşmesi (rev. 21) üzerinde 11 açık `static_audit` kaydı var.
- `emlak-yonetim-1`: 22 açık `worker_rejection`. Proje 25 Ekim'den beri `paused`.
- `stok-takip-1`: 92 açık `worker_rejection` + 3 `verification_blocker`; bir kısmı B-1 kaynaklı.

Açık kayıt teslimi bloke eder (`projectRepository.js:assertVerifiedArtifactEvidence`).

### B-7 🟡 Test süitleri yük altında güvenilmez (doğrulandı)

Canlı bir onarım koşusu sürerken:
- **Tam backend süiti:** 172/178 süit, 1.039 sn. Düşen süitler: `test_manager_recovery_simulation`, `test_reverification`, `test_p1_a_pipeline_allowlist`, `test_p1_b_quality_policy_evidence`, `test_p1_c_state_invalidation`, `test_p8_sandbox_limits`. Aynı 6 süit tek başına **6/6 geçti** (52 sn).
- **Frontend:** 0 test başladı, 14 hata, 620 sn. Yeniden koşuda 14 dosya, **155/155 geçti** (89 sn).

`backend/tests/test_runner.js:runTestFile` zaman aşımında `error: 'TIMEOUT'` döndürüyor, ama özet satırı (`runAllTests`, ~128-133) yalnız dosya adlarını basıyor. Kullanıcı kırık testi yavaş makineden ayıramıyor. Süit başına bütçe 120 sn, eşzamanlılık varsayılan 2 (`XFACTOR_TEST_CONCURRENCY`).

### B-8 🟡 Belge ve kod çelişkileri (doğrulandı)

- `README.md:30` kalp atışı iddiası fazla güçlü (B-3).
- `README.md:142` ve `CLAUDE.md §5` son koşuyu `76dccdd0` gösteriyor. Daha yeni iki koşu var: `7aea86b1` (17 Kasım 05:42, typecheck/build FAIL: `tests/test-helper.ts(249,54) TS2345`) ve `a0e40be7` (npm 502, B-1).

### B-9 🟡 Gerileyen onarım turu geri alınamıyor (doğrulandı, tasarım)

Sınırlı onarım tur sonrası doğrulama kötüleşse de (ör. 83 → 20 PASS) yeni kaynakları korur. Sonraki tur bozuk kaynaktan başlar. Önceki kaynak özeti tutuluyor (`ledger.outputSourceHash`, `baseline`), ama geri dönüş akışı yok. Dosya içeriklerinin de saklanıp saklanmadığı doğrulanmadı.

### B-10 ⚪ Doğrulanmamış açık konular

- Yerel Windows worker'da `spawn('npm')` ENOENT (`CLAUDE.md §5`). `execution/localProcesses.js` npm'i kendi araç yolundan çağırıyor (~44-105). **27 Kasım bulgusu:** hata `service-manifest.json`'dan değil, üretilen uygulamanın kendi testlerinden geliyor (`stok-takip-1`: `tests/browser-journey.test.js` `execFile('npm', …)`/`spawn('npm', …)`, `tests/requirements.test.js` `runCommand('npm', …)`). Koşu `96ee3f60` kanıtı: `test_suite_execution` `spawn npm ENOENT`; `8f6ef366`: Prisma seed `spawn tsx ENOENT`. Yeniden üretim: Windows'ta PATH'e yalnız `npm.cmd` konunca `spawn('npm')` `shell:false` ile ENOENT, `shell:true` ile çalışır (aynı `tsx` için). Yani worker'ın `localProcesses.js` yolu doğru çalışıyor; sorun üretilen testlerin Windows'ta taşınabilir olmaması (kullanıcının Windows'unda da aynı testler düşer). Docker (Linux) profili etkilenmez; `stok-takip-1`'in Docker koşularının engeli bu değil, ağ/zaman aşımıdır.
- Docker koşularında aralıklı npm ağ hataları (B-1 ailesi).

### B-11 ⚪ Küçük notlar

- **Commit edilmemiş değişiklik:** `controlledRepairBatchGrowth` (`engine/controlledRepairs.js`, `routes/projectRepairRoutes.js`, `test_controlled_repairs.js`, `test_controlled_repair_routes.js`, `CLAUDE.md`, `docs/faz-arsiv.md`, `kullanici-kilavuzu.md`, `graphify-out/`). İlgili süitler tam koşuda geçti.
- **Sabit geliştirme token'ı:** `'dev-worker-token-internal'` hâlâ `backend/.env.example`, `executionClient.js` (~24) ve `execution/server.js` (~297) içinde. Üretim reddediyor, `npm run dev` rastgele token üretiyor. Düşük risk.
- **Modül büyüklükleri:** `agents/tester.js` 1.134, `services/reconciliationService.js` 1.132, `routes/projectRoutes.js` 1.110, `engine/codeGenerator.js` 1.039, `frontend/src/App.jsx` 985 satır. Hepsi 1.200'ün altında.
- **Deneysel API:** `node:sqlite` hâlâ deneysel (`ExperimentalWarning`).

---

## 6. Yol haritası: genel bakış

**İlerleme (18 Kasım):** Y0, Y1, Y2, Y3a, Y4, Y7 ve Y8 bitti; değişiklikler `faz-6/*` dal zincirinde, `main`'e alınmadı. Y5, Y6, Y9 ve Y3b açık. Karmalar `git log faz-6/y8-belgeler` ile doğrulanabilir.

**Sıra:** Y0 → Y1 → (Y2, Y4, Y7 paralel olabilir) → Y3 → Y5. Y6, Y8, Y9 kullanıcı kararına bağlı.

| ID | Başlık | Önem | Bağımlılık | Onay | Tahmini kapsam |
|---|---|---|---|---|---|
| Y0 ✅ 17.11 `80b16e6`, `e64fa54` | Zemin: commit edilmemiş işi doğrula, test koşucusu zaman aşımını ayırsın | 🟡 | — | Commit 🔒 | 1 dosya + test |
| Y1 ✅ 17.11 `2d8a59f` | Altyapı hatasını ayır, `npm ci`'yi bir kez yeniden dene, Devam Ettir'i açık tut | 🔴 | Y0 | Şema yok; commit 🔒 | 4–6 dosya + testler |
| Y1b ✅ 18.11 `7dd842d` (+ Docker kurulum yeniden denemesi `440ad57`, 21.11) | Docker kesintisini ve Docker yolunda fırlatılan kurulum hatasını altyapı say | 🟠 | Y1 | Şema yok | 2–3 dosya + test |
| Y2 ✅ 17.11 `6f2529c` | `await` içeren transaction'ları kaldır, statik koruma testi | 🟠 | Y0 | commit 🔒 | 3 dosya + test |
| Y3a ✅ 17.11 `a5f2792`; Y3c ✅ 18.11 `fb30290` (kalp atışı bağlantısı); Y3b açık | Kilit hatasını ölç; gerekirse lineage'i tabloya taşı | 🟠 | Y2 | Y3b 🔒 migrasyon 19 | Y3a: 3 dosya |
| Y4 ✅ 17.11 `a345413` | Test çıktısında baş + kuyruk | 🟡 | Y0 | commit 🔒 | 2–3 dosya + test |
| Y5 | `stok-takip-1` teslimi | 🟠 ürün | Y1, Y4 (Y2, Y3a önerilir) | Her koşu 🔒 | Kod yok, operasyon |
| Y6 | Bayat kayıtlar ve takılı projeler | 🟡 | — | 🔒 veri | Operasyon |
| Y7 ✅ 17.11 `e87e1fb` | Worker iş deposunu hafiflet | 🟡 | — | commit 🔒 | 1 dosya + test |
| Y8 ✅ 18.11 `faz-6/y8-belgeler` | Belgeleri koda hizala | 🟡 | Her görevden sonra | — | Belgeler |
| Y9 | Gerileyen onarımı geri alma | 🟡 | Y5 deneyimi | 🔒 ürün kararı | Tasarıma bağlı |

---

## 7. Görevler

Her görev aynı şablonda: **Amaç → Bağlam → Adımlar → Kabul ölçütü → Doğrulama → Yapma**. Her görevden önce §3'ü yeniden oku.

### Y0 — Zemin

**Amaç:** Yeni işe temiz ve güvenilir bir zeminden başlamak.

**Bağlam:** B-11 (commit edilmemiş değişiklik), B-7 (test koşucusu).

**Adımlar:**
1. `git status --porcelain` ve `git diff --stat` çalıştır. B-11'deki dosyalar dışında değişiklik varsa **dur ve sor**.
2. Şu iki süiti koş: `test_controlled_repairs.js`, `test_controlled_repair_routes.js` (§2.5).
3. 🔒 Kullanıcı onaylarsa bu değişikliği tek commit olarak at: `fix(repair): reserve growth room for files written earlier in the same repair batch`.
4. `backend/tests/test_runner.js`'i değiştir:
   - `runTestFile` sonucuna `reason` alanı ekle: `'timeout'` (zaman aşımı), `'startup'` (başlatılamadı) veya `'exit'` (çıkış kodu ≠ 0).
   - `runAllTests` özetinde başarısız dosyaları nedenleriyle bas. Örnek: `Failed suites: test_x.js (timeout 120s), test_y.js (exit 1)`.
   - Zaman aşımı varsa ek bir uyarı satırı bas: `Zaman aşımı yük kaynaklı olabilir; bu süitleri tek başına yeniden koşun.`
5. Bu davranışı sınayan bir test yaz. Örnek: `backend/tests/test_runner_failure_reasons.js` adlı yeni süit (`testInventory.js`'e ekle). Geçici bir dizinde iki küçük yardımcı betik oluştur: biri sonsuz bekleyen, biri `process.exit(1)` yapan. `runTestFile`'ı bunlarla ve küçük bir `timeoutMs` ile çağır. Gerekirse `runTestFile`'a dizin parametresi ekle; varsayılanı koru.

**Kabul ölçütü:**
- İki onarım süiti geçiyor.
- Yeni test `timeout` ile `exit` nedenlerini ayırıyor.
- `test_p9_runner_inventory.js` geçiyor.

**Yapma:**
- Zaman aşımı bütçelerini körlemesine büyütme.
- Başarısız süiti otomatik yeniden koşup "geçti" sayma.

---

### Y1 — Altyapı hatasını kaynak hatasından ayır (🔴 en önemli)

**Amaç:** Geçici ağ/registry hataları projeyi "Manager revizyonu gerekir" durumuna kilitlemesin.
- Önce aynı komut **bir kez** yeniden denensin.
- Yine olmazsa kontrol **BLOCKED (altyapı)** olsun ve hiçbir kapı PASS sayılmasın.
- Açılan kayıt Devam Ettir'i ve Yalnız Yeniden Doğrula'yı **kapatmasın**.
- Kullanıcı açık bir Türkçe mesaj görsün.

**Bağlam:** B-1'deki beş adımlık zincir. Kısıtlar:
- `repair_issues.origin` CHECK'i yalnız `static_audit`, `worker_rejection`, `verification_blocker` değerlerini kabul ediyor (migrasyon 18, `backend/db/migrations.js`). **Yeni origin ekleme**; sınıfı `detail_json` içinde taşı.
- `PROJECT_STATUS` değerlerine dokunma.

**Adımlar:**
1. **Kırmızı testler** (`backend/tests/test_infrastructure_failure_classification.js` adlı yeni süit, envantere ekle):
   - a. `packageVerifier.js`'teki `clean_install`'ı çağıran fonksiyonu bul (dosyada `name: 'clean_install'` geçen fonksiyon). Bu fonksiyonu sahte bir `adapter` veya `executeInSandbox` ile çağır. İlk çağrı `{ passed:false, exitCode:1, stderr:'npm error code E502\nnpm error 502 Bad Gateway - GET http://proxy/x' }`, ikinci çağrı `{ passed:true, exitCode:0 }` döndürsün. Beklenen: `clean_install` `passed`, kanıtta `retries.length === 1`. Bugün `failed` döner.
   - b. Her iki çağrı da E502 → beklenen `status: 'blocked'`, `classification: 'infrastructure'`.
   - c. `npm error code ERESOLVE` → davranış **değişmez** (`failed`, yeniden deneme yok).
   - d. `summarizeWorkerRejection` + `recordWorkerRejection`: yalnız altyapı kaynaklı blocker'ı olan bir koşu → açık kaydın `detail.classification === 'infrastructure'`.
   - e. `recoveryRevisionRequired` (`projectRoutes.js` içinde, dışa aktarılmıyorsa davranışı `POST /resume` üzerinden sına): yalnız altyapı kaydı varken `false`. Benzer rota testleri için `test_controlled_repair_routes.js` ve `test_reverification.js`'e bak.
2. `packageVerifier.js` içine saf bir `isTransientRegistryFailure(text)` fonksiyonu ekle ve dışa aktar.
   - Eşleşmeli: `/\b(E50[234]|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up)\b/i`
   - Eşleşmemeli: `ERESOLVE`, `ETARGET`, `E404`, `EINTEGRITY`.
   - Örnek: `buildVerifier.js` (~56-72).
3. `clean_install`'da ilk deneme başarısız olur ve çıktı geçici desene uyarsa **bir kez** yeniden dene.
   - Kalan süre ve `options.signal`'a saygı göster; iptal edildiyse deneme yapma.
   - İlk denemenin `exitCode`, `stdoutDigest`, `stderrDigest` ve kısa `reason` bilgisini `retries` dizisine koy.
   - Başarılı ikinci deneme PASS olur; `reason` alanına `1 geçici registry hatasından sonra yeniden denendi.` ekle.
4. İkinci deneme de geçici hatayla biterse kontrol `status: 'blocked'` ve `classification: 'infrastructure'` olsun. Bağımlı kapılar zaten BLOCKED'e düşer. **PASS üretilmez.**
5. Sınıfı worker sonucundan backend kaydına taşı:
   - `artifactVerifier.js` worker kontrolünü işlerken `classification` alanını kanıtta koru (`evidence_json` içine).
   - `summarizeWorkerRejection` altyapı sınıflı kontrolleri ayrı bir `infrastructureBlockers` listesinde toplasın.
   - Ürün bulgusu yoksa ve **bütün** blocker'lar altyapı kaynaklıysa `recordWorkerRejection` `classification: 'infrastructure'` yazsın.
   - Karışık durumda mevcut davranış korunur (`ambiguous`).
   - Not: Worker Docker'da `packageVerifier.js`'i backend kopyasından mı çalıştırıyor, kendi kodundan mı? `execution/jobExecutor.js` ve `backend/verification/runChecks.js` zincirini izleyerek doğrula. Değişikliği gerçekten çalışan yere yap.
6. Altyapı kayıtlarını akıştan ayır:
   - `workerFailures.js:loadOpenWorkerRepairBatch`: `detail.classification === 'infrastructure'` olan kayıtları `issues` listesine koyma. Ayrı bir `infrastructureIssues` alanında döndür.
   - `projectRoutes.js:recoveryRevisionRequired` bu kayıtlar için `true` dönmesin.
   - Yeni bir koşu başlarken (`acceptanceStage.js:runAcceptanceStage`, worker'a iş gönderilmeden hemen önce, `commitVerificationContext` içinde) aynı sözleşmenin açık altyapı kayıtları `status='resolved'`, `resolved_at=şimdi` yapılsın. Yeni koşu düşerse yeni kayıt açılır.
7. Kullanıcı mesajı: `last_error` yalnız altyapı nedeniyle oluşuyorsa `Worker repair requires Manager revision:` öneki **kullanılmasın**. Metin: `Bağımlılık kurulumu ağ/registry hatası nedeniyle tamamlanamadı (E502). Kaynaklar değiştirilmedi; Devam Ettir veya Yalnız Yeniden Doğrula ile yeniden deneyin.` İlgili yerler: `workflow.js` hata işleyicisi (~896-917), `acceptanceStage.js` (~259-282), `engine/recoveryAdvice.js`.
8. Belgeler: `kullanici-kilavuzu.md`'deki hata ve kurtarma bölümü ile `README.md` "Üretim sırasında hata ve devam etme".

**Kabul ölçütü:**
- 1a–1e testleri geçiyor.
- Gerçek bağımlılık hataları değişmedi.
- Mevcut süitler geçiyor: `test_worker_repairs.js`, `test_reverification.js`, `test_p1_b_quality_policy_evidence.js`, `test_controlled_repair_routes.js`, `test_manager_recovery_simulation.js`, `test_schema_canonical_constraints.js`; ayrıca `npm --prefix execution test` ve `npm --prefix frontend run test:unit` (`canResumeProject`).

**Yapma:**
- `ERESOLVE`/`ETARGET`/`E404`/`EINTEGRITY` hatalarını geçici sayma.
- Birden fazla yeniden deneme.
- Altyapı hatasında PASS.
- Yeni `origin` değeri.
- Ürün bulgusu içeren karışık durumda Manager revizyonu kuralını gevşetme.

---

### Y2 — `await` içeren transaction'ları kaldır

**Amaç:** Paylaşılan SQLite bağlantısında hiçbir transaction olay döngüsünü geçmesin.

**Bağlam:** B-2.

**Adımlar:**
1. **Statik koruma testi** (`backend/tests/test_transaction_await_boundary.js`, envantere ekle):
   - Ek B'deki mantığı test içine taşı: `backend/` altındaki `.js` dosyalarında (`tests`, `node_modules`, `data`, `scripts` hariç) `exec('BEGIN` ile sonraki `exec('COMMIT` arasında `await` geçen satırları bul.
   - Sonucu `dosya:satır` yerine `dosya + await satırının kırpılmış metni` anahtarıyla bir izin listesiyle karşılaştır (satır kaymasına dayanıklı olsun).
   - Başlangıç izin listesi: yalnız B-2 tablosundaki ⚪ satırlar. Yanlarına yorum yaz: "`saveProjectState`'te gerçek I/O yok".
   - Test bugün `archive.js` ve `reconciliationService.js` yüzünden kırmızı olmalı.
2. `backend/utils/archive.js:createProjectZip`:
   1. Geçici dosyayı yaz.
   2. `fs.rename` ile son konuma taşı (**transaction dışında**).
   3. **Senkron** bir transaction'da `createArtifact` ve `addArtifactFile` kayıtlarını ekle.
   4. Hata olursa mevcut `catch` son dosyayı siler; koru.
3. `repositories/artifactRepository.js:withArtifactTransaction`'ı senkron yap. `work()` bir `Promise` döndürürse transaction'ı geri al ve hata fırlat. Örnek desen: `workflowAttempts.js:commitWorkflowSource` içindeki "Source CAS callback must be synchronous".
4. `services/reconciliationService.js`:
   - Satır ~54'teki kopya `withArtifactTransaction`'ı aynı biçimde senkron yap.
   - ~1086 ve ~1203'teki döngülerde diskten okuma (`rehydrateProjectStateFromDisk`'in okuduğu her şey) **transaction'dan önce** yapılsın; yazmalar senkron transaction'da kalsın.
   - `rehydrateProjectStateFromDisk` içinde hem okuma hem yazma varsa fonksiyonu "oku" ve "yaz" diye ikiye böl. Davranışı ve dışa aktarımları koru.
   - Dosya büyük; yalnız bu sırayı değiştir.
5. Bu imzayı mock'layan testleri uyarla: `test_p9_artifact_pipeline.js` (`withArtifactTransaction: async work => work()`), `test_p1_c_archive.js`.
6. (İsteğe bağlı) ⚪ satırlar için `projectRepository.js`'ten senkron bir `saveProjectStateInTransaction` dışa aktar; rotalarda `await` olmadan kullan, izin listesini boşalt.

**Kabul ölçütü:**
- Koruma testi geçiyor; izin listesinde en çok ⚪ satırlar var.
- Şu süitler geçiyor: `test_p1_c_archive.js`, `test_p9_artifact_pipeline.js`, `test_p9_lease_fencing.js`, `test_p7_sqlite_durability.js`, `test_project_state_rehydration.js`, adında `reconcil` geçen süitler (`backend/tests` altında ara).

**Yapma:**
- Bağlantı havuzu veya yeni kütüphane ekleme.
- Atomikliği bozacak şekilde transaction'ı kaldırma.

---

### Y3 — Kilit hatasını ölç; gerekirse onarım geçmişini taşı

**Amaç:** `workflow.execution_fenced` kök nedenini tahminle değil ölçümle bulmak.

**Bağlam:** B-3.

**Y3a — Ölçüm (onay gerekmez, commit 🔒):**
1. `backend/db.js`'e küçük bir yardımcı ekle:
   ```js
   export function measureTransaction(label, fn, database = db)
   ```
   - `performance.now()` ile `BEGIN` → `COMMIT`/`ROLLBACK` süresini ölçsün.
   - 1.000 ms'yi aşarsa `writeStructuredLog('warn', 'db.transaction_slow', { label, ms, caller })` yazsın (`caller`: `new Error().stack`'in 3–7. satırları).
   - Kendisi transaction açmasın; mevcut `BEGIN/COMMIT` bloklarını saran bir zamanlayıcı olsun.
   - **Yalnız şu noktalara uygula** (toplu refactor yapma): `projectRepository.js:saveProjectState`, `workflowAttempts.js:commitWorkflowSource`, `verification/verificationContext.js:commitVerificationContext`, `db.js:saveProjectLog`, `utils/archive.js` (Y2'den sonra).
2. `saveProjectState`'te `workflowStr` 256 KB'ı aşarsa proje başına süreç ömründe bir kez `workflow.state_large` logu yaz: `{ projectId, bytes, topKeys }`. `topKeys` en büyük üç üst düzey anahtar ve boyutları olsun.
3. Testler: `db.transaction_slow` için sahte bir saatle (yardımcıya `now` parametresi ver) 1.100 ms süren transaction'ın log ürettiğini doğrula; `workflow.state_large` için de 300 KB'lık durum. Log yakalamak için `writeStructuredLog`'un `sink` parametresi var.
4. Kullanıcıdan bir sonraki gerçek koşunun terminal çıktısını iste. Ya da 🔒 onayla koşu başlat ve çıktıyı bir dosyaya kaydet. Bulguyu `docs/faz-arsiv.md`'ye yaz.

**Y3b — 🔒 Lineage'i `workflow_state`'ten çıkar (migrasyon 19):** Yalnız Y3a ölçümü büyük durum yazımının kilit süresine katkı yaptığını gösterirse kullanıcıya öner.
- Öneri: ekleme-yalnız bir `controlled_repair_lineage` tablosu; `workflow_state` yalnız son kontrol noktası özetini tutar.
- Okuyan ve yazan kod: `engine/controlledRepairLineage.js` (`archiveControlledRepairLineage`, kontrol noktası/`compactLineage` mantığı) ve `controlledRepair` ledger'ını okuyan her yer. `lineage` kelimesiyle ara.
- Migrasyon öncesi canlı DB'nin `VACUUM INTO` yedeğini al.
- `test_schema_canonical_constraints.js` ve `test_database_migrations.js`'i güncelle.

**Kabul ölçütü (Y3a):**
- Yeni testler geçiyor.
- `test_p9_lease_fencing.js`, `test_workflow_attempts.js`, `test_p1_2_pause_resume_lease.js` geçiyor.

**Yapma:**
- Lease TTL'ini büyüterek sorunu gizleme.
- Kalp atışı iş parçacığını SQLite çağrısının ortasında sonlandırma (`workflowAttempts.js:startLeaseHeartbeat` içindeki uyarıya bak).

---

### Y4 — Test çıktısı kanıtında baş ve kuyruğu tut

**Amaç:** Uzun çıktının sonundaki hata özeti ve `not ok` blokları kayıtlı kanıta, Kalite Paneline ve onarım önerisine ulaşsın.

**Bağlam:** B-4. İki katman var: worker (1 MiB baş) ve backend (16 KB baş).

**Adımlar:**
1. **Kırmızı test (backend):** 40 KB'lık bir TAP metni oluştur; ortasında `ok` satırları, sonunda `not ok 19 - stok azaltma\n  error: 'Promise resolution is still pending'` olsun. `normalizeWorkerCheckLog({ stdout: metin })` sonucunda `not ok 19` bulunmadığını göster. Uygun yer: `test_worker_repairs.js`'e ekle ya da yeni süit aç.
2. `workerFailures.js:bounded`'ı "baş + işaret + kuyruk" yap:
   - `limit` baytın yarısı baştan, yarısı sondan alınsın; araya `\n…[kesildi: N bayt]…\n` gelsin.
   - UTF-8 karakter sınırına dikkat et (`Buffer.subarray` sonrası `toString('utf8')` yarım karakteri `�` yapar; kabul edilebilir).
   - `truncated` bayrağı korunsun.
   - Sızıntı riski yok: `redactSensitiveText` kesmeden **önce** uygulanıyor; sırayı koru.
3. **Worker:**
   - `execution/runtime.js:captureChildOutput` ve `execution/localProcesses.js` çıktı tutmayı "ilk K + son K" yap (iki tampon: baş sabit, kuyruk halka tampon).
   - `stdoutBytes`, `stdoutSha256` (tüm akışın özeti) ve `stdoutTruncated` anlamını **değiştirme**.
   - Kesilmiş çıktının `passed: false` sayılması kuralı (`runtime.js` ~343, `localProcesses.js` ~133) aynen kalmalı.
   - `execution/tests/` altına benzer bir test ekle.
4. Yanıt şekli değişmiyor (yalnız metin içeriği değişiyor). Yine de `test_p3_observability.js` ve `observabilityShapes` anlık görüntü testlerini koş.

**Kabul ölçütü:**
- Yeni testler geçiyor: sondaki `not ok` bloğu kanıtta var, kesme işareti görünüyor, `truncated` true.
- `npm --prefix execution test` ve ilgili backend süitleri geçiyor.

**Yapma:** Kesilmiş çıktıyı tam kanıt sayma; kabul kurallarını değiştirme.

---

### Y5 — `stok-takip-1` teslimi (operasyon; kod değişikliği yok)

**Amaç:** Sözleşme 3 altında `stok-takip-1`'i bağımsız worker doğrulaması ve tamamlama makbuzuyla teslim etmek.

**Ön koşullar:**
- Y1 ve Y4 `faz-5/stok-takip-onarim`'a (veya çalışılan dala) alınmış olmalı.
- Çalışan backend ve worker, değişiklikler alındıktan **sonra** yeniden başlatılmış olmalı. Backend izleme modu worker'ı yenilemez.
- **Her koşu 🔒 kullanıcı onayı gerektirir.** LLM maliyeti var; bir koşu 10–40 dk sürer.

**17 Kasım itibarıyla durum:**
- Proje `paused`, revizyon 845. Onaylı sözleşmenin `contractId`'sini Ek A betiği verir.
- 17 Kasım turları şu dosyaları yeniden yazdı: `tests/test-helper.ts`, `tests/seed-behavior-fixture.ts`, `tests/seed-behavior.test.js`, `tests/requirements.test.js`.
- Bunlardan sonraki tek koşu (`a0e40be7`) npm 502 yüzünden kaynağı sınamadı.
- Ondan önceki koşu (`7aea86b1`): `tests/test-helper.ts(249,54) TS2345` typecheck/build hatası, lint zaman aşımı, web servisi açılmadı.
- Bağımsız inceleme hakkı: 1 kaldı.
- **Not:** Bu belge yazılırken, 17 Kasım 14:58 UTC'de yeni bir girişim (`attempt-c9f9ee9e…`) ve koşu (`verification-88674954…`) başlatılmıştı ve sürüyordu. Yukarıdaki durum bu koşudan öncesini anlatıyor. Y5'e başlamadan önce bu koşunun sonucunu Ek A ile oku ve kararı ona göre ver.

**Adımlar:**
1. Ek A betiğiyle durumu oku. Çalışan (`running`) girişim olmamalı. `GET /readyz` 200 dönmeli.
2. 🔒 **Yalnız Yeniden Doğrula:** `POST /api/projects/stok-takip-1/reverify`, gövde `{ "contractId": "<onaylı sözleşme id>" }` (§2.3). Bitince sonucu Ek A betiğiyle veya `GET /verification-runs` ile oku.
3. Karar ağacı:
   - **`clean_install` altyapı nedeniyle BLOCKED:** ağ/proxy düzelince 2. adımı tekrarla. Kaynağa dokunma.
   - **Typecheck/build/lint/servis hatası:**
     1. 🔒 `POST /repair-proposal` `{ contractId }` ile **dar** bir öneri iste. Önerideki hedefleri `GET /:id` yanıtındaki `repairPreparation`'dan oku; en çok 3 hedef ve yalnız hatalı dosyalar olmalı.
     2. Hedefler mantıklıysa 🔒 `POST /repair` `{ contractId, proposalHash }`.
     3. Mantıksızsa kullanıcıya göster, onay olmadan uygulama.
   - **Yalnız `requirement_assertions` / `ui_language_evidence` / `requirement_traceability` BLOCKED, diğer bütün zorunlu kapılar PASS:** 🔒 `POST /repair-review` `{ contractId, proposalHash }`. Kalan tek hak; erken harcama.
   - **Uygulama testleri düşüyor (`test_suite_execution` FAIL):** Y4 sonrası kanıtta `not ok` bloklarını oku ve kullanıcıya özetle. Ardından dar onarım önerisi iste.
4. Bir onarım turu zorunlu PASS sayısını düşürürse **dur** ve kullanıcıya bildir. Arka arkaya ikinci tur deneme (bkz. Y9).
5. Teslim ancak şu üçü birlikte varsa bildirilir: proje `completed`, `completion_receipts`'te kayıt var, `GET /:id/artifacts` indirilebilir bir `verified` artefakt gösteriyor.

**Kabul ölçütü:** Canlı DB'de `stok-takip-1` için `verified` koşu ve makbuz var; `docs/faz-arsiv.md` ve `CLAUDE.md §5` güncellendi.

**Yapma:**
- `projects/stok-takip-1/` dosyalarını düzenleme.
- Reddedilmiş sözleşme 4'ü canlandırma.
- Kural gevşetme.
- İnceleme hakkını erken harcama.

---

### Y6 — 🔒 Bayat kayıtlar ve takılı projeler

**Amaç:** Teslimi bloke eden veya paneli kirleten eski kayıtlar için kullanıcı kararı almak.

**Bağlam:** B-6.

**Adımlar:**
1. Kullanıcıya üç ayrı soru sor:
   - a. `kutuphane-takip-sistemi-2`'nin `superseded` sözleşmesindeki 11 açık kayıt `resolved` yapılsın mı?
   - b. `emlak-yonetim-1` (22 açık kayıt, 25 Ekim'den beri `paused`): sürdür, arşivle ya da olduğu gibi bırak?
   - c. `test-6-debug-1` normal silme akışıyla (`DELETE /api/projects/test-6-debug-1`) silinsin mi?
2. Onay gelirse:
   1. Canlı DB'nin `VACUUM INTO` yedeğini al (`backend/data/maintenance-backups/pre-cleanup-<UTC zaman>/`); yedeğin `PRAGMA integrity_check`'ini doğrula.
   2. Yalnız onaylanan değişikliği tek transaction'da uygula.
   3. `PRAGMA integrity_check` ve `PRAGMA foreign_key_check` çalıştır.
   4. Değişikliği `docs/faz-arsiv.md`'ye yaz.

**Yapma:** Onaysız `UPDATE`/`DELETE`; makbuzu olan projeyi silme (kod zaten engelliyor).

---

### Y7 — Worker iş deposunu hafiflet

**Amaç:** Worker her komut olayında MB'larca senkron disk yazımı yapmasın.

**Bağlam:** B-5. Dosya: `execution/jobStore.js` (2 boşluk girinti).

**Adımlar:**
1. **Testler** (`execution/tests/jobStore*.test.js` yanına):
   - a. İş terminal duruma geçince kayıtta `archiveBase64`/`packageJsonBase64` kalmasın; kimlik alanları ve `inputSha256` kalsın.
   - b. Terminal bir işe aynı kimlik ve aynı `inputSha256` ile yeniden `insertJob` → `'exists'`. Farklı `inputSha256` → `Duplicate jobId with different input` hatası.
   - c. 100 `recordCommandDiagnostic` çağrısında `_save` çağrı sayısı ≤ 2 (sahte zamanlayıcı veya enjekte edilebilir saat).
   - d. Çökme kurtarma: `running` iş yeniden yüklenince `failed_interrupted` (mevcut test korunmalı).
2. `updateJobStatus` terminal geçişte iki büyük alanı sil. `insertJob`'ın karşılaştırması (~65-72) terminal işlerde `inputSha256` ve `JSON.stringify(contract)` ile yapılsın.
3. Komut ve faz tanılama olaylarında `_save`'i en çok 1 sn'de bir yap (birleştirme zamanlayıcısı). Terminal geçişte, `beginDiagnostics`'te, `insertJob`'da ve `close()`'da hemen yaz. `close()` bekleyen zamanlayıcıyı temizleyip son kez yazsın. `execution/server.js` kapanışta `store.close()` çağırıyor; koru.

**Kabul ölçütü:** `npm --prefix execution test` tamamen geçiyor; yeni testler geçiyor.

---

### Y8 — Belgeleri koda hizala

**Adımlar:**
1. `README.md:30` kalp atışı cümlesini şöyle değiştir: "… ana döngü takılmalarına karşı korur; veritabanı kilidi kaynaklı düşmeler hâlâ izleniyor (bkz. docs/yol-haritasi-2026-11-17.md B-3)."
2. `README.md` "17 Kasım 2026 durumu" paragrafını ve `CLAUDE.md §5`'i B-8'e göre güncelle (koşular `7aea86b1`, `a0e40be7`; B-1).
3. Y1–Y7'den biteni `kullanici-kilavuzu.md`'ye ve `docs/faz-arsiv.md`'ye işle. Bu belgenin §6 tablosunda biten görevi `✅ <tarih> <commit>` diye işaretle.
4. `npm run graph`, `test_graphify.js`, `test_p9_runner_inventory.js`.

---

### Y9 — 🔒 Gerileyen onarım turunda geri alma (ürün kararı)

**Amaç:** Bir sınırlı onarım turu doğrulamayı belirgin biçimde geriletirse kullanıcıya önceki kaynaklara dönme seçeneği sunmak.

**Bağlam:** B-9. İlgili kod: `engine/controlledRepairPlan.js:controlledRepairSourceHash`, `engine/controlledRepairLineage.js`, `engine/controlledRepairs.js`.

**Adımlar:**
1. **Önce araştır:** Lineage önceki dosya **içeriklerini** mi tutuyor, yalnız özetleri mi? İçerik yoksa geri alma için içeriği nereden alabileceğini belirle. Seçenekler: son `verified`/`failed` artefakt ZIP'i (`backend/data/artifacts/`), checkpoint. Sonucu kullanıcıya raporla.
2. Kullanıcıya iki kapsam sun:
   - a. Yalnız uyarı (öneri ekranında "son tur 83 → 20 PASS geriledi").
   - b. Gerçek geri alma eylemi.
3. b seçilirse:
   - Kaynak yazımı `workflowAttempts.js:commitWorkflowSource` fence'i, sözleşme ve lease kontrolleriyle yapılmalı.
   - Geri alma sonrası kaynak özeti, seçilen önceki turun `outputSourceHash`'ine birebir eşit olmalı.
   - Ardından **Yalnız Yeniden Doğrula** zorunlu olmalı.

---

## 8. Bu incelemenin kapsamı

**Okunan kod:**
- Backend: `engine/workflow.js`, `engine/stages/acceptanceStage.js`, `workflowAttempts.js`, `workflowHeartbeatWorker.js`, `db.js`, `projectRepository.js` (kapı ve kaydetme bölümleri), `executionClient.js`, `verification/{executionProgress,verificationContext,workerFailures,packageVerifier,artifactVerifier}.js` (ilgili bölümler), `repositories/artifactRepository.js`, `utils/archive.js`, `routes/projectRoutes.js` (resume ve kurtarma), `routes/projectRepairRoutes.js` (reverify), `security.js`, `routes/authRoutes.js`, `tests/test_runner.js`.
- Worker: `execution/{server,jobStore,runtime,localProcesses}.js` (ilgili bölümler).
- Belgeler: `README.md`, `CLAUDE.md`, `docs/rontgen-2026-11-05.md`, commit edilmemiş fark, canlı DB.

**Çalıştırılan testler:**

| Komut | Sonuç | Not |
|---|---|---|
| `npm --prefix backend test` (yük altında) | 172/178 süit, 1.039 sn | Düşen 6 süit tek başına 6/6 (52 sn) → B-7 |
| `npm --prefix frontend run test:unit` (yük altında) | 0 test, 14 hata, 620 sn | Yeniden koşu 14 dosya, 155/155 (89 sn) → B-7 |
| `test_graphify.js`, `test_p9_runner_inventory.js` | 2/2 | `npm run graph` sonrası |
| `npm --prefix execution test`, `npm run test:local-worker`, `npm run test:e2e`, Docker süitleri | **Çalıştırılmadı** | Makinede canlı koşu vardı |

**Doğrulanmayanlar:** B-3 kök nedeni (hipotez); B-10 (Windows `spawn('npm')` ENOENT); worker'ın Docker'da `packageVerifier.js`'in hangi kopyasını çalıştırdığı (Y1 adım 5'te doğrulanacak); lineage'in dosya içeriği tutup tutmadığı (Y9).

---

## Ek A — Canlı DB'yi salt okunur okuma betiği

Depo **dışına** kaydet (örn. `%TEMP%\xf-db-read.mjs`). Bağlantı `readOnly: true`; yazma yapamaz.

```js
// Kullanım: node --no-warnings xf-db-read.mjs <db-yolu> [proje-id]
import { DatabaseSync } from 'node:sqlite';
const [dbPath, projectId = 'stok-takip-1'] = process.argv.slice(2);
const db = new DatabaseSync(dbPath, { readOnly: true });
const q = (sql, ...p) => db.prepare(sql).all(...p);
const show = (title, rows) => { console.log(`\n## ${title}`); for (const r of rows) console.log(JSON.stringify(r)); };
show('şema sürümü', q('SELECT MAX(version) v FROM schema_migrations'));
show('projeler', q('SELECT id, status, revision, length(workflow_state) wf_bytes FROM projects ORDER BY created_at'));
show('onaylı sözleşme', q("SELECT id, revision, contract_hash FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1", projectId));
show('son girişimler', q('SELECT id, status, started_at, ended_at, substr(error,1,240) error FROM workflow_attempts WHERE project_id=? ORDER BY started_epoch DESC LIMIT 5', projectId));
const run = q('SELECT id, contract_id, status, started_at, ended_at FROM verification_runs WHERE project_id=? ORDER BY started_at DESC LIMIT 1', projectId)[0];
show('son koşu', run ? [run] : []);
if (run) {
    // İndeks (contract_id, run_id) üzerinde; contract_id vermeden sorgu tabloyu tarar.
    show('kontrol özeti', q('SELECT status, applicability, COUNT(*) n FROM verification_checks WHERE contract_id=? AND run_id=? GROUP BY status, applicability', run.contract_id, run.id));
    show('PASS olmayan zorunlu kontroller', q("SELECT gate_name, status, substr(evidence_json,1,300) ev FROM verification_checks WHERE contract_id=? AND run_id=? AND applicability='MANDATORY' AND status NOT IN ('PASS','NOT_APPLICABLE')", run.contract_id, run.id));
}
show('açık onarım kayıtları', q("SELECT origin, json_extract(detail_json,'$.classification') cls, COUNT(*) n FROM repair_issues WHERE project_id=? AND status='open' GROUP BY 1,2", projectId));
show('makbuz', q('SELECT COUNT(*) n FROM completion_receipts WHERE project_id=?', projectId));
```

## Ek B — `await` içeren transaction tarama betiği

```js
// Kullanım: node xf-tx-scan.mjs <depo>/backend
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', 'tests', 'data', 'scripts'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(js|cjs|mjs)$/.test(e.name) ? [p] : [];
});
for (const file of walk(root)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
        if (!/exec\(['"`]BEGIN/.test(line)) return;
        for (let j = i + 1; j < Math.min(lines.length, i + 400); j++) {
            if (/\bawait\b/.test(lines[j])) { console.log(`${path.relative(root, file)}:${i + 1} -> await @${j + 1}: ${lines[j].trim().slice(0, 110)}`); break; }
            if (/exec\(['"`]COMMIT/.test(lines[j])) break;
        }
    });
}
```

Sınır: Betik yalnız aynı fonksiyon içindeki doğrudan `await`'i görür. Callback ile geçen `async` fonksiyonları (örn. `withArtifactTransaction(async () => …)`) ayrıca elle incelenmeli.

## Ek C — Görev raporu şablonu

Her görevin sonunda kullanıcıya şu biçimde rapor ver:

```
## Y<n> — <başlık>
Dal: <dal adı>   Taban: <commit>   Commit: yok (onay bekliyor) | <hash>
Değişen dosyalar:
- <dosya> — <bir cümle: ne değişti>
Eklenen testler:
- <dosya> — <neyi sınıyor>
Çalıştırılan doğrulamalar ve sonuçları:
- <komut> → <geçti/kaldı, sayı, süre>
Çalıştırılmayanlar ve nedeni:
- <komut> — <neden>
Kabul ölçütleri:
- [x] / [ ] <ölçüt>
Açık kalanlar / kullanıcı kararı gerekenler:
- <madde>
Belge güncellemeleri: <dosyalar veya "gerekmedi">
```
