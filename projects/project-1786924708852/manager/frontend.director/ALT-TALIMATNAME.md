# Frontend Alt-Talimatnamesi

## 1. Genel Mimari ve Teknoloji Yığını
* **Framework:** Next.js 14+ (App Router)
* **Stil & UI Kütüphanesi:** Tailwind CSS + Shadcn UI (Radix Primitives tabanlı bileşenler)
* **İkon Seti:** Lucide React
* **Form & Doğrulama:** React Hook Form + Zod
* **State & Data Fetching:** React Context, Server Actions / Fetch API ve Toast bildirimleri (Shadcn Toast / Sonner)

---

## 2. Dizin ve Rota Yapısı (App Router)
```
app/
├── (auth)/
│   ├── login/page.tsx          # Kullanıcı Giriş Sayfası
│   └── register/page.tsx       # Öğretmen Kayıt Sayfası (Onay Uyarılı)
├── dashboard/
│   ├── layout.tsx              # Sidebar + Header içeren ortak panel düzeni
│   ├── page.tsx                # İstatistikler ve Hızlı Bakış Paneli
│   ├── books/page.tsx          # Kitap Kataloğu ve Yönetimi
│   ├── students/page.tsx       # Öğrenci Yönetimi (Sadece Admin)
│   ├── borrow/page.tsx         # Ödünç / İade İşlemleri Paneli (Sadece Admin)
│   └── users/page.tsx          # Öğretmen Onay Paneli (Sadece Admin)
```

---

## 3. Bileşen Mimarisi (Component Architecture)
1. **`components/ui/`**: Shadcn UI atomik bileşenleri (`button`, `input`, `dialog`, `table`, `badge`, `select`, `card`, `toast`).
2. **`components/layout/`**:
   * `Sidebar.tsx`: Kullanıcı rolüne göre dinamik menü öğeleri (Admin / Öğretmen).
   * `Header.tsx`: Kullanıcı bilgisi, rol rozeti ve çıkış butonu.
3. **`components/books/`**:
   * `BookTable.tsx`: Kitap listesi, stok durumu rozetleri, arama/filtreleme.
   * `BookFormModal.tsx`: Kitap ekleme/düzenleme modal formu.
4. **`components/students/`**:
   * `StudentTable.tsx`: Öğrenci listesi ve aksiyonlar.
   * `StudentFormModal.tsx`: Öğrenci kayıt/güncelleme modalı.
5. **`components/borrow/`**:
   * `BorrowWizard.tsx`: Öğrenci ve Kitap seçimi ile hızlı ödünç verme formu.
   * `ActiveBorrowsTable.tsx`: Devam eden ödünçler ve gecikme durumları (`OVERDUE`).
6. **`components/users/`**:
   * `PendingTeachersTable.tsx`: Bekleyen öğretmen başvuruları ve onay/red butonları.

---

## 4. Rol Tabanlı Arayüz Mantığı (RBAC UI)
* **Admin:** Tüm menü öğelerini görür. Kitap ekleyebilir/silebilir, Öğrenci yönetebilir, Ödünç/İade yapabilir, Öğretmen onaylayabilir.
* **Öğretmen:** Sadece `Kitap Kataloğu` sayfasını görebilir. Ekleme/Düzenleme/Silme butonları gizlenir (Salt Okunur Mod).
* **Giriş Yapmamış / Onaysız Kullanıcı:** Sayfalara erişim engellenir, `/login` sayfasına yönlendirilir.