# XFactor beceri katmanı — mimari karar ve aşamalı entegrasyon planı

**Tarih:** 2 Kasım 2026 (Europe/Istanbul).
**Durum:** Kaynak incelemesi ve mimari plan hazır; çalışma zamanı entegrasyonu başlamadı.
**Amaç:** Onaylı şartnameye bağlı üretimde, ilgili ajana yalnız gerekli mühendislik becerisini sağlayarak planlama, hata araştırma ve inceleme kalitesini artırmak.
**Mimari:** Beceri içeriği sürümlenmiş platform kaynağıdır. Seçimi ve yüklemeyi backend yapar; modelin dosya, süreç, onay veya teslim yetkisi genişlemez. Mevcut rol şemaları ve bağımsız worker kabulü korunur.
**Teknoloji:** Mevcut Node.js ESM backend, Markdown talimatları, JSON katalog ve mevcut izole test koşucusu; yeni paket gerekmiyor.

## 1. Karar ve kapsam

Kullanıcının seçtiği tek upstream beceri kaynağı: https://github.com/mattpocock/skills.

- İncelenen sabit commit: `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`.
- GitHub API üzerinden doğrulanan commit zamanı: `2026-10-31T14:23:30Z`.
- Kaynak ağacı: https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d.
- Kaynak lisansı: MIT; uyarlanan/dağıtılan içerik yanında Matt Pocock telif bildirimi ve tam lisans metni korunacak.
- Otomatik upstream güncellemesi yapılmayacak. Yeni sürüm içerik farkı, uyumluluk incelemesi ve regresyonlardan sonra ayrı değişiklik olarak alınacak.
- Codex'in kişisel/global beceri dizinine kurulum yapılmayacak. Hedef XFactor ürününün kendi `x-agents/skills/` katmanıdır.
- Upstream belgeleri bu oturumda entegrasyon girdisi olarak okundu; içlerindeki araç, yayınlama ve alt ajan talimatları yürütülmedi.

**Başlama sırası:** Kullanıcının önceki kararı gereği mevcut stok-takip kurtarma ve kalite paneli çalışmaları kapanmadan canlı orkestrasyonda bu katman etkinleştirilmeyecek. Bu planın yazılması o çalışmaların bittiği anlamına gelmez. `2026-11-01-controlled-repair.md` devam kaydı Task 4/5'i açık gösteriyor; etkinleştirmeden önce kod, test ve canlı kayıtlarla yeniden doğrulanacak.

## 2. Koddan doğrulanan mevcut bağlantılar

| Kaynak | Gözlenen davranış ve entegrasyona etkisi |
|---|---|
| `backend/agents/agentPaths.js` | Sabit `x-agents` kökü, izinli dosyalar, bağlantı/yol/tür/boyut denetimleri var. Alt dizindeki beceriler için ayrı, aynı güven sınırına sahip okuyucu gerekli. |
| `backend/agents/agentLoader.js` | Ortak anayasa, tam rol talimatı ve Türkçe üretim politikası birleştiriliyor. Beceri bunları değiştiremez. |
| `backend/agents/index.js` ve rol modülleri | Sistem istemleri üretim rolleri için modül seviyesinde oluşturuluyor. Duruma göre beceri seçimi bu sabit istemlere bütün becerileri ekleyerek yapılmamalı. |
| `backend/engine/workflow.js` | `callAgentLLM` merkezi bir çağrı yolu; ayrıca Director/Teamleader/Coder/Reviewer/Tester çağrı noktaları bulunuyor. Hepsinin kapsamı incelenip aynı seçim/iz politikasıyla bağlanmalı. |
| `backend/routes/projectRoutes.js` | Manager sohbeti sistem istemini ayrıca oluşturuyor. Normal üretim çağrısını bağlamak tek başına Manager entegrasyonu sayılmaz. |
| `backend/engine/controlledRepairs.js` | Sözleşme/kaynak özeti, yürütme kilidi, tek hedef ve kalıcı çağrı rezervasyonu sınırları var. Beceri bu izinleri veya bilinmeyen sonuçta yeniden deneme davranışını aşamaz. |
| `backend/tests/test_agent_document_boundary.js`, `test_docs_agent_sync.js` | Güvenilen dosya sınırı ve tam rol/anayasa bileşimi test ediliyor. Yeni okuyucu ve dinamik bileşim için bunlar genişletilmeli; fixture kopyaları yeni bağımlılıkları da içermeli. |

