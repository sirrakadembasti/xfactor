// Türkçe Kelime Listesi ve Mantık Yardımcıları

export const TURKISH_SOLUTIONS = [
  'KALEM', 'KİTAP', 'MASAL', 'KAZAN', 'MELEK', 'DÜNYA', 'GÜNEŞ', 'DENİZ',
  'ÇİÇEK', 'BAHAR', 'SOKAK', 'MÜZİK', 'BARIŞ', 'SEVGİ', 'HAYAT', 'RADYO',
  'DUVAR', 'ORMAN', 'BEYAZ', 'SİYAH', 'KANAL', 'DAİRE', 'RESİM', 'YAZAR',
  'POLİS', 'TARİH', 'SABAH', 'AKŞAM', 'ŞEHİR', 'NEHİR', 'BULUT', 'KAHVE',
  'ELMAS', 'ALTIN', 'GÜMÜŞ', 'MEYVE', 'EKMEK', 'CEVİZ', 'ÇANTA', 'KAPAK',
  'DÖNEM', 'ZAMAN', 'FİKİR', 'BİLGİ', 'SÖZLÜ', 'CEVAP', 'SORUÇ', 'YAŞAM',
  'İNSAN', 'ÇOCUK', 'KADIN', 'ERKEK', 'GÖNÜL', 'SEVDA', 'MİLLET', 'VATAN',
  'GÖKYÜ', 'DENEY', 'SAVAŞ', 'BARIŞ', 'DÜZEN', 'ÖZGÜR', 'GÜÇLÜ', 'MUTLU',
  'SABIR', 'GÜVEN', 'SAYGI', 'SEVGİ', 'INANÇ', 'DREAM', 'MEYDAN', 'BAHÇE',
  'ÇAYIR', 'TARLA', 'NEFES', 'YÜREK', 'AKILL', 'TATL1', 'BİBER', 'SOĞAN',
  'LİMON', 'ARMUT', 'ÇİLEK', 'KİRAZ', 'KAVUN', 'KARPU', 'CEVİZ', 'BADEM'
].filter(w => w.length === 5);

