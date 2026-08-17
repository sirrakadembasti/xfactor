# Dosya-Bazlı Çok Katmanlı Ajan Orkestrasyonu — Talimatname (v2)

> Bu doküman, Claude Code'a (veya benzer bir ajan tabanlı kod asistanına) verilmek üzere hazırlanmıştır. Amaç: CrewAI tarzı bir hiyerarşik iş bölüşümünü, **"agent'lar klasörlerde yaşar"** ilkesiyle, tamamen dosya-bazlı bir koordinasyon protokolüyle kurmak.
>
> **v2 değişiklikleri:** manager ile teamleader arasına **director.agent** katmanı eklendi; **coder.agent artık kesin bir yaprak (leaf)** — altında recursive alt-coder yok. Hiyerarşi artık sabit 4 seviye: `manager → director → teamleader → coder`.

---

## 0. Senaryo (özet)

1. **Boss** (kullanıcı), istediği uygulamayı doğal dille tarif eder.
2. **manager.agent**, isteği anlamak için beyin fırtınası yapar, eksikleri makul varsayımlarla tamamlar, bunu bir **uygulama talimatnamesine** (`TALIMATNAME.md`) dönüştürür.
3. manager.agent, projeyi ihtiyaç duyduğu kadar **domaine** böler (örn. frontend, backend — sabit liste değil, projeye göre değişir) ve her domain için **ön-isimli bir director.agent** oluşturur: `frontend.director.agent`, `backend.director.agent` gibi. Her director'a kendi adıyla anılan bir klasör açar (`frontend.director/`, `backend.director/`) ve içine `GOREV.md` yazar.
4. **director.agent**, kendi klasöründeki `GOREV.md`'yi okuyup kendi **alt talimatnamesini** (`ALT-TALIMATNAME.md`) ve kendi **TODO yönetim şablonunu** oluşturur. İhtiyaç duyduğu sayıda (**varsayılan: 1**) teamleader klasörü açar — bu klasör **kendi adıyla aynı ön isimle** anılır (örn. `frontend.director/frontend.teamleader/`).
5. **teamleader.agent**, kendi klasöründeki görevi coder.agent'ların bitirebileceği **atomik parçalara böler**, her biri için `gorev-<isim>/` klasörü açar ve devreder.
6. **coder.agent**, kendisine gelen görevi **doğrudan uygular** — daha fazla bölmez, altında başka bir ajan yoktur. Görev gerçekten atomik değilse kendi bölmeye kalkışmaz, üste (teamleader'a) bildirir.
7. Tamamlanan işler kendi talimat dosyasında işaretlenir, üst ajana dosya üzerinden bildirilir; bu zincir manager.agent'a kadar yukarı toplanır.

---

## 1. Temel İlke: "Agent = Klasör"

- Her ajanın **yetki alanı** = kendi klasörü + altındaki her şey.
- Bir ajan **kendi klasörünün dışına doğrudan yazamaz** — üst klasöre yalnızca kendi adına ayrılmış satırı/işareti güncelleyebilir.
- Ajanlar birbirleriyle **doğal dille değil, dosyalarla konuşur.** Neden: Claude Code'da her subagent kendi izole context penceresinde çalışır, birbirinin konuşma geçmişini görmez. Dosya sistemi, bu mimaride ajanlar arası **tek gerçek ortak hafızadır.**
- Bir klasörü kim açtıysa (üst ajan), o klasörün içine görev tanımını (`GOREV.md`) yerleştirmekle yükümlüdür.

---

## 2. Hiyerarşi ve Roller (sabit 4 seviye)

```
Seviye 0: manager.agent      (manager/ klasörü ve proje kökü)
Seviye 1: director.agent     (<prefix>.director/     — örn. frontend.director/)
Seviye 2: teamleader.agent   (<prefix>.teamleader/   — director'ın kendi klasörü içinde)
Seviye 3: coder.agent        (task-<isim>/ veya gorev-<isim>/ — YAPRAK, daha altı yok)
Seviye 4: reviewer & tester  (Quality Gate, RAPOR.md ve README.md üretimi)

### 2.1 Boss (kullanıcı)
- Serbest metinle isteğini bildirir.
- manager.agent'ın sorduğu (varsa, tek ve net) soruyu yanıtlar.
- Proje bitince manager.agent'tan konsolide raporu alır.

### 2.2 manager.agent (proje kökü)
- Girdi: Boss'un doğal dil isteği.
- Görevi:
  1. Beyin fırtınası yapar, eksik bilgiyi makul varsayımlarla tamamlar; kritik ve varsayılamayacak bir belirsizlik varsa **en fazla bir** soru sorar.
  2. `manager/` klasöründe ve proje kökünde `TALIMATNAME.md`, `TODO.md`, `DURUM.md`, `GOREV.md` üretir (uygulama şartnamesi).
  3. Projeyi ihtiyaç duyduğu kadar domaine böler (**sabit bir liste değildir** — projeye göre "frontend/backend", "mobil/backend/altyapı", "veri-hattı/api/arayüz" vb. olabilir).
  4. Her domain için **ön-isimli bir director.agent** tanımlar (örn. `frontend.director.agent`) ve kendi adıyla anılan bir klasör açar (`frontend.director/`), içine `GOREV.md` yazar.
  5. Kök `TODO.md`'de her director'ı bir satır olarak izler.
  6. Task tool ile her `director-agent`'ı, hangi ön-isimle ve hangi klasörde çalışacağını açıkça belirterek devreye alır (bağımsız domainleri paralel başlatabilir).
  7. Tüm director'ların `DURUM.md`'sini periyodik izler, `BLOKE` olanlara öncelik verir.
  8. Hepsi `TAMAMLANDI` olunca Tester kabul raporunu (`RAPOR.md`) ve çalıştırma rehberini (`README.md`) yazar, Boss'a sunar.
  9. Boss ile sohbet ederken projenin anlık durumundan (`state.status`) ve tamamlanan işlerden haberdar olarak yanıt verir.
- **Asla kod yazmaz, domain içi işi de bölmez** — domain içi bölme director.agent'ın işidir.
### 2.3 director.agent (her `<prefix>.director/` klasöründe bir tane)
- Girdi: kendi klasöründeki `GOREV.md` (manager.agent'tan gelen domain görevi) + kök `TALIMATNAME.md`.
- Görevi:
  1. Kendi domaini için **`ALT-TALIMATNAME.md`** üretir: bu domainin tasarımı/mimarisi, kapsamı, teknik kararları — `GOREV.md`'nin detaylandırılmış hali.
  2. Kendi **`TODO.md`**'sini (todo yönetim şablonu) oluşturur — altındaki teamleader(ler)i izlemek için.
  3. İhtiyaç duyduğu sayıda teamleader klasörü açar. **Varsayılan: 1.** Bu klasör, director ile **aynı ön-isimle** anılır (örn. `frontend.director/frontend.teamleader/`). Domain gerçekten büyükse birden fazla teamleader açılabilir; bu durumda her biri aynı ön-ismi taşır ama ayırt edici bir ek alır (örn. `backend-api.teamleader/`, `backend-veri.teamleader/`).
  4. Her teamleader klasörüne, `ALT-TALIMATNAME.md`'den türetilmiş kendi kendine yeterli bir `GOREV.md` yazar.
  5. Task tool ile ilgili `teamleader-agent`(ler)i devreye alır.
  6. Altındaki teamleader(ler)in `DURUM.md`'sini izler, `BLOKE` olanlara öncelik verir (gerekirse soruyu manager.agent'a taşır).
  7. Tamamlanınca kendi `RAPOR.md`'sini yazar, kendi `DURUM.md`'sini `TAMAMLANDI` yapar.
- **Kod yazmaz, coder.agent için doğrudan `gorev-*/` klasörü açmaz** — bu teamleader'ın işidir. director yalnızca teamleader seviyesini yönetir.

### 2.4 teamleader.agent (her `<prefix>.teamleader/` klasöründe bir tane, director'ın altında)
- Girdi: kendi klasöründeki `GOREV.md` (director.agent'tan gelen).
- Görevi: (bkz. Talimatname §6, atomiklik kriteri — **artık coder.agent'a inmeden önceki tek bölme katmanı burasıdır, bu yüzden özenli olunmalı**)
  1. Görevi, coder.agent'ın **tek oturumda, daha fazla bölünmeye gerek kalmadan** bitirebileceği atomik parçalara böler.
  2. Her atomik parça için `gorev-<isim>/` klasörü açar, kendi kendine yeterli bir `GOREV.md` yazar.
  3. Kendi `TODO.md`'sini bağımlılıklarla birlikte doldurur.
  4. Task tool ile coder.agent'ları devreye alır (bağımsız görevleri paralel başlatabilir).
  5. `DURUM.md`'leri izler. Bir coder.agent "bu görev atomik değil" diye `BLOKE` bildirirse, teamleader o `gorev-*/` klasörünü **birden fazla `gorev-*/` klasörüne yeniden böler** (coder'a bölme yaptırmaz — bölme yetkisi teamleader'dadır).
  6. Tüm alt görevler tamamlanınca kendi `RAPOR.md`'sini yazar, `DURUM.md`'sini `TAMAMLANDI` yapar.
- **Kod yazmaz.**

### 2.5 coder.agent (her `gorev-<isim>/` klasöründe bir tane — **YAPRAK, altında başka ajan yok**)
- Girdi: kendi klasöründeki `GOREV.md`.
- Görevi:
  1. Görevi **doğrudan uygular**: kodu yazar/düzenler, mümkünse test eder.
  2. `RAPOR.md`'yi doldurur (ne yapıldı, hangi dosyalar değişti, test durumu, bilinen sınırlamalar).
  3. Kendi `DURUM.md`'sini `TAMAMLANDI` yapar.
  4. Üst klasördeki (`teamleader`) `TODO.md`'de **yalnızca kendi satırını** işaretler.
- **Emniyet supabı:** İşe başladıktan sonra görevin aslında atomik olmadığını fark ederse (çok büyük, birden fazla bağımsız parçaya ayrılması gerekiyor), **kendi altına klasör açıp bölmez** — bunun yerine `DURUM.md`'yi `BLOKE` yapar, nedenini ve önerdiği bölünmeyi yazar, teamleader'ın müdahalesini bekler. Küçük/geri alınabilir belirsizliklerde makul varsayım yapıp `RAPOR.md`'ye not düşerek devam edebilir.

---

## 3. Klasör / Dosya Yapısı (örnek)

```
proje-kok/
├── CLAUDE.md
├── TALIMATNAME.md                        ← manager.agent üretir
├── TODO.md                               ← manager.agent'ın director listesi
├── DURUM.md
├── RAPOR.md
│
├── frontend.director/
│   ├── GOREV.md                           ← manager.agent → director.agent
│   ├── ALT-TALIMATNAME.md                 ← director.agent'ın kendi alt şartnamesi
│   ├── TODO.md                            ← director.agent'ın teamleader listesi
│   ├── DURUM.md
│   ├── RAPOR.md
│   │
│   └── frontend.teamleader/               ← director ile aynı ön-isim (varsayılan: 1 adet)
│       ├── GOREV.md                        ← director.agent → teamleader.agent
│       ├── TODO.md                         ← teamleader.agent'ın coder listesi
│       ├── DURUM.md
│       ├── RAPOR.md
│       │
│       ├── gorev-liste-gorunumu/
│       │   ├── GOREV.md                     ← teamleader.agent → coder.agent
│       │   ├── DURUM.md
│       │   └── RAPOR.md                     ← coder.agent tamamladı, yaprak
│       │
│       └── gorev-ekleme-formu/
│           ├── GOREV.md
│           ├── DURUM.md
│           └── RAPOR.md
│
└── backend.director/
    ├── GOREV.md
    ├── ALT-TALIMATNAME.md
    ├── TODO.md
    ├── DURUM.md
    ├── RAPOR.md
    └── backend.teamleader/
        ├── GOREV.md
        ├── TODO.md
        ├── DURUM.md
        ├── RAPOR.md
        ├── gorev-veri-modeli/
        │   ├── GOREV.md
        │   ├── DURUM.md
        │   └── RAPOR.md
        └── gorev-api-crud/
            ├── GOREV.md
            ├── DURUM.md
            └── RAPOR.md
```

**Not:** Derinlik artık sabittir (4 seviye) — recursion yoktur, bu yüzden eski tasarımdaki "sonsuz bölünme" riski yapısal olarak ortadan kalkmıştır. Tek dikkat noktası: teamleader.agent, coder.agent'a **gerçekten atomik** görevler vermekle yükümlüdür, çünkü coder'ın kendisi artık bölme yapamaz.

---

## 4. Dosya Şablonları

`sablonlar/` klasöründe ayrı dosyalar olarak da verildi: `GOREV.md`, `TODO.md`, `DURUM.md`, `RAPOR.md`, `ALT-TALIMATNAME.md`. Kısa özet:

- **`GOREV.md`** — üstten gelen görev tanımı: amaç, kapsam/kapsam dışı, teknik kısıtlar, bağımlılıklar, kabul kriterleri, **seviye** (0=manager, 1=director, 2=teamleader, 3=coder/yaprak).
- **`ALT-TALIMATNAME.md`** — yalnızca director.agent seviyesinde: domainin kendi şartnamesi (tasarım/mimari kararları, teamleader bölünme tablosu).
- **`TODO.md`** — bir ajanın kendi altına böldüğü liste: tablo + checkbox, atanan alt klasör, bağımlılık, durum.
- **`DURUM.md`** — canlı özet: durum etiketi (`BEKLEMEDE / DEVAM_EDIYOR / BLOKE / TAMAMLANDI`), ilerleme, varsa blok nedeni.
- **`RAPOR.md`** — tamamlanma raporu.

### 4.1 `TALIMATNAME.md` (yalnızca proje kökünde, manager.agent üretir)

```markdown
# Uygulama Talimatnamesi

## 1. Özet
<Boss'un ne istediğinin 2-3 cümlelik özeti>

## 2. Yapılan Varsayımlar
- ...

## 3. Kapsam
- ...

## 4. Kapsam Dışı
- ...

## 5. Teknoloji / Mimari Kararları
- ...

## 6. Domain / Director Bölünmesi
| Domain | Director | Klasör | Sorumluluk | Bağımlılık |
|---|---|---|---|---|
| Arayüz | frontend.director.agent | frontend.director/ | UI, kullanıcı akışı | backend (API sözleşmesi) |
| Sunucu | backend.director.agent | backend.director/ | API, veri modeli | — |

## 7. Kabul Kriterleri (proje geneli)
- [ ] ...
```

---

## 5. İş Akışı — Adım Adım

1. **Boss → manager.agent:** doğal dil istek.
2. **manager.agent:** brainstorm → `TALIMATNAME.md` → domain sayısı ve ön-isimleri belirle → her domain için `<prefix>.director/` aç + `GOREV.md` yaz → kök `TODO.md`'yi doldur → her `director-agent`'ı devreye al.
3. **director.agent (paralel, her domain için):** `GOREV.md`'yi oku → `ALT-TALIMATNAME.md` üret → `TODO.md`'yi oluştur → (varsayılan 1, gerekirse daha fazla) `<prefix>.teamleader/` klasörü aç + `GOREV.md` yaz → `teamleader-agent`'ı devreye al.
4. **teamleader.agent:** `GOREV.md`'yi oku → atomik parçalara böl → her `gorev-*/` için `GOREV.md` yaz → `TODO.md`'yi doldur → `coder-agent`'ları devreye al (paralel, bağımsız olanlar).
5. **coder.agent:** görevi doğrudan uygula → `RAPOR.md` + `DURUM.md=TAMAMLANDI` → üst `TODO.md`'de kendi satırını işaretle. (Atomik değilse: `BLOKE`, teamleader'dan yeniden bölme ister.)
6. **Yukarı toplanma:** teamleader → tüm `gorev-*/` tamamlanınca kendi `RAPOR.md`'si + `TAMAMLANDI`. director → tüm teamleader(ler) tamamlanınca kendi `RAPOR.md`'si + `TAMAMLANDI`. manager → tüm director'lar tamamlanınca kök `RAPOR.md`'yi yazar, Boss'a sunar.

---

## 6. "Atomik Görev" Kriteri (teamleader → coder sınırında uygulanır)

teamleader.agent bir görevi coder.agent'a **atomik** olarak vermelidir; bunun kriterleri:

- İş, **tek bir odaklı oturumda** bitirilebiliyorsa,
- Genellikle **~1-5 dosyayı** ilgilendiriyorsa (kesin sayı değil, kılavuzdur),
- Tek bir bağımsız modül/bileşen/uç nokta/fonksiyon grubu ile sınırlıysa,
- Kabul kriterleri net ve doğrudan test edilebilirse.

**Bu kriter artık kritik önemdedir** çünkü coder.agent bu sınırı aşan bir görevi kendi bölemez — teamleader.agent'ın önceden doğru boyutlandırması gerekir. Coder bir görevi büyük bulursa (emniyet supabı, §2.5) teamleader'a geri bildirir; teamleader görevi daha küçük `gorev-*/` klasörlerine yeniden böler.

---

## 7. Bloke Olma / Soru Sorma Protokolü

Bir ajan devam edemiyorsa (belirsiz gereksinim, çelişkili talimat, eksik bilgi/erişim, ya da coder için "görev atomik değil"):

1. Kendi `DURUM.md`'sini `BLOKE` yapar, blok nedenini ve **üst ajana yönelik net soruyu/talebi** yazar.
2. Küçük/geri alınabilir belirsizliklerde makul varsayım yapıp devam edebilir (varsayımı `RAPOR.md`'ye not düşerek); geri dönüşü zor kararlarda beklemelidir.
3. Üst ajan, alt klasörleri tararken `BLOKE` durumundakileri önceliklendirir; gerekirse soruyu bir üste taşır (zincir Boss'a kadar çıkabilir).
4. Bloke, "başarısızlık" değil, bilinçli bir eskalasyon mekanizmasıdır.

---

## 8. Bunu Gerçek Claude Code Üzerinde Kurmak

### 8.1 İki katman

- **Katman 1 — Rol tanımları (yeniden kullanılabilir):** `.claude/agents/manager.md`, `director.md`, `teamleader.md`, `coder.md`. Bunlar Claude Code'un subagent formatındadır (YAML frontmatter: `name`, `description`, `tools`) ve *rolün genel olarak nasıl davranacağını* tanımlar.
- **Katman 2 — Görev çalışma alanı (proje-özel):** yukarıdaki klasör ağacı. Buradaki dosyalar *ne yapılacağını ve hangi ön-isimle* tanımlar.

### 8.2 Director'ların "ön isimle anılması" — pratik uygulama

İki yol var:

- **Basit (önerilen varsayılan):** `.claude/agents/director.md` **tek, genel bir şablon** olarak kalır. manager.agent, Task tool ile bu şablonu çağırırken görev talimatının içine ön-ismi ve çalışma klasörünü açıkça yazar: *"Sen `frontend.director.agent`'sın. Çalışma klasörün: `frontend.director/`. Önce oradaki `GOREV.md`'yi oku."* Ön-isim, kimlik olarak klasör adında ve görev metninde yaşar; ayrı bir dosya gerekmez.
- **Gelişmiş (isteğe bağlı):** manager.agent, her domain için gerçekten ayrı, isimle çağrılabilir bir subagent dosyası üretmek isterse, `Write` aracıyla dinamik olarak `.claude/agents/frontend.director.md`, `.claude/agents/backend.director.md` gibi dosyalar oluşturabilir (temel `director.md` içeriğini kopyalayıp `name:` alanını değiştirerek). Bu, daha fazla kurulum karmaşıklığı getirir; çoğu proje için basit yol yeterlidir.

Aynı mantık `teamleader.agent` için de geçerlidir (`frontend.teamleader`, `backend.teamleader` vb.).

### 8.3 Delegasyon mekanizması

Her seviye, bir alttakini **Task tool** ile devreye alır. Bağımsız/paralel çalışabilecek dallar (örn. iki farklı domain, ya da bir teamleader altındaki birbirine bağımlı olmayan `gorev-*/` görevleri) aynı anda paralel başlatılabilir.

### 8.4 Eşzamanlılık / dosya çakışması

Bir klasörün `TODO.md` / `DURUM.md`'sini **yalnızca o klasörü açan ajan** (üst ajan) düzenler; doğrudan altındaki ajanlar yalnızca **kendi satırları için** günceller. Böylece paralel çalışan ajanlar arasında çakışma oluşmaz.

---

## 9. Uçtan Uca Mini Örnek

Boss: *"Basit bir yapılacaklar listesi (todo) web uygulaması istiyorum."*

1. manager.agent → `TALIMATNAME.md`: kapsam = ekleme/silme/tamamlama işaretleme, tek kullanıcılı, local storage yeterli. İki domain: `frontend.director/`, `backend.director/`.
2. `frontend.director/GOREV.md`: "Liste görünümü, ekleme formu, tamamlanmış öğe stili." → `frontend.director.agent`, `ALT-TALIMATNAME.md`'sini yazar, tek bir `frontend.teamleader/` açar.
3. `frontend.teamleader/`, işi ikiye böler: `gorev-liste-gorunumu/`, `gorev-ekleme-formu/` → iki coder.agent, paralel çalışır.
4. `backend.director/GOREV.md`: "Veri modeli + local storage senkronu + CRUD fonksiyonları." → `backend.director.agent`, tek bir `backend.teamleader/` açar.
5. `backend.teamleader/`, işi üçe böler: `gorev-veri-modeli/`, `gorev-storage/`, `gorev-crud/` (crud, diğer ikisine bağımlı) → coder.agent'lar sırayla/paralel çalışır.
6. Her coder.agent `RAPOR.md`'sini yazar; teamleader → director → manager zincirinde yukarı toplanır; manager.agent kök `RAPOR.md`'yi yazıp Boss'a sunar.

---

## 10. Riskler ve Öneriler (özet)

| Risk | Önlem |
|---|---|
| teamleader, coder'a atomik olmayan görev verir | §6 kriteri + coder'ın `BLOKE` emniyet supabı (coder kendi bölmez, teamleader yeniden böler) |
| Ajanlar arası bağlam kaybı | Tüm iletişim dosya üzerinden; her `GOREV.md` kendi kendine yeterli olmalı |
| Dosya çakışması | Her ajan yalnızca kendi klasörüne ve üst `TODO.md`'de kendi satırına yazar |
| Yüksek token/maliyet | Paralel subagent kullanımını gerekliyle sınırlı tutun |
| director sayısı gereksiz artar | manager.agent yalnızca gerçekten bağımsız/anlamlı domainler için director açmalı (tipik: 2-4) |
| Kalitesiz/entegre olmayan çıktı | İsteğe bağlı: teamleader seviyesine bir "entegrasyon" görevi (`gorev-entegrasyon/`) veya ayrı bir `reviewer.agent` eklenebilir — bu talimatnamede temel senaryoya dahil edilmedi, istenirse eklenir |

---

*Katman 1 (`.claude/agents/*.md`) ve şablon dosyaları (`sablonlar/`) ayrı dosyalar olarak birlikte verildi; doğrudan bir proje köküne kopyalayıp kullanabilirsiniz.*
