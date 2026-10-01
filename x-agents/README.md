# Platform ajan dosyaları

Bu klasör XFactor platformunun güvenilen talimat kaynağıdır. Üretilen uygulama belgeleri veya canlı proje durumları buraya yazılmaz.

| Dosyalar | Kullanım |
|---|---|
| `manager.md`, `director.md`, `teamleader.md`, `coder.md`, `reviewer.md`, `tester.md` | Altı platform ajanının sistem talimatları |
| `ORKESTRASYON-TALIMATNAMESI.md` | Platform orkestrasyon anayasası |
| `ALT-TALIMATNAME.md`, `GOREV.md`, `DURUM.md`, `TODO.md`, `RAPOR.md` | Proje içindeki protokol kayıtlarının biçim şablonları; canlı durum kayıtları değildir |

Backend sabit `x-agents` kökünden yalnız izinli dosya adlarını okur. `docs/` ve proje belgelerine veya kod içi yedek istemlere dönüş yapmaz. Eksik/kısa talimatlar, bilinmeyen roller, dosya/dizin bağlantıları ve büyük/geçersiz dosyalar reddedilir. Rol talimatları modül yüklenirken alınır; değiştirildikten sonra backend yeniden başlatılmalıdır. Sohbet anayasası ve Manager talimatı sohbet istemi hazırlanırken tekrar okunur.

`docs/` geliştirme/işletim belgeleri içindir. Üretilen uygulamanın README ve belgeleri `projects/<id>/` altında; o projeye ait canlı görev/durum/rapor kayıtları aynı projenin `manager/` ve alt ajan klasörlerinde kalır. Şablonların taşınması mevcut projelerin disk protokolünü veya devam ettirme kayıtlarını taşımaz.

Platform talimatlarını yalnız operatör değiştirir. Backend, `PROJECTS_ROOT` veya proje klasörünün bu dizinle doğrudan ya da junction/symlink üzerinden çakışmasını reddeder. Üretim imajı `/app/x-agents` dosyalarını root sahipliğinde içerir; çalışma verileri için bu dizine yazılabilir volume bağlamayın. Dosya ayrımı işletim sistemi sandbox'ı değildir: `local-trusted` worker mevcut hesap yetkileriyle çalışır. Güvenilmeyen kod için ayrı, kısıtlı hesap veya uygun izolasyon gerekir.
