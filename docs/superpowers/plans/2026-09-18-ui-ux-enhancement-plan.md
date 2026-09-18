# SDD Plan: XFactor UI/UX Geliştirme — Ergonomik Sohbet, Büyük Çıkış Butonu, Mesaj Kopyalama ve Sıcak Krem Tema

## Context & Global Constraints
- Proje: XFactor Frontend (React 18 + Vite + TailwindCSS + Lucide Icons)
- Yalnızca `frontend/` arayüz dosyaları (`ChatView.jsx`, `Sidebar.jsx`, `App.jsx`, `Header.jsx`, `tailwind.config.js`) üzerinde geliştirmeler yapılacak.
- Hiçbir backend API rotası, veri sözleşmesi veya state mantığı bozulmayacak.
- Mevcut test süitleri (`npm --prefix frontend run test:unit`) %100 yeşil kalacak.

---

### Task 1: ChatView UI/UX — Sohbet Giriş Alanının Geliştirilmesi ve Mesaj Kopyalama Butonları
**Hedef Dosyalar:**
- `frontend/src/components/ChatView.jsx`

**Gereksinimler:**
- **Mesaj Kopyalama Özelliği:**
  - Her bir sohbet mesajı için (hem kullanıcı hem Manager mesajları) sağ üstte veya aksiyon alanında küçük, şık bir kopyalama butonu (`Copy` ikonu) ekle.
  - Tıklandığında mesaj içeriğini `navigator.clipboard.writeText` ile panoya kopyala ve 2 saniyeliğine yeşil `Check` ("Kopyalandı") ikonuna dönüştür.
- **Gelişmiş ve Yukarı Taşınmış Sohbet Giriş Alanı:**
  - Giriş alanını ekranın en altına sıkışmış vaziyetten kurtar; daha ferah, modern ve hafif yukarı taşınmış (floating / elevated card) bir giriş paneline dönüştür.
  - Tek satırlık input yerine çok satırı destekleyen `textarea` (veya zenginleştirilmiş giriş) yapısı sağla: `Enter` tuşuyla gönderme, `Shift+Enter` ile alt satıra geçme desteği.
  - Gönder butonu, karakter/durum göstergesi ve temiz bir görsel hiyerarşi oluştur.
- **Görsel İyileştirmeler:**
  - Mesaj balonları arasındaki boşlukları ve okunabilirliği artır.
  - Düşünme (thinking) göstergesinin animasyonunu ve kart yapısını koruyup cilala.

---

### Task 2: Sidebar UI/UX — Yan Menü Görsel Tasarımı ve Büyük Çıkış Butonu
**Hedef Dosyalar:**
- `frontend/src/components/Sidebar.jsx`

**Gereksinimler:**
- **Büyük ve Belirgin Çıkış Alanı (Footer):**
  - Alttaki küçük "Çıkış" linki yerine; kullanıcı avatarı, kullanıcı adı (`admin`), rol rozeti (`Yönetici`) barındıran şık bir profil kartı ekle.
  - Profil kartının hemen altına geniş, dolgulu, belirgin ve kırmızı tonlu `LogOut` ikonlu büyük bir **"Oturumu Kapat"** butonu yerleştir.
- **Yan Menü Görsel Geliştirmeleri:**
  - Başlık alanı (`XFactor Projeler`) ve butonlar (`+ Yeni Proje`, `Diskle Senkronize Et`) arasındaki boşlukları ve mikro etkileşimleri modernize et.
  - Proje kartları hover efektleri, aktif proje göstergesi ve 3-nokta işlem menüsü görselini iyileştir.

---

### Task 3: Uygulama Genel Teması — Sıcak Krem Rengi Dönüşümü
**Hedef Dosyalar:**
- `frontend/tailwind.config.js`
- `frontend/src/App.jsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/LoginView.jsx`

**Gereksinimler:**
- **Sıcak Krem Renk Paleti:**
  - `tailwind.config.js` içine `cream` renk paleti (`#fbf9f5`, `#f6f3ee`, `#ede6db`) tanımla veya Tailwind'in sıcak `stone` ve krem tonlarını kullan.
  - Soğuk/çiğ beyaz (`bg-white`), soğuk gri (`bg-gray-50`, `bg-slate-50`) arka planları sıcak krem tonlarıyla (`bg-[#faf8f5]` / `bg-stone-50`) değiştir.
- **Bileşen Uyumu:**
  - `App.jsx` ana layout arka planı, `Header.jsx`, `ChatView.jsx` ve `LoginView.jsx` renklerini bu sıcak krem temaya uyumlu hale getir.
  - Kartların ve panellerin kontrastını (border ve shadow) krem zemin üzerinde net ve okunaklı kıl.

---

### Task 4: Ek UI/UX Geliştirmeleri Listesi ve Test Doğrulaması
**Hedef Dosyalar:**
- `frontend/src/components/__tests__/` (mevcut birim testleri)
- `docs/superpowers/plans/2026-09-18-ui-ux-enhancement-plan.md`

**Gereksinimler:**
- Vitest ile tüm frontend birim testlerini (`npm --prefix frontend run test:unit`) çalıştırarak tüm 38 testin yeşil olduğunu doğrula.
- Kullanıcıya gelecekte yapılabilecek diğer UI/UX geliştirme önerilerini (Header, Monaco IDE, DAGFlow, Dashboard) maddeler halinde sun.
