# CLAUDE.md — XFactor Proje Anayasası ve Geliştirici Rehberi

> **ZORUNLU OTURUM VE ÇALIŞMA KURALI:**
> - **Her oturum başında graph (`graphify-out/`), doküman (`README.md`, `docs/`) ve roadmap (`docs/roadmap-reports/`) güncelliğini git ile kontrol et; iş bitince üçünü de güncelle.**
> - Onay olmadan dosya silme, DB şeması değiştirme, toplu refactor yok; commit atma.
> - Değişiklikten önce ne yapacağını bir cümleyle söyle; mevcut stile uy, gereksiz kütüphane ekleme, kök nedeni çöz.
> - Bitince değişen dosyaları ve test yöntemini özetle.
> - Doküman/roadmap ile kod arasında çelişki varsa **KOD DOĞRUDUR**; çelişkiyi bildir ve dokümanı koda göre hizala.

---

## 1. Mimari Özeti ve 4 Çalışma Zamanı Yüzeyi

**XFactor**, kullanıcının doğal dildeki yazılım fikrini 6 uzmanlaşmış AI ajanı, deterministik **DAG dalga motoru**, sürümlü sözleşmeler (`PROJECT_CONTRACT`), **18 zorunlu kalite kapısı (Politika 2.0 Fail-Closed Veto)** ve **bağımsız temiz oda (clean-room) Execution Worker** üzerinden doğrulanmış, indirilebilir ZIP paketine dönüştüren otonom yazılım üretim platformudur.

| Yüzey | Port | Giriş Noktası & Ana Modüller | Sorumluluk |
| :--- | :---: | :--- | :--- |
| **1. Web Orchestrator (`backend/`)** | `8000` | `backend/server.js`, `backend/db.js`, `backend/engine/workflow.js`, `backend/routes/projectRoutes.js` | Express 4 + WebSocket (`ws`), `node:sqlite` (WAL, 17 migrasyon), Auth/MFA, 6 ajan hiyerarşisi, DAG orkestrasyonu ve doğrulama koordinasyonu. **Üretilen müşteri kodunu asla kendi sürecinde çalıştırmaz.** |
| **2. Execution Worker (`execution/`)** | `8099` | `execution/server.js`, `execution/runtime.js`, `execution/localRuntime.js` | Bearer token (`EXECUTION_WORKER_TOKEN`) korumalı iç RPC servisi. `prepare_dependencies` ve `verify_artifact` işlerini `local-trusted` (OS izolasyonu yok) veya `docker` (`--cpus 2.0`, `--memory 1g`, `--pids-limit 100`, `--cap-drop ALL`) profilinde yürütür. |
| **3. Frontend (`frontend/`)** | `5173` | `frontend/src/App.jsx`, `ChatView.jsx`, `DashboardView.jsx`, `DAGFlowView.jsx`, `LogsView.jsx`, `utils/dagLayout.js` | React 18 + Vite 6 + TailwindCSS + ReactFlow komuta merkezi (Sohbet & Mimari, Kalite Paneli, Canlı DAG Grafiği, Canlı Süreç Logları). |
| **4. LLM Yönetimi (`llm-yonetimi/`)** | `/llm` | `llm-yonetimi/src/index.js`, `llm-yonetimi/src/runtime.js`, `backend/llm.js` | AES-256-GCM şifreli sağlayıcı profilleri (`backend/data/llm-profiles.json`), bağlantı/sohbet sınaması, çoklu sağlayıcı (Google Gemini, Anthropic, OpenAI uyumlu REST) yönlendirmesi. |

### 6 Ajan Hiyerarşisi (`x-agents/` & `backend/agents/`)
- Ortak anayasa `x-agents/ORKESTRASYON-TALIMATNAMESI.md` + rol dosyası (`x-agents/<rol>.md`), `backend/agents/agentLoader.js` ile yüklenir (`docs/` sistem istemi kaynağı değildir).
- Sıra: **Manager** (`manager.js` — mimari plan & `project_contracts`) ➔ **Director** (`director.js` — domain bazlı `ALT-TALIMATNAME.md`) ➔ **Teamleader** (`teamleader.js` — `targetFiles.length === 1` atomik DAG görevleri) ➔ **Coder** (`coder.js` — kod üretimi) ➔ **Reviewer** (`reviewer.js` & `selfCorrection.js` — Babel AST + kapsam + en fazla 3 inceleme) ➔ **Tester** (`tester.js` — deterministik statik denetim & tavsiye/veto).

