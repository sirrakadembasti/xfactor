# ⚡ XFactor — Otonom AI Ajan Orkestrasyon Platformu

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-646CFF.svg)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Tests-71%2F71%20Passing-brightgreen.svg)](file:///F:/projeler/xfactor/backend/tests/test_runner.js)

**XFactor**, kullanıcı isteklerini analiz ederek 6 seviyeli uzmanlaşmış AI ajanları (`Manager`, `Director`, `Teamleader`, `Coder`, `Reviewer`, `Tester`) ve deterministik **DAG dalga motoru** ile sıfırdan çalışan tam teşekküllü yazılım projeleri üreten otonom bir AI orkestrasyon platformudur.

---

## 🤖 Ajan Hiyerarşisi (6 Seviye)

| Seviye | Ajan | Görevi |
| :--- | :--- | :--- |
| **0** | **Manager** | İstek analizi, mimari tasarım (`TALIMATNAME.md`), domain dağılımı ve canlı telemetri teşhisi. |
| **1** | **Director** | Domain bazlı teknik standartlar ve alt şartname (`ALT-TALIMATNAME.md`). |
| **2** | **Teamleader** | Görevleri atomik parçalara bölme (maksimum 1-2 dosya kuralı) ve DAG oluşturma. |
| **3** | **Coder** | Çok dosyalı kod üretimi ve bileşen kompozisyonu (`@/components`). |
| **4** | **Reviewer** | 2 turlu kod denetimi ve kalite kapısı onayı / fail-closed **VETO**. |
| **5** | **Tester** | Deterministik sentaks & şema doğrulaması, `RAPOR.md` ve `README.md` üretimi. |

---

## 🖥️ 4 Bağımsız Arayüz Sekmesi

1. 💬 **Sohbet & Mimari:** Manager ile beyin fırtınası, canlı düşünme animasyonu ve durum bildirimleri.
2. 📊 **Canlı DAG Grafiği:** Çakışmasız, renk kodlu ve 2 sütunlu hiyerarşik React Flow ağaç görünümü.
3. 📜 **Canlı Süreç Logları:** Arama, eylem filtreleri (`ERROR`, `VETO`, `WRITE`, `FINISH`) içeren tam sayfa log tablosu.
4. 💻 **Kod Editörü:** Tamamlanan projeleri incelemek için tam teşekküllü Monaco Editor ve `.env` dahil ZIP indirme.

---

## 🚀 Hızlı Başlangıç

### 1. Kurulum ve Ortam Değişkenleri
```bash
cd backend
copy .env.example .env
npm install
```
`.env` dosyanıza `GOOGLE_API_KEY` veya tercih ettiğiniz yapay zekâ anahtarını girin.

### 2. Backend'i Başlatma
```bash
npm run dev
# Backend: http://127.0.0.1:8000
```

### 3. Frontend'i Başlatma
```bash
cd ../frontend
npm install
npm run dev
# Web Arayüzü: http://localhost:5173
```

---

## 🧪 Testleri Çalıştırma
```bash
cd backend
npm test
# 71/71 test %100 başarıyla doğrulanır.
```

---

## 📚 Detaylı Dokümantasyon

* 📖 **[Kullanım Kılavuzu (docs/KULLANIM-KILAVUZU.md)](docs/KULLANIM-KILAVUZU.md)**: A'dan Z'ye kullanım senaryoları ve operasyonel rehber.
* 📜 **[Master Talimatname (docs/ORKESTRASYON-TALIMATNAMESI.md)](docs/ORKESTRASYON-TALIMATNAMESI.md)**: 6 seviyeli orkestrasyon anayasası ve protokol kuralları.
