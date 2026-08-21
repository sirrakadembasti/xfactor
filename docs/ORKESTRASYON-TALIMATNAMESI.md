# 📜 Dosya-Bazlı Çok Katmanlı Ajan Orkestrasyonu — Master Talimatname (v3)

> Bu doküman, **XFactor Otonom AI Ajan Orkestrasyon Platformu**'nun (`msitarzewski/agency-agents` + `coleam00/Archon DAG`) çalışma prensiplerini, ajan hiyerarşisini, dosya-bazlı koordinasyon protokolünü ve deterministik kalite kapısını tanımlayan ana şartnamedir.
>
> **v3 Güncellemeleri:** 6 Katmanlı tam ajan hiyerarşisi (`Manager → Director → Teamleader → Coder → Reviewer → Tester`), paralel DAG dalga yürütme motoru (`Execution Waves`), Reviewer fail-closed veto kapısı, Tester deterministik şema doğrulaması ve otomatik `.env` (`DATABASE_URL`) Scaffold Guard entegre edilmiştir.

---

## 0. Orkestrasyon Senaryosu (Özet Akış)

```text
[Boss / Kullanıcı]
       │ Doğal Dilde İstek & Beyin Fırtınası
       ▼
[Manager Agent] ───► manager/TALIMATNAME.md & Kök TODO.md (Domain Bölünmesi)
       │
       ▼ Domain Görevi Devri
[Director Agent] ──► <domain>.director/ALT-TALIMATNAME.md & Director TODO.md
       │
       ▼ Alt Şartname Devri
[Teamleader Agent] ► <tl>/TODO.md & Görev DAG'ı (Atomik 1-2 Dosya Kuralı)
       │
       ▼ DAG Dalga İcrası (Execution Waves - Paralel Havuz)
[Coder Agent] ──────► Çok Dosyalı Kod Üretimi & Bileşen Kompozisyonu
       │
       ▼ Kod İnceleme & Geri Bildirim Döngüsü (Max 2 Tur)
[Reviewer Agent] ───► Kalite Kapısı Onayı / Fail-Closed VETO
       │
       ▼ Tüm Görevler Tamamlandığında Konsolide Kabul
[Tester Agent] ─────► Deterministik Şema/Sentaks Denetimi, RAPOR.md & README.md
       │
       ▼ Scaffold Guard
[Proje İskeleti] ───► Güncel Bağımlılıklar (Next.js, Prisma, Tailwind) & .env Dosyası
```

---

## 1. Temel İlke: "Agent = Klasör" Protokolü

1. **İzole Çalışma Alanı:** Her ajan kendi klasöründe yaşar (`manager/`, `<domain>.director/`, `<tl>.teamleader/`, `<task_id>/`).
2. **Dosya-Bazlı Ortak Hafıza:** Ajanlar birbirleriyle doğal dil konuşma geçmişiyle değil; diske yazılan standart Markdown dosyaları (`GOREV.md`, `DURUM.md`, `TODO.md`, `RAPOR.md`, `TALIMATNAME.md`) üzerinden haberleşir.
3. **Yetki Sınırı:** Bir ajan yalnızca kendi klasörüne ve üst klasördeki kendi takip satırına yazabilir. Üst ajan görev tanımını (`GOREV.md`) alt klasöre bırakır.

---

## 2. Ajan Hiyerarşisi ve Uzmanlaşmış Roller (6 Seviye)

### 2.1. Manager Agent (Seviye 0 — Proje Mimarisi & Yönetim)
* **Konum:** `projects/<id>/manager/`
* **Girdi:** Boss'un doğal dildeki istekleri ve sohbet geçmişi.
  1. İstek analizi yapar, varsayımları belirler ve `manager/TALIMATNAME.md` şartnamesini üretir.
  2. Projeyi bağımsız domainlere (`frontend`, `backend` vb.) ayırır.
  3. Prisma/SQLite projelerinde `.env` dosyasında `DATABASE_URL="file:./dev.db"` tanımının yer alacağını şartnameye bağlar.
  4. Her domain için `<domain>.director/` klasörü açar ve `GOREV.md` yazar.
  5. **Telemetri, İç Muhakeme & Canlı Bildirim:** Canlı logları, DAG grafiğini ve alt ajanların `RAPOR.md` veto/hata kayıtlarını tam yetkiyle analiz eder; proje tamamlandığında veya duraklatıldığında sohbet kanalına otomatik resmi bildirim bırakır.
* **Kısıt:** Asla doğrudan kod yazmaz.
* **Girdi:** `manager/TALIMATNAME.md` ve domain `GOREV.md`.
* **Görevleri:**
  1. Domain mimarisini, kütüphane tercihlerini (Zod, Prisma, Tailwind vb.) belirler ve `ALT-TALIMATNAME.md` üretir.
  2. Altındaki Teamleader'ı tanımlar ve `manager/<domain>.director/<tl>/` klasörünü açar.
