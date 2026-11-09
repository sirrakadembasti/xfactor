# CLAUDE.md — XFactor Proje Anayasası ve Geliştirici Rehberi

> **ZORUNLU OTURUM VE ÇALIŞMA KURALI:**
> - **Her oturum başında graph (`graphify-out/`), doküman (`README.md`, `kullanici-kilavuzu.md`) ve faz arşivi (`docs/faz-arsiv.md`) güncelliğini git ile kontrol et; iş bitince ilgili kaynakları güncelle.**
> - Onay olmadan dosya silme, DB şeması değiştirme, toplu refactor yok; commit atma.
> - Değişiklikten önce ne yapacağını bir cümleyle söyle; mevcut stile uy, gereksiz kütüphane ekleme, kök nedeni çöz.
> - Bitince değişen dosyaları ve test yöntemini özetle.
> - Doküman veya *.md ile kod arasında çelişki varsa **KOD DOĞRUDUR**; çelişkiyi bildir ve dokümanı koda göre hizala.

---

## 1. Uygulamayı Güncel Kaynaklardan Öğrenme (Zorunlu)

Bu dosya çalışma kurallarını ve kısa devralma kaydını tutar. Ayrıntılı mimari, kullanım ve tarihsel kayıtlar aşağıdaki kaynaklardadır. Uygulama hakkında karar vermeden önce göreve ilişkin kaynakları oku:

1. **`README.md`:** Uygulamanın amacı, güncel yetenekleri, mimarisi, kurulum/çalıştırma akışı ve doğrulama kapsamı.
2. **`kullanici-kilavuzu.md`:** Kullanıcı yolculukları, onay/revizyon, hata ve kurtarma davranışları, arayüz ve teslim kuralları.
3. **`graphify-out/`:** `graphify-bilgi-notu.md`, `graphify-rules.md` ve `GRAPH_REPORT.md` dosyalarını oku; `graph.json` üzerinden ilgili düğüm ve ilişkileri incele. `graph.html` ilişki haritasını ve `GRAPH_TREE.html` dosya ağacını kullanarak modülleri ve bağımlılıkları anla. Güncelliği git geçmişi ve raporun üretim tarihiyle kontrol et. `manifest.json`/Python cache çıktısını ana mimari haritanın güncellik kanıtı sayma.
4. **Git geçmişi:** `git status --porcelain`, `git log` ve ilgili commit'lerin `git show` çıktılarıyla çalışma ağacını, son değişiklikleri ve ana dala alınan işleri incele. Commit başlığı tek başına davranış veya başarılı test kanıtı değildir.
5. **Göreve ilişkin belgeler ve kod:** Yukarıdaki kaynakların yönlendirdiği `docs/` kılavuzlarını, kayıtlarını ve ilgili kaynak dosyalarını oku. Gerektiğinde ajan talimatları için `x-agents/`, çalışma/test komutları ve sürümler için ilgili `package.json`, lockfile ve test koşucularına başvur.

- Okumayı dosya adlarını listelemekle sınırlama; ana akışları, güvenlik/kanıt sınırlarını, hata sonrası davranışları ve değişikliğin etkileyeceği modülleri anlamadan uygulamaya geçme.
- Belgeler veya grafik ile kod çelişirse ilgili kod yolunu incele; **kod otoritedir**. Çelişkiyi bildir ve ilgili dokümanı koda göre hizala. Grafiğin statik ilişkileri çalışma zamanı başarısını kanıtlamaz.
- Tarihli test raporlarını yeni çalıştırılmış sonuç gibi sunma. Atlanan kontrolleri ve doğrulamanın kapsamını koru.
- **Sayısal bilgi doğrulama:** Kapı, kontrol, test, modül, migrasyon, süre, sürüm veya limit sayısını yalnız dokümandan alıp güncel gerçek gibi sunma. Önce ilgili kod sabitlerini, koşullu üretim yollarını ve testleri incele; mümkünse sayıyı koddan hesapla ve ilgili testleri çalıştır. Sayının neyi saydığını açıkla: ana politika kapısı, koşullu zorunlu kontrol, benzersiz kontrol adı, koşu kanıt satırı, test dosyası/süiti veya test vakası birbirinin yerine kullanılamaz. Kaynak dosya/simgeyi, doğrulanan commit veya tarihi ve testin gerçek/mock/atlanmış kapsamını belirt. Canlı bir koşunun toplamı soruluyorsa o koşunun kayıtlarını incele; statik liste veya fixture beklentisinden canlı toplam çıkarma. Doğrulanamayan sayıyı belirsiz veya tarihsel olarak etiketle.
- Mimari ve iş kurallarını bu dosyaya yeniden kopyalamak yerine ilgili güncel kaynakları kullan; mevcut güvenlik, kabul, kurtarma ve veri bütünlüğü garantilerini zayıflatma.