### Faz 4 Modüler Yapısı (Sıfır Kırılma Re-Export Disiplini)
- `backend/engine/workflow.js` ➔ `backend/engine/stages/repairStage.js`, `backend/engine/stages/verificationStage.js`
- `backend/engine/codeGenerator.js` ➔ `backend/engine/templates/dockerTemplates.js`, `backend/engine/templates/prismaTemplates.js`
- `backend/routes/projectRoutes.js` ➔ `backend/routes/projectObservabilityRoutes.js`, `backend/routes/projectTraceabilityRoutes.js`
- `backend/db.js` ➔ `backend/db/migrations.js` (17 migrasyon) ve `backend/workflowAttempts.js` (`assertWorkflowLease`)
- **Önemli:** Alt modüllere taşınan fonksiyonlar geriye dönük test ve Graphify uyumluluğu için ana modüllerden `export { ... } from './...'` ile yeniden dışa aktarılmaya devam eder.

---

## 2. Çalıştırma, Test ve Graphify Komutları

### Kurulum ve Çalıştırma
```powershell
# Bağımlılıklar
npm --prefix backend install
npm --prefix frontend install

# Yerel Worker kurulumu (Docker olmadan Node 22.23.2 + npm 10.9.8 + Playwright 1.62.1 + Chromium)
npm run worker:local:setup -- --install

# Geliştirme (3 servis birlikte: Frontend 5173, Backend 8000, Local Worker 8099)
npm run dev              # (veya açık adıyla: npm run dev:local)
npm run dev:docker       # Docker container izolasyonlu worker profili
```

### Test Komutları ve Kritik Test Kuralları
> **KRİTİK TEST KURALI:**
> 1. **Asla çıplak `node --test backend/tests/...` çalıştırma!** Backend testleri `backend/tests/preloadDatabase.js` ve `backend/tests/test_runner.js` tarafından sağlanan izole geçici ortam değişkenlerine (`DB_PATH`, `PROJECTS_ROOT`, `ARTIFACTS_ROOT`, `TRASH_ROOT`, `XFACTOR_TEMPLATE_DB_PATH`) ihtiyaç duyar.
> 2. `backend/tests/` altına yeni bir `test_*.js` dosyası eklersen **mutlaka `backend/tests/testInventory.js` içindeki `names` dizisine ekle**, aksi halde `assertCompleteTestInventory` anında hata fırlatır.

```powershell
# Tekil veya seçili backend testlerini hızlı çalıştırma (PowerShell):
$env:XFACTOR_TEST_RUNNER_FILES="test_project_state_rehydration.js,test_graphify.js"; npm --prefix backend test; Remove-Item Env:\XFACTOR_TEST_RUNNER_FILES

# Tam Backend test süiti (148 süit, şablon DB klonlamalı paralel koşucu):
npm --prefix backend test

# Execution Worker birim testleri (156 test):
npm --prefix execution test

# Gerçek Local Worker entegrasyon & 4 Chromium rol yolculuğu (159 test):
npm run test:local-worker

# Frontend birim testleri (Vitest, 14 dosya / 130 test) ve üretim build'i:
npm --prefix frontend run test:unit
npm --prefix frontend run build

# Playwright E2E testleri:
npm run test:e2e
```

### Bilgi Grafiği (Graphify) Güncelleme ve Sorgulama
```powershell
# Kaynak kod veya doküman değiştiğinde bilgi grafiğini yeniden üret (AST tabanlı, LLM maliyeti yok):
npm run graph

# Mevcut graph.json üzerinde hızlı sorgulama:
graphify query "<soru>"
graphify path "<BaşlangıçDüğümü>" "<HedefDüğüm>"
graphify explain "<DüğümAdı>"
```
- **Uyarı:** Python `graphify` CLI aracının cache/update mekanizması `graphify-out/graph.json`, `graph.html`, `GRAPH_TREE.html` ve `GRAPH_REPORT.md` dosyalarını üretmez; bu 4 dosyayı her zaman `npm run graph` (`backend/scripts/generate_graph.js`) üretir.

---

## 3. Kod Stili ve Geliştirme Kuralları

- **Runtime & Modül:** Node.js `22.23.2`, `npm@10.9.8`, ESM (`"type": "module"`, `import`/`export`), yerleşik `node:sqlite` (`DatabaseSync`).
- **Biçimlendirme:** Noktalı virgül (`;`) zorunlu, tek tırnak (`'...'`), LF satır sonu (`.gitattributes`), backend'de 4 boşluk / frontend'de 2 boşluk girinti.
- **Dil:** Arayüz metinleri, hata mesajları ve ajan yönergeleri Türkçe; kod sembolleri, durum sabitleri ve teknik log anahtarları İngilizce.
- **Geriye Dönük Uyumluluk Yasağı (Temiz Mimari):** Bozuk/eski durumları (`status = 'in_progress'`, makbuzsuz `'completed'`, `requirements` dizisi olmayan sözleşmeler) kurtarmak için sahte PASS veya gevşek shim bırakılmaz; tek kanonik şema ve fail-closed doğrulama uygulanır.
- **Bağımlılık Disiplini:** Kullanıcı onayı olmadan yeni npm paketi eklenmez; yerleşik Node.js modülleri (`node:crypto`, `node:sqlite`, `node:fs/promises`, `node:test`) tercih edilir.