Bu inceleme çalışan uygulamanın sağlık veya teslim kabul testi değildir. Mevcut çalışma ağacı ana görevden kalan çok sayıda değişiklik içeriyor; bu yan çalışma mevcut dosyalara dokunmadan yalnız bu planı ekler.

## 3. Seçilen beceriler ve uyarlama kararları

Upstream yollar aşağıdaki sabit commit'e göredir; listelenen içerikler okunarak seçildi.

| Kaynak yolu (`skills/` altında) | XFactor kullanımı | Gerekli uyarlama |
|---|---|---|
| `engineering/diagnosing-bugs/SKILL.md` | Başarısız kontrol veya üretim sorununun teşhisi | Belirtiyi tekrarlama, küçültme, hipotez, kanıt, regresyon sırası korunur. Gerçek komutu backend/worker yürütür. Kanıt yoksa tanı doğrulanmış sayılmaz. |
| `engineering/code-review/SKILL.md` | Reviewer için şartname ve standart uyumu | İki inceleme ekseni korunur. Git komutu, issue tracker ve paralel alt ajan varsayımı kaldırılır; doğrulanmış kaynak farkını ve kabul ölçütlerini backend sağlar. |
| `engineering/tdd/SKILL.md` | Coder/Tester için davranış odaklı test tasarımı | Test sınırını son kullanıcıya teknik sorularla onaylatma yerine onaylı kabul akışları esas alınır. Gerçek kırmızı/yeşil döngü ancak worker yürütüyorsa kaydedilir. |
| `engineering/to-spec/SKILL.md` | Manager'ın konuşmadan şartname oluşturması | İş takip sistemine yayınlama kaldırılır. Mevcut sözleşme modeli tek otoritedir; ikinci bir bağımsız şartname durumu üretilmez. Yeni kapsam mevcut onay akışına girer. |
| `engineering/to-tickets/SKILL.md` | Director/Teamleader için bağımlı planlama | Kullanıcıya değer sağlayan dilimler üst seviye gruplardır; yürütülebilir her Coder görevi yine tek hedef dosyadır. İkinci ticket/DAG motoru kurulmaz. |
| `engineering/domain-modeling/SKILL.md` | Manager/Director için alan kavramları | Kullanıcının iş terimleri Türkçe netleştirilir. Teknik rol kimliği/sözleşme hash'i değiştirilmez. Model doğrudan sözlük/ADR yazmaz; çıktı backend'in izinli akışına gider. |

`skills/productivity/grilling/SKILL.md` ayrıca değerlendirildi: uzun ve teknik sorgulama ile alt ajan varsayımları nedeniyle ilk pakete alınmayacak. Manager yalnız sonucu etkileyen belirsizlikleri sade Türkçe soracak.

`implement`, `implement-spec`, `triage`, `setup-matt-pocock-skills`, `pr` ve benzeri süreç/araç becerileri ilk kapsam dışında. Mevcut orkestrasyon yerine ikinci bir orkestratör veya yayınlama sistemi kurulmayacak.

Upstream'de incelenen listede bağımsız bir teslim öncesi doğrulama becerisi yok. Bu ihtiyacı kaynakta varmış gibi göstermeyeceğiz: teşhis kapanış disiplini ve inceleme yaklaşımı, XFactor'a özgü bir `delivery-readiness` uyarlaması olarak mevcut worker kabulüne bağlanacak. Bu uyarlamanın kaynak ve yerel bölümleri açık ayrılacak.

## 4. Güven ve davranış sözleşmesi

- Öncelik: kod/şema/yetki denetimleri, onaylı proje sözleşmesi, platform politikası ve rolün çıktı şeması; beceri bunlara tabi yöntem talimatıdır.
- Beceri seçimi serbest model çıktısından veya proje dosyasından dosya yolu üretmez. Backend'in izinli rol/aşama kataloğundan yapılır.
- Manager kullanıcı ihtiyacını belirtir; uygun beceri ve kaynak içeriğini orkestrasyon seçer. Model kendi başına yeni beceri yükleyemez.
- Üretilen projenin Markdown'ı, telemetrisi veya dosya adları sistem talimatı olamaz.
- Modelin test tasarlaması/incelemesi ile gerçek worker sonucu ayrı kaydedilir. Üretilmiş bir test dosyası gerçek TDD kanıtı değildir.
- Aynı kaynak için önceki PASS, yeni kaynak için otomatik kabul sayılmaz. Kalite kapıları, kaynak/artefakt özetleri ve makbuz politikası korunur.
- Başlangıçta beceriler kapalıdır. Devam eden girişime politika sürümü değiştirilmez; yeni girişim kendi beceri içerik özetlerini sabitler. Eski checkpoint yeni beceriyle üretilmiş gibi etiketlenmez.
- Seçim tek başına ek LLM çağrısı veya yeni alt ajan üretmez. Gelecekte ek inceleme istenirse süre/maliyet sınırı ayrıca tanımlanır.
- Varsayılan sınır: çağrı başına en fazla iki beceri ve toplam 16 KiB UTF-8 beceri metni. Bunlar yeni tasarım sınırlarıdır, mevcut kod gerçeği değildir. Aşımda sessiz kesme yerine açık hata verilir.
- İlgisiz aşamada beceri verilmez. Etkin politika tarafından gerekli seçilen dosya eksik, değiştirilmiş veya geçersizse çağrı kapalı durur; sessiz geri dönüş yapılmaz.
- Son kullanıcıya sade Türkçe sonuç gösterilir; teknik beceri isimleri veya teşhis komutları bilmesi beklenmez.

