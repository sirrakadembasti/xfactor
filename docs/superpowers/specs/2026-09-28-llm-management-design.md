# LLM yönetimi tasarımı

XFactor yöneticisi sağlayıcı profillerini Türkçe bir sayfadan kaydeder, sınar ve varsayılan profili seçer. Profiller sağlayıcı türü, model kimliği, API adresi ve şifreli anahtar içerir. Yönetim API'si ile sayfa yalnızca `isAdmin` oturumlarına açıktır. Anahtarlar API yanıtlarında ve loglarda görünmez. Var olan `.env` ayarları, henüz profil seçilmemiş kurulumlarda kullanılmaya devam eder.

`backend/llm-auth/llm.js` takılabilir Express router ve profil çözümleyicisini dışarı açar. `llm.html` Türkçe sayfadır; CSP nedeniyle davranış ayrı `llm-ui.js` dosyasındadır. Profil dosyası `LLM_CONFIG_ENCRYPTION_KEY` ile AES-256-GCM kullanılarak şifrelenir ve varsayılan olarak backend veri dizininde tutulur. Bu anahtar olmadan yeni profil kaydedilemez. Profillerde yalnızca HTTPS API adresleri kabul edilir; yerel HTTP ancak açık geliştirme ayarıyla kullanılabilir.

Katalog, yaygın ABD ve Çin sağlayıcıları için düzenlenebilir başlangıç adresleri sunar. Model kimlikleri kullanıcı tarafından girilebilir; desteklenen OpenAI uyumlu sağlayıcılarda `/models` ile keşif yapılır. Google ve Anthropic için yerel taşıma, diğer sağlayıcılar için OpenAI uyumlu taşıma kullanılır. Kaydetme bağlantıyı otomatik etkinleştirmez; bağlantı sınanır ve yönetici varsayılan profili seçer. Manager sohbeti ve ajanlar aynı profili çağrı başında çözer. Devam eden bir çağrı kendi anlık ayarlarını kullanır.

Testler şifreli saklama, anahtar maskeleme, yönetici yetkisi, URL doğrulama, sağlayıcı geçişi ve Manager/ajan entegrasyonunu doğrular. Kullanım ve eklenti montajı README'de açıklanır.

## 2026-09-29 kullanım ve durum düzeltmesi

Yönetim sayfası etkin profili ayrı bir özet alanında, diğerlerini pasif olarak gösterir. Etkin kartın düğmesi tekrar etkinleştirmeye kapalıdır; pasif kartlar arasında geçiş yapılabilir. Bağlantı testinin başarılı/başarısız sonucu ile zamanı profil deposunda saklanır ve profil düzenlenince temizlenir. Bu kayıt test anının kanıtıdır; sürekli sağlık denetimi değildir. Düşünme kullanan modellerin kısa sınamada metin üretmeden token sınırına ulaşmaması için test çağrısı yeterli çıkış bütçesi kullanır. Yönetim sayfasının yazma istekleri XFactor CSRF başlığını gönderir; API adresi ve model kimliği katalog önerisinden sonra elle değiştirilebilir.
