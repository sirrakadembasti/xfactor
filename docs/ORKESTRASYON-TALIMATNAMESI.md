# 📜 Dosya-Bazlı Çok Katmanlı Ajan Orkestrasyonu — Master Talimatname (v4)

> Bu doküman, **XFactor Otonom AI Kod Üretim ve Yazılım Orkestrasyon Platformu**'nun çalışma prensiplerini, rol hiyerarşisini, dosya-bazlı koordinasyon protokolünü, deterministik DAG dalga motorunu ve çok katmanlı derleme/kalite kapılarını tanımlayan ana şartnamedir.
>
> **v4 Güncellemeleri:** 6 Katmanlı rol hiyerarşisi (`Manager → Director → Teamleader → Coder → Reviewer → Tester`), `Set` tabanlı katı eşzamanlılık havuzu (`runWithConcurrency`, limit: 2), fail-closed Reviewer veto kapısı, gerçek derleyici doğrulayıcısı (`buildValidator.js: tsc --noEmit, prisma validate, npm run build`), Coder 2 turlu otomatik onarım döngüsü ve tam bağlamlı **Project Manifest** QA mimarisi entegre edilmiştir.

---

## 0. Orkestrasyon Senaryosu ve Gerçek İş Akışı

```text
[Boss / Kullanıcı]
       │ Doğal Dilde İstek & Beyin Fırtınası (HTTP POST /api/projects/:id/chat)
       ▼
[Manager Rolü] ──────► manager/TALIMATNAME.md & Kök TODO.md (Domain Bölünmesi)
       │
       ▼ Kullanıcı Onayı (pending_approval -> running)
[Merkezi Orkestratör (workflow.js)]
       │
       ├─► [1. Director Katmanı] ──► <domain>.director/ALT-TALIMATNAME.md & GOREV.md
       │
       ├─► [2. Teamleader Katmanı] ► <tl>/TODO.md & Görev DAG'ı (Maks 1-2 Dosya Kuralı)
       │
       ├─► [3. DAG Dalga Yürütücüsü (Execution Waves - Concurrency: 2)]
       │     │
       │     ├──► [Coder] ──────► Modüler TypeScript/React/Express Kod Üretimi
       │     │
       │     └──► [Reviewer] ────► İteratif Kalite Kapısı (Maksimum 2 Tur Düzeltme)
       │                             ├── Red ──► Coder'a Hata Geri Bildirimiyle Tekrar
       │                             └── Veto ──► DURUM.md = BASARISIZ & Süreç Paused
       │
       ├─► [4. Çok Katmanlı Derleyici & Kalite Kapıları (Quality Gates)]
       │     ├── A. Deterministik Statik Denetim (JSON, Parantez Dengesi, Dosya Varlığı)
       │     ├── B. TypeScript Tip/Derleme Denetimi (npx tsc --noEmit / Semantic Type Check)
       │     ├── C. Prisma Şema Doğrulaması (npx prisma validate / Schema Linter)
       │     ├── D. Framework Sandbox Build (npm run build - node_modules varsa)
       │     │
       │     └── Hata Varsa ──► Coder Otomatik Onarım Döngüsü (Maksimum 2 Tur) ──► Revalidate
       │
       ├─► [5. Tester Manifest QA Kabulü]
       │     ├── Proje Manifestosu (Routes, Models, Schemas, Shared Types, Env Vars, Graph)
       │     └── Derleyici Sonuçları Karşılaştırması ──► RAPOR.md & README.md Üretimi
       │
       └─► [6. Tamamlanma & Yayın (status = 'completed')]
```

---

## 1. Temel İlke: "Agent = Klasör" Protokolü

1. **İzole Çalışma Alanı:** Her rol kendi klasöründe çalışır (`manager/`, `<domain>.director/`, `<tl>/`, `<task_id>/`).
2. **Dosya-Bazlı Ortak Hafıza:** Roller birbirleriyle kontrolsüz serbest metinle değil; diske yazılan standart Markdown protokol dosyaları (`GOREV.md`, `DURUM.md`, `TODO.md`, `RAPOR.md`, `TALIMATNAME.md`) üzerinden koordinasyon sağlar.
3. **Yetki Sınırı:** Bir rol yalnızca kendi klasörüne ve üst klasördeki kendi takip satırına yazabilir. Üst rol görev tanımını (`GOREV.md`) alt klasöre bırakır.

---

## 2. Rol Hiyerarşisi ve Sorumluluklar (6 Seviye)

### 2.1. Manager Rolü (Seviye 0 — Proje Mimarisi & Yönetim)
* **Konum:** `projects/<id>/manager/`
* **Girdi:** Kullanıcının doğal dildeki istekleri ve sohbet geçmişi.
* **Görevleri:**
  1. İstek analizi yapar, mimari şartnameyi (`manager/TALIMATNAME.md`) üretir.
  2. Projeyi bağımsız domainlere (`frontend`, `backend` vb.) ayırır.
  3. Prisma/SQLite projelerinde `.env` dosyasında `DATABASE_URL="file:./dev.db"` tanımının yer alacağını şartnameye bağlar.
  4. Her domain için `<domain>.director/` klasörü açar ve `GOREV.md` yazar.
  5. Canlı telemetriyi (`getProjectLogs`, `findFailedReports`) analiz ederek kullanıcıya durum bildirir.

