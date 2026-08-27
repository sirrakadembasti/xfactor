# 🎮 Küçük Oyunlar Portalı (5'i 1 Arada)

Next.js 14 (App Router), TypeScript, TailwindCSS, Zustand ve Prisma ORM (SQLite) tabanlı modern, akıcı ve %100 Türkçe 5'li Mini Oyun Paketi.

---

## 🚀 Hızlı Başlangıç ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları uygulayın:

### 1. Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Ortam Değişkenini Tanımlayın (`.env`)
Kök dizinde bir `.env` dosyası oluşturun:
```env
DATABASE_URL="file:./dev.db"
```

### 3. Veritabanı Şemasını Hazırlayın (Prisma / SQLite)
```bash
npx prisma generate
npx prisma db push
```

### 4. Geliştirme Sunucusunu Başlatın
```bash
npm run dev
```
Tarayıcınızda `http://localhost:3000` adresini açarak oyunları oynamaya başlayabilirsiniz!

---

## 🕹️ İçerdiği Oyunlar

1. 🧠 **Hafıza Kartları (Memory Game):** Görsel ve ikonları eşleştirme, hamle ve süre skoru takibi.
2. ✂️ **Taş - Kağıt - Makas:** Bilgisayara karşı seri maçlar ve üst üste kazanma serisi (Streak) mekanizması.
3. ❌ **XOX (Tic-Tac-Toe):** Yapay Zekaya karşı (Kolay / Zor mod) veya aynı cihazda 2 Kişilik mod.
4. 🐍 **Yılan Oyunu (Snake):** Hızlanan klasik arcade deneyimi, klavye ve mobil dokunmatik kontroller.
5. 🔤 **Türkçe Wordle (Kelime Tahmin):** 5 harfli gizli Türkçe kelimeleri renkli ipuçlarıyla 6 denemede bulma.
6. 🏆 **Liderlik Tablosu (Leaderboard):** SQLite destekli en yüksek skorlar, ilk 3 podyumu ve detaylı filtreler.

---

## 📁 Dizin Yapısı
- `src/app/page.jsx`: Tüm oyunları ve liderlik tablosunu birleştiren ana oyun hub'ı.
- `src/components/games/`: Hafıza, Taş-Kağıt-Makas ve XOX oyun bileşenleri.
- `src/components/SnakeGame/`: Yılan oyunu board ve ses kontrolleri.
- `src/components/Wordle/`: Türkçe kelime tahmin oyunu ve sanal klavye.
- `src/components/leaderboard/`: Liderlik tablosu ve podyum.
- `src/app/api/`: Skor ve kelime servisi API rotaları.
- `prisma/schema.prisma`: Veritabanı modelleri (`Score`, `Word`).
- `manager/`: Proje mimari şartnamesi (`TALIMATNAME.md`) ve ajan koordinasyon protokolü.

---
*Ayrıntılı oyun kuralları ve API dokümantasyonu için `KULLANIM-KILAVUZU.md` dosyasını inceleyebilirsiniz.*