## 5. Hedef dosya yapısı ve arayüzler

```text
x-agents/skills/
  README.md
  manifest.json
  LICENSE.mattpocock
  diagnosing-bugs/SKILL.md
  code-review/SKILL.md
  tdd/SKILL.md
  to-spec/SKILL.md
  to-tickets/SKILL.md
  domain-modeling/SKILL.md
  delivery-readiness/SKILL.md
backend/agents/skills/
  skillRegistry.js       # manifest şeması ve izinli tanımlar
  skillLoader.js         # güvenli okuma, dosya özeti, boyut denetimi
  skillPolicy.js         # rol/aşama -> deterministik beceri seçimi
  skillContext.js        # mevcut sistem istemine sınırlı beceri bileşimi
  skillAudit.js          # izinli metaveri projeksiyonu
```

Bağımlı upstream belgeleri (örneğin `tdd/tests.md`, `tdd/mocking.md`, `domain-modeling/GLOSSARY-FORMAT.md`, `ADR-FORMAT.md`) paketlenmeden önce aynı commit'ten okunmalı. Uyarlama bunlara atıf yapıyorsa dosyalar da hash/lisans ile paketlenmeli; kaldırıyorsa yerel beceri bütün talimatı kendi içinde içermeli. Kırık referans bırakılmayacak.

Önerilen yeni arayüzler (henüz uygulanmadı):

```js
// skillRegistry.js
validateSkillManifest(manifest); // geçersiz tanımda hata; geçerlide manifest
// skillPolicy.js
selectSkills({ enabled, role, stage, failureKind }); // izinli skillId[]
// skillLoader.js
loadSkill(skillId); // { id, version, sha256, sourceCommit, content }
// skillContext.js
composeSkillContext(basePrompt, skills); // değiştirilmemiş basePrompt + beceri metni
// skillAudit.js
projectSkillAudit({ attemptId, taskId, role, stage, skills, reasonCode });
// yalnız tanımlı kimlik/özet/neden alanları; ham prompt veya sır içermez
```

Manifest her beceri için yerel sürüm, kaynak repo/commit/yol, uyarlama notu, izinli rol/aşamalar ve **yerel uyarlanmış dosyanın** SHA-256 özetini içerecek. Kaynak commit ile yerel içerik özeti aynı şey değildir. Paket uygulamayla birlikte güvenilen operatör kaynağı olarak dağıtılır; içerik hash'i imza veya güvenlik sertifikası değildir.

Çağrı audit kaydı mevcut proje denetim/iş akışı altyapısına bağlanacak. Yeni tablo/şema bu planın gereği değildir; mevcut kalıcılık modelinin alan koruma, yeniden yükleme ve lease kuralları test edilmeden yeni alan eklenmeyecek.

## 6. Uygulama sırası ve doğrulama

### Aşama 0 — etkinleştirme önkoşulu

- [ ] Ana kurtarma/kalite paneli çalışmasının güncel kapanış kaydını, testlerini ve canlı sonucunu incele.
- [ ] Etkin workflow/worker işine dokunulmayacak uygulama noktası belirle. Buradaki plan ana görevi yürütme yetkisi değildir.
- [ ] Kod temelini yeniden kontrol et; bu plandaki bağlantılar değişmişse planı hizala.

### Aşama 1 — sürümlü, kapalı beceri paketi

**Oluşturulacak:** `x-agents/skills/` ağacı ve `backend/agents/skills/skillRegistry.js`, `skillLoader.js`.
**Test:** `backend/tests/test_skill_registry.js`, `test_skill_loader.js`; dosyaları mevcut `testInventory.js` listesine ekle.