---

## 2. Test ve Graphify Çalışma Kuralları

Kurulum, servis başlatma ve ortam yapılandırması için güncel README/kılavuzu izle; komutları ilgili `package.json` üzerinden doğrula.

### Test Komutları ve Kritik Test Kuralları
> **KRİTİK TEST KURALI:**
> 1. **Asla çıplak `node --test backend/tests/...` çalıştırma!** Backend testleri `backend/tests/preloadDatabase.js` ve `backend/tests/test_runner.js` tarafından sağlanan izole geçici ortam değişkenlerine (`DB_PATH`, `PROJECTS_ROOT`, `ARTIFACTS_ROOT`, `TRASH_ROOT`, `XFACTOR_TEMPLATE_DB_PATH`) ihtiyaç duyar.
> 2. `backend/tests/` altına yeni bir `test_*.js` dosyası eklersen **mutlaka `backend/tests/testInventory.js` içindeki `names` dizisine ekle**, aksi halde `assertCompleteTestInventory` anında hata fırlatır.

```powershell
# Tekil veya seçili backend testlerini hızlı çalıştırma (PowerShell):
$env:XFACTOR_TEST_RUNNER_FILES="test_project_state_rehydration.js,test_graphify.js"; npm --prefix backend test; Remove-Item Env:\XFACTOR_TEST_RUNNER_FILES

# Tam Backend test süiti:
npm --prefix backend test

# Execution Worker birim testleri:
npm --prefix execution test

# Gerçek Local Worker entegrasyon:
npm run test:local-worker

# Frontend birim testleri ve üretim build'i:
npm --prefix frontend run test:unit
npm --prefix frontend run build

# Playwright E2E testleri:
npm run test:e2e
```

### Bilgi Grafiği (Graphify) Güncelleme ve Sorgulama
```powershell
# Kaynak kod veya doküman değiştiğinde bilgi grafiğini yeniden üret (AST tabanlı, LLM maliyeti yok):
npm run graph

# Kurulu CLI sürümünün desteğini doğrulayarak odaklı sorgulama:
graphify query "<soru>"
graphify path "<BaşlangıçDüğümü>" "<HedefDüğüm>"
graphify explain "<DüğümAdı>"
```
- **Uyarı:** Python `graphify` CLI aracının cache/update mekanizması `graphify-out/graph.json`, `graph.html`, `GRAPH_TREE.html` ve `GRAPH_REPORT.md` dosyalarını üretmez; bu 4 dosyayı her zaman `npm run graph` (`backend/scripts/generate_graph.js`) üretir.

---

## 3. Kod Stili ve Geliştirme Kuralları

- **Runtime & Modül:** Runtime ve paket yöneticisi sürümlerini ilgili `package.json` ve lockfile üzerinden doğrula; mevcut ESM (`import`/`export`) modül düzenine uy.
- **Biçimlendirme:** Noktalı virgül (`;`) zorunlu, tek tırnak (`'...'`), LF satır sonu (`.gitattributes`), backend'de 4 boşluk / frontend'de 2 boşluk girinti.
- **Dil:** Arayüz metinleri, hata mesajları ve ajan yönergeleri Türkçe; kod sembolleri, durum sabitleri ve teknik log anahtarları İngilizce.
- **Geriye Dönük Uyumluluk Yasağı (Temiz Mimari):** Bozuk/eski verileri veya geçersiz durumları kurtarmak için sahte PASS veya gevşek shim bırakılmaz; tek kanonik şema ve fail-closed doğrulama uygulanır.
- **Modül Ayrıştırma Disiplini:** Modül taşırken mevcut dışa aktarımları ve çağrı noktalarını koru; gerekli yeniden dışa aktarımları (`export { ... } from ...`) ve ilgili test/Graphify bağlantılarını sürdür.
- **Bağımlılık Disiplini:** Kullanıcı onayı olmadan yeni npm paketi eklenmez; yerleşik Node.js modülleri (`node:crypto`, `node:sqlite`, `node:fs/promises`, `node:test`) tercih edilir.

---

## 4. Oturum Başı ve Oturum Sonu Kontrol Listesi

### Oturum Başında Çalıştırılacak Güncellik Kontrolü
```powershell
# 1. Son commit ve çalışma ağacı durumu
git status --porcelain
git log -5 --format="%h %ci %s"

# 2. Kaynakların (Graph, Dokümanlar) son commit zamanları
foreach ($f in 'CLAUDE.md','README.md','kullanici-kilavuzu.md','docs/faz-arsiv.md','graphify-out/graphify-bilgi-notu.md','graphify-out/graph.json','graphify-out/graph.html','graphify-out/GRAPH_TREE.html','graphify-out/GRAPH_REPORT.md') {
    "$f => " + (git log -1 --format="%h %ci" -- $f)
}
```
- Herhangi bir kaynak dosyadan sonra kod değişmişse veya `graphify-out/GRAPH_REPORT.md` üretim tarihi son kod değişikliğinden eskiyse o kaynağı **"eskimiş"** işaretle ve önce `npm run graph` ile grafiği güncelle.