// Ekstra geçerli tahmin kelimeleri
export const VALID_GUESSES = Array.from(new Set([
  ...TURKISH_SOLUTIONS,
  'ACABA', 'ACELE', 'ADETA', 'AFACAN', 'AFİŞE', 'AHŞAP', 'AKIL', 'AKŞAM',
  'ALARM', 'ALBÜM', 'ALEVİ', 'ALTI', 'AMBAR', 'AMCA', 'ANCAK', 'ANKET',
  'ANTEN', 'ARABA', 'ARIZA', 'ARSAN', 'ARTIK', 'ASLAN', 'ASTAR', 'AŞİRET',
  'ATLAS', 'AVUKAT', 'AYDIN', 'AYRAN', 'AYNA', 'BACAK', 'BAGAJ', 'BAKAN',
  'BAKIR', 'BALIK', 'BALON', 'BAMYA', 'BANKA', 'BANYO', 'BARAJ', 'BASIN',
  'BAŞKA', 'BATARYA', 'BATIK', 'BAYAN', 'BAYRAK', 'BAZEN', 'BEBEK', 'BEDEN',
  'BELGE', 'BELKİ', 'BELLEK', 'BENZİN', 'BERBER', 'BESTE', 'BETON', 'BEYAZ',
  'BIÇAK', 'BİLET', 'BİLİM', 'BİNA', 'BİTKİ', 'BİZİM', 'BOĞAZ', 'BORSA',
  'BÖCEK', 'BÖLGE', 'BÖLÜM', 'BUĞDAY', 'BUHAR', 'BURUN', 'BUTİK', 'BÜTÇE',
  'BÜYÜK', 'CADDE', 'CAMİA', 'CANLI', 'CASUS', 'CAVAP', 'CEKET', 'CEMAL',
  'CEVAP', 'CEVİZ', 'CİHAZ', 'CUMA', 'ÇABUK', 'ÇADIR', 'ÇALGI', 'ÇAMUR',
  'ÇANTA', 'ÇARŞI', 'ÇATI', 'ÇAYIR', 'ÇEKİÇ', 'ÇEVRE', 'ÇİÇEK', 'ÇİZGİ',
  'ÇOCUK', 'ÇORAP', 'ÇORBA', 'DAHİL', 'DAİRE', 'DAMLA', 'DAMAR', 'DANS',
  'DARBE', 'DAVET', 'DAVUL', 'DEDİK', 'DEFIN', 'DEGİŞ', 'DEĞER', 'DEMİR',
  'DENİZ', 'DEPO', 'DERGİ', 'DERİN', 'DERS', 'DERYA', 'DESTE', 'DEVAM',
  'DİKİŞ', 'DIŞARI', 'DİLEK', 'DİNCİ', 'DİREN', 'DİZİ', 'DOĞAL', 'DOĞRU',
  'DOLAP', 'DOLAR', 'DOMAT', 'DOSYA', 'DOSTU', 'DURUM', 'DUVAR', 'DUYGU',
  'DÜĞÜN', 'DÜNYA', 'DÜZEN', 'EKLEN', 'EKRAN', 'EKSİK', 'ELBİS', 'ELMAS',
  'EMLAK', 'EMNİY', 'ENGEL', 'ERKEK', 'ESKİS', 'EŞYA', 'ETİKET', 'EVREN',
  'EYLEM', 'FABRİ', 'FAKAT', 'FAKİR', 'FARET', 'FARK', 'FATURA', 'FAYDA',
  'FENER', 'FERAH', 'FİKİR', 'FİLM', 'FİRMA', 'FİYAT', 'FLAŞ', 'FORMAL',
  'FÜZE', 'GALİB', 'GARAP', 'GARİP', 'GEÇİC', 'GELİN', 'GELİR', 'GEMİ', 'GENÇ',
  'GENEL', 'GEREK', 'GİRDİ', 'GİYSİ', 'GÖLET', 'GÖLGE', 'GÖNÜL', 'GÖREV',
  'GÖRÜŞ', 'GÖZLE', 'GÜCÜ', 'GÜLÜŞ', 'GÜMÜŞ', 'GÜNEŞ', 'GÜNLÜ', 'GÜVEN',
  'HABER', 'HACİM', 'HAFTA', 'HAKİK', 'HALKA', 'HAMUR', 'HANGİ', 'HANIM',
  'HARİT', 'HASTA', 'HATIR', 'HAVA', 'HAYAL', 'HAYAT', 'HAZIR', 'HEDEF',
  'HEKİM', 'HELAL', 'HEMEN', 'HENÜZ', 'HESAP', 'HEYET', 'HIZLI', 'HİÇBİ',
  'HUKUK', 'HUZUR', 'HÜCRE', 'IŞIK', 'IRMAK', 'IZGARA', 'İLAVE', 'İLEÇ',
  'İLERİ', 'İLÇE', 'İLHAM', 'İKLİM', 'İKAZ', 'İMZA', 'İNANÇ', 'İNCİR',
  'İNSAN', 'İNTER', 'İPEK', 'İPTAL', 'İSKELE', 'İSLAM', 'İŞLET', 'İŞÇİ',
  'İTALİ', 'İTHAL', 'İYİLİ', 'JAPON', 'JÜRİ', 'KABUL', 'KAĞIT', 'KAHVE',
  'KALEM', 'KALIP', 'KALBİ', 'KALİT', 'KAMP', 'KANAL', 'KANAT', 'KANLI',
  'KAPAK', 'KAPLI', 'KAPUS', 'KARAR', 'KARGO', 'KARIN', 'KARDE', 'KAŞIK',
  'KASET', 'KATLI', 'KAVAL', 'KAVGA', 'KAYAK', 'KAYIP', 'KAZAN', 'KELEB',
  'KENAR', 'KENDİ', 'KESİN', 'KEYİF', 'KIRIK', 'KISIM', 'KIYI', 'KİTAP',
  'KLASİ', 'KLİMA', 'KOCA', 'KOLAY', 'KOLEJ', 'KOMŞU', 'KONUŞ', 'KOREA',
  'KORKU', 'KORUMA', 'KOŞUL', 'KÖPRÜ', 'KÖSÜ', 'KREŞ', 'KRAL', 'KURAL',
  'KURUM', 'KURUÇ', 'KUTU', 'KUTLU', 'KUZEY', 'KÜÇÜK', 'KÜLTÜ', 'KÜMES',
  'KÜRE', 'KÜSÜS', 'LAMPA', 'LASTİ', 'LİDER', 'LİMAN', 'LİSTE', 'LİTRE',
  'LOKMA', 'MADDE', 'MADEN', 'MAĞAZ', 'MAHAL', 'MAKİN', 'MALUM', 'MANAV',
  'MANZA', 'MARKA', 'MARTI', 'MASAL', 'MASA', 'MASKA', 'MAVİ', 'MEDYA',
  'MEKAN', 'MELEK', 'MERAK', 'MERMİ', 'MESAF', 'MESEK', 'MESAJ', 'MESLE',
  'MEVKİ', 'MEYVE', 'MEYDA', 'MISIR', 'MİKTAR', 'MİLLE', 'MİMAR', 'MİNİK',
  'MİSAF', 'MİZAH', 'MODEL', 'MODER', 'MOTOR', 'MUHAT', 'MUTLU', 'MÜDÜR',
  'MÜZİK', 'MÜZE', 'NAKİT', 'NASIL', 'NAZAR', 'NEFES', 'NEHİR', 'NESNE',
  'NETİC', 'NİMET', 'NİSAN', 'NİŞAN', 'NOKTA', 'NOTAR', 'OKUL', 'OLAY',
  'OLMAZ', 'ORMAN', 'ORTAM', 'ORTAK', 'OTEL', 'OYNUR', 'ÖDÜL', 'ÖĞLEN',
  'ÖNCEK', 'ÖNEML', 'ÖRNEK', 'ÖRTÜ', 'ÖZEL', 'ÖZEN', 'ÖZGÜR', 'ÖZET',
  'PAKET', 'PAMUK', 'PANEL', 'PARÇI', 'PARKA', 'PARLA', 'PARTİ', 'PASAP',
  'PASTA', 'PAZAR', 'PEYNİ', 'PİLAN', 'PİLOT', 'PİŞİR', 'PİYAS', 'POLİS',
  'POSTA', 'POZİT', 'PROJE', 'RABTA', 'RADYO', 'RAPOR', 'RESİM', 'RESMİ',
  'RİSKL', 'RİTİM', 'RÜZGA', 'SABAH', 'SABIR', 'SABUN', 'SADIK', 'SAĞLI',
  'SAHİL', 'SAHNE', 'SAKİN', 'SALON', 'SAMİM', 'SANAT', 'SANCI', 'SANİT',
  'SARI', 'SAVAŞ', 'SAYGI', 'SEBEP', 'SEBZE', 'SEÇİM', 'SEVGİ', 'SEVER',
  'SEVİC', 'SEYİR', 'SICAK', 'SIFIR', 'SIĞIR', 'SINIR', 'SINIF', 'SINAV',
  'SİLAH', 'SİSİ', 'SİYAH', 'SİYAS', 'SİZİN', 'SOĞUK', 'SOKAK', 'SOLUK',
  'SONRA', 'SORG1', 'SORUN', 'SOYLU', 'SÖZCU', 'SÖZLÜ', 'SPOR', 'STAD',
  'SUNUC', 'SÜREÇ', 'SÜREK', 'SÜRÜC', 'SÜTÇÜ', 'ŞAHİS', 'ŞAHİN', 'ŞEKER',
  'ŞEKİL', 'ŞEHİR', 'ŞAMPİ', 'ŞANS', 'ŞARKI', 'ŞATI', 'ŞEREF', 'ŞİRKET',
  'ŞİİR', 'ŞUBAT', 'ŞÜPHE', 'TABLO', 'TABAN', 'TAHIN', 'TAKIM', 'TAKİP',
  'TALEB', 'TAMAM', 'TARAF', 'TARİH', 'TARLA', 'TARZF', 'TARTU', 'TASAR',
  'TAŞIT', 'TATLI', 'TAVIR', 'TAVŞA', 'TAZE', 'TEDAV', 'TEKLİ', 'TEKNE',
  'TELER', 'TEMA', 'TEMİZ', 'TEMMU', 'TEPSİ', 'TERZİ', 'TESİS', 'TESTI',
  'TEZEL', 'TİCAR', 'TİLKİ', 'TİPİK', 'TİYAT', 'TOHUM', 'TORUN', 'TÖREN',
  'TRAFİ', 'TREN', 'TULUM', 'TUZLU', 'TÜNEL', 'TÜKET', 'TÜRKÜ', 'TÜRÜ', 'UCUZ',
  'UÇAK', 'UFUK', 'ULAŞI', 'UMUT', 'UNSUR', 'UNUTU', 'USUL', 'UYGUN',
  'UYGAR', 'UYARI', 'UZMAN', 'UZUN', 'ÜCRET', 'ÜLKE', 'ÜNİVE', 'ÜNLÜ',
  'ÜRÜN', 'ÜSTAT', 'ÜSTÜN', 'ÜZÜM', 'VAGON', 'VAKİT', 'VALİZ', 'VANGA',
  'VARLI', 'VATAN', 'VATAN', 'VEKİL', 'VERGİ', 'VERİM', 'VİDEO', 'VİŞNE',
  'VİTES', 'VÜCUT', 'YAKIN', 'YAKIT', 'YALAN', 'YALNIZ', 'YAMAC', 'YANLI',
  'YAPIN', 'YAPRA', 'YARAR', 'YARD1', 'YARIN', 'YASAL', 'YAŞAM', 'YAŞLI',
  'YATIR', 'YAVRU', 'YAYIN', 'YAYLA', 'YAZAR', 'YAZI', 'YEŞİL', 'YETKİ',
  'YILDI', 'YILMA', 'YİRMİ', 'YOĞUN', 'YOKSA', 'YOLCU', 'YORUM', 'YÖNEM',
  'YÖNET', 'YUKAR', 'YUMUR', 'YUNAN', 'YÜKSE', 'YÜREK', 'YÜZDE', 'YÜZÜK',
  'ZAMAN', 'ZARAR', 'ZARİF', 'ZATEN', 'ZEKİ', 'ZENGİ', 'ZEYTİ', 'ZİNCİ',
  'ZİRVE', 'ZORLU', 'ZULÜM'
]).filter(w => w.length === 5));

