# Platform ajan dosyaları

Bu klasör XFactor platformunun güvenilen talimat kaynağıdır. Üretilen uygulama belgeleri veya canlı proje durumları buraya yazılmaz.

| Dosyalar | Kullanım |
|---|---|
| `manager.md`, `director.md`, `teamleader.md`, `coder.md`, `reviewer.md`, `tester.md` | Altı platform ajanının sistem talimatları |
| `ORKESTRASYON-TALIMATNAMESI.md` | Platform orkestrasyon anayasası |
| `ALT-TALIMATNAME.md`, `GOREV.md`, `DURUM.md`, `TODO.md`, `RAPOR.md` | İnsan için protokol biçim referansları; backend bunları okuyup genişletmez, canlı kayıt değildir |

Backend sabit `x-agents` kökünden yalnız izinli dosya adlarını okur. Ortak `loadAgentSystemPrompt(role)` anayasanın tamamını ve frontmatter dışında rolün tamamını birleştirir; üretim rolleri bu bileşimi modül yüklenirken önbelleğe alır. Değişiklikten sonra backend yeniden başlatılmalıdır. Manager sohbeti aynı bileşimi istem hazırlanırken yeniden okur; anayasa karakter sınırıyla kesilmez. Kod/şema doğrulayıcıları önceliklidir, rolün çıktı şeması ve aşama kapsamı genel anlatımı uzmanlaştırır. `docs/`, proje belgeleri veya kod içi yedek isteme dönüş yoktur. Eksik/kısa talimatlar, bilinmeyen roller, dosya/dizin bağlantıları ve büyük/geçersiz dosyalar reddedilir. Gerçek proje Markdown kayıtlarını `backend/engine/fileProtocol.js` ve orkestratör üretir; beş referans şablonunu değiştirmek çalışma zamanı biçimini değiştirmez.

`docs/` geliştirme/işletim belgeleri içindir. Üretilen uygulamanın README ve belgeleri `projects/<id>/` altında; o projeye ait canlı görev/durum/rapor kayıtları aynı projenin `manager/` ve alt ajan klasörlerinde kalır. Şablonların taşınması mevcut projelerin disk protokolünü veya devam ettirme kayıtlarını taşımaz.

Platform talimatlarını yalnız operatör değiştirir. Backend, `PROJECTS_ROOT` veya proje klasörünün bu dizinle doğrudan ya da junction/symlink üzerinden çakışmasını reddeder. Üretim imajı `/app/x-agents` dosyalarını root sahipliğinde içerir; çalışma verileri için bu dizine yazılabilir volume bağlamayın. Dosya ayrımı işletim sistemi sandbox'ı değildir: `local-trusted` worker mevcut hesap yetkileriyle çalışır. Güvenilmeyen kod için ayrı, kısıtlı hesap veya uygun izolasyon gerekir.

## Üretim ve kalite kayıtları

Manager planı ve onayı, Coder/Reviewer denetimi ve Tester'ın statik sonucu ayrı aşamalardır. Tester onayı, uygulamanın çalıştırılarak doğrulandığı veya ZIP'in teslim edilebilir olduğu anlamına gelmez. Bunun için bağımsız worker kanıtları, zorunlu kalite kapıları ve kabul edilmiş artefakta bağlı kanonik tamamlanma kaydı gerekir.

Resume sırasında tamamlanmış kod üretimi yalnız `generationCompletion` kaydının onaylı sözleşme kimliği, sözleşme hash'i ve plan hash'iyle eşleşmesi halinde korunur. Kalite aşaması yeniden yürütülür; önceki PASS kayıtları yeni aday için otomatik başarı sayılmaz. Canlı durum SQLite/proje kayıtlarındadır; bu klasördeki şablonlar güncellenerek proje durumu değiştirilemez.

Güncel gerçek üretim kabulü: [21 Ekim 2026 yerel worker raporu](../docs/LOCAL-WORKER-VALIDATION-2026-10-21.md). Üretilen proje dizinleri ve teslim ZIP'leri Git kapsamı dışındadır.
