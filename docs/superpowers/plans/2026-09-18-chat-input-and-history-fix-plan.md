# SDD Plan: Chat Input Boyutlandırması, Taban Boşluğu ve Yan Menü Sohbet Yükleme Onarımı

## Context & Global Constraints
- Proje: XFactor Frontend & Backend
- Yalnızca ilgili dosyalar (`frontend/src/components/ChatView.jsx`, `backend/projectRepository.js`, `backend/services/reconciliationService.js`) güncellenecek.
- Mevcut test süitleri (%100) yeşil kalacak.

---

### Task 1: Chat Giriş Alanı Boyutlandırması ve Taban Boşluğu
**Hedef Dosyalar:**
- `frontend/src/components/ChatView.jsx`
- `frontend/src/components/__tests__/ChatView.test.jsx`

**Gereksinimler:**
- **Enlemesine (Genişlik) %35 Küçültme:**
  - `max-w-4xl` (~896px) genişlik `max-w-xl` (~576px, %35 daha dar) olarak güncellenecek.
- **Yükseklik %25 Küçültme:**
  - `rows={2}`, `min-h-[44px]` ve iç padding `p-2.5 px-3.5` ile dikey boyut %25 oranında küçültülecek.
- **Taban Boşluğunu %100 Arttırma:**
  - Giriş kutusunun alt taban boşluğu 16px'den 32px'e (`pb-4` -> `pb-8`) iki katına çıkarılacak.
- **Doğrulama:**
  - `npm --prefix frontend run test:unit` ile testlerin geçtiği doğrulanacak.

---

### Task 2: Yan Menüden Proje Seçildiğinde Sohbetlerin Yüklenmesi ve Otomatik Karşılama
**Hedef Dosyalar:**
- `backend/projectRepository.js`
- `backend/services/reconciliationService.js`
- `frontend/src/components/ChatView.jsx`

**Gereksinimler:**
- **`backend/projectRepository.js` (`getProject`):**
  - Proje için veritabanında henüz chat kaydı yoksa (`chatHistory.length === 0`), boş liste yerine projenin durumuna göre Manager'ın başlangıç karşılama mesajını (`"Merhaba Boss!..."`) döndür.
- **`backend/services/reconciliationService.js` (`autoRegisterDiscoveredProjects`):**
  - Diskteki klasörler veritabanına otomatik eşitlenirken `chat_history` tablosuna da ilk karşılama mesajını otomatik kaydet.
- **`frontend/src/components/ChatView.jsx`:**
  - Eğer sohbet geçmişi henüz boşsa ekranı çıplak bırakmak yerine Manager karşılama kartını göster.
- **Doğrulama:**
  - Backend ve frontend birim testlerini çalıştır ve doğrula.