export function getDailyWord() {
  const epochMs = new Date(2024, 0, 1).getTime();
  const nowMs = Date.now();
  const dayIndex = Math.floor((nowMs - epochMs) / (1000 * 60 * 60 * 24));
  const index = Math.abs(dayIndex) % TURKISH_SOLUTIONS.length;
  return TURKISH_SOLUTIONS[index];
}

export function getRandomWord() {
  const index = Math.floor(Math.random() * TURKISH_SOLUTIONS.length);
  return TURKISH_SOLUTIONS[index];
}

export function toTurkishUpper(str) {
  return str.toLocaleUpperCase('tr-TR');
}

export function evaluateGuess(guess, solution) {
  const result = Array(guess.length).fill('absent');
  const solutionChars = solution.split('');
  const guessChars = guess.split('');

  // İlk geçiş: Tam eşleşmeler (green / correct)
  guessChars.forEach((char, i) => {
    if (char === solutionChars[i]) {
      result[i] = 'correct';
      solutionChars[i] = null; // kullanıldı işaretle
    }
  });

  // İkinci geçiş: Yanlış pozisyondaki eşleşmeler (yellow / present)
  guessChars.forEach((char, i) => {
    if (result[i] !== 'correct') {
      const foundIndex = solutionChars.indexOf(char);
      if (foundIndex !== -1) {
        result[i] = 'present';
        solutionChars[foundIndex] = null; // kullanıldı işaretle
      }
    }
  });

  return result;
}
