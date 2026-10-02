# Manager sohbet onayı ve plan doğrulaması

**Amaç:** Sunulan plan açıkça onaylandığında güvenli üretim akışını çalıştırmak;
geçersiz plan nedeniyle görünmeyen düğmeyi ve uzun JSON tekrarlarını gidermek.

**Tasarım:** Sohbet ve düğme aynı owner kontrolü, sözleşme onayı, capability kontrolü
ve workflow lease akışını kullanır. Mevcut bekleyen plan onayında LLM çağrılmaz.
Plan JSON'u kesin parse ve mevcut şema ile doğrulanır; eksik fixture'lar için yalnız
bir sınırlı model düzeltmesi denenir. Başarısız plan üretimi durdurur ve görünür
tanılama verir. Tam plan korunur, sohbet kısa özet ve açılabilir ayrıntılar gösterir.

- [x] Ekteki JSON'u doğrulayarak retention fixture ve deleteExpectation uyumsuzluğunu saptama.
- [x] Backend regresyon testi: uzun karma yanıt, açık onay, tekrar onay, owner yetkisi, başarısız düzeltme.
- [x] Ortak onay işleyicisi ve Manager plan ayrıştırma/düzeltme akışı.
- [x] Ön yüzde plan ayrıntıları ve ilgili testler.
- [x] Manager/README/kılavuz ve Graphify güncellemesi.
- [x] İlgili backend/frontend regresyon ve build doğrulaması.
- [x] Gerçek MiMo ile ekteki planın hedefli düzeltmesi: 11462 ms, 1767 karakter; birleştirilmiş plan şeması geçti.
- [x] Bağımsız kod incelemesi; yapısal eksik ile fixture eksik ayrımı düzeltildi ve test edildi.

Gerçek otel projesi bu testlerde otomatik üretilmez; izole test veritabanı ve
sahte executor kullanılır. Kullanıcı tekrar onay verdiğinde gerçek yürütme başlar.
