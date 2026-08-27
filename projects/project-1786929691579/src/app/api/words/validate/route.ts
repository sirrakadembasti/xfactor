import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FALLBACK_WORDS = [
  "KALEM", "KİTAP", "MELEK", "GÜNEŞ", "DENİZ", "SABAH", "BAHAR", "ÇİÇEK",
  "SEVGİ", "YAZAR", "SOKAK", "BEYAZ", "SİYAH", "İNSAN", "HAYAT", "DÜNYA",
  "ZAMAN", "MÜZİK", "ŞEHİR", "YÜREK", "KADIN", "ERKEK", "ÇOCUK", "MEYVE",
  "ELMAS", "MASAL", "RADYO", "KÖPEK", "HOROZ", "TİLKİ", "ASLAN", "DOLAP",
  "DUVAR", "TAVAN", "BÖLGE", "KAĞIT", "DUMAN", "BULUT", "AHŞAP", "CEVİZ"
];

function toTurkishUpper(str: string): string {
  return str
    .replace(/i/g, "İ")
    .replace(/ı/g, "I")
    .toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { word } = body;

    if (!word || typeof word !== "string") {
      return NextResponse.json(
        { success: false, isValid: false, message: "Kelime parametresi geçerli bir metin olmalıdır." },
        { status: 400 }
      );
    }

    const normalizedWord = toTurkishUpper(word.trim());

    if (normalizedWord.length !== 5) {
      return NextResponse.json({
        success: true,
        isValid: false,
        word: normalizedWord,
        message: "Kelime 5 harfli olmalıdır."
      });
    }

    let isValid = false;

    try {
      const existingWord = await prisma.word.findFirst({
        where: {
          text: {
            equals: normalizedWord,
            mode: "insensitive"
          }
        }
      });

      if (existingWord) {
        isValid = true;
      }
    } catch (dbError) {
      console.warn("Veritabanı kelime kontrolü başarısız, statik sözlük kullanılıyor.", dbError);
    }

    if (!isValid) {
      isValid = FALLBACK_WORDS.includes(normalizedWord);
    }

    return NextResponse.json({
      success: true,
      isValid,
      word: normalizedWord,
      message: isValid ? "Geçerli kelime." : "Kelime sözlükte bulunamadı."
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Kelime doğrulanırken bir hata oluştu." },
      { status: 500 }
    );
  }
}
