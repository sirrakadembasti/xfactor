# SDD Plan: Diskteki Protokol Dosyalarından Tam Durum, Plan, Sohbet ve Log Kurtarma (Project Rehydration Engine)

## Context & Global Constraints
- Proje: XFactor (Backend & Frontend)
- KESİNLİKLE `projects/` altındaki mevcut proje dosyaları silinmeyecek veya bozulmayacak!
- Yalnızca `backend/services/reconciliationService.js`, `backend/projectRepository.js`, `backend/routes/projectRoutes.js` üzerinde geliştirmeler yapılacak.
- 18 kalite kapısı ve fail-closed güvenlik kuralları korunacak.
- Mevcut test süitleri (%100) yeşil kalacak.

---

### Task 1: Diskteki Protokol Dosyalarından Plan, Görevler (DAG) ve Durum Kurtarma Motoru
**Hedef Dosyalar:**
- `backend/services/reconciliationService.js`
- `backend/projectRepository.js`
- `backend/tests/test_project_state_rehydration.js`

**Gereksinimler:**
- `backend/services/reconciliationService.js` içerisine `rehydrateProjectStateFromDisk(projectDir, { projectId, database })` fonksiyonunu ekle:
  1. `manager/TALIMATNAME.md` dosyasını oku; `plan.talimatname` ve `plan.summary` alanlarını doldur.
  2. `manager/TODO.md` dosyasından `domains` (`backend`, `frontend` vb.) listesini ayrıştır.
  3. `manager/` altındaki tüm alt `TODO.md` dosyalarını tara; tüm atomik görevleri (`id`, `title`, `dependencies`, `status: [x] ? 'completed' : 'pending'`) çıkararak `workflow.teamleaderPlans` ve `state.plan` yapılarını tam olarak inşa et.
  4. Kök dizindeki `RAPOR.md` (veya tüm görevlerin `completed` olması) durumunda proje durumunu (`status`) otomatik olarak **`completed`** yap.
  5. Kurtarılan durumu SQLite `projects` tablosundaki `plan`, `workflow_state` ve `status` kolonlarına kaydet; ayrıca `project_contracts` tablosuna onaylı bir sözleşme revizyonu ekle.
- `autoRegisterDiscoveredProjects` ve `syncProjectsWithDisk` fonksiyonlarına bu rehydration adımını entegre et; veritabanında planı veya workflow_state'i boş olan mevcut projelerin otomatik olarak zenginleştirilmesini sağla.
- **Doğrulama:**
  - `backend/tests/test_project_state_rehydration.js` test dosyasını oluştur ve diskteki protokol dosyalarından durumun eksiksiz kurtarıldığını doğrula.

---

### Task 2: Sohbet Geçmişinin (`chat_history`) Şartname ve Raporla Canlandırılması
**Hedef Dosyalar:**
- `backend/services/reconciliationService.js`
- `backend/projectRepository.js`
- `backend/tests/test_project_state_rehydration.js`

**Gereksinimler:**
- `backend/services/reconciliationService.js` içine `rehydrateProjectChatHistoryFromDisk(projectDir, { projectId, database })` ekle:
  - Eğer bir projenin `chat_history` tablosunda 0 veya yalnızca 1 jenerik karşılama mesajı varsa, diskteki dosyalardan zengin bir sohbet geçmişi inşa et:
    1. Mesaj: Kullanıcı/Manager proje başlangıç kaydı.
    2. Mesaj: Diskteki gerçek `manager/TALIMATNAME.md` içeriğinden oluşan mimari plan sunumu.
    3. Mesaj: Eğer proje tamamlanmışsa (`RAPOR.md` varsa), diskteki `RAPOR.md` içeriğinden oluşan nihai kabul ve teslimat raporu.
  - Bu mesajları kronolojik olarak `chat_history` tablosuna yaz.
- `backend/projectRepository.js` içindeki `getProject(projectId)` fonksiyonuna bu sohbet geçmişi zenginleştirmesini bağla; böylece kullanıcı projeye tıkladığında sohbet penceresi geçmiş mimariyi ve raporu eksiksiz göstersin.
- **Doğrulama:**
  - `test_project_state_rehydration.js` içinde sohbet geçmişi kurtarmasını doğrula.

---

### Task 3: Görev Raporlarından Canlı Logların Geri Yüklenmesi (`rehydrateProjectLogs`)
**Hedef Dosyalar:**
- `backend/services/reconciliationService.js`
- `backend/routes/projectRoutes.js`
- `backend/tests/test_project_state_rehydration.js`

**Gereksinimler:**
- `backend/services/reconciliationService.js` içine `rehydrateProjectLogsFromDisk(projectDir, { projectId, database })` ekle:
  - Eğer `project_logs` tablosunda o proje için log kaydı yoksa;
  - `manager/DURUM.md`, `director/DURUM.md`, takım lideri `TODO.md` ve görev klasörlerindeki `RAPOR.md` / `GOREV.md` dosyalarını tara.
  - Her bir görev için:
    - Teamleader delegasyon logu (`action: "delegate"`, `agent: "Teamleader"`).
    - Coder kod yazım logu (`action: "write"`, `agent: "Coder"`, `node_id`).
    - Reviewer onay logu (`action: "finish"`, `agent: "Reviewer"`).
    - Tester kabul denetimi logu (`action: "finish"`, `agent: "Tester"`).
  - Bu logları `project_logs` tablosuna yaz.
- `backend/routes/projectRoutes.js` içindeki `GET /api/projects/:id/logs` rotasında eğer tablo boşsa bu kurtarmayı otomatik tetikle.
- **Doğrulama:**
  - `test_project_state_rehydration.js` içinde logların kurtarıldığını ve DAG için hazır hale geldiğini doğrula.

---

### Task 4: Mevcut Diskteki Tüm Projelerin Canlandırılması, Graphify & Regresyon Doğrulaması
**Hedef Dosyalar:**
- `backend/data/projects.db`
- `backend/scripts/generate_graph.js`
- `graphify-out/*`

**Gereksinimler:**
- Diskteki mevcut tüm projeleri (`todo-app-1`, `quiz-yonetim-app-1`, `deneme-1`) bu kurtarma motorundan geçirerek veritabanını zenginleştir.
- `npm run graph` çalıştırarak bilgi grafiğini güncelle.
- Tüm backend ve frontend test süitlerini çalıştırarak sıfır regresyon sağlandığını doğrula.
