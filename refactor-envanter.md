# XFactor — Refactor & Temizlik Envanteri (Graphify Destekli)

Bu doküman, `graphify-out/graph.json` bağımlılık haritası, AST ve statik analiz yöntemleri kullanılarak tespit edilen ölü kod, kullanılmayan import/export, duplicate fonksiyon ve şişkinlik alanlarının tam envanteridir.

---

## 1. Graphify Mimari ve Blast Radius Özeti
- **Toplam Düğüm (Nodes):** 69
- **Toplam Bağlantı (Edges):** 92
- **Kök Düğümler (In-Degree = 0):** `frontend/src/App.jsx` (UI kökü), `backend/tests/test_runner.js` (Test kökü).
- **İzole / Sıfır Bağlantılı Dosya:** 0 (Tüm dosyalar mimari olarak ağa bağlıdır).

### 🌟 God Nodes & Yüksek Riskli Merkez Düğümler (Blast Radius)

| Düğüm | Topluluk | In-Edges (Çağıranlar/Doğrulayanlar) | Out-Edges (Bağımlılıklar) | Risk Seviyesi |
|---|:---:|---|---|:---:|
| `backend/tests/test_runner.js` | tests | 0 | 25 test süiti | **Kritik (Test Root)** |
| `backend/engine/workflow.js` | engine | `projectRoutes.js`, `test_quality_gate.js`, `test_manager_error_telemetry.js` | `dag.js`, `fileProtocol.js`, `codeGenerator.js`, `selfCorrection.js`, `agents/index.js`, `stateMachine.js`, `llm.js`, `db.js`, `executionClient.js` | **Kritik (Orchestrator)** |
| `docs/ORKESTRASYON-TALIMATNAMESI.md` | docs | `agentLoader.js` | 6 ajan dokümanı, 2 SDD planı, `kullanici-kilavuzu.md` | **Kritik (Anayasa)** |
| `backend/agents/index.js` | agents | `workflow.js` | 8 ajan modülü (`manager`, `director`, `teamleader`, `coder`, `reviewer`, `tester`, `schemas`, `agentLoader`) | **Yüksek (Ajan Fabrikası)** |
| `backend/routes/projectRoutes.js` | backend | `server.js`, `test_manager_error_telemetry.js` | `workflow.js`, `agentLoader.js`, `llm.js`, `projectRepository.js`, `reconciliationService.js`, `stateMachine.js` | **Yüksek (REST API)** |
| `frontend/src/App.jsx` | frontend | 0 | `Sidebar`, `Header`, `ChatView`, `DAGFlowView`, `dagLayout.js`, `IDEView`, `api.js` | **Yüksek (UI Root)** |
| `backend/agents/agentLoader.js` | agents | `agents/index.js`, `manager.js`, `projectRoutes.js`, `test_docs_agent_sync.js` | `docs/ORKESTRASYON-TALIMATNAMESI.md` | **Yüksek (Living Docs)** |
| `frontend/src/utils/dagLayout.js` | frontend | `App.jsx`, `DAGFlowView.jsx`, `dagLayout.test.js` | (Yaprak düğüm) | **Orta (DAG Layout)** |
| `backend/engine/stateMachine.js` | engine | `workflow.js`, `projectRoutes.js` | (Yaprak düğüm) | **Yüksek (State Machine)** |
| `backend/server.js` | backend | `api.js`, `test_backend.js` | `projectRoutes.js`, `authRoutes.js`, `auth.js`, `security.js` | **Kritik (Server Entry)** |

---

## 2. Adayların Sınıflandırılması

### Kategori A: Kesin Ölü Kod (Kullanılmayan Importlar & Exportlar)
*Hiçbir fonksiyonel etkisi olmayan, derleyici/çalışma zamanını gereksiz şişiren kullanılmayan importlar:*

1. **`frontend/src/App.jsx`:**
   - `MarkerType` (`reactflow` paketinden import edilmiş, kullanılmıyor).
   - `getAgentVisualTheme` (`./utils/dagLayout.js` dosyasından import edilmiş, kullanılmıyor).
2. **`frontend/src/components/ChatView.jsx`:**
   - `Bot` (`lucide-react` paketinden import edilmiş, kullanılmıyor).
3. **`frontend/src/components/LogsView.jsx`:**
   - `Filter` (`lucide-react` paketinden import edilmiş, kullanılmıyor).
4. **`backend/engine/workflow.js`:**
   - `fileURLToPath` (`url` modülünden import edilmiş, kullanılmıyor).
   - `uncheckTodoItem`, `isTaskCompleted`, `isFolderCompleted` (`./fileProtocol.js` dosyasından import edilmiş, kullanılmıyor).
   - `validateGenerationQuotas` (`./codeGenerator.js` dosyasından import edilmiş, kullanılmıyor).
5. **`backend/routes/projectRoutes.js`:**
   - `getProjectRole`, `canViewProject`, `canEditProject`, `canDeleteProject` (`../auth.js` dosyasından import edilmiş; yetkilendirme `requireProjectRole` middleware'i ile yapıldığı için doğrudan kullanılmıyor).
6. **`backend/routes/authRoutes.js`:**
   - `authenticateUser` (`../auth.js` dosyasından import edilmiş, rota içinde kullanılmıyor).
7. **`backend/engine/buildValidator.js`:**
   - `isSafeProjectPath` (`../projectPaths.js` dosyasından import edilmiş, kullanılmıyor).
8. **`backend/engine/checkpointHelper.js`:**
   - `fsSync` (`fs` modülünden import edilmiş, dosya içinde kullanılmıyor).
9. **`backend/verification/artifactVerifier.js`:**
   - `aggregateVerificationRun` (`./qualityPolicy.js` dosyasından import edilmiş, kullanılmıyor).
10. **`backend/verification/qualityPolicy.js`:**
    - `listProjectTree` (`../engine/codeGenerator.js` dosyasından import edilmiş, kullanılmıyor).

---

### Kategori B: Atıl / Yarım Kalmış Özellikler
1. **`backend/verification/buildVerifier.js: ensureLocalBinShims(projectDir)`:**
   - Tanımlanmış ve export edilmiş fakat `buildVerifier.js` içinde veya başka hiçbir test/serviste çağrılmıyor. Ancak `buildVerifier` 18 kalite kapısından biri olduğu için Kategori E koruması altındadır.

---

### Kategori C: Duplicate / Paralel Implementasyonlar
1. **`computeDigest(text)` Fonksiyonu:**
   - `buildVerifier.js`, `packageVerifier.js`, `qualityPolicy.js` ve `testInfrastructureVerifier.js` olmak üzere 4 ayrı doğrulama dosyasında birebir aynı implementasyon (`crypto.createHash('sha256').update(String(text ?? '')).digest('hex')`) tekrarlanmıştır.
2. **`assertWorkflowLease` Fonksiyonu:**
   - Hem `backend/workflowAttempts.js` hem de `backend/db.js` içinde tanımlıdır.
3. **`writeGeneratedFiles` İsim Çakışması:**
   - `backend/engine/codeGenerator.js` (proje çapında dosyaları yazan ana motor) ile `backend/engine/fileProtocol.js` (onarım döngüsünde allowlist denetimli yazıcı) aynı ada sahiptir; `workflow.js` içinde `writeGeneratedFiles as writeRepairFiles` olarak alias ile ayrılmaktadır.

---

### Kategori D: Şişkin Ama Canlı (Sadeleştirme Adayları)
1. **`frontend/src/utils/dagLayout.js`:**
   - Düğüm koordinatları ve DAG derinlik hesaplamasında bazı yardımcı fonksiyonlar okunabilirliği koruyarak sadeleştirilebilir.
2. **`backend/engine/workflow.js`:**
   - Ajan loglama ve hata yakalama bloklarındaki tekrarlayan log objesi üretimleri.

---

### Kategori E: Belirsiz / Riskli — DOKUNULMAYACAK ALANLAR (Yalnızca Raporlanır)
*Talimat gereği sistem bütünlüğünü korumak adına bu bileşenlerde hiçbir kod silinmeyecek veya değiştirilmeyecektir:*
- 6 God Node (`workflow.js`, `test_runner.js`, `App.jsx`, `projectRoutes.js`, `agents/index.js`, `server.js`) çekirdek iş mantıkları.
- 18 Kalite kapısı modülleri (`backend/verification/*`).
- `backend/auth.js` ve `backend/security.js` güvenlik katmanları.
- `backend/engine/stateMachine.js` CAS geçişleri ve revizyon kilitleri.
- `backend/db.js` SQLite WAL ve veritabanı migrasyonları.
- `docs/*.md` canlı ajan sözleşmeleri ve `backend/agents/agentLoader.js` köprüsü.
- `EXECUTION_WORKER_TOKEN`, Sandbox (`Bubblewrap`/`Docker`) ve worker izolasyon sınırları.
- `checkpointRepository.js` ve görev sağlama/doğrulama hash mekanizmaları.
