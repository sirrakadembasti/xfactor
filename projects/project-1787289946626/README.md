# 🚀 sanal-okul

> Sanal Okul projesinin tüm mimari gereksinimleri, Prisma veri şeması, API uç noktaları, rol tabanlı kullanıcı arayüzleri ve sınav motoru başarıyla doğrulandı.

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları sırasıyla uygulayın:

### 1. Adım: Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Adım: Veritabanı ve Şemayı Hazırlayın (Prisma / SQLite)
> **Not:** Projede `.env` dosyası hazır olarak `DATABASE_URL="file:./dev.db"` şeklinde tanımlıdır.
```bash
npx prisma generate
npx prisma db push
```

### 3. Adım: (Varsa) Tohum / Örnek Verileri Yükleyin
```bash
npx prisma db seed
```

### 4. Adım: Uygulamayı Başlatın
```bash
npm run dev
```
Uygulamanız varsayılan olarak `http://localhost:3000` adresinde çalışacaktır.

---

## 📋 Proje Özellikleri ve Mimari Yapı


