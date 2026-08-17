# Rapor: Kullanıcı Kaydı, Giriş ve Onay API Endpoint'leri

Kullanıcı kaydı, giriş mantığı ve admin kullanıcı onaylama API endpoint'leri güncellendi. Kayıt işleminde ADMIN rolü engellendi ve öğretmen hesapları varsayılan olarak onaysız (isApproved: false) olarak oluşturulacak şekilde ayarlandı. Giriş işleminde onay denetimi eklendi. Admin endpoint'lerine JWT bazlı RBAC (Role-Based Access Control) yetki denetimi entegre edildi.

Üretilen Dosyalar: ["src/app/api/auth/register/route.ts","src/app/api/auth/login/route.ts","src/app/api/admin/users/pending/route.ts","src/app/api/admin/users/[id]/approve/route.ts"]