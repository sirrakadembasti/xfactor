# XFactor Güncel İyileştirme Yol Haritası

> Durum: Yeni ve üstüne-geçen iyileştirme girişimi. Önceki P0–P4 kayıtları tarihsel kanıt olarak korunur; bu belge 2026-09-04 incelemesinde doğrulanan açıkları P5–P8 sırasıyla kapatır.

## Durum Anahtarı

- `[ ]` Bekliyor
- `[~]` Devam ediyor
- `[!]` Bloke
- `[x]` Davranış kanıtı, test ve review ile doğrulandı

## Yürütme Kuralları

1. Aynı anda yalnız bir teslim birimi aktiftir.
2. P5 doğrulanmadan P6, P6 doğrulanmadan P7, P7 doğrulanmadan P8 başlamaz.
3. Her davranış değişikliği TDD ile yürütülür: başarısız kanıt → minimal düzeltme → geçen kanıt.
4. Generated/LLM kaynaklı kod hiçbir koşulda host uygulama yetkisiyle çalıştırılmaz.
5. Mandatory gate için `SKIPPED`, `BLOCKED`, eksik runner veya eksik evidence hiçbir zaman PASS değildir.
6. `completed` ve artifact download yalnız canonical verification evidence ile yetkilendirilir.
7. DB testleri geçici `DB_PATH` ve `PROJECTS_ROOT` kullanır; `backend/data/projects.db` testlerde değiştirilmez.
8. Mevcut dirty worktree kullanıcı çalışmasıdır; üzerine yazılmaz ve ilgisiz değişiklikler commit edilmez.
9. Bir görev ancak dar test, ilgili regresyon süiti, davranış doğrulaması ve review sonrası `[x]` olur.
10. Plan dışı refactor yapılmaz.

## Başlangıç Bulguları

### Kritik

- Windows sandbox uygulanmamışken yerel ayar `XFACTOR_BUILD_SANDBOX=host`; generated build ve servis komutları host üzerinde çalışabiliyor.
- Frontend verified artifact yokken `/files` yanıtını JSZip ile paketleyerek doğrulama zincirini bypass ediyor.
- Artifact repository ham DB satırında `verification_run_id` döndürürken canonical completion akışı `verificationRunId` okuyor.
- `mfa_enabled=1` kullanıcılar login sırasında TOTP vermeden session alabiliyor.

### Yüksek

- Backend ZIP üretme/açma kodu `jszip` kullanıyor fakat paket yalnız frontend bağımlılığı.
- Production Dockerfile frontend build çıktısını kopyalıyor; Express static serving tanımlı değil.
- Startup disk sync, diskte görünmeyen projeleri transactionsız olarak DB’den silebiliyor.
- Sandbox adapterlarında CPU, RAM, PID ve disk limitleri yok.
- Docker servis portları loopback yerine varsayılan tüm host arayüzlerine yayınlanabiliyor.

### Orta ve düşük

- `/files` global dosya sayısı limiti recursive çağrılarda doğru uygulanmıyor.
- Binary dosyalar UTF-8 metin olarak okunuyor.
- Approve response persisted `implementing` yerine stale state döndürebiliyor.
- Generated README her stack için Prisma/NextAuth/port 3000 varsayıyor.
- `db.js`, `projectRepository.js`, disk sync ve state erişiminde çift doğruluk kaynakları var.
- SQLite `busy_timeout` ve açık durability politikası yok.
- `App.jsx`, `projectRoutes.js`, `workflow.js` ve `db.js` aşırı sorumluluk taşıyor.
- Frontend `uiError` ve `wsState` state’leri kullanıcıya görünmüyor.
- Request abort listener normal tamamlanmada temizlenmiyor.
- CI frontend unit testlerini ve root Playwright E2E testlerini çalıştırmıyor.
- `npm ci || npm install` lockfile fail-closed davranışını bozuyor.
- CSP `connect-src 'self' ws: wss:` gereğinden geniş.
- TOTP secret düz metin saklanıyor; username login zaman farkı enumeration riski taşıyor.
- Dependency CVE taraması ağ zaman aşımı nedeniyle doğrulanamadı.

