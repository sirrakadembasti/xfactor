# Docker'sız yerel worker uygulama planı

> **For agentic workers:** Use inline execution for coupled runtime changes; the independent packaging task and final review may use subagent-driven-development. Execute every authorized task without additional permission checkpoints. No automatic commit/push.

**Goal:** Node + npm + Playwright + Chromium ile yerel bağımsız worker'ın dependency hazırlama ve bütün uygulanabilir kalite kontrollerini Docker çağırmadan yürütmesi.

**Architecture:** Mevcut HTTP job protokolü, kimlik/hash bağları, JobStore, deadline ve backend kalite kontrolleri korunur. Yeni local runtime, sahip olduğu geçici workspace ve alt süreçleri yönetir; Docker runtime ayrı seçenek olarak kalır. Yerel runtime OS sandbox olarak sunulmaz; operatörün seçtiği `local-trusted` profili ve `osIsolation:false` readiness/kanıtlarda açık taşınır.

**Tech Stack:** Node 22.23.2, npm 10.9.8, mevcut Playwright Core 1.62.1, Chromium, JSZip 3.10.1; Windows/Linux/macOS platform paketleri.

## Global constraints

- Admin, auth ve varsayılan kullanıcı bilgileri değiştirilmez. Önceki kullanıcı değişiklikleri ve geçici kullanıcı dosyaları korunur.
- Yerel çalıştırma otomatik Docker fallback yapmaz. Üretilen job runtime, host path, tool binary veya izin politikasını seçemez.
- Yerel kod çalıştırma operatör tarafından `EXECUTION_WORKER_RUNTIME=local` ve `EXECUTION_WORKER_TRUST_LOCAL_CODE=1` ile seçilir. Yerel profil sadece loopback dinler; dağıtım launcher'ı bu profili açıkça gösterir.
- Sabit araç sürümleri ve gerçek çalıştırma readiness'i; eksik Chromium/npm/script/dependency açık engel, sahte PASS yok.
- Her işe ayrı workspace/HOME/cache/veritabanı; env allowlist, archive/path sınırları, stdout/stderr sınırı, deadline/abort ve süreç ağacı temizliği.
- Ağ ve filesystem kontrolleri host sandbox garantisi değildir. Mevcut mandatory kalite kapıları gevşetilmez; yerel güven profili kanıtlarda korunur.
- Linux/macOS desteği platform kodu ve CI matrisiyle sağlanır; bu Windows bilgisayarında test edilmeyen platform için fiili başarı iddiası yapılmaz.
- Mevcut checkout'taki önceki düzeltmeler bu çalışmanın girdisidir; ayrıştırılmamış eski değişiklikler commit edilmez.

## Task 1: Runtime profili ve yürütme yetkilendirmesi

Files: `execution/runtimeSelector.js`, `execution/server.js`, `backend/verification/sandboxRunner.js`, `execution/tests/localProfile.test.js`.

Interfaces: selector `executeJob(job, options)`, `probeRuntimeReadiness()`, local runtime `executeLocalJob(job, options)`, `probeLocalReadiness(options)`. Operatöre ait native adapter, mevcut guard tarafından gerçek OS izolasyonu olmayan açık yerel profil olarak kabul edilir; rastgele adapter capability iddiası kabul edilmez.

- [x] Önce sahte `isolation:false` adapter reddi, local opt-in gerekliliği, runtime seçim hatası ve readiness metadata testlerini yazıp eksik uygulama nedeniyle başarısız olduklarını gözle.
- [x] Default Docker davranışını koruyan selector ve markalı local adapter yetkilendirmesini ekle. Guard'da yalnızca kayıtlı yerel adapter kabul edilir; başka adapter'ın izolasyon zorunluluğu kaldırılmaz.
- [x] Testleri tekrar çalıştır; worker HTTP auth/protokol/readiness regresyonlarını doğrula.

## Task 2: Native workspace, arşiv ve süreç yürütücüsü

Files: `execution/localRuntime.js`, `execution/localProcesses.js`, `execution/localArchive.js`, `execution/tests/localRuntime.test.js`.

