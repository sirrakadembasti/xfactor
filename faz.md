# XFactor: P0'dan P9'a Kadar Gerçekleştirilen Fazlar ve İşlemler

Bu doküman, XFactor mimarisinin **P0'dan P9'a** kadar geçirdiği tüm kalite, güvenlik, veri bütünlüğü, izolasyon ve operasyonel fazlarının özetini, teknik hedeflerini ve somut çıktılarını içerir.

---

## 📌 P0: State & Contract Safety, Sandbox ve Checkpoint Güvenliği
> **Hedef:** Hatalı/sahte "completed" üretimini tamamen durdurmak; durum geçişlerini ve sözleşmeleri güven altına almak.

### P0-A — State & Contract Safety
- **State Machine & CAS Projeksiyonu:** Proje durum geçişleri katı bir matrise (`stateMachine.js`) bağlandı. `planning -> pending_approval -> contract_approved -> implementing -> ... -> completed` durum akışı Compare-And-Swap (`expectedRevision`) ile kilitlendi.
- **Sürümlü Sözleşmeler:** Manager planları ham metin olmaktan çıkarılıp sürümlü sözleşme (`project_contracts`) yapısına geçirildi.
- **Kapasite ve Reddetme:** Desteklenmeyen stack/framework talepleri `capability_blocked` durumuna çekildi. Hatalı doğrulamalar için `verification_failed` ve onarım kayıtları (`repair_issues`) eklendi.
- **Kaba Checkpoint İptali:** Sözleşme revizyonunda eski checkpoint'ler geçersiz kılındı.

### P0-B — OS Sandbox & Fail-Closed Doğrulama
- **İzole Çalıştırma:** Üretilen kodların ana sistemde doğrudan çalıştırılması engellendi; komutlar sınırlandırılmış ortama çekildi.
- **Fail-Closed Prensibi:** Doğrulama aracı veya sandbox erişilemez olduğunda sistem "başarılı" sayılmayıp doğrudan `BLOCKED`/`FAILED` durumuna geçti.

### P0-C — Selective Checkpoint Safety
- **Seçici Geri Yükleme:** Görev ve dosya bağımlılıklarına dayalı güvenli checkpoint saklama ve geri yükleme mekanizması kuruldu.

---

## 📌 P1: Sözleşme, Çalışma Zamanı ve Artefakt Doğrulaması
> **Hedef:** Kod üretimi, gereksinim izlenebilirliği ve teslim edilecek ZIP arşivinin bağımsız doğrulanması.

### P1-A — Contract & Requirement Traceability
- **Gereksinim Eşleme:** Sözleşmedeki gereksinimlerin kod blokları ve üretilen dosyalarla (`requirement_file_links`, `requirement_check_links`) 1:1 izlenebilirliği sağlandı.

### P1-B — Runtime, API ve Browser Verifier
- **Canlı Doğrulayıcılar:** Servis ayağa kalkma (`processVerifier`), API uç noktaları (`apiVerifier`) ve Chromium/Playwright tabanlı tarayıcı yolculuğu (`browserVerifier`) kontrolleri gerçek zamanlı işletildi.

### P1-C — ZIP Artifact Clean-Room Validation
- **Temiz Oda İncelemesi:** Üretilen ZIP arşivi dışarıdan izole bir dizine açılarak tam bağımsız test, derleme ve sağlama doğrulamasına tabi tutuldu.

---

## 📌 P2: Kalite ve Şablon Sertleştirme (Hardening)
> **Hedef:** Kod iskeletleri, domain modelleri ve güvenlik zafiyetlerinin önceden tespiti.

- **Domain/Skeleton Güvenliği:** Backend ve frontend için standart, güvenli mimari şablonlar tanımlandı.
- **Statik Kontroller:** Placeholder (`TODO`, stub) ve hassas veri bulaşması (`contamination_check`) denetimleri zorunlu kılındı.
- **README Doğrulaması:** Üretilen projenin README dokümanındaki kurulum adımlarının gerçekten çalışıp çalışmadığı (`readmeVerifier`) test edildi.

---

