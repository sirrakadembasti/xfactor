# 🎮 Küçük Oyunlar Portalı — Detaylı Kullanım ve Oyun Kılavuzu

Bu kılavuz, **Küçük Oyunlar Portalı (5'i 1 Arada)** uygulamasının mimarisini, oyun kurallarını, kurulum adımlarını ve API servislerini detaylandırmaktadır.

---

## 📑 İÇİNDEKİLER
1. [Proje Özeti ve Teknolojik Altyapı](#1-proje-özeti-ve-teknolojik-altyapı)
2. [Kurulum ve Yerel Çalıştırma](#2-kurulum-ve-yerel-çalıştırma)
3. [Oyunlar ve Oynanış Kuralları](#3-oyunlar-ve-oynanış-kuralları)
   - [🧠 1. Hafıza Kartları (Memory Game)](#1-hafıza-kartları-memory-game)
   - [✂️ 2. Taş - Kağıt - Makas (RPS)](#2-taş---kağıt---makas-rps)
   - [❌ 3. XOX (Tic-Tac-Toe)](#3-xox-tic-tac-toe)
   - [🐍 4. Klasik Yılan Oyunu (Snake)](#4-klasik-yılan-oyunu-snake)
   - [🔤 5. Türkçe Wordle (Kelime Tahmin)](#5-türkçe-wordle-kelime-tahmin)
4. [🏆 Liderlik Tablosu ve Skor Sistemi](#4-liderlik-tablosu-ve-skor-sistemi)
5. [🌐 REST API Uç Noktaları](#5-rest-api-uç-noktaları)

---

## 1. Proje Özeti ve Teknolojik Altyapı
- **Framework:** Next.js 14 App Router (React 18 + TypeScript)
- **Tasarım & UI:** Tailwind CSS + Lucide Icons + Framer Motion
- **Veritabanı:** SQLite + Prisma ORM (Skorlar, rekorlar ve Türkçe kelime sözlüğü)
- **Durum Yönetimi:** Zustand (Oyun içi state ve anlık skorlar)
- **Ses & Efektler:** Web Audio API / Howler.js + Canvas Confetti
- **Dil Desteği:** %100 Türkçe arayüz ve kelime hazinesi

---

## 2. Kurulum ve Yerel Çalıştırma

### 1. Adım: Paketleri Yükleyin
```bash
npm install
```

### 2. Adım: Ortam Değişkenini Tanımlayın (`.env`)
Kök dizinde `.env` oluşturun:
```env
DATABASE_URL="file:./dev.db"
```

### 3. Adım: Veritabanını Oluşturun
```bash
npx prisma generate
npx prisma db push
```

### 4. Adım: Uygulamayı Başlatın
```bash
npm run dev
```
Tarayıcınızda `http://localhost:3000` adresini açarak oyun portalını kullanmaya başlayabilirsiniz!

---

## 3. Oyunlar ve Oynanış Kuralları

### 1. Hafıza Kartları (Memory Game)
- **Amaç:** Kapalı kartları ikişer ikişer açarak aynı sembolleri eşleştirmek.
- **Puanlama:** En az hamle sayısı ve en kısa sürede tüm kartları eşleştiren oyuncu en yüksek puanı alır.

### 2. Taş - Kağıt - Makas (RPS)
- **Kurallar:** Taş makası kırar, makas kağıdı keser, kağıt taşı sarar.
- **Özellikler:** Bilgisayara karşı seri maçlar ve üst üste kazanma serisi (Win Streak) takibi.

### 3. XOX (Tic-Tac-Toe)
- **Modlar:** 
  1. *Yapay Zekaya Karşı:* Kolay veya Zor stratejik algoritma.
  2. *2 Kişilik Mod:* Aynı ekranda karşılıklı oynama.
- **Amaç:** 3 aynı sembolü (X veya O) yatay, dikey veya çapraz hizalamak.

### 4. Klasik Yılan Oyunu (Snake)
- **Kontroller:** Yön tuşları veya WASD (Mobilde dokunmatik yön butonları).
- **Kurallar:** Yemi yedikçe yılan uzar ve hızlanır. Duvara veya kendi kuyruğuna çarpmadan en yüksek skora ulaşın.

### 5. Türkçe Wordle (Kelime Tahmin)
- **Amaç:** 5 harfli gizli Türkçe kelimeyi 6 denemede bulmak.
- **Renk İpuçları:**
  - 🟩 **Yeşil:** Harf kelimede var ve doğru konumda.
  - 🟨 **Sarı:** Harf kelimede var ama yanlış konumda.
  - ⬛ **Gri:** Harf kelimede hiç yok.

---

## 4. Liderlik Tablosu ve Skor Sistemi
Her oyun bitiminde oyuncu adı ve skoru SQLite veritabanına kaydedilir. Liderlik tablosunda oyun bazında ve genel sıralamada ilk 3 podyumu ve detaylı filtreler görüntülenir.

---

## 5. REST API Uç Noktaları
- `GET /api/words/random`: Rastgele 5 harfli Türkçe kelime döner.
- `POST /api/words/validate`: Girilen kelimenin Türkçe sözlükte olup olmadığını doğrular.
- `GET /api/leaderboard?game=snake`: Oyun bazlı en yüksek skorları listeler.
- `POST /api/leaderboard`: Yeni skor kaydı oluşturur.

---
*XFactor Otonom AI Ajan Orkestrasyon Platformu ile üretilmiştir.*