- [ ] Önce geçersiz manifest, bilinmeyen kimlik, yol kaçışı, bağlantılı kök/ara dizin/dosya, büyük dosya, özet uyuşmazlığı ve kırık referans için başarısız testler yaz.
- [ ] Sabit kaynak sürümünden seçilmiş içerikleri Türkçe ve rol şemalarına uyumlu uyarlayıp lisans/kaynak kaydıyla paketle.
- [ ] Okuyucuyu sabit kök, izinli kimlik/yol ve boyut/hash denetimiyle uygula; başka proje dizinine düşmesin.
- [ ] Kapalı durumda mevcut istemin byte düzeyinde aynı kaldığını doğrula. Yeni dosyalar çalıştırılan istemlere kendiliğinden alınmasın.

**Kabul örneği:** `loadSkill('../manager')` hata verir; yerel içerik değişip manifest değişmediğinde çağrı başlamaz; paket eklendiğinde mevcut Manager yanıt yolu değişmez.

### Aşama 2 — teşhis ve inceleme pilotu

**Oluşturulacak:** `skillPolicy.js`, `skillContext.js`, `skillAudit.js`.
**Değiştirilecek:** mevcut kod yeniden incelendikten sonra `workflow.js` çağrı yolları ve Manager istem/çağrı noktası; mevcut dosyalara kapsamlı refactor yapılmaz.
**Test:** `test_skill_policy.js`, `test_skill_context.js`, `test_skill_integration.js` ve mevcut rol/anayasa testleri.

- [ ] Rol/aşama eşleşmesi, kapalı politika, seçimsiz normal sohbet, aynı becerinin iki kez eklenmesi, bütçe aşımı ve şema önceliğini test et.
- [ ] İlk pilotta yalnız hata teşhisine `diagnosing-bugs`, kaynak incelemesine `code-review` ver. Durum sorusu üretim/teşhis/model çağrısı başlatmasın.
- [ ] Seçimi bütün çağrı yollarında merkezi uygula; salt `callAgentLLM` bağlantısıyla yetinme. Çağrı başına içerik ve audit aynı seçimi temsil etsin.
- [ ] Audit'i proje/attempt/task ve kaynak beceri özetleriyle, sır veya ham prompt içermeden kalıcılaştır. Yeniden başlatmada aynı girişimin sürümünü koru.

**Kabul örneği:** Başarısız testin teşhis çağrısı tanımlı beceriyi içerir; normal “son durum nedir?” sorusu beceri veya ek ücretli çağrı üretmez. Reviewer şeması hâlâ mevcut parser tarafından doğrulanır.

### Aşama 3 — izole uçtan uca pilot

**Test:** `backend/tests/test_skill_workflow_simulation.js`; mevcut kontrollü onarım ve yeniden doğrulama regresyonları.

- [ ] İzole fixture'da gerçek belirtiyi yakalayan bir başarısız kontrol oluştur; sahte PASS kabul edilmesini ayrı negatif senaryoyla sına.
- [ ] Seçilen beceri, rol çıktısı, izinli tek dosya yazımı ve yeni worker doğrulamasının bağlantısını gözle.
- [ ] Kaynak değişiminde eski inceleme/PASS reddini, iptal/lease kaybını ve belirsiz çağrı sonucunun sessizce tekrar edilmemesini doğrula.
- [ ] Aynı fixture'ı beceri kapalı/açık karşılaştır. Yalnız prompt uzunluğu veya seçilen beceri sayısını kalite artışı kanıtı sayma; doğru teşhis, kapsam korunması ve gerçek kontrol sonucunu raporla.
- [ ] Ana süreci etkilemeden ayrı pilot tamamlanmadan canlı stok-takip girişimine politika ekleme.

### Aşama 4 — şartname ve görev izlenebilirliği

**Değiştirilecek:** `manager.md`, `director.md`, `teamleader.md`, ilgili istem oluşturucular ve mevcut sözleşme/görev doğrulayıcılarının çağrı bağlamları.
**Test:** `backend/tests/test_skill_spec_traceability.js`.