## 📌 P3: Gözlemlenebilirlik, Dashboard ve Metrikler
> **Hedef:** Denetim geçmişi, kalite panelleri ve metriklerin kullanıcıya şeffaf sunumu.

- **Kanıt Paneli (Quality Panel):** Tamamlanan tüm doğrulama kapılarının çıktıları, exit kodları ve özetleri kullanıcı arayüzüne taşındı.
- **Audit History & Logs:** Görev ve ajan bazlı olaylar `project_logs` tablosunda sıralı ve izlenebilir hale getirildi.
- **DAG Flow Görselleştirme:** Canlı DAG grafik akışı frontend üzerinde hiyerarşik olarak görselleştirildi.

---

## 📌 P4: Production Safety & Fail-Closed Execution
> **Hedef:** Üretim ortamında güvenli çalışma, 18 zorunlu doğrulama kapısı ve değiştirilemez makbuzlar.

- **18 Zorunlu Doğrulama Kapısı (Mandatory Gates):** `package_json`, `lockfile`, `clean_install`, `typecheck`, `framework_build`, `api_contract`, `browser_journey`, vb. kapıların tamamı `PASS` olmadan projenin `completed` olması yasaklandı.
- **Değiştirilemez Tamamlanma Makbuzu (`completion_receipts`):** SQL trigger seviyesinde UPDATE ve DELETE işlemleri engellenen, doğrulama çalıştırmasına ve artefakt SHA-256 özetine bağlı kesin teslim makbuzu oluşturuldu.
- **İndirme Güvenliği:** Doğrulanmamış veya makbuzu bulunmayan projelerin artefakt indirme talepleri `409 Conflict` ile engellendi.

---

## 📌 P5: Critical Trust Chain & MFA Güvenliği
> **Hedef:** Güven zincirinin kırılmaz hale getirilmesi ve kimlik doğrulama güvenliği.

- **Kritik Güven Zinciri:** Sözleşme onayı -> Kod üretimi -> Bağımsız Doğrulama -> Makbuz Üretimi adımları birbirine kriptografik özetlerle bağlandı.
- **TOTP / MFA Desteği:** Çok faktörlü kimlik doğrulama (MFA) altyapısı, güvenli oturum çerezleri ve yetkilendirme katmanı eklendi.

---

## 📌 P6: Production Operability & Docker İzolasyonu
> **Hedef:** Konteyner ortamında çalışabilirlik, ortam ayrımı ve operasyonel hazır oluş.

- **Container İmajı & Caddy Proxy:** Production imajları hazırlandı, HTTPS sonlandırma ve yerel ters vekil sunucu entegrasyonu sağlandı.
- **Sahte Başarıların Temizlenmesi:** Testlerdeki konteyner seed mock'ları üretim kanıtı olmaktan çıkarıldı.

---

## 📌 P7: Veri Mimarisi ve Çökme Dayanıklılığı (Durability)
> **Hedef:** SQLite WAL dayanıklılığı, disk senkronizasyonu ve yetkisiz silme koruması.

- **WAL Checkpoint:** SQLite üzerinde `WAL` journal modu, `PRAGMA synchronous = NORMAL` ve kontrollü `wal_checkpoint` mekanizması işletildi.
- **Tahribatsız Disk Senkronizasyonu (Reconciliation):** Disk üzerinde elle eklenen veya silinen klasörler için veritabanının sessizce kayıt silmesi engellendi; bilinmeyen klasörler izole edildi.
- **Delete Protection:** Doğrulanmış teslim makbuzuna (`completion_receipts`) sahip projelerin silinmesi veritabanı seviyesinde `RESTRICT` ile korumaya alındı.

---

## 📌 P8: Güvenlik Sertleştirmesi, CI ve Operasyonel Sınırlar
> **Hedef:** Sandbox kaynak kısıtları, ağ sınırları ve CI sözleşmesi.

- **Kaynak Limitleri:** Süreçler için bellek (1 GB), CPU (2 çekirdek), PID (100) ve zaman aşımı limitleri getirildi.
- **Ağ İzolasyonu:** Yükleme aşamasında yalnız yetkili HTTPS registry proxy izni; derleme ve servis testlerinde tamamen internetsiz (egress deny) ağ politikası uygulandı.
- **CI Pipeline:** GitHub Actions üzerinde otomatik güvenlik denetimleri ve test suite doğrulamaları entegre edildi.

