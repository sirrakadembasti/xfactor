# Frontend Alt-Talimatnamesi: kücük-oyunlar

## 1. Mimari Overview & Teknoloji Yığını
Frontend katmanı, Next.js (App Router) ve TypeScript tabanlı, yüksek performanslı, mobil öncelikli (mobile-first) ve duyarlı (responsive) bir mimari ile tasarlanacaktır.

- **Framework:** Next.js (App Router) + TypeScript (Strict Mode)
- **Styling:** Tailwind CSS + `clsx` / `tailwind-merge`
- **Animasyonlar:** Framer Motion (Kart çevirme, geçişler, kazanma efektleri)
- **İkonlar:** Lucide Icons (`lucide-react`)
- **State Management:** Zustand (Oyun durumları, aktif oyun verileri, global ayarlar)
- **Ses Altyapısı:** Web Audio API / Custom Sound Manager (Efektler, Mute/Unmute)
- **Tema:** `next-themes` veya Zustand tabanlı Dark/Light mod yönetimi

---

## 2. Klasör ve Dosya Yapısı
```
src/
├── app/
│   ├── layout.tsx              # Root Layout (ThemeProvider, Toast Container)
│   ├── page.tsx                # Ana Sayfa / Oyun Seçim Ekranı
│   ├── liderlik-tablosu/       # Liderlik Tablosu Sayfası / Modal
│   └── oyunlar/
│       ├── hafiza-kartlari/    # Hafıza Oyunu Ekranı
│       ├── tas-kagit-makas/    # Taş-Kağıt-Makas Oyunu Ekranı
│       ├── xox/                # XOX Oyunu Ekranı
│       ├── yilan/              # Yılan Oyunu Ekranı
│       └── kelime-tahmin/      # Türkçe Wordle Oyunu Ekranı
├── components/
│   ├── ui/                     # Temel UI Bileşenleri (Button, Card, Modal, Switch vb.)
│   ├── layout/                 # Navbar, Footer, Header
│   ├── common/                 # AudioPlayer, ThemeToggle, ScoreBoard
│   └── games/                  # Oyuna Özel Bileşenler
│       ├── hafiza/             # CardGrid, MemoryCard
│       ├── tkm/                # ChoiceButton, GameResult
│       ├── xox/                # Board, Cell, ModeSelector
│       ├── yilan/              # GameCanvas / GridBoard, DPad
│       └── kelime/             # WordGrid, VirtualKeyboard, Tile
├── store/
│   ├── useSettingsStore.ts     # Tema, Ses (Mute/Unmute) ayarları
│   ├── useLeaderboardStore.ts  # Skor verileri state'i
│   └── games/                  # Her oyun için Zustand store'lar
├── hooks/
│   ├── useAudio.ts             # Ses efekti tetikleyici hook
│   ├── useKeyPress.ts          # Klavye girdi hook'u (Yılan ve Wordle için)
│   └── useWindowSize.ts        # Mobil responsive kontroller
└── lib/
    ├── constants.ts            # Sabitler ve oyun konfigürasyonları
    └── utils.ts                # Tailwind merge ve yardımcı fonksiyonlar
```

---

## 3. Oyun Bazlı UI/UX ve Bileşen Gereksinimleri

### 3.1. Hafıza Kartları (Memory Game)
- **Arayüz:** Kart ızgarası (4x4 veya 6x6 zorluk seçimi), Hamle Sayacı, Geçen Süre (Timer).
- **Animasyon:** 3D Card Flip efekti (Framer Motion / CSS `perspective`).
- **Aksiyonlar:** Kart tıklama, eşleşme kontrolü, tebrik modali/efekti.

### 3.2. Taş - Kağıt - Makas
- **Arayüz:** Oyuncu vs Bilgisayar seçim alanları, Skor Tablosu, Galibiyet Serisi (Streak) göstergesi.
- **Animasyon:** Seçim anında geri sayım / sallantı animasyonu, kazanan belirtme vurgusu.

### 3.3. XOX (Tic-Tac-Toe)
- **Arayüz:** Mod Seçimi (Yapay Zeka Kolay/Zor vs 2 Kişilik Yerel), 3x3 Oyun Izgarası, Tur Sırası Göstergesi.
- **Animasyon:** X ve O çizim animasyonları, kazanan 3'lü grubun üzerini çizen çizgi animasyonu.

### 3.4. Yılan Oyunu (Snake)
- **Arayüz:** Skor ve En Yüksek Skor paneli, Canvas/Grid Oyun Alanı, Mobil Dokunmatik D-Pad/Swipe Alanı.
- **Kontroller:** Klavye yön tuşları + Mobil Sanal Yön Tuşları.
- **Durumlar:** Başlat, Duraklat (Pause), Oyun Bitti (Game Over) Modalı.

### 3.5. Türkçe Kelime Tahmin (Wordle)
- **Arayüz:** 6 Satır x 5 Sütun Harf Izgarası, Türkçe Sanal Klavye (Ğ, Ü, Ş, İ, Ö, Ç dahil).
- **Renk Mantığı:** Yeşil (Doğru konum), Sarı (Kelime içinde var), Gri (Kelime içinde yok).
- **Animasyon:** Harf girildiğinde pop efekti, satır onaylandığında Flip efekti, hatalı kelimede Shake efekti.

---

## 4. Tasarım, Tema ve UX Standartları
1. **%100 Türkçe Metinler:** Tüm UI bileşenleri, butonlar, modallar, hata ve başarı bildirimleri tamamen Türkçe olacaktır.
2. **Karanlık / Aydınlık Mod:** Tailwind `dark:` sınıfları ile tam uyumlu UI. Gece oynanabilirliği yüksek tutulacaktır.
3. **Mobil Uyum (Responsive):** Mobil ekranlarda taşma olmayacak, dokunmatik hedef boyutları en az 44x44px olacaktır.
4. **Ses Efektleri:** Tıklama, kart çevirme, doğru/yanlış bilme, oyun bitiş sesleri için global ses yönetimi sunulacaktır. Kullanıcı istediği an sesi kapatabilecektir (Mute).

---

## 5. Kabul Kriterleri (Acceptance Criteria)
- [ ] Tüm sayfalar ve oyun ekranları mobil ve masaüstü cihazlarda sorunsuz render edilmeli.
- [ ] Zustand store'ları oyun durumlarını doğru tutmalı, sayfa yenilemede rekorlar saklanabilmeli.
- [ ] Türkçe karakter desteği (Wordle ve UI) eksiksiz çalışmalı.
- [ ] UI bileşenleri erişilebilir (accessible) ve performanslı olmalı.