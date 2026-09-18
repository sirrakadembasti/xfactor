# SDD Plan: Gerçek Proje Durumu Tespiti, Doğrulanmış ZIP Artefaktı ve Ekran Senkronizasyonu

## Context & Global Constraints
- Proje: XFactor Otonom AI Yazılım Platformu
- KESİNLİKLE `projects/` altındaki mevcut proje kod dosyalarına dokunulmayacak veya silinmeyecek!
- Yalnızca `backend/services/reconciliationService.js`, `backend/projectRepository.js`, `backend/routes/projectRoutes.js` üzerinde geliştirmeler yapılacak.
- 18 kalite kapısı ve fail-closed güvenlik kuralları korunacak.
- Mevcut test süitleri (%100) yeşil kalacak.

---

### Task 1: Gerçek Durum Tespiti — Biten ve Devam Eden Projelerin Doğru Ayrılması
**Hedef Dosyalar:**
- `backend/services/reconciliationService.js`
- `backend/tests/test_project_state_rehydration.js`

**Gereksinimler:**
- `detectProjectStatusFromDisk(dirPath)` fonksiyonunu düzelt:
  - Kök `DURUM.md` dosyasında açıkça `TAMAMLANDI` yazmıyorsa veya `state.json` içinde `completed` yoksa projeyi ASLA `completed` yapma!
  - `manager/DURUM.md` dosyasında `BASLADI` yazıyorsa ve `manager/TALIMATNAME.md` varsa, projenin durumu gerçekçi olarak **`pending_approval`** (onay bekliyor) veya `planning` olmalıdır.
- `rehydrateProjectChatHistoryFromDisk`:
  - Yalnızca durumu gerçekten `completed` olan projeler için son teslim/kabul raporu mesajını ekle.
  - Durumu `pending_approval` veya devam eden projeler için sahte "Proje tamamlandı" mesajı basma; Manager'ın hazırladığı mimari plan sunumunu ve onay çağrısını bırak.
- **Doğrulama:**
  - `test_project_state_rehydration.js` içerisinde hem tamamlanmış (`todo-app-1`) hem de devam eden/onay bekleyen (`quiz-yonetim-app-1`) projelerin durum ayrımını test et.

---

### Task 2: Gerçekten Tamamlanan Projeler İçin Otomatik Doğrulanmış ZIP Artefaktı Üretimi
**Hedef Dosyalar:**
- `backend/services/reconciliationService.js`
- `backend/repositories/artifactRepository.js`
- `backend/projectRepository.js`

**Gereksinimler:**
- `rehydrateProjectStateFromDisk`:
  - Eğer proje durumu gerçekten `completed` ise (`DURUM: TAMAMLANDI` ve `RAPOR.md` geçerli):
  - `createProjectZip(projectId, contractId, files)` çağrılarak `backend/data/artifacts/` altında gerçek bir ZIP arşivi oluşturulsun.
  - SQLite `artifacts` tablosuna `status = 'verified'`, hesaplanan `sha256` hash'i, dosya boyutu ve dosya yolu kaydedilsin.
  - `project_contracts` ile `artifacts` arasındaki ilişki bağlansın.
  - Böylece `Header.jsx` içindeki `canDownloadArtifact` (`projectState.status === 'completed' && latestArtifact?.status === 'verified'`) koşulu tam sağlanır ve **`📥 Projeyi (ZIP) İndir`** butonu hem Header'da hem Sidebar'da eksiksiz belirir ve sorunsuz indirir.
- **Doğrulama:**
  - `getProject(completedId)` çağrıldığında `latestArtifact` nesnesinin dolu geldiğini ve `canDownloadArtifact` koşulunun sağlandığını test et.

---

### Task 3: Canlı DAG, Log Senkronizasyonu ve Mevcut Projelerin Düzeltilmesi
**Hedef Dosyalar:**
- `backend/services/reconciliationService.js`
- `backend/data/projects.db`

**Gereksinimler:**
- `rehydrateProjectLogsFromDisk`:
  - Devam eden / onay bekleyen projeler için sahte "bitiş/finish" logları basma. Yalnızca gerçekleşmiş gerçek adımları (`Manager: start`) logla; böylece DAG grafiği ve log ekranı donuk/yanıltıcı bitmiş görünmek yerine canlı ve onay bekleyen aşamada kalsın.
- Mevcut veritabanındaki 3 projeyi (`todo-app-1`, `quiz-yonetim-app-1`, `deneme-1`) bu yeni ve doğru kurallarla yeniden rehidrate et:
  - `todo-app-1`: `status = 'completed'` + Doğrulanmış ZIP Artefaktı + İndirme butonu aktif!
  - `quiz-yonetim-app-1`: `status = 'pending_approval'` + Plan hazır + "Planı Onayla ve Başlat" butonu aktif!
  - `deneme-1`: `status = 'pending_approval'` + Plan hazır + "Planı Onayla ve Başlat" butonu aktif!
- **Doğrulama:**
  - Veritabanı sorguları ve API yanıtları ile durumların ve butonların doğruluğunu kanıtla.

---

### Task 4: Test Süitleri, Graphify Senkronizasyonu ve Final İnceleme
**Hedef Dosyalar:**
- `backend/scripts/generate_graph.js`
- `graphify-out/*`

**Gereksinimler:**
- `npm run graph` ile bilgi grafiğini güncelle.
- Tüm backend ve frontend test süitlerini çalıştırarak sıfır regresyon sağlandığını doğrula.
- Final whole-branch code review yap.