---

## 4. İş Kuralları ve 5 Çekirdek Değişmez (`P1–P5`)

1. **P1 — Kanıt Otoritesi:** Ajan/Reviewer/Tester çıktıları yalnızca tavsiye (`advisory`) niteliğindedir. Yalnızca bağımsız worker (`execution/`) ve yetkili hardening kapılarının (`artifactVerifier.js`, `qualityPolicy.js`) ürettiği makine kanıtları (`exitCode`, `startedAt`, `endedAt`, `stdoutDigest`, `stderrDigest`) kabul kapılarını geçirebilir. Eksik kanıt alanı `BLOCKED` olur.
2. **P2 — Sözleşme-Kenetli Checkpoint:** Her `task_checkpoints` kaydı `contract_id`, `plan_hash`, `task_spec_hash`, `input_hash`, `output_hash`, `gate_version` ve nitelikli görev kimliğiyle (`task_identity_version = 1`) kenetlidir. Sözleşme yenilendiğinde veya doğrulama başarısız olduğunda eski checkpoint'ler `status = 'invalidated'` olarak işaretlenir.
3. **P3 — Tek-Yazar Lease & Fencing:** Tüm durum, sözleşme, kaynak yazımı, checkpoint ve doğrulama işlemleri aktif `workflow_attempts` kirası (`assertWorkflowLease` / `commitVerificationContext`) altında yürütülür. Erken çıkış/iptal (`checkPause`, `SHUTDOWN`) durumlarında lease asla `'completed'` olarak kapatılmaz (`'paused'` veya `'aborted'` olur).
4. **P4 — Atomik Tamamlama Makbuzu:** Bir proje yalnızca `completeVerifiedProject` üzerinden, geçerli bir `completion_receipts` satırı (SQLite trigger ile `UPDATE`/`DELETE` edilemez) ve `status = 'verified'` ZIP artefaktı ile `'completed'` durumuna geçebilir. Makbuzsuz disk projeleri uzlaştırmada (`reconciliationService.js`) `'paused'` durumuna alınır. Makbuzlu projeler normal silme işlemine karşı korumalıdır.
5. **P5 — Fail-Closed Kalite Kapıları:** 18 zorunlu kalite kapısından (`package_json`, `lockfile`, `ast_import_inventory`, `clean_install`, `typecheck`, `framework_build`, `requirement_traceability`, `service_manifest`, `database_verification`, `api_contract`, `browser_journey`, `smoke_gate`, `test_infrastructure`, `domain_entity_check`, `placeholder_check`, `contamination_check`, `security_baseline`, `readme_check`) herhangi biri `FAIL`, `BLOCKED` veya `skipped` ise proje tamamlanmaz ve ZIP indirilemez (`409 Conflict`).

### Kanonik Proje Durum Makinesi (`backend/engine/stateMachine.js`)
- `PROJECT_STATUS` (16 durum): `'planning'`, `'pending_approval'`, `'contract_approved'`, `'implementing'`, `'implementation_finished'`, `'verification_pending'`, `'verification_running'`, `'verification_failed'`, `'paused'`, `'failed'`, `'build_verified'`, `'runtime_verified'`, `'acceptance_verified'`, `'artifact_verified'`, `'completed'`, `'capability_blocked'`.
- Durum geçişleri `canTransitionProject(fromStatus, toStatus)` ile, sohbetten revize edilebilir durumlar `isRevisableProjectStatus(status)` ile denetlenir.

### Diğer Kritik İş Kuralları
- **Auth & Güvenlik:** Varsayılan geliştirici hesabı `admin` / `xfactor`. Parolalar `scrypt`, MFA sırları `v1:<iv>:<tag>:<ciphertext>` (AES-256-GCM), oturumlar 24 saatlik `xfactor_session` (`HttpOnly`, `SameSite=Lax`). Mutasyon çağrılarında `x-xfactor-csrf: 1` başlığı ve Origin kontrolü zorunludur.
- **Sohbet Sınırları:** Mesaj boyutu en fazla `4000` karakterdir; aynı projede eşzamanlı sohbet istekleri `409 CHAT_ALREADY_IN_PROGRESS` ile reddedilir.
- **LLM Kesilme Denetimi:** Tüm ajan rollerinde token sınırında kesilen yanıtlar (`MAX_TOKENS` / `length` / `max_tokens`) `LLM_TRUNCATED` hatasıyla fail-closed reddedilir (`options.allowTruncated !== true`).
- **Worker Onarım Bütçesi:** `workerRepairs.js` içinde her onarım rezervasyonu 7-bileşenli `inputSignature` (`contract.id`, `contract.contract_hash`, `owner.spec`, `target`, `currentHash`, `fingerprints`, `digest(currentContext)`) ile mühürlenir (parti başına en fazla 8 hedef / 64 bulgu, hedef başına 2 değişen girdi denemesi, sözleşme başına 64 toplam deneme).