- [ ] `to-spec`, `to-tickets`, `domain-modeling` uyarlamalarını rol/aşama politikasıyla aç.
- [ ] Her kabul gereksiniminin plan/görev/kontrol bağlantısını mevcut kimliklerle taşı; bilinmeyen gereksinim veya bağlantı boşluğu kabul edilemesin.
- [ ] Kullanıcıya değer sağlayan dilimleri tek dosyalık yürütme görevlerine ayrıştır; döngü ve eksik bağımlılık mevcut DAG denetimlerinden geçsin.
- [ ] Yeni sözleşme onayı olmadan kapsam değişmediğini, eski sözleşme hash/checkpoint'lerinin yeniden etiketlenmediğini doğrula.

### Aşama 5 — test tasarlama ve teslim hazırlığı

**Değiştirilecek:** ilgili Coder/Tester istem bağlamları ve beceri politikası; kabul kuralları gevşetilmez.
**Test:** `backend/tests/test_skill_verification_boundary.js`.

- [ ] `tdd` becerisini davranış/kabul akışına dayalı test görevlerine ver. Sabit doğru döndüren veya yalnız mock başarıya dayanan testin yeterli kanıt sayılmamasını sına.
- [ ] Ayrı test/uygulama dosyaları gerektiren kırmızı/yeşil döngüyü bağımlı tek dosyalık görevler ve gerçek worker yürütmesiyle modelle; bunu yapmayan akışı “TDD tamamlandı” diye etiketleme.
- [ ] Yerel `delivery-readiness` uyarlamasını kaynak/artefakt/koşu bağlantısı ve açık engellerin incelenmesiyle sınırla. Model görüşü yeni doğrulama kaydı veya makbuz üretmesin.
- [ ] Eksik/blocked kontrol, yabancı kaynak özeti ve eski PASS durumunda teslimin kapalı kaldığını gerçek kabul fonksiyonları üzerinden doğrula.

### Aşama 6 — belgeler ve kontrollü etkinleştirme

**Değiştirilecek:** `x-agents/README.md`, `README.md`, `kullanici-kilavuzu.md`, `docs/faz-arsiv.md`; kod tamamlandıktan sonra Graphify çıktıları.

- [ ] Seçilmiş hedefli regresyonları ve değişen UI varsa frontend test/build'ini çalıştır. Backend testleri yalnız izole koşucuyla çalıştırılsın.
- [ ] Gerçek pilot sonucunu, mock/worker ayrımını, maliyet/süre etkisini ve kalan sınırlamaları kaydet.
- [ ] Kullanıcı kılavuzunda gündelik deneyimi anlat; beceri seçimi için teknik kullanıcı adımları ekleme.
- [ ] Etkin girişim yokken uygulama sürümünü yükle; yeni girişimde beceri politikasını sabitle. Geri alma yeni girişimler için kapatmayı sağlar, geçmiş audit'i değiştirmez.
- [ ] `npm run graph` ile haritayı üret; statik haritayı canlı başarı kanıtı sayma. Git commit/push ayrı kullanıcı talimatıyla ele alınır.

## 7. Test komutları

Yeni testler oluşturulup `testInventory.js` içine alındıktan sonra PowerShell'de:

```powershell
$env:XFACTOR_TEST_RUNNER_FILES = 'test_skill_registry.js,test_skill_loader.js,test_skill_policy.js,test_skill_context.js,test_skill_integration.js,test_skill_workflow_simulation.js,test_skill_spec_traceability.js,test_skill_verification_boundary.js'
try { npm --prefix backend test } finally { Remove-Item Env:\XFACTOR_TEST_RUNNER_FILES -ErrorAction SilentlyContinue }
```

Bu komut henüz çalıştırılmadı; listelenen yeni test dosyaları henüz oluşturulmadı. İş bitiş raporu gerçek çalışan testleri ve kapsamlarını ayrıca gösterecek. Native worker güven sorunu bu entegrasyonla çözülmüş sayılmaz; ilgili yardımcıyı yeniden oluşturan/çalıştıran testler bu iş için tetiklenmeyecek.

## 8. Bu yan çalışmanın teslimi

- [x] Kaynak repo, commit, lisans ve seçilen ana beceriler incelendi.
- [x] Mevcut ajan yükleme/çağrı yolları ile yetki sınırları karşılaştırıldı.
- [x] Mimari, uyarlama farkları, dosya sorumlulukları ve doğrulama sırası kaydedildi.
- [ ] Beceri dosyaları ve runtime entegrasyonu uygulanmadı.
- [ ] Pilot veya yeni test çalıştırılmadı; canlı uygulama/worker yeniden başlatılmadı.

Uygulama başlangıcında bu kayıt yeniden okunmalı; ana görevin mevcut durumu git başlığından veya bu tarihli plandan çıkarılmamalı.