---

## P5 — Kritik Güven Zinciri

**Amaç:** Generated kod yürütme, artifact indirme/completion ve MFA değişmezlerini fail-closed yapmak.

**Durum:** `[x] P5 davranış kanıtı, güvenlik review ve tüm Step 4 proje-geneli doğrulama kapılarıyla doğrulandı. Sonraki eylem yalnız P6 production-operability tasarım/planını hazırlamaktır.`

### P5.1 — Host execution sınırı

- [x] Generated proje için environment tabanlı host fallback yetkisini kaldır.
- [x] Sandbox capability yoksa komutu çalıştırmadan `BLOCKED` üret.
- [x] Unit testlerde yalnız dependency-injected fake adapter kullan.
- [x] Windows adapterın uygulanmamış capability durumunu fail-closed koru.
- [x] Host üzerinde yan etki oluşmadığını davranış testiyle kanıtla.

### P5.2 — Artifact ve completion zinciri

- [x] Artifact repository sınırında tek canonical model tanımla.
- [x] `verification_run_id` ↔ `verificationRunId` dönüşümünü repository içinde yap.
- [x] Başarılı clean-room verification sonrası aynı run ID ile artifact bağlantısını doğrula.
- [x] Completion receipt oluşturulmasını ve `completed` geçişini entegrasyon testiyle kanıtla.
- [x] Receipt’siz mevcut completed kayıtları otomatik değiştirme; reconciliation raporuna ayır.

### P5.3 — Verified-only download

- [x] Frontend client-side JSZip/FileSaver ZIP fallback’ini kaldır.
- [x] Verified artifact yoksa indirme kontrolünü kapat ve açık hata göster.
- [x] Artifact download URL’sini configured API base üzerinden üret.
- [x] Server download route’unda latest approved contract, artifact hash ve verification evidence kontrollerini koru.
- [x] Browser testinde doğrulanmamış projenin ZIP indiremeyeceğini kanıtla.
- [x] Browser testinde doğrulanmış artifact’ın doğru origin üzerinden indirildiğini kanıtla.

### P5.4 — MFA enforcement

- [x] `POST /api/login` payload’ına opsiyonel altı haneli `totp` ekle.
- [x] Password doğru ve MFA açıkken TOTP yoksa session üretmeden `202 { mfaRequired: true }` dön.
- [x] Geçersiz TOTP’de session/cookie üretme.
- [x] Geçerli TOTP’de session oluştur.
- [x] MFA kapalı kullanıcıların mevcut password-only login davranışını koru.
- [x] Logout ve account-state temizliğinde MFA ara state’ini temizle.

### P5 Çıkış Kapısı

- [x] P5 dar unit ve route integration testleri geçiyor.
- [x] Frontend unit testleri geçiyor.
- [x] İlgili backend regresyon süiti geçiyor.
- [x] Gerçek browser MFA ve verified-only download akışları geçiyor.
- [x] Generated komut sandbox yokken host üzerinde çalışmıyor.
- [x] Completion receipt aynı verification run ve artifact hash ile oluşuyor.
- [x] Bağımsız review blocking bulgu vermiyor.
- [x] Evidence kaydı gerçek komut, exit code ve sonuç içeriyor.

---

## P6 — Production Çalışabilirliği

**Bağımlılık:** P5 verified.

- [x] `jszip` sahipliğini backend package/lock dosyalarına taşı.
- [x] Archive ve safe extractor için frontend `node_modules` fallback’ini kaldır.
- [x] Tek-imaj veya ayrı frontend/backend deployment sözleşmesini kesinleştir.
- [x] Seçilen sözleşmeye göre frontend static serving veya ayrı web image uygula.
- [x] SPA route fallback ve cache header davranışını doğrula.
- [x] Docker build’de `npm ci` fail-closed kullan; `npm install` fallback’ini kaldır.
- [x] Backend/frontend standalone Dockerfile’larını aynı runtime/lock politikasıyla hizala.
- [x] Health/readiness ve production HTTPS/reverse-proxy senaryosunu smoke test et.
- [x] Production imajında artifact oluşturma, clean-room açma ve download akışını doğrula.