Interfaces: `createLocalAdapter({root, tools, deadline, signal})` returns execute/spawn/kill/writeFile/readFile/extractArchive/collectFiles/interact/dispose; `executeLocalJob(job, options)` owns directory lifecycle. Virtual `/workspace` is mapped only for protocol paths; verification uses real owned workspace. Native npm is invoked as Node + npm CLI, avoiding shell interpolation on Windows. POSIX uses owned process groups. Windows launches suspended processes into Job Objects with process/memory caps, kill-on-close, and an exact-parent-handle watchdog.

- [x] Gerçek komut testi: çıkış kodu/digest, sıfır test reddi, deadline/abort, ortamdan sentetik secret çıkartma, escape/symlink/Windows reserved path ve ZIP bombası reddi.
- [x] JSZip ile limitli, canonical metadata kontrollü extraction; package kaynak politikası; sabit araç çözümlemesi; sınırlı stdout/stderr; süreç ağacı ve sahip olunan dizin temizliği ekle.
- [x] Fake Docker executable'ın hiç çağrılmadığı native prepare/build senaryosu çalıştır. Başarı/hata/iptal sonrası çalışma dizini ve child process kalmadığını doğrula.

## Task 3: Bağımsız gerçek doğrulama ve kalite görünürlüğü

Files: `execution/jobExecutor.js`, `execution/browserRunner.cjs`, native browser entrypoint, `backend/verification/runChecks.js`, frontend kalite görünümü, local integration fixtures.

- [x] Gerçek HTTP prepare/verify fixture yaz: package/lock integrity, npm ci, gerçek Node build/test, SQLite read/write, manager/viewer login ve yetki, gerçek Chromium positive/negative yolculuk, metadata/hash bağları.
- [x] Envanter ve workspace yollarını host-native uyumlu yap; container/browser launch davranışını ayrı seç. Yerel browser trusted operator runner'dan çalışır; generated dependencies runner yerine geçmez.
- [x] Sonuçların ve kalite panelinin `local-trusted` / OS izolasyonu yok bilgisini gösterdiğini test et. Zorunlu test veya servis eksikse PASS oluşmadığını doğrula.
- [x] Gerçek browser ve job HTTP entegrasyonunu seri çalıştır; Docker kapalı kalır.

## Task 4: Paket, başlatma ve platform doğrulama

Files: `scripts/package-local-worker.mjs`, yerel setup/start araçları, package scripts, packaging testleri, CI matrisi, kullanıcı/operasyon belgeleri.

- [x] Paket tamlığı testini önce yaz: bundled Node/npm, Playwright/Chromium, gerekli execution/backend modülleri, sürüm/hash manifesti ve hedef platform launcher'ları.
- [x] Host platform için gerçek bağımsız dizin paketi üret; kaynak checkout'a veya global npm/Chromium'a bağımlı olmayan araç yollarıyla readiness ve gerçek job çalıştır.
- [x] Platforma özel paket üretimini Windows/Linux/macOS CI runner'larında yapılandır; browser libs eksikliğini fail-closed bildir. ARM/mimari destek yalnız test edilen release hedefinde ilan edilir.
- [x] Kullanıcı kılavuzuna kurulum, local-trusted sınırı, iptal ve sorun giderme ekle; Docker imajı build/run kontrolünün ayrı altyapı gerektirdiğini açıkla.

## Final acceptance

- [x] Native unit/integration + backend guard/quality + frontend ilgili testleri, CI sözleşmesi ve JS syntax/diff kontrolleri.
- [x] Dağıtılmış worker paketinden gerçek prepare/verify HTTP roundtrip ve browser testi.
- [x] Kalan süreç/workspace denetimi; bu çalışma admin/varsayılan kullanıcı bilgilerini değiştirmez, önceki değişiklikler korunur.
- [x] Bağımsız spec/code review; material bulgular giderilir. Test edilmeyen platform ve OS izolasyonu sınırı sonuçta açık belirtilir.
