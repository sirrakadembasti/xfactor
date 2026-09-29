# LLM Yönetimi kullanıcı kılavuzu

## İlk kurulum

1. XFactor'ın yerel `backend/.env` dosyasında LLM yönetimi için yalnızca `LLM_CONFIG_ENCRYPTION_KEY` şifreleme anahtarı bulunur; sağlayıcı adresi, modeli ve API anahtarı burada tutulmaz. Bu anahtarı Git'e koymayın; kaybolursa kayıtlı sağlayıcı anahtarları çözülemez. Eklentiyi başka uygulamaya taşıdığınızda o uygulama için yeni bir 32 baytlık anahtar üretin:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Daha önce `.env` içinde bulunan Google Gemini API anahtarı şifreli **Google Gemini** profiline taşınmıştır. Xiaomi MiMo profili de yönetim ekranında kayıtlıdır. Etkin sağlayıcıyı **Etkinleştir** düğmesiyle değiştirebilirsiniz. Token Plan anahtarı ile Singapur adresi aynı plana/bölgeye ait olmalıdır.
3. XFactor'a yönetici olarak giriş yapın. Sol menüden **LLM Yönetimi** sayfasını açın (`/llm`). Geliştirme sunucusu `/llm` isteğini backend'e yönlendirir.
4. Sağlayıcıyı seçin, profil adını, API adresini, model kimliğini ve o sağlayıcının API anahtarını girin. Katalog değerleri yalnızca başlangıç önerisidir; API adresi ve model kimliği alanlarına güncel değerleri elle yazabilirsiniz. **Profili kaydet** ardından **Bağlantıyı sına** ve **Etkinleştir** adımlarını izleyin. **Düzenle** sırasında API anahtarını boş bırakırsanız kayıtlı anahtar korunur; yeni anahtar girerseniz değiştirilir.

## Kayıtlı profilleri yönetme

- Sayfanın üstündeki **Etkin profil** özeti Manager ve ajanların seçili olarak kullandığı profili gösterir. Aynı anda yalnızca bir profil etkindir.
- Etkin profil kartında düğme **Etkin** olarak görünür ve tekrar basılamaz. Pasif kartların **Etkinleştir** düğmesiyle sağlayıcıyı değiştirebilirsiniz.
- Her kartta son bağlantı testinin sonucu ve zamanı gösterilir. Bu, test anının sonucudur; sağlayıcının sürekli erişilebilir olduğuna dair canlı sağlık garantisi değildir. Profil düzenlenince önceki test sonucu temizlenir ve yeniden sınanmalıdır.
- Etkin profili silerseniz seçili profil kalmaz. Silme öncesinde arayüz bu sonucu belirtir.

Xiaomi MiMo Token Plan (Singapur) seçildiğinde `https://token-plan-sgp.xiaomimimo.com/v1` ve şu model seçenekleri hazır gelir: `mimo-v2.6-pro`, `mimo-v2.6-flash`, `mimo-v2.5-pro`, `mimo-v2.5`. Bölge adresi ve Token Plan anahtarı hakkında [Xiaomi'nin resmî kılavuzuna](https://mimo.mi.com/docs/tokenplan/subscription) bakın.

Bağlantı testi, düşünme kullanan modellerin yanıt üretmesine yetecek çıkış sınırıyla gerçek bir çağrı yapar. Sağlayıcı HTTP 200 dönse bile metin üretmeden token sınırına ulaşırsa test bunu ayrı bir hata olarak bildirir.

Yalnızca API anahtarını değiştirmek yeterli değildir: sağlayıcı, model ve API adresi aynı hizmete ait olmalıdır. Model kimliği sağlayıcının kendi panelinden alınabilir. **Modelleri getir** desteklenen uç noktalardan listeyi sorgular; başarısız olursa model kimliği elle girilebilir. İlgili sağlayıcının faturalandırma ve erişim koşulları kendi hesabınızda geçerlidir. Bağlantı testi kısa bir gerçek model çağrısı yapar.

## Profiller ve güvenlik

- Sağlayıcı kataloğu başlangıç adresleri sunar; değişen adres ve model kimlikleri düzenlenebilir. **Özel OpenAI uyumlu** seçeneği katalog dışındaki hizmetler içindir.
- Kayıtlı anahtar arayüze geri gönderilmez. Sunucuda AES-256-GCM ile şifrelenir; profil dosyası varsayılan olarak `backend/data/llm-profiles.json` konumundadır. Bu dosya Git dışında tutulur.
- Sayfa ve `/api/llm` uç noktaları yalnızca yönetici oturumuna açıktır. API'nin yazma istekleri XFactor'ın mevcut CSRF denetiminden geçer.
- Genel adreslerde HTTPS zorunludur. Geliştirmede yerel HTTP modeli kullanmak için yalnız güvenilen ortamda `LLM_ALLOW_LOCAL_HTTP=true` ayarlanabilir.
- Etkin profil silinirse XFactor eski kurulumlarla uyumluluk için varsa `.env` sağlayıcı ayarlarına dönebilir. Yeni kurulumlarda sağlayıcı bilgilerini yalnızca yönetim sayfasında tanımlayın.
- Profil dosyasının yerini değiştirmek için `LLM_CONFIG_PATH` ayarlanabilir. Bu dosyanın ve şifreleme anahtarının yedeğini birlikte güvenli biçimde saklayın.

## Başka Express uygulamasına ekleme

`backend/llm-auth/llm.js` içindeki `mountLLMManagement` uygulamanın mevcut oturum ara yazılımını alır. `requireAuth` isteğe `req.user` eklemeli; yönetici için `req.user.isAdmin === true` sağlamalıdır. JSON body ve CSRF korumasını montajdan önce kurun.

```js
import express from 'express';
import { mountLLMManagement, createLLMProfileStore } from './llm-auth/llm.js';

const app = express();
app.use(express.json());
app.use('/api', yourCsrfMiddleware);
mountLLMManagement(app, {
  requireAuth: yourSessionMiddleware,
  store: createLLMProfileStore({
    filePath: '/secure/data/llm-profiles.json',
    encryptionKey: process.env.LLM_CONFIG_ENCRYPTION_KEY
  })
});
```

Bu montaj `/llm`, `/llm/llm-ui.js` ve `/api/llm` yollarını açar. Başka uygulamanın LLM çağrıları için `createLLMProfileStore(...).getActive()` sonucunu kendi istemcisine aktarın; `apiKey` değerini yalnız sunucu tarafında kullanın.