---

## 5. Bilinen Sınırlar, Riskler ve Operasyonel Notlar

1. **Tek-Node Dağıtım Sınırı:** SQLite WAL veritabanı, yerel dosya sistemi (`PROJECTS_ROOT`, `ARTIFACTS_ROOT`), bellek içi WebSocket odaları ve yerel süreç kilitleri nedeniyle platform **tek-node** çalışacak şekilde tasarlanmıştır. Yatay ölçekleme için paylaşımlı SQL DB, ortak depolama, dağıtık oturum ve pub/sub WebSocket gerekir (`docs/OPERATIONS.md`).
2. **`local-trusted` Worker Profili:** `npm run dev` / `npm run dev:local` ile çalışan yerel worker gerçek kurulum, build, SQLite, API ve Chromium kontrollerini Docker olmadan yürütür ancak **işletim sistemi izolasyonu sağlamaz** (`osIsolation: false`); üretilen kod worker kullanıcısının yetkileriyle çalışır. Konteyner izolasyonu için `npm run dev:docker` ve çalışan bir Docker daemon gerekir.
3. **ZIP Yaşam Döngüsü ve Karantina:** Kaynak klasörün diskten silinmesi DB kayıtlarını veya ZIP'leri otomatik silmez. Proje silindiğinde veya `node backend/scripts/artifact-maintenance.js --quarantine --offline` çalıştırıldığında ZIP dosyaları kalıcı olarak silinmez (purge yok); `.quarantine` / `.artifact-quarantine` dizinlerine taşınır (`docs/ARTIFACT-LIFECYCLE.md`).
4. **LLM Şifreleme Anahtarı:** Sağlayıcı API anahtarları `.env` içinde değil `backend/data/llm-profiles.json` içinde `LLM_CONFIG_ENCRYPTION_KEY` (veya `llm-encryption.key`) ile şifreli tutulur. Anahtar kaybolursa mevcut şifreli profiller çözülemez; yedeklemede DB/proje/artefakt snapshot'ına ek olarak ayrıca yedeklenmelidir.
5. **Üretim Ortamı Gereksinimleri:** `NODE_ENV=production` modunda `TRUST_PROXY=loopback`, HTTPS `ALLOWED_ORIGINS`, açık `MFA_ENCRYPTION_KEY` ve geliştirme varsayılanından farklı `EXECUTION_WORKER_TOKEN` zorunludur; aksi halde sunucu başlamayı reddeder (`validateRuntimeConfig`).

---

## 6. Oturum Başı ve Oturum Sonu Kontrol Listesi

### Oturum Başında Çalıştırılacak Güncellik Kontrolü
```powershell
# 1. Son commit ve çalışma ağacı durumu
git status --porcelain
git log -5 --format="%h %ci %s"

# 2. Kaynakların (Graph, Dokümanlar, Roadmap) son commit zamanları
foreach ($f in 'CLAUDE.md','README.md','docs/kullanici-kilavuzu.md','docs/OPERATIONS.md','docs/roadmap-reports/mimari-yol-haritasi.md','docs/roadmap-reports/faz-4-rapor.md','graphify-out/graph.json','graphify-out/GRAPH_REPORT.md') {
    "$f => " + (git log -1 --format="%h %ci" -- $f)
}
```
- Herhangi bir kaynak dosyadan sonra kod değişmişse veya `graphify-out/GRAPH_REPORT.md` üretim tarihi son kod değişikliğinden eskiyse o kaynağı **"eskimiş"** işaretle ve önce `npm run graph` ile grafiği güncelle.

### İş Bitiminde Zorunlu Kapanış Adımları
1. İlgili birim/entegrasyon testlerini çalıştır (`$env:XFACTOR_TEST_RUNNER_FILES="..."` veya tam süit).
2. `npm run graph` komutunu çalıştırarak `graphify-out/` çıktılarını güncelle ve `test_graphify.js` + `test_p9_runner_inventory.js` testlerinin geçtiğini doğrula.
3. Mimari, davranış veya akış değiştiyse `README.md`, `docs/` altındaki ilgili kılavuzları, `docs/roadmap-reports/` kayıtlarını ve `CLAUDE.md` dosyasını güncelle.
4. Değişen dosyaları ve doğrulama/test yöntemini kullanıcıya özetle.
