# 🚀 todo-app

> Mimari Plan: todo-app

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları sırasıyla uygulayın:

### 1. Adım: Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Adım: Veritabanı ve Şemayı Hazırlayın (Prisma / SQLite)
> **Not:** `.env.example` dosyasını `.env` olarak kopyalayın, `NEXTAUTH_SECRET` değerini uzun rastgele bir anahtarla değiştirin ve `DATABASE_URL="file:./dev.db"` ayarını doğrulayın.
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

Harika bir fikir! Klasik, sıkıcı bir yapılacaklar listesi yerine modern, performanslı ve kullanıcı dostu tam teşekküllü bir **To-Do / Görev Yönetimi Uygulaması** mimarisi tasarladım.

İşte projeyi hayata geçirmek için hazırladığım mimari plan:

---

### 🏗️ 1. Mimari & Teknoloji Tercihleri

* **Frontend:** Next.js (App Router), React, Tailwind CSS, Lucide Icons (Modern ve duyarlı UI)
* **Backend:** Node.js / Express.js REST API (TypeScript)
* **Veritabanı & ORM:** Prisma ORM ile SQLite (`file:./dev.db`)

---

### 🎯 2. Temel Özellikler & Fonksiyonlar

1. **Görev (Task) Yönetimi:**
   * Görev ekleme, düzenleme, silme ve tamamlandı/aktif durumunu değiştirme (CRUD).
   * Göreve son teslim tarihi (Due Date) ve açıklama ekleme.
2. **Kategorizasyon & Önceliklendirme:**
   * Öncelik seviyeleri (Düşük, Orta, Yüksek, Acil - renk kodlu rozetler).
   * Özel kategoriler / etiketler (İş, Kişisel, Proje, Alışveriş vb.).
3. **Akıllı Filtreleme & Arama:**
   * Duruma göre filtreleme (Tümü, Aktif, Tamamlananlar).
   * Öncelik ve kategori bazlı filtreleme.
   * Anlık canlı metin araması.
4. **Dashboard & İstatistikler:**
   * Toplam görev, tamamlanma yüzdesi ve yaklaşan son tarihler için görsel özet widget'ı.
5. **Modern Arayüz & UX:**
   * Temiz ve modern kart yapısı, akıcı geçişler ve karanlık/aydınlık tema uyumu.

---

### 📂 3. Domain Bölünmesi (Sorumluluk Dağılımı)

* **`backend.director`**: Express.js REST API servisleri, Prisma SQLite modelleri, validasyon middleware'leri ve API endpoint'leri (`/api/todos`, `/api/categories`, `/api/stats`).
* **`frontend.director`**: Next.js bileşenleri (Görev Listesi, Görev Ekleme/Düzenleme Modalı, Filtre Çubuğu, İstatistik Kartları), Tailwind tasarımı ve API entegrasyonu.

---