### 2.2. Director Rolü (Seviye 1 — Domain Mimarisi & Standartlar)
* **Konum:** `projects/<id>/manager/<domain>.director/`
* **Girdi:** `manager/TALIMATNAME.md` ve domain `GOREV.md`.
* **Görevleri:**
  1. Domain mimarisini, onaylı teknoloji yığınını (`react-hook-form`, `sonner`, `zod`, `prisma` vb.) ve ortak sözleşme yollarını (`@/lib/prisma`, `@/lib/validations`) belirleyerek `ALT-TALIMATNAME.md` üretir.
  2. Kodlama başlamadan önce `package.json`, `tsconfig.json` ve `.env` dosyalarının diske kilitlenmesini sağlar.
  3. Altındaki Takım Liderlerini tanımlar ve klasörlerini açar.

### 2.3. Teamleader Rolü (Seviye 2 — DAG Görev Bölümü & Koordinasyon)
* **Konum:** `projects/<id>/manager/<domain>.director/<tl>/`
* **Girdi:** `ALT-TALIMATNAME.md` ve `GOREV.md`.
* **Görevleri:**
  1. Şartnameyi Coder'ın tek seferde bitirebileceği **atomik parçalara (DAG)** ayırır.
  2. **KRİTİK ATOMİK LİMİT:** LLM çıktı token sınırına takılmamak için her bir görevin `targetFiles` listesinde **EN FAZLA 1 veya 2 dosya** tanımlar.
  3. **Bileşen Ayrıştırma Zorunluluğu:** Büyük sayfaları tek blok yapmak yerine önce form/kart/filtre alt bileşenlerini ayrı görevlere böler; ardından ana sayfa sarmalayıcısını kodlatır.
  4. Her görev için `<task_id>/` klasörü açar, `GOREV.md` bırakır ve bağımlılıkları `TODO.md`'ye yazar.

### 2.4. Coder Rolü (Seviye 3 — Yaprak Geliştirici)
* **Konum:** `projects/<id>/manager/<domain>.director/<tl>/<task_id>/`
* **Girdi:** Görev tanımı `GOREV.md` ve paylaşılan `projectContext` (şemalar, tipler, route tanımları).
* **Görevleri:**
  1. Hedef dosyaları eksiksiz, TypeScript uyumlu ve modern standartlara göre kodlar.
  2. **Bileşen Kompozisyonu:** Önceden oluşturulmuş bileşenleri `@/components/...` üzerinden `import` ederek sayfayı kompoze eder.
  3. Kodları proje kök dizinine (`src/...`, `prisma/...`) ve kendi görev klasörüne yazar.

### 2.5. Reviewer Rolü (Seviye 4 — Iterative Quality Gate & Veto)
* **Girdi:** Coder'ın ürettiği dosyalar ve görev kabul kriterleri.
* **Görevleri:**
  1. Kodları syntax, eksik importlar, kapanmamış etiketler ve güvenlik açısından satır satır denetler.
  2. Hata varsa somut düzeltme talimatı (`feedback`) vererek Coder'a yeniden kodlatır (Maksimum 2 tur).
  3. **Fail-Closed Veto:** 2 turun sonunda kod standartlara uymazsa görevi veto eder (`approved: false`); süreç kontrollü durdurulur (`paused`).

### 2.6. Tester Rolü (Seviye 5 — QA & Kabul Doğrulaması)
* **Girdi:** Project Spec + Project Manifest + Statik Denetim + Compiler/Build Sonuçları.
* **Görevleri:**
  1. Proje manifestosunu (rotalar, modeller, şemalar, tipler, ortam değişkenleri, bağımlılık grafiği) kabul kriterleriyle karşılaştırır.
  2. Compiler ve tip denetimi sonuçlarını değerlendirerek nihai `RAPOR.md` ve son kullanıcıya yönelik temiz `README.md` dosyasını üretir.

---

## 3. Çok Katmanlı Kalite Kapıları ve Derleme Denetimi

```text
[Coder Görev Tamamlandı]
          ↓
[Reviewer İteratif Kalite Kapısı] ──(Red / Düzeltme)──► Coder Tekrar Kodlar (Maks 2 Tur)
          ↓ (Onaylandı)
[1. Statik Deterministik Denetim] (JSON Parse, Parantez Dengesi, Dosya Varlığı)
          ↓
[2. TypeScript Derleyici Kapısı] (npx tsc --noEmit / Semantic Type Validator)
          ↓
[3. Prisma Şema Kapısı] (npx prisma validate / Schema Linter)
          ↓
[4. Framework Build Kapısı] (npm run build - node_modules varsa)
          ↓
[Hata Varsa] ──────────────────────────► Coder Otomatik Onarım Çağrısı (Maks 2 Tur)
          ↓                                       ↓
[Hata Giderilemediyse]                   [Hata Giderildiyse]
          ↓                                       ↓
[DURUM.md = BASARISIZ]                   [Tester Manifest QA Kabulü]
[status = paused (Kilit)]                         ↓
                                         [RAPOR.md & README.md Üretimi]
                                                  ↓
                                         [status = completed]
```

---

## 4. Duraklatma, Devam Etme ve Hata Kurtarma (Recovery)

1. **Duraklatma (`Pause`):** Kullanıcı arayüzdeki `Duraklat` butonuna bastığında orkestratör aktif dalganın tamamlanmasını bekler ve süreci güvenli bir checkpoint anında dondurur.
2. **Kaldığı Yerden Devam (`Resume`):** Proje devam ettirildiğinde:
   * `isTaskCompleted()` kontrolü daha önce tamamlanmış ve Reviewer onayı almış görevleri diskten tanır ve atlar (`skip`).
   * Yalnızca eksik, yarım kalmış veya hata almış görevler yeniden yürütülür.
3. **Sunucu Yeniden Başlatma (Crash Recovery):** Backend yeniden başlatılsa dahi SQLite `workflow_state` ve diskteki `TODO.md` / `DURUM.md` dosyaları senkronize kalır; veri kaybı yaşanmaz.