* **Kısıt:** Doğrudan coder görevi açmaz; teamleader katmanını yönetir.

### 2.3. Teamleader Agent (Seviye 2 — DAG Görev Bölümü & Koordinasyon)
* **Konum:** `projects/<id>/manager/<domain>.director/<tl>/`
* **Girdi:** `ALT-TALIMATNAME.md` ve `GOREV.md`.
  1. Şartnameyi Coder ajanlarının tek seferde bitirebileceği **atomik parçalara (DAG)** ayırır.
  2. **KRİTİK ATOMİK LİMİT:** LLM çıktı token sınırına takılmamak için her bir görevin `targetFiles` listesinde **EN FAZLA 1 veya 2 dosya** tanımlar.
  3. **Bileşen Ayrıştırma Zorunluluğu:** `page.tsx` gibi büyük UI sayfalarını tek blok yapmak yerine, önce form/kart/filtre alt bileşenlerini ayrı görevler olarak dağıtır; ardından `page.tsx` sarmalayıcısını kodlatır.
  4. Her görev için `<task_id>/` klasörü açar, `GOREV.md` bırakır ve DAG önkoşullarını `TODO.md`'ye yazar.
### 2.4. Coder Agent (Seviye 3 — Yaprak Geliştirici)
* **Konum:** `projects/<id>/manager/<domain>.director/<tl>/<task_id>/`
* **Girdi:** Görev tanımı `GOREV.md` ve paylaşılan `projectContext` (şemalar, tipler, route tanımları).
  1. Hedef dosyaları eksiksiz, TypeScript uyumlu ve modern standartlara göre kodlar.
  2. **BİLEŞEN KOMPOZİSYONU:** Sayfa (`page.tsx`) yazarken form/tablo/modal gibi alt bileşenleri sayfa içine monolitik gömmek yerine, önceden oluşturulmuş bileşenleri `@/components/...` üzerinden `import` ederek kompoze eder.
  3. **EKSİKSİZ KOD ÜRETİMİ:** Kodları yarım kesmeden, tüm import ve JSX kapanışlarıyla baştan sona eksiksiz üretir.
  4. Kodları proje kök dizinine (`src/...`, `prisma/...`) ve kendi klasörüne yazar.
### 2.5. Reviewer Agent (Seviye 4 — Iterative Quality Gate & Veto)
* **Girdi:** Coder'ın ürettiği dosyalar ve görev kabul kriterleri.
* **Görevleri:**
  1. Kodları syntax, eksik importlar, kapanmamış etiketler ve güvenlik açısından satır satır denetler.
  2. Hata varsa somut düzeltme talimatı (`feedback`) vererek Coder'a yeniden kodlatır (Maksimum 2 tur).
  3. **Fail-Closed Veto:** 2 turun sonunda kod standartlara uymazsa görevi veto eder (`approved: false`); süreç kontrollü durdurulur (`paused`), bozuk proje tamamlandı sayılmaz.

### 2.6. Tester Agent (Seviye 5 — QA & Kabul Doğrulaması)
* **Girdi:** Tüm üretilen proje dosyaları ve `TALIMATNAME.md`.
* **Görevleri:**
  1. **Deterministik Denetim:** `stripStringsAndComments` ile sözdizimi doğrulaması, `schema.prisma` modelleri ile API rotaları arasındaki model adı tutarlılığı denetimini yapar.
  2. **Otomatik Onarım (Auto-Repair):** Deterministik hata bulunursa Coder'a otomatik onarım görevi gönderir.
  3. **Temiz & Kapsamlı README ve Kabul Raporu:** Proje köküne nihai `RAPOR.md` raporunu yazar; `README.md` dosyasını ise iç orkestrasyon/ajan jargonu barındırmayan, son kullanıcıya yönelik profesyonel bir yazılım dokümanı olarak (özellikler, modeller, sayfalar, `.env` ve çalıştırma adımları) üretir.

## 3. Güncel Dizin ve Dosya Mimarisi