---

## 📌 P9: İzole Çalıştırma, Denetim İyileştirmeleri ve Tam Ayrık Mimari
> **Hedef:** R01–R24 güvenlik denetim bulgularının tamamen giderilmesi, Web ve Worker süreçlerinin fiziksel olarak ayrılması.

1. **İzole Execution Worker (Tasks 1, 2, 3):**
   - Web Orchestrator'dan Docker soketi ve daemon yetkileri tamamen alındı.
   - Bağımsız, kimlik doğrulamalı (Bearer token) private bir `execution/server.js` işçisi kuruldu.
   - Komut çalıştırma ve paket doğrulama ana sunucudan çıkarılıp bu işçiye devredildi.
2. **Binary-Safe Artefakt İncelemesi (Tasks 4, 5):**
   - ZIP bomb, aşırı dosya sayısı, sıkıştırma oranı limitleri ve dosya yolu kaçırma (`../`, CR/LF enjeksiyonu) kontrolleri `safeExtractor.js` ile güvenli hale getirildi.
   - DAG spesifikasyon özetleri (`planHash`, `taskSpecHash`) ile bağımlılık çakışmaları çözüldü.
3. **Lease Fencing & Yarış Durumu Koruması (Task 6):**
   - Çoklu process ve sunucu yeniden başlatma senaryolarında kilit çalınmasını engellemek için `heartbeat_epoch` tabanlı atomik kiralama (`workflow_attempts`) getirildi.
   - Eski işçilerin gecikmiş yazma girişimleri veritabanı seviyesinde reddedildi.
4. **Kimlik & Tarayıcı Güvenliği (Tasks 7, 8, 9):**
   - **Session Revocation:** Şifre değişimi ve sıfırlamada tüm aktif oturumlar ve WebSocket bağlantıları anında sonlandırıldı; concurrent TOTP replay açığı giderildi.
   - **Local Monaco Editor:** Monaco Editor'ın CDN/harici kaynak bağımlılığı kaldırıldı; tüm ESM worker'lar (TS, HTML, CSS, JSON) yerel Vite derlemesine dahil edildi. Katı `Content-Security-Policy` uygulandı.
   - **Frontend Async Fencing:** Projeler arası hızlı geçişlerde ve çıkış yapıldığında eski projeye ait asenkron isteklerin, WebSocket mesajlarının ve düşünme animasyonunun yeni projeyi kirletmesi engellendi.
5. **Kanonik Veritabanı Yaşam Döngüsü & Kurtarılabilir Silme (Task 10):**
   - `db.js` import anındaki kontrolsüz dosya oluşturma ve migration çalıştırma yan etkilerinden arındırıldı; `initializeDatabase()` ve `closeDatabase()` ile açık yaşam döngüsü kuruldu.
   - Proje silme işlemleri `project_deletion_intents` tablosu ile atomik ve çökme durumunda geri alınabilir (`.trash`) hale getirildi.
6. **Operasyonlar, Yedekleme ve Bounded Shutdown (Task 11):**
   - Tüm test süitleri (113 adet) kategorize edildi; runner başlangıç hataları fail-closed yapıldı.
   - Global DNS müdahalesi kaldırıldı, yerel OS çözümleyicisine dönüldü.
   - SQLite + projeler + artefaktları kapsayan, SHA-256 ve makbuz onaylı `backup.js` ve `restore.js` CLI araçları yazıldı.
   - Kapatma anında yeni işleri reddeden, WebSocket'leri ve DB'yi kontrollü kapatan `lifecycle.js` koordinatörü devreye alındı.
7. **Deterministik Üretim Kanıtı (Task 12):**
   - `scripts/test-p9-production-pipeline.mjs` ile Web API ve Execution Worker arasındaki deterministik entegrasyon kanıtlandı; sahte başarılar temizlenip `implementation-evidence/P9.md` dokümanı oluşturuldu.
