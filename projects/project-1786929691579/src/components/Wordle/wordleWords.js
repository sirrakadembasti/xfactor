// 5 Harfli Türkçe Kelime Listesi
export const TARGET_WORDS = [
  "ARABA", "ARMUT", "ASLAN", "AYRAN", "BAHAR", "BEYAZ", "BİBER", "BÖCEK", "BULUT", "CEVİZ",
  "ÇANTA", "ÇİÇEK", "ÇİLEK", "DENİZ", "DÜNYA", "ELMAS", "FAKAT", "FİKİR", "GÜNEŞ", "HABER",
  "HAYAT", "IRMAK", "İNSAN", "İZMİR", "KABAK", "KADIN", "KALEM", "KAPAN", "KAŞIK", "KAVUN",
  "KAYIK", "KİTAP", "KÖPEK", "KURAL", "LİMON", "MASAL", "MELEK", "MEYVE", "MÜZİK", "NOKTA",
  "ORMAN", "ÖRDEK", "PAZAR", "PEMBE", "RADYO", "SABAH", "SANAT", "SEVGİ", "SİYAH", "SOĞAN",
  "ŞEHİR", "ŞEKER", "TABLO", "TAVUK", "TİLKİ", "UZMAN", "ÜÇGEN", "VİŞNE", "YALAN", "YILAN",
  "YEŞİL", "ZAMAN"
];

// Geçerli kabul edilen tüm tahmin kelimeleri (Hedef kelimeler dahil)
export const ALLOWED_WORDS = Array.from(new Set([
  ...TARGET_WORDS,
  "ACABA", "AÇLIK", "ADRES", "AFİŞS", "AHŞAP", "AKŞAM", "ALARM", "ALKOL", "AMBAR", "AMCAZ",
  "ANLAM", "ANTEN", "ARAZİ", "ARŞİV", "ASGAR", "ASKER", "AŞIMA", "AŞİRET", "ATLAS", "AVUKAT",
  "BAGAJ", "BAKIR", "BALIK", "BANKA", "BARAJS", "BASIN", "BAŞKA", "BATARY", "BEYİN", "BİLGİ",
  "BÖLGE", "BÜTÇE", "BÜYÜK", "CANLI", "CEVAP", "CİHAZ", "CÜMLE", "ÇABUK", "ÇAMUR", "ÇATAL",
  "ÇEVRE", "ÇİZGİ", "ÇOCUK", "DARBE", "DAİRE", "DAMLA", "DEĞER", "DELİL", "DEMİR", "DENEY",
  "DERYA", "DESEN", "DESTAN", "DEVRE", "DİKİŞ", "DİLEK", "DİZİN", "DOĞAL", "DOĞRU", "DOLAP",
  "DOSTU", "DURAĞ", "DUYGU", "DÜZEN", "EGZOZ", "EKLEN", "EKRAN", "EKSİK", "EYLEM", "EYLÜL",
  "FATURA", "FİDAN", "FİRMA", "FİZİK", "FORMÜ", "FOTOĞ", "FÜZE0", "GARAN", "GAYRE", "GEZEG",
  "GİRİŞ", "GİYİM", "GÖLET", "GÖLGE", "GÖREV", "GÖRÜŞ", "GÖĞÜS", "GÜÇLÜ", "GÜMÜŞ", "GÜVEN",
  "HALAT", "HALKA", "HAMLE", "HARİT", "HASAR", "HASTA", "HAFTA", "HEKİM", "HELAL", "HEDEF",
  "HESAP", "HUZUR", "HÜCRE", "IŞIKL", "İÇERİ", "İDDAA", "İFADE", "İKAMET", "İKAZL", "İKLEM",
  "İLÇES", "İLHAM", "İLİŞK", "İLKER", "İMAM1", "İMKAN", "İNANÇ", "İNCİR", "İNCEK", "İPEKL",
  "İSLA2", "İSMAY", "İSMET", "İSRAF", "İŞLEM", "İŞARE", "İTALYA", "İTİBA", "İZLE2"
])).filter(word => word.length === 5);

export const getRandomWord = () => {
  const randomIndex = Math.floor(Math.random() * TARGET_WORDS.length);
  return TARGET_WORDS[randomIndex];
};