### P6 Çıkış Kapısı

- [x] Temiz production image build geçiyor.
- [x] UI, API, WebSocket ve artifact download seçilen deployment modelinde erişilebilir.
- [x] Backend ZIP işlemleri frontend dependencies olmadan çalışıyor.
- [x] Reproducible install doğrulandı.

---

## P7 — Veri ve Mimari Sağlamlaştırma

**Bağımlılık:** P6 verified.

- [x] Tek canonical project repository ve disk reconciliation servisi belirle.
- [x] Duplicate `syncProjectsWithDisk` ve legacy state erişim yollarını kaldır.
- [x] Startup sync’i transactionsız destructive delete yapmayacak biçimde değiştir.
- [x] Eksik/boş/unmounted root durumunu fail-closed ve non-destructive yap.
- [x] Orphan kayıtları otomatik silmek yerine quarantine/reconciliation raporuna taşı.
- [x] Completion receipt’li projeler için RESTRICT ve disk eksikliği senaryolarını test et.
- [x] SQLite `busy_timeout`, checkpoint ve durability politikasını tanımla.
- [x] `/files` global dosya/adet/byte limitlerini tek sayaçla uygula.
- [x] Binary dosyaları metin gibi okumayı bırak; açık encoding/content contract tanımla.
- [x] Approve response’u persisted current state’ten üret.
- [x] Generated README’yi gerçek stack ve service manifest üzerinden üret.
- [x] `projectRoutes.js`, `workflow.js`, `db.js` ve `App.jsx` için yalnız değişen sorumlulukları hedefli ayır.

### P7 Çıkış Kapısı

- [x] Startup/reconciliation hiçbir mount hatasında veri silmiyor.
- [x] Tek repository yolu tüm callsite’lar tarafından kullanılıyor.
- [x] Dosya API limitleri çok dizinli ve binary projelerde doğrulanıyor.
- [x] Concurrent DB yazma senaryoları deterministik sonuç veriyor.

---

## P8 — CI, Güvenlik Hardening ve Operasyon

**Bağımlılık:** P7 verified.

- [x] CI’a `frontend npm run test:unit` ekle.
- [x] CI’a root `npm run test:e2e` ekle.
- [x] Dependency audit için zaman aşımı ve kayıtlı sonuç politikası tanımla.
- [x] Sandbox’a CPU, RAM, PID, disk ve timeout limitleri ekle.
- [x] Windows için restricted-token/Job Object sandboxını uygula veya generated execution’ı izole Linux/Docker worker’a taşı.
- [x] Docker service portlarını loopback’e bağla.
- [x] Production CSP `connect-src` değerini beklenen originlerle sınırla.
- [x] TOTP secret at-rest encryption ve key rotation tasarımını uygula.
- [x] Username timing farkını dummy scrypt ile azalt.
- [x] Session cleanup ve revoke lifecycle operasyonunu zamanlanmış bakım işine bağla.
- [x] Frontend `uiError` ve WebSocket durumunu erişilebilir biçimde göster.
- [x] Abort listener cleanup uygula.
- [x] README ve kullanıcı kılavuzundaki MFA, sandbox, ZIP ve test iddialarını gerçek davranışla eşitle.
- [x] Tek-node sınırlarını ve horizontal scaling önkoşullarını operasyon dokümanına ekle.

### P8 Çıkış Kapısı

- [x] Backend, frontend unit ve browser E2E CI’da zorunlu.
- [x] Sandbox resource/network sınırları davranış testiyle kanıtlı.
- [x] Dokümantasyon ile runtime davranışı arasında bilinen çelişki yok.
- [x] Nihai security review blocking bulgu vermiyor.

---

```text
Roadmap P0–P8 is verified; perform no new source implementation until a new approved design/plan exists.
```
