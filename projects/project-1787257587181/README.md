# 🚀 emlak takip uygulaması

Proje: emlak takip uygulaması

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları uygulayın:

### 1. Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Veritabanı Şemasını Hazırlayın (Prisma / SQLite)
```bash
npx prisma generate
npx prisma db push
```

### 3. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```
Uygulamanız `http://localhost:3000` adresinde hazır olacaktır.

---

## 📁 Mimari ve Domain Yapısı
- **frontend**: Kullanıcı arayüzü ve bileşenler
- **backend**: REST API ve sunucu servisleri

## 📑 Test ve Kabul Doğrulaması
- **Sonuç:** ⚠️ UYARI
- **Detay:** [Deterministik Hatalar Tespit Edildi]: Kritik Sözdizimi Hatası: "src/components/map/MapContainer.tsx" dosyasında dengesiz parantez/süslü parantez tespit edildi (Brace: -2, Paren: -3, Bracket: 0)! | Kritik Sözdizimi Hatası: "src/lib/session.ts" dosyasında dengesiz parantez/süslü parantez tespit edildi (Brace: 0, Paren: 1, Bracket: 0)!. Projede derleme/çalışmayı engelleyen kritik sözdizimi hataları ve şartname gereksinimleri yerine genel görev (Task) şablonunun kullanılması kaynaklı majör kabul kriteri uyumsuzlukları tespit edildi.

---
*XFactor Otonom AI Ajan Orkestrasyon Platformu tarafından üretilmiştir.*
