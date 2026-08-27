# ⚡ XFactor — Otonom AI Yazılım Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-22.5.0%2B%20%7C%20Bun%201.0%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL%20Migrations-003B57.svg)](https://www.sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing%20(25%20Suites)-brightgreen.svg)](backend/tests/test_runner.js)

**XFactor**, kullanıcıların doğal dilde ilettiği yazılım fikirlerini analiz ederek 6 seviyeli rol uzmanlaşması, deterministik **DAG dalga motoru** ve gerçek **derleyici/kalite kapıları** (`tsc`, `prisma`, `eslint`) ile sıfırdan çalışan tam teşekküllü projelere dönüştüren merkezi bir yapay zekâ kod üretim platformudur.

---

## 🌟 Öne Çıkan Yetenekler

* 🤖 **6 Seviyeli Rol Uzmanlaşması:** `Manager` (Mimar), `Director` (Domain), `Teamleader` (DAG/Plan), `Coder` (Geliştirici), `Reviewer` (Kod Denetim) ve `Tester` (Kabul & QA).
* ⚡ **Deterministik DAG Dalga Yürütücüsü:** Görevleri atomik parçalara (maks 1-2 dosya) böler, bağımsız işleri paralel dalgalar halinde çalıştırır.
* 🛡️ **Çok Katmanlı Kalite Kapıları:** Kodlar Reviewer, statik sözdizim, TypeScript derleyicisi (`tsc --noEmit`) ve Prisma şema doğrulamasından geçmeden onaylanmaz (Fail-Closed Veto).
* 🔒 **Sıfır Sızıntı & İzolasyon:** 24 saatlik HttpOnly sunucu oturumları, RFC 6238 TOTP/MFA desteği, asenkron `scrypt` kimlik doğrulama, CSP, HSTS, özel login rate limiter, CSRF koruması, izole alt süreç sandbox'ı ve çift yönlü disk senkronizasyonu.
* 🖥️ **4 Bağımsız Canlı Panel:** Manager ile sohbet & planlama, canlı ReactFlow DAG akış şeması, renk kodlu telemetri logları ve dahili Monaco Editor IDE.

---

## 🚀 Hızlı Başlangıç (3 Adımda Kurulum)

### 1. Backend'i Hazırlayın ve Başlatın
```bash
cd backend
copy .env.example .env    # Linux/macOS: cp .env.example .env

# .env dosyasına GOOGLE_API_KEY değerinizi girin
npm install
npm run create-admin -- admin    # Yönetici hesabını oluşturun (parolayı sorar)
npm run dev                      # Backend hazır: http://127.0.0.1:8000
```

> [!CAUTION]
> **Production / VPS Uyarısı:** VPS ortamında backend portunu (`8000`) doğrudan internete açmayınız. TLS sonlandırması ve `X-Forwarded-Proto: https` başlığı sağlayan bir Reverse Proxy (Caddy, Nginx vb.) kullanınız.

### 2. Frontend Web Panelini Başlatın
```bash
cd ../frontend
npm install
npm run dev                      # Web Arayüzü: http://localhost:5173
```

### 3. Kullanmaya Başlayın
1. Tarayıcınızda `http://localhost:5173` adresini açın ve oluşturduğunuz yönetici hesabıyla giriş yapın.
2. Sol menüden **`+ Yeni Proje`** oluşturun.
3. Manager ile sohbet ederek istediğiniz uygulamayı tarif edin ve **`Planı Onayla ve Başlat`** butonuna tıklayın!

---

## 🧪 Test Süiti & Güvenlik Doğrulaması

Platform, tüm çekirdek motorları, güvenlik sınırlarını, MFA ve observabilite mekanizmalarını kapsayan 25 bağımsız test süitine sahiptir:

```bash
cd backend
npm test
```
> Testler `os.tmpdir()` üzerindeki izole geçici sandbox'ta çalışır; geliştirme veritabanınızı (`projects.db`) ve `projects/` klasörünüzü kesinlikle kirletmez.

---

## 📚 Kapsamlı Dokümantasyon

* 📖 **[A'dan Z'ye Kullanıcı ve Operasyon Kılavuzu (kullanici-kilavuzu.md)](kullanici-kilavuzu.md)** — Arayüz kullanımı, revizyon adımları, kurtarma rehberi ve projeyi çalıştırma talimatları.
* 📜 **[Master Talimatname & Ajan Anayasası (docs/ORKESTRASYON-TALIMATNAMESI.md)](docs/ORKESTRASYON-TALIMATNAMESI.md)** — Platformun 6 seviyeli orkestrasyon anayasası ve kural seti.

