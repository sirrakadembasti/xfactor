# Graphify Kullanım ve Bilgi Notu

Bu doküman, **Graphify** aracının kısıtlı ağlarda (MEB vb.) kullanımı, komutları ve bu uygulama (Gemini / Antigravity AI Asistanı) içerisindeki çalışma mantığına dair rehberdir.

---

## 1. Graphify Nedir ve Ne İşe Yarar?

Graphify, projenizdeki kod dosyalarını AST (Abstract Syntax Tree / Soyut Sözdizimi Ağacı) seviyesinde analiz ederek sınıflar, fonksiyonlar ve bağımlılıklar arasındaki ilişkileri çıkaran bir **Bilgi Grafiği (Knowledge Graph)** motorudur.

* **Token Tasarrufu:** Yapay zekanın tüm projedeki kodları tek tek okuması yerine grafik üzerinden sorgulama yapmasını sağlayarak %90'a varan token tasarrufu sağlar.
* **Hızlı Anlama:** Yapay zeka asistanının projenin genel mimarisini ve bileşenler arası ilişkileri saniyeler içinde kavramasını sağlar.
* **Tamamen Yerel:** Analiz tamamen kendi bilgisayarınızda yapılır, kodlarınız dışarı aktarılmaz.

---

## 2. Kısıtlı Ağlarda (MEB vb.) IPv4 ile Çalıştırma

Ağınızda IPv6 DNS çözünürlüğü kısıtlı olduğu için standart `graphify` komutu yerine Python üzerinden **IPv4 zorlamalı** komutları kullanabilirsiniz.

### A. Standart Komut (İnternet/Ağ Normal Olduğunda):
```bash
python -m graphify <komut>
```

### B. Kısıtlı Ağ / IPv4 Zorlamalı Komut (Garanti Çalışan Yöntem):
```bash
python -c "import socket; orig=socket.getaddrinfo; socket.getaddrinfo=lambda h,p,f=0,t=0,pr=0,fl=0: orig(h,p,socket.AF_INET,t,pr,fl); from graphify.cli import main; import sys; sys.argv=['graphify'] + sys.argv[1:]; main()" <komut_ve_parametreler>
```

---

## 3. Temel Graphify Komutları ve Kullanımları

| Komut | Açıklama |
| :--- | :--- |
| `python -m graphify extract . --code-only` | Projedeki tüm kodları tarar ve `graphify-out/graph.json` haritasını oluşturur. |
| `python -m graphify query "<soru>"` | Bilgi grafiği üzerinde belirli bir fonksiyon/modül hakkında sorgulama yapar. |
| `python -m graphify explain "<kavram>"` | Projedeki belirli bir mimariyi veya sınıfı grafik üzerinden detaylı açıklar. |
| `python -m graphify path "<bileşen_A>" "<bileşen_B>"` | İki kod bileşeni (fonksiyon/sınıf) arasındaki çağrı yolunu ve ilişkileri gösterir. |
| `python -m graphify god-nodes` | Projedeki en çok bağlantıya sahip merkez (mimari odak) düğümleri listeler. |
| `python -m graphify tree` | Grafiği tarayıcıda görselleştirmek için `graphify-out/GRAPH_TREE.html` sayfasını üretir. |
| `python -m graphify reflect` | Başarılı sorgulardan çıkarılan dersleri `LESSONS.md` hafıza dosyasına kaydeder. |
| `python -m graphify gemini install` | Gemini CLI / Antigravity asistanı entegrasyonunu ve hook'larını yeniden kurar. |

---

## 4. Bu Uygulama (Gemini / Antigravity AI) İçinde Kullanımı

Bu proje dizininde (`xfactor`) `graphify gemini install` komutu başarıyla çalıştırıldığı için:

1. **Otomatik Grafiği Kullanma:**
   Siz bu sohbet ekranında projeyle ilgili genel mimari veya kod soruları sorduğunuzda (Örn: *"Bu projede veri tabanı bağlantısı nerede kuruluyor?"* veya *"Projedeki ana bileşenler nasıl haberleşiyor?"*), Gemini asistanı arka planda `graphify query` komutunu çalıştırarak doğrudan haritadan yanıt verir.

2. **Kod Değişikliklerinden Sonra Güncelleme:**
   Projenize yeni dosyalar eklediğinizde veya önemli fonksiyon güncellemeleri yaptığınızda, haritayı tazelemek için terminalinizde şu komutu çalıştırmanız yeterlidir:
   ```bash
   python -m graphify extract . --code-only
   ```

3. **Öğrenen Hafıza (Memory):**
   Karmaşık bir hatayı çözdüğümüzde veya mimari bir karara vardığımızda asistan `graphify reflect` mekanizmasını kullanarak bu tecrübeyi projeye özel `LESSONS.md` dosyasına kaydeder ve gelecekte aynı hataların tekrarlanmasını engeller.
