/**
 * Türkçe Karakter Yardımcı Fonksiyonları
 * Türkçe alfabe büyüklük/küçüklük dönüşümleri, UTF-8 normalizasyonu ve karşılaştırma işlevleri sunar.
 */

// Türkçe alfabe karakter kümesi (A-Z, a-z ve Türkçe özel harfler)
export const TURKISH_ALPHABET_REGEX = /^[a-zA-ZçÇğĞıİöÖşŞüÜ\s-]+$/;

/**
 * Metni Türkçe yerel kurallarına göre küçük harfe dönüştürür.
 * 'I' -> 'ı' ve 'İ' -> 'i' dönüşümlerini doğru yapar.
 */
export function toTurkishLowerCase(text: string): string {
  if (!text) return '';
  return text.toLocaleLowerCase('tr-TR');
}

/**
 * Metni Türkçe yerel kurallarına göre büyük harfe dönüştürür.
 * 'i' -> 'İ' ve 'ı' -> 'I' dönüşümlerini doğru yapar.
 */
export function toTurkishUpperCase(text: string): string {
  if (!text) return '';
  return text.toLocaleUpperCase('tr-TR');
}

/**
 * Türkçe metni normalize eder:
 * - Unicode NFC normalizasyonu uygular
 * - Baş/son boşlukları temizler
 * - Ardışık boşlukları tek boşluğa indirger
 */
export function normalizeTurkishText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Arama ve indeksleme işlemleri için metni küçük harfe dönüştürüp normalize eder.
 */
export function prepareTurkishForSearch(text: string): string {
  return toTurkishLowerCase(normalizeTurkishText(text));
}

/**
 * İki Türkçe metni büyük/küçük harf duyarsız olarak karşılaştırır.
 */
export function turkishEquals(str1: string, str2: string): boolean {
  return prepareTurkishForSearch(str1) === prepareTurkishForSearch(str2);
}

/**
 * Verilen metnin yalnızca Türkçe alfabe harfleri, boşluk ve tire içerip içermediğini kontrol eder.
 */
export function isTurkishAlphabetOnly(text: string): boolean {
  if (!text) return false;
  return TURKISH_ALPHABET_REGEX.test(text.trim());
}

/**
 * Türkçe özel karakterleri ASCII karşılıklarına dönüştürür.
 * Örn: 'şeker' -> 'seker', 'İĞDE' -> 'IGDE'
 */
export function removeTurkishAccents(text: string): string {
  if (!text) return '';
  const map: Record<string, string> = {
    'ç': 'c', 'Ç': 'C',
    'ğ': 'g', 'Ğ': 'G',
    'ı': 'i', 'I': 'I',
    'İ': 'I', 'i': 'i',
    'ö': 'o', 'Ö': 'O',
    'ş': 's', 'Ş': 'S',
    'ü': 'u', 'Ü': 'U',
  };
  return text.replace(/[çÇğĞıİöÖşŞüÜ]/g, (match) => map[match] || match);
}
