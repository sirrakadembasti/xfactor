# Proje Orkestrasyon Kuralları

Bu proje, **dosya-bazlı çok katmanlı ajan hiyerarşisi** ile yürütülür. Tam detay için `ORKESTRASYON-TALIMATNAMESI.md` dosyasına bakın. Özet kurallar:

1. Sabit hiyerarşi: `manager.agent` (kök) → `director.agent` (`<prefix>.director/`, örn. `frontend.director/`) → `teamleader.agent` (`<prefix>.teamleader/`, director ile aynı ön-isim) → `coder.agent` (`gorev-*/`, **yaprak — altında başka ajan yok**).
2. Her ajan yalnızca kendi klasörüyle ve altındakilerle ilgilenir. Başka bir ajanın klasörüne doğrudan yazmaz.
3. İletişim yalnızca şu dosyalar üzerinden yürür: `GOREV.md`, `TODO.md`, `DURUM.md`, `RAPOR.md` (director seviyesinde ayrıca `ALT-TALIMATNAME.md`). Sohbet geçmişine güvenmeyin — her ajan işe başlarken kendi klasöründeki `GOREV.md`'yi okuyarak başlar.
4. **coder.agent kendi altına asla klasör açmaz / iş bölmez.** Görev atomik değilse `DURUM.md` = `BLOKE` yapıp teamleader'dan yeniden bölme ister. Atomiklik sorumluluğu teamleader.agent'a aittir (bkz. talimatname §6).
5. Belirsiz/çelişkili bir durumda kendi `DURUM.md`'nizi `BLOKE` yapıp net soruyu yazın — tahmine dayalı, geri dönüşü zor kararlar almayın.
6. Görev tamamlandığında: kendi `DURUM.md` → `TAMAMLANDI`, `RAPOR.md` doldurulur, üst klasördeki `TODO.md`'de yalnızca kendinize ait satır işaretlenir.

Subagent rol tanımları: `.claude/agents/manager.md`, `director.md`, `teamleader.md`, `coder.md`.
Boş şablonlar: `sablonlar/` klasörü.
