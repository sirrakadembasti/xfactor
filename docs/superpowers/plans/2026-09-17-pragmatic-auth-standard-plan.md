# SDD Plan: Üretilen Uygulamalar İçin Sade ve Standart Güvenlik (Pragmatic Auth Standard)

## Context & Global Constraints
- Proje: XFactor Otonom AI Yazılım Platformu
- KESİNLİKLE `projects/` altındaki mevcut proje kod dosyalarına dokunulmayacak!
- Yalnızca platform çekirdeği (`backend/engine/`, `backend/verification/`, `docs/`, `backend/contracts/`) üzerinde geliştirmeler yapılacak.
- 18 kalite kapısı ve fail-closed güvenlik kuralları korunacak.
- Mevcut test süitleri (`backend/tests/test_runner.js` ve frontend vitest) kırılmayacak.
- Üretilen projeler için bankacılık düzeyinde aşırı karmaşık kurallar (zorunlu MFA/TOTP, karmaşık CSRF başlıkları vb.) yerine; standart JWT/Cookie, Scrypt/Bcrypt şifreleme, sade rol kontrolü (`admin`/`user`) ve hazır tak-çalıştır admin tohumu (`admin` / `admin123` veya `xfactor`) içeren geliştirici dostu bir standart uygulanacak.

---

### Task 1: Scaffold Şablonlarına Sade Auth ve Hazır Seed Standartlarının Eklenmesi
**Hedef Dosyalar:**
- `backend/engine/codeGenerator.js`
- `backend/tests/test_scaffold_auth_standards.js`

**Gereksinimler:**
- `backend/engine/codeGenerator.js` içinde `ensureProjectScaffold` fonksiyonunu genişlet:
  - Eğer proje sözleşmesinde (`state.plan` veya `contract.authentication`) kimlik doğrulama veya kullanıcı yönetimi varsa;
  - `prisma/schema.prisma` içine standart `User` modeli (`id`, `username`, `password`, `role: "user" | "admin"`, `createdAt`) şablonunu hazırla veya destekle.
  - `prisma/seed.ts` (veya seed scripti) içerisine test etmeyi kolaylaştıran varsayılan hazır yönetici hesabını (`admin` / `admin123`, rol: `admin`) tohumlayan kodu ekle.
  - Basit ve hafif yardımcı auth köprüsü (`lib/auth.ts` / `lib/auth.js`) şablonunu hazırla: Parola doğrulama (`verifyPassword`) ve rol denetleyici middleware (`requireAuth`, `requireAdmin`).
- **Doğrulama:**
  - `backend/tests/test_scaffold_auth_standards.js` test dosyasını oluştur ve scaffold üretiminin bu standartları eksiksiz sağladığını doğrula.

---

### Task 2: Ajan Canlı Dokümanları ve Sistem İstemlerinin Güncellenmesi
**Hedef Dosyalar:**
- `docs/coder.md`
- `docs/manager.md`
- `docs/ORKESTRASYON-TALIMATNAMESI.md`
- `backend/tests/test_docs_agent_sync.js`

**Gereksinimler:**
- `docs/coder.md`:
  - Coder ajanına "Sade ve Standart Kimlik Doğrulama (Pragmatic Auth)" kuralını ekle:
    - Login/Register gereken projelerde standart rotaları uygula: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
    - Token'ları standart JWT veya sade oturum çerezi olarak yönet; aşırı karmaşık TOTP/MFA veya ağır CSRF mekanizmalarıyla kullanıcıyı kilitleme.
    - Rol kontrolünü basit tut (`user.role === 'admin'`).
    - Parolaları açık metin (plaintext) saklama; yerleşik Scrypt veya Bcrypt kullan.
- `docs/manager.md`:
  - Manager ajanına, kullanıcı auth istediğinde şartnameye sade JWT/Cookie ve `admin`/`user` rol mimarisini yazmasını, gereksiz bankacılık kısıtları koymamasını emreden yönerge ekle.
- `docs/ORKESTRASYON-TALIMATNAMESI.md`:
  - Anayasa içine "Pragmatic Application Auth Standard" başlığını ekle.
- **Doğrulama:**
  - `node backend/tests/test_docs_agent_sync.js` çalıştırarak canlı dokümanların ajan promptlarıyla birebir senkron olduğunu doğrula.

---

### Task 3: Kalite Kapısı Uyumluluğu ve Güvenlik Tabanı Esnekliği
**Hedef Dosyalar:**
- `backend/verification/securityVerifier.js`
- `backend/contracts/domainPolicy.js`
- `backend/tests/test_p2_security_baseline.js`

**Gereksinimler:**
- `backend/verification/securityVerifier.js`:
  - 18 Kalite kapısının `security_baseline` denetleyicisinde standart JWT Bearer ve sade session yapılarının sorunsuz PASS almasını garanti et.
  - `POST /api/auth/login` ve `POST /api/auth/register` rotalarının auth middleware denetiminde halka açık (public) giriş kapısı olarak doğru istisna tutulmasını sağla.
  - Yalnızca gerçek güvenlik açıkları (açık metin parola saklama, raw SQL enjeksiyonu, committed `.env` secrets) VETO alsın; standart sade auth yapıları VETO almasın.
- **Doğrulama:**
  - `node backend/tests/test_p2_security_baseline.js` çalıştırarak kalite kapılarının geçtiğini doğrula.

---

### Task 4: Graphify Haritalarının Güncellenmesi ve Regresyon Doğrulaması
**Hedef Dosyalar:**
- `backend/scripts/generate_graph.js`
- `graphify-out/*`

**Gereksinimler:**
- `backend/scripts/generate_graph.js` içine yeni planı (`2026-09-17-pragmatic-auth-standard-plan.md`) ve yeni test süitini ekle.
- `npm run graph` çalıştırarak bilgi grafiğini güncelle.
- Tüm backend ve frontend test süitlerini çalıştırarak sıfır regresyon sağlandığını doğrula.
