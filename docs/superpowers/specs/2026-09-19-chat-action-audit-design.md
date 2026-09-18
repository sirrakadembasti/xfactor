# XFactor Sohbet Tabanlı Aksiyon Denetim İzi Tasarımı

## Amaç

Kullanıcının arayüzde gerçekleştirdiği iş akışı ve yardımcı proje aksiyonlarını kalıcı sohbet mesajları olarak göstermek. Sohbet geçmişi; kullanıcı mesajları, Manager yanıtları ve butonla tetiklenen işlemler için tek ve kalıcı zaman çizelgesi olacaktır.

## Kapsam

Aşağıdaki başarılı aksiyonlar SQLite `chat_history` tablosuna yazılır:

| Aksiyon | Kullanıcı mesajı | Manager mesajı |
|---|---|---|
| Planı onayla | `✅ Mimari planı onayladım. Uygulama üretimini başlat.` | `🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.` |
| Devam et | `▶️ Süreci kaldığı yerden devam ettir.` | `Süreç kaldığı görevden devam ettiriliyor.` |
| Duraklat | `⏸️ Üretim sürecini duraklat.` | `Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.` |
| ZIP indir | `📥 Doğrulanmış proje ZIP paketini indirdim.` | `Doğrulanmış artefakt başarıyla indirildi.` |
| Disk senkronizasyonu | `🔄 Diskteki projeleri uygulamayla senkronize ettim.` | Yeni bulunan, eksik veya güncellenen proje sayısını içeren sonuç özeti |
| Başa sabitle | `📌 Projeyi başa sabitledim.` | `Proje yan menünün üst sırasına taşındı.` |
| Sabitlemeyi kaldır | `📌 Projenin sabitlemesini kaldırdım.` | `Proje normal sıralamaya döndürüldü.` |

`Projeyi Sil` işlemi kapsam dışıdır. Proje silindiğinde ilişkili sohbet geçmişi de silindiği için proje sohbetine kalıcı silme mesajı yazılmaz.

## Mimari Kararlar

### Kanonik Kaynak

Backend tek doğruluk kaynağıdır. Frontend iyimser veya sentetik sohbet mesajı üretmez. Her mesaj, başarılı işlemden sonra backend tarafından `appendProjectChatMessage()` üzerinden `chat_history` tablosuna yazılır.

### API Yanıtları

- JSON döndüren proje aksiyonları, mesajlar yazıldıktan sonra güncel `getProject(projectId)` sonucunu döndürür.
- Frontend bu kanonik yanıtla `projectState` değerini yeniler.
- Dosya indirme rotası, artefakt indirme yetkisi doğrulandıktan sonra sohbet kaydını ekler; başarısız veya yetkisiz indirme sohbet mesajı üretmez.
- Disk senkronizasyonu aktif proje bağlamında çalışıyorsa sonuç aktif projenin sohbetine yazılır. Aktif proje yoksa yalnız yapılandırılmış sistem logu üretilir.

### İdempotency

Aynı işlem tekrarlandığında çift sohbet mesajı üretilmemelidir.

- `approve` ve `resume` rotalarının mevcut idempotent lease davranışı korunur.
- Aksiyon mesajları yalnız yeni ve başarılı durum geçişinden sonra eklenir.
- İdempotent/tekrarlı yanıt yolları yeni sohbet mesajı yazmaz.
- Yardımcı işlemlerde tekrarlar gerçek kullanıcı aksiyonları olduğundan her başarılı ayrı tıklama mesaj oluşturabilir; aynı HTTP isteğinin ağ tekrarında çift kayıt engellenir.

## Veri Akışı

1. Kullanıcı arayüzde aksiyon butonuna basar.
2. Frontend mevcut API istemcisiyle isteği gönderir.
3. Backend yetki ve durum geçişini doğrular.
4. İşlem başarısızsa hata yanıtı döner; sohbet yazılmaz.
5. İşlem başarılıysa kullanıcı aksiyon mesajı yazılır.
6. Gerekliyse Manager sonuç mesajı yazılır.
7. Backend güncel proje durumunu döndürür veya dosya yanıtını başlatır.
8. Frontend sohbet ve ilgili ekranları kanonik veriden yeniler.

## Ekran Tutarlılığı

- Sohbet, DAG, Loglar, Header ve Sidebar aynı kanonik proje durumunu kullanır.
- Plan onayı, devam ve duraklatma mesajları gerçek durum geçişiyle aynı transaction/başarı sınırında görünür.
- ZIP mesajı yalnız doğrulanmış artefakt indirildiğinde görünür.
- Pin mesajları yalnız güncelleme başarıyla kaydedildiğinde görünür.

## Hata Yönetimi

- Yetkisiz, geçersiz durum veya sunucu hatası sohbet başarı mesajı üretmez.
- Frontend mevcut hata banner mekanizmasını kullanır.
- Sohbet kaydı eklenemiyorsa yük taşıyan iş akışı aksiyonunda işlem başarısız kabul edilir; sessizce durum değiştirip sohbeti atlamak yasaktır.
- Dosya aktarımı başladıktan sonraki istemci bağlantı kopması, sunucunun başarılı yetkilendirme/aktarım başlangıcı mesajını geri almaz.

## Test Tasarımı

### Backend Davranış Testleri

Her aksiyon için:

1. Başarılı işlem, beklenen kullanıcı ve Manager mesajlarını kalıcılaştırır.
2. Başarısız işlem mesaj eklemez.
3. İdempotent `approve`/`resume` çağrısı mesaj çoğaltmaz.
4. Yeni `getProject()` çağrısı aksiyon geçmişini aynı sırayla döndürür.
5. ZIP mesajı yalnız doğrulanmış artefakt indirme rotasında yazılır.
6. Silme işlemi sohbet mesajı üretmez ve mevcut cascade davranışı korunur.

### Frontend Davranış Testleri

1. Aksiyon API yanıtındaki mesajlar `ChatView` içinde görünür.
2. Proje değiştirip geri dönüldüğünde mesajlar korunur.
3. Başarısız istek yalnız hata banner’ı üretir; sentetik sohbet mesajı oluşmaz.
4. Disk senkronizasyonu ve pin işlemi sonrasında proje durumu ve sohbet birlikte yenilenir.

## Değişmeyecek Sözleşmeler

- Mevcut route URL’leri korunur.
- `chat_history` rol biçimi (`user`, `model`) korunur.
- Proje silme/cascade davranışı korunur.
- Doğrulanmış artefakt indirme yetkilendirmesi gevşetilmez.
- Frontend buton etiketleri ve mevcut erişilebilirlik sözleşmeleri korunur.
