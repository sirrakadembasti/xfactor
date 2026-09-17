# SDD Plan: XFactor Senkronizasyon, Hata Teşhisi & Canlı DAG İyileştirmesi

## Context & Global Constraints
- Proje: XFactor Otonom AI Yazılım Platformu
- Backend: Node.js 22 (ES Modules), SQLite (`projects.db`), Express, WebSockets.
- Frontend: React 18, Vite, ReactFlow, TailwindCSS.
- Execution Worker: `execution/server.js`, split architecture.
- Kalite Politikası: 18 kalite kapısı, fail-closed güvenlik kuralları korunacak.
- Mevcut test süitleri (`backend/tests/test_runner.js`) kırılmayacak.

---

### Task 1: Disk-DB İki Yönlü Senkronizasyonu
**Hedef Dosyalar:**
- `backend/services/reconciliationService.js`
- `backend/routes/projectRoutes.js`
- `backend/projectRepository.js`

**Gereksinimler:**
- `reconcileProjectsWithDisk` fonksiyonunu genişlet:
  1. Diskte geçerli bir proje klasörü olup (`projects/<id>`) SQLite'ta olmayan klasörleri tespit et ve güvenli bir şekilde `autoRegisterDiscoveredProject` ile SQLite `projects` tablosuna ekle (varsayılan durum: `completed` veya `planning`, başlık klasör veya TALIMATNAME'den).
  2. SQLite'ta olup diskte fiziksel klasörü bulunmayan projeleri tespit et; `missing_on_disk: 1` bayrağı ile işaretle veya GET listelemesinde UI'ın ayırt edebilmesini sağla.
  3. `GET /api/projects` endpoint'inde bu senkronizasyonu hafif bir dosya kontrolüyle tetikle.
- **Doğrulama:**
  - `test_disk_sync_and_isolation.js` ve `test_p7_reconciliation.js` testlerini çalıştır.
  - Diskteki 2 klasör ile DB'deki projelerin tutarlı hale geldiğini doğrula.

---

### Task 2: Şeffaf Hata Loglama ve Geliştirme Modu Worker Yapılandırması
**Hedef Dosyalar:**
- `backend/engine/workflow.js`
- `backend/config.js`
- `backend/executionClient.js`
- `scripts/dev.mjs`
- `backend/.env.example` ve `backend/.env`

**Gereksinimler:**
- `workflow.js` içindeki `executeProjectTasks` catch bloğunda hatayı maskelemeden, okunabilir açık hata mesajını log ekranına yaz (`Süreç hatası (${error.message}). Referans: ${errorLog.requestId}`).
- Geliştirme ortamında (`NODE_ENV !== 'production'`) `executionClient`'ın `EXECUTION_WORKER_TOKEN` eksikliğinden çökmesini engelle:
  - `scripts/dev.mjs` başlatılırken varsayılan yerel bir worker token (`dev-worker-token`) sağla veya `execution/server.js`'i dev modunda ayağa kaldır ya da `executionClient`'ta yerel geliştirme token'ı için güvenli varsayılan sağla.
- **Doğrulama:**
  - `node backend/tests/test_runner.js` çalıştırarak backend testlerinin geçtiğini doğrula.
  - `workflow.js` hata yakalama bloğunun okunabilir hata ürettiğini doğrula.

---

### Task 3: Manager Muhakemesi, Gerçek Hata Enjeksiyonu ve Talimat Yürütme
**Hedef Dosyalar:**
- `backend/routes/projectRoutes.js`
- `backend/engine/workflow.js`

**Gereksinimler:**
- `buildManagerChatSystemPrompt` fonksiyonunda:
  - Proje duraklatılmış veya hata almışsa (`paused`, `failed`), `workflow_attempts` tablosundaki en son girişin gerçek `error` metnini ve başarısız olan adımı oku.
  - Telemetri bölümüne "### ⚠️ SON GERÇEK MOTOR HATASI VE TEKNİK DETAY:" başlığı altında bu hatayı açıkça ekle.
  - Manager'ın ezbere teori uydurmasını engelleyen ve gerçek hataya odaklanmasını emreden yönerge ekle.
- `/api/projects/:id/chat` endpoint'inde:
  - Kullanıcı bir hatanın onarılmasını veya sürece müdahale edilmesini istediğinde, Manager yanıtı ile birlikte projeyi onarım döngüsüne (`executeStaticRepairLoop` veya `resume`) yönlendirecek bayrak/işlem desteği sağla.
- **Doğrulama:**
  - Manager sistem istemine hata bağlamının aktarıldığını birim test/betik ile doğrula.

---

### Task 4: Canlı DAG Grafiğinde 6 Ajan Rolü ve Canlı Senkronizasyon
**Hedef Dosyalar:**
- `frontend/src/utils/dagLayout.js`
- `frontend/src/components/DAGFlowView.jsx`
- `backend/engine/workflow.js`

**Gereksinimler:**
- `workflow.js` içinde `Tester` logları atılırken hiyerarşik `node_id` (`${directorId}.tester`) ve `parent_node_id` iletilmesini sağla.
- `dagLayout.js` içinde:
  - `Reviewer` ve `Tester` adımlarını görsel DAG hiyerarşisinde belirgin kıl.
  - Düğümlerde karmaşık ham kimlikler yerine okunabilir görev adlarını (`task.title`) ve ajan unvanlarını göster.
  - Henüz log oluşmamış ama onaylanmış bir plan (`state.plan`) varken boş grafik yerine planlanan domain/teamleader yapısını çiz.
- **Doğrulama:**
  - `frontend` testlerini çalıştır (`npm --prefix frontend run test:unit`).
  - Fonksiyonların doğru düğüm ve kenar ürettiğini doğrula.