### İş Bitiminde Zorunlu Kapanış Adımları
1. İlgili birim/entegrasyon testlerini çalıştır (`$env:XFACTOR_TEST_RUNNER_FILES="..."` veya tam süit).
2. `npm run graph` komutunu çalıştırarak `graphify-out/` çıktılarını güncelle ve `test_graphify.js` + `test_p9_runner_inventory.js` testlerinin geçtiğini doğrula.
3. Mimari, davranış veya akış değiştiyse `README.md`, `kullanici-kilavuzu.md` ve ilgili `docs/faz-arsiv.md` kayıtlarını güncelle. Devralma gerekiyorsa `CLAUDE.md` içindeki kısa durum ve açık iş kaydını yenile.
4. Değişen dosyaları ve doğrulama/test yöntemini kullanıcıya özetle. Kullanıcı testleri durdurduysa test başlatma ve doğrulamanın kapsamını açıkça belirt.

## 5. Devralma — 5 Kasım 2026 röntgeni

Güncel durum, bulgular ve yol haritası [docs/rontgen-2026-11-05.md](docs/rontgen-2026-11-05.md) dosyasındadır. Oturuma başlamadan önce şu dört noktayı bil:

- **Faz 0 kapandı (5 Kasım):** 29 Ekim'den bu yana commit edilmemiş çalışma, [PR #3](https://github.com/sirrakadembasti/xfactor/pull/3) ile `main`'e alındı (merge `17bac2e`). Beş CI işinin hepsi yeşil: üç işletim sisteminde `local-worker`, `test` (backend, frontend, E2E, Docker worker) ve `production-image`. Bu, 29 Ekim'den beri ilk tamamen yeşil CI. PR sırasında düzeltilenler:
  - Üç bozuk test.
  - Takma adlı geçici dizin (macOS `/private/var`, Windows 8.3) için kanonik workspace tabanı. Bu hata yüzünden yerel worker macOS'ta hiç çalışamıyordu.
  - Kapsamsız worker izlenebilirliği artık `skipped`; backend otoriter kalıyor. Eskiden normal doğrulamalar hiç kabul edilemiyordu.
  - Ubuntu Chromium sandbox ayarı.
  - `npm audit`: backend patch yükseltmeleri, frontend vitest 4.1.12.
  - Dashboard E2E ve Docker tarayıcı testlerinin hizalanması.

  Ayrıntılar röntgen raporunun Faz 0 bölümünde. Ara commit'ler tek başına test geçmeyebilir; tam süit `17bac2e` üzerinde geçer.
