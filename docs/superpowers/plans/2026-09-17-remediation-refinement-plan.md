# SDD Plan: XFactor İyileştirme, Menü Düzenleme, Şeffaf Hata ve DAG Temizliği

## Context & Global Constraints
- Proje: XFactor Otonom AI Yazılım Platformu
- KESİNLİKLE `projects/` altındaki mevcut proje kod dosyalarına dokunulmayacak!
- Yalnızca platform çekirdeği (`backend/`, `frontend/`, `execution/`, `scripts/`) üzerinde düzeltmeler yapılacak.
- 18 kalite kapısı ve fail-closed güvenlik kuralları korunacak.
- Mevcut test süitleri kırılmayacak.

---

### Task 1: Yan Menü Üç Nokta Düzenlemesi, Anlık Disk Senkronizasyonu ve `.trash` İzolasyonu
**Hedef Dosyalar:**
- `frontend/src/components/Sidebar.jsx`
- `backend/projectRepository.js`
- `backend/routes/projectRoutes.js`

**Gereksinimler:**
- `Sidebar.jsx`:
  - `Yeniden Adlandır` seçeneğini menüden tamamen kaldır.
  - `Başa Sabitle / Sabitlemeyi Kaldır` seçeneğini koru.
  - `Uygulamayı Kaldır (Projeyi Sil)` seçeneğini koru.
  - Eğer proje tamamlanmışsa (`p.status === 'completed'`), menüye `📥 Projeyi (ZIP) İndir` butonunu ekle.
- `projectRepository.js`:
  - `trashRootFor` fonksiyonunu `projects/.trash` yerine sistem geçici dizinine (`path.join(os.tmpdir(), 'xfactor-trash')`) yönlendir.
  - Mevcut boş `projects/.trash` dizinini temizle.
- `projectRoutes.js` (`GET /api/projects`):
  - Diskte fiziksel klasörü bulunmayan projeleri tespit edip yanıtta `existsOnDisk: false, missingOnDisk: true` olarak döndür veya diskle anlık tutarlılık sağla.

---

### Task 2: Şeffaf Hata Loglama (Kullanıcı Ekranından Anlamsız Referans Kodlarının Temizlenmesi)
**Hedef Dosyalar:**
- `backend/engine/workflow.js`
- `backend/routes/projectRoutes.js`

**Gereksinimler:**
- `workflow.js` içinde kullanıcıya gösterilen log mesajlarındaki `Referans: <hex>` eklentisini kaldır.
- Hata mesajını insan tarafından doğrudan anlaşılır net Türkçe teknik açıklama olarak bas (Örn: `[Süreç Hatası] Bağımlılık hazırlığı başarısız oldu: package-lock.json üretilemedi.`).
- İç requestId değerini yalnızca iç telemetride sakla, kullanıcı ekranına anlamsız sayı dizisi olarak yansıtma.

---

### Task 3: Manager Revizyon Kilidinin Açılması, Talimat İletimi ve Host Fallback
**Hedef Dosyalar:**
- `backend/routes/projectRoutes.js`
- `backend/engine/workflow.js`
- `backend/executionClient.js`

**Gereksinimler:**
- `projectRoutes.js`:
  - `revisableStatuses` listesine `PROJECT_STATUS.PAUSED` ve `PROJECT_STATUS.VERIFICATION_FAILED` durumlarını ekle.
  - Duraklatılmış bir projede Manager yeni bir plan (`[PLAN_HAZIR]`) ürettiğinde yeni sözleşme revizyonunu kaydet ve projeyi `pending_approval` durumuna geçir.
- `workflow.js` & `executionClient.js`:
  - Docker çalışmadığında veya `XFACTOR_BUILD_SANDBOX=host` olduğunda, `prepare_dependencies` adımının Docker bağlantı hatasıyla çökmek yerine yerel `npm --package-lock-only` ile `package-lock.json` üretmesini sağla.

---

### Task 4: DAG Grafiğindeki Uydurma Düğümlerin Temizlenmesi
**Hedef Dosyalar:**
- `frontend/src/utils/dagLayout.js`
- `frontend/src/utils/__tests__/dagLayout.test.js`

**Gereksinimler:**
- `dagLayout.js`:
  - `tl_${domain.prefix}`, `req_${rIdx + 1}`, `tester-qa` gibi yapay ve uydurma ID fabrikasyonunu tamamen kaldır.
  - Grafiği yalnızca uygulamada çalışan 6 gerçek ajan (`Manager`, `Director`, `Teamleader`, `Coder`, `Reviewer`, `Tester`) ve gerçek görevler ile oluştur.
  - Hayalet / uydurma düğümlerin ekrana basılmasını engelle.
- Unit testleri güncelle ve doğrula.
