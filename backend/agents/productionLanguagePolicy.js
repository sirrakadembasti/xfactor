/** Shared production requirement; never normalize persisted contracts with this policy. */
export const PRODUCTION_LANGUAGE_POLICY = `TÜRKÇE ÜRETİM DİLİ POLİTİKASI (tüm roller ve tüm üretim görevleri için zorunlu):
Üretilen uygulamanın kullanıcıya görünen bütün metinleri doğru Türkçe ve Türkçe karakterlerle yazılır: menüler, başlıklar, düğmeler, etiketler, yardım ve doğrulama metinleri, hata ve başarı bildirimleri, boş durumlar, giriş ve yetkilendirme ekranları. Ç, ç, Ğ, ğ, İ, ı, Ö, ö, Ş, ş, Ü, ü karakterlerini görünür metinlerde koru; ASCII'ye indirgeme. Sayfa, bileşen, erişilebilirlik etiketi ve dinamik/API kaynaklı görünür mesajlar da bu kurala dahildir.
Her uygulama rolünün kullanıcıya görünen adı ve her role ait demo hesabın görünen adı uygulamanın alanına uygun Türkçe olmalıdır. Alanı onaylı sözleşmeden çıkar; bilinmeyen roller uydurma. Teknik rol kimliği veya auth role.name/API enum değerini çevirmek yerine sunum katmanında Türkçe görünen ad eşlemesi kullan. Demo hesabın görünen adı ile teknik kullanıcı adı/e-posta alanını ayrı tut.
Yalnız yeni teknik kullanıcı adı, e-posta ve ID üretirken gerekirse şu birebir dönüşümü uygula: Çç→Cc, Ğğ→Gg, İ→I, ı→i, Öö→Oo, Şş→Ss, Üü→Uu. Örnekler: Çorap→Corap; Ağaç→Agac; İstanbul→Istanbul; ılık→ilik; Ördek→Ordek; Şemsiye→Semsiye; Üzüm→Uzum. Bu dönüşüm genel metin temizleyicisi değildir; görünür adları, mevcut kimlikleri, enumları veya şema anahtarlarını dönüştürme.
Onaylı/persist edilmiş sözleşme kayıtlarını, normalizasyonunu, sözleşme hash'ini ve devam ettirme (resume) kimliklerini bu dil politikası nedeniyle değiştirme. Sözleşmedeki teknik kimlikleri koruyarak Türkçe sunum metinleri üret.
Manager bu kuralı kapsam ve kabul ölçütlerine, Director ve Teamleader görev gereksinimlerine taşır; Coder görünür metinlerde ve sunum eşlemelerinde uygular. Reviewer ve Tester görünür İngilizce veya Türkçe karakterleri eksik metinleri uygunsuzluk olarak raporlar. Salt istem, statik inceleme veya Tester görüşü gerçek worker/browser yürütme kanıtı yerine geçmez; tüm görünür durumların dil uygunluğu yürütme kanıtıyla doğrulanmalıdır.`;

const TURKISH_IDENTIFIER_CHARACTERS = Object.freeze({
    Ç: 'C', ç: 'c', Ğ: 'G', ğ: 'g', İ: 'I', ı: 'i',
    Ö: 'O', ö: 'o', Ş: 'S', ş: 's', Ü: 'U', ü: 'u'
});

/** Opt-in transliteration for a newly created technical identifier, never display text. */
export function transliterateTurkishIdentifier(value) {
    if (typeof value !== 'string') throw new TypeError('Teknik kimlik bir metin olmalıdır.');
    return value.replace(/[ÇçĞğİıÖöŞşÜü]/g, character => TURKISH_IDENTIFIER_CHARACTERS[character]);
}