- **Faz 1 kapandı (6 Kasım):** [PR #4](https://github.com/sirrakadembasti/xfactor/pull/4) `main`'e alındı (merge `70882b9`); beş CI işinin hepsi yeşildi. Yapılanlar:
  - Üretim `admin/xfactor` hesabını oluşturmuyor. Hiç yönetici yoksa ya da bir yönetici varsayılan parolayı kullanıyorsa açılmıyor (`auth.js:assertProductionAdminCredentials`). Kullanıcı kararıyla asgari parola uzunluğu 6'da kaldı.
  - İki geliştirme profili de her koşuda rastgele worker token'ı üretiyor.
  - Worker iş iptali `projectId` kapsamlı; yanıtlar JSON.
- **Faz 2 kapandı (7 Kasım):** [PR #5](https://github.com/sirrakadembasti/xfactor/pull/5) `main`'e alındı (merge `e348566`); beş CI işinin hepsi yeşildi. Migrasyon 18 eklendi ve canlı DB'ye uygulandı (önce `VACUUM INTO` yedeği alındı: `backend/data/maintenance-backups/pre-migration-18-*`). Değişiklikler:
  - Yetki yalnız `project_owners`'tan okunuyor; `owner_id` ve sahte `legacy-local-owner` kaldırıldı.
  - Durum ve rol alanlarına CHECK eklendi.
  - Attempt, koşu ve mesaj bağlantıları FK ile korunuyor.
  - Onarım kayıtları açık `origin` taşıyor (statik denetim artık `run_id`'ye attempt yazmıyor).
  - Ölü iki tablo kaldırıldı.

  Zaman biçimi birleştirme (V-4) kullanıcı kararıyla kapsam dışı. Yeni kural: `repair_issues` yazan her kod `origin` vermek zorunda; yeni bir durum değeri eklenecekse yeni bir migrasyon gerekir (`MIGRATION_18_VALUES` ile kod sabitlerinin uyumunu `test_schema_canonical_constraints.js` denetler).
- **Faz 3 (7 Kasım, `faz-3/api-sozlesmesi`, PR bekliyor):**
  - `releaseWorkflowLease` geçersiz terminal durumu reddediyor ve veritabanı hatalarını log'a yazıyor.
  - `executionClient` her worker isteğini 60 sn ile sınırlıyor (`WORKER_REQUEST_TIMEOUT`).
  - Gözlemlenebilirlik yanıt şekilleri `routes/observabilityShapes.js`'te tek kaynakta toplandı.
  - İstemcisiz dokuz uç, kullanıcı kararıyla kılavuzda iç ve teşhis API'si olarak belgelendi.
- **Yol haritası sırası:** Faz 0 ✅ (zemin: commit ayrıştırma ve kırık testler) → Faz 1 ✅ (güvenlik: üretimde varsayılan admin, sabit dev token) → Faz 2 ✅ (şema: sahiplik tek kaynak, CHECK/FK, migrasyon 18) → Faz 3 (API sözleşmesi) → Faz 4 (modül disiplini) → Faz 5 (stok-takip teslimi).
- **stok-takip-1:** sözleşme 3 onaylı; sözleşme 4 (30 Ekim) hâlâ `pending_approval`. Bu taslak onaylanırsa tam DAG üretimi yeniden tetiklenebilir. Devam etmeden önce taslak için kullanıcı kararı al.

## 5a. Devralma — 4 Kasım 2026

XFactor, Manager sohbetinden onaylı sözleşmeye ve tek dosyalık üretim görevlerine ilerler. Backend görev, checkpoint, paket ve kabul kayıtlarını yönetir. `execution/` bağımsız Worker ile kurulumu, derlemeyi, API'yi ve Chromium akışlarını sınar. Frontend, Manager, Kalite Paneli, DAG ve log ekranlarını sunar. Kabul, güncel kaynaklara bağlı zorunlu kanıt ve kalıcı teslim makbuzu gerektirir. Başlangıç noktaları `backend/engine/workflow.js`, `backend/verification/artifactVerifier.js`, `execution/server.js` ve `frontend/src/App.jsx`.

Son geliştirmeler aynı sözleşmede yeniden doğrulama, tek dosya hedefleriyle sınırlı onarım, bağımsız kanıt incelemesi ve canlı Worker ilerlemesi üzerinde yoğunlaştı. `backend/engine/controlledRepairs.js`, `controlledRepairLineage.js`, `controlledSemanticPlan.js` ve `backend/routes/projectRepairRoutes.js` onarım zincirini kurar. `frontend/src/components/DashboardView.jsx` ve `ExecutionProgress.jsx` geçmişi ve canlı komutları gösterir. `execution/browserRunner.cjs` rol girişinde geçici test parolası kullanır. `execution/registryProxy.js` eksik paket aktarımını kaydeder. Bu belge commit'i platform kaynak değişikliklerini kapsamıyor. Devralırken çalışma ağacını kontrol et.

**Açık iş:** `stok-takip-1` duraklatıldı, sözleşme 3 onaylı ve son iki test dosyası XFactor tarafından yazıldı. `7893b21a` koşusunda API, dört rol senaryosu ve sistem testi komutu geçti. Daha yeni `3269a25b` koşusu 21 PASS, 7 FAIL, 7 BLOCKED ile kapandı. `tests/test-helper.ts` gerçek servis türlerine uymadığı için TypeScript ve derleme başarısız, dolayısıyla güncel paket için API ve tarayıcı kanıtı oluşmadı. Gereksinim bağları ve Türkçe arayüz incelemesi açık. Ayrıntı [faz arşivinde](docs/faz-arsiv.md#halka-32--4-kasım-stok-takip-devralma-kaydı).

Kullanıcı yeniden yetki verdiğinde önce güncel koşu ve aktif Worker durumunu doğrula. Sözleşme 3 ve mevcut üretim kayıtlarını koruyarak yalnız XFactor'ın sınırlı onarım akışıyla test yardımcısının servis imzalarını düzelt. Üretilen proje dizinine elle girme veya kaynaklarını değiştirme. Ardından gerçek davranışa dayalı gereksinim bağlarını ve bağımsız Türkçe arayüz kanıtını tamamla. RootLayout için gerçek prerender, lint için gerçek React bileşenlerinde etkin ESLint kuralı gerekir. Güncel bağımsız koşu ve makbuz gelmeden teslim bildirimi yapma. Bu devirde hedef kullanıcı isteğiyle duraklatıldı ve yeni test çalıştırılmadı.
