# XFactor İyileştirme ve Yeniden Yapılandırma Yol Haritası (yenitodo.md)

Bu belge, `analiz.md` raporundaki bulgular doğrultusunda platformu prototipten güvenilir, kaliteli ve kurumsal bir AI ajan orkestrasyon sistemine dönüştürmek için icra edilen adımların durumunu içerir.

---

## Faz 0: Kalite Kapısı ve Savunma Mekanizmaları (Kritik Düzeltmeler)
- [x] **Görev 0.1:** `selfCorrection.js` modülünü `workflow.js` içerisine tam olarak bağla (Çok turlu re-review ve veto yetkisi).
- [x] **Görev 0.2:** `tester.js` içerisine gerçek deterministik doğrulayıcılar ekle (Prisma şema doğrulaması, TypeScript syntax/tip kontrolü ve derleme kontrolü).
- [x] **Görev 0.3:** `normalizeReviewResult` ve `normalizeTesterReport` içindeki sessiz onay (`approved: true` varsayılanı) açığını gider; başarısız çıktılarda fail-closed davran.

## Faz 1: Bağlam (Context) ve Scaffold İyileştirmeleri
- [x] **Görev 1.1:** Coder ajanına proje genelindeki paylaşılan şemaları (`schema.prisma`, `types/`, API kontratları) `projectContext` olarak dinamik besle.
- [x] **Görev 1.2:** `ensureProjectScaffold` içindeki hardcoded Next.js 14 bağımlılığını dinamikleştir; Vite, Express veya saf React projelerine uygun şablon seçimi sağla.
- [x] **Görev 1.3:** `isTaskCompleted` fonksiyonuna hedef dosyaların (`targetFiles`) diskteki fiziksel varlık ve boyut kontrolünü ekle.

## Faz 2: Kalıcılık ve Checkpoint Güçlendirme
- [x] **Görev 2.1:** SQLite `projects` tablosuna `workflow_state` JSON kolonu ekle; backend kapansa dahi hafıza durumu DB'den kayıpsız yüklensin.
- [x] **Görev 2.2:** `saveProjectState` ve `getProjectState` fonksiyonlarını `state.workflow` verisini tam persist edecek şekilde güncelle.

## Faz 3: Mimari Temizlik ve Modülerleştirme
- [x] **Görev 3.1:** `backend/server.js` dosyasını `routes/` (auth, projects) modüllerine ayır.
- [x] **Görev 3.2:** `frontend/src/App.jsx` dosyasını `components/` (DAGFlowView, IDEView, ChatView, Sidebar, Header, LoginView) modüllerine böl.

## Faz 4: Doğrulama, Test ve Güvenlik Sertifikasyonu
- [x] **Görev 4.1:** Gerçek proje üretimini derleyen ve test eden yeni bir kalite kapısı test süiti (`test_quality_gate.js`) hazırla.
- [x] **Görev 4.2:** Tüm backend test süitlerini (Mevcut testler + `test_quality_gate.js`) çalıştır ve doğrula.
