# DURUM — <bu klasörün adı>

Son güncelleme: <tarih/saat>
Durum örnekleri: BEKLEMEDE | BASLADI | CALISIYOR | DEVAM_EDIYOR | BLOKE | BASARISIZ | YENIDEN_BASLATILDI | TAMAMLANDI

Bu insan için bir referans şablondur; çalışma zamanı enum doğrulayıcısı değildir. Gerçek kaydı `backend/engine/fileProtocol.js:writeDurum` yazar. Tamamlanma yalnız bu metinden çıkarılmaz; checkpoint ve bağımsız kabul kanıtı ayrıca doğrulanır.
Genel ilerleme: %<sayı>

## Bloke Nedeni (yalnızca BLOKE ise doldur)
<Açıklama + üst ajandan beklenen net cevap / talep (örn. coder için: "görev atomik değil, yeniden bölünmeli")>

## Alt Birimler Özeti (varsa)
- gorev-x/: TAMAMLANDI
- gorev-y/: DEVAM_EDIYOR