```text
xfactor/
├── docs/                                  # 📚 CANLI AJAN BEYİNLERİ & TALİMATNAMELER
│   ├── ORKESTRASYON-TALIMATNAMESI.md      # Ana Orkestrasyon Master Kılavuzu
│   ├── KULLANIM-KILAVUZU.md               # A'dan Z'ye Kullanıcı ve Operasyon Kılavuzu
│   ├── manager.md                         # Manager Ajan Promptu & Kuralları
│   ├── director.md                        # Director Ajan Promptu & Kuralları
│   ├── teamleader.md                      # Teamleader Ajan Promptu & Kuralları
│   ├── coder.md                           # Coder Ajan Promptu & Kuralları
│   ├── reviewer.md                        # Reviewer Kalite Kapısı Promptu
│   └── tester.md                          # Tester Deterministik QA Promptu
│
├── backend/
│   ├── agents/                            # Ajan Fabrikası ve Şema Ayrıştırıcılar
│   │   ├── agentLoader.js                 # docs/*.md dosyalarını canlı yükleyen köprü
│   │   ├── schemas.js                     # JSON Truncation Repair & Validatörler
│   │   └── index.js                       # Merkezi Ajan Kayıt Defteri (Registry)
│   ├── engine/                            # Orkestrasyon Çekirdeği
│   │   ├── dag.js                         # Topolojik Sıralama & Execution Waves (Dalgalar)
│   │   ├── workflow.js                    # Concurrency Pool (Max 2) & Veto Kontrolcüsü
│   │   ├── fileProtocol.js                # Agent=Klasör & Checkpoint Dosya Denetimi
│   │   ├── codeGenerator.js               # Dinamik Scaffold Guard (.env, Next, Vite, Express)
│   │   └── selfCorrection.js              # Reviewer-Coder 2 Turlu Döngü Motoru
│   ├── routes/                            # Modüler Express Rotaları (auth, projects)
│   ├── tests/                             # 📁 TÜM TEST SÜİTLERİ (70 Test)
│   │   ├── test_runner.js                 # Master Test Koşucusu (npm test)
│   │   ├── test_backend.js                # Güvenlik, Scrypt, JWT, RateLimit
│   │   ├── test_quality_gate.js           # Prisma & Kalite Kapısı Testleri
│   │   ├── test_deep_verification.js      # DAG & Execution Waves Testleri
│   │   ├── test_tur2_edge_cases.js        # Döngü Stresi & RBAC Testleri
│   │   ├── test_runtime_verification.js   # Sentaks & Checkpoint Testleri
│   │   └── test_e2e_simulation.js         # Uçtan Uca Otonom Pipeline Testi
│   ├── server.js                          # Express & WebSocket Sunucusu
│   └── package.json
│
├── frontend/                              # React 18 + Vite + Tailwind Panel
│   ├── src/
│   │   ├── components/                    # Sidebar, Header, ChatView, DAGFlowView, IDEView
│   │   └── App.jsx                        # Ana Koordinatör & WebSocket Canlı İstemcisi
│   └── package.json
│
└── projects/                              # 📁 ÜRETİLEN GERÇEK PROJELER
    └── <proje_id>/
        ├── manager/                       # Canlı Protokol Dosyaları
        ├── src/                           # Üretilen Temiz Kaynak Kodlar
        ├── prisma/                        # schema.prisma & seed.ts
        ├── .env & .env.example            # Otomatik DATABASE_URL="file:./dev.db"
        ├── package.json                   # Modern Bağımlılıklar (Next 14.2+, React 18.3+, Prisma 5.22+)
        ├── RAPOR.md                       # Tester Nihai Kabul Raporu
        └── README.md                      # Kurulum ve Çalıştırma Kılavuzu
```

---

## 4. Eşzamanlılık ve DAG Dalga Motoru (Execution Waves)

* **Seviyelendirme:** Bağımsız görevler `TaskDAG.getExecutionWaves()` ile seviyelere ayrılır (Dalga 0, Dalga 1, Dalga n).
* **Worker Pool:** Her dalga içindeki görevler `CONCURRENCY_LIMIT = 2` havuzunda paralel çalıştırılır; LLM 429 rate-limit hataları engellenir.
* **Atomik Dosya Birleştirme (Wave Reduce):** Görev çıktıları dalga sonunda `generatedProjectFiles` listesine atomik olarak birleştirilir; yarış durumları (race condition) engellenir.

---

## 5. Checkpoint & Stateful Recovery Kuralları

1. **Çift Katmanlı Doğrulama:** Bir görevin `[SKIP]` edilmesi için hem `RAPOR.md` varlığı, hem `DURUM.md`'nin `TAMAMLANDI` olması, hem de `targetFiles` dosyalarının diskte fiziksel olarak **`size > 0` byte** olması şarttır.
2. **Hata İzolasyonu:** `DURUM.md` dosyasında `BASARISIZ` veya `REDDEDILDI` kaydı olan görevler asla atlanmaz; tekrar çalıştırılır.
3. **SQLite State Kalıcılığı:** Sunucu kapansa dahi hafıza durumu `workflow_state` sütunundan eksiksiz geri yüklenir.

---

## 6. Proje Dışa Aktarma & ZIP Paketleme Kuralları

1. **İç Yönetim Klasörlerinin Elenmesi:** ZIP paketinde iç ajan yönetim klasörleri (`manager/`, `*.director/`, `DURUM.md`, `TODO.md`, `GOREV.md`, `ALT-TALIMATNAME.md`) elenerek temiz kaynak kod paketi oluşturulur.
2. **Çalıştırılabilirlik Güvencesi (.env Kuralı):** `.env` (`DATABASE_URL="file:./dev.db"`), `.env.example` ve `.gitignore` dosyaları asla filtrelenemez; ZIP paketine ve IDE dosya ağacına eksiksiz dahil edilir. Böylece indirilen proje `npx prisma db push` ve `npm run dev` ile sıfır kurulum maliyetiyle anında çalışır.
