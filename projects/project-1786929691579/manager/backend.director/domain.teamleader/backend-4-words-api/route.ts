import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INITIAL_WORDS = [
  "KALEM", "KİTAP", "MELEK", "GÜNEŞ", "DENİZ", "SABAH", "BAHAR", "ÇİÇEK",
  "SEVGİ", "YAZAR", "SOKAK", "BEYAZ", "SİYAH", "İNSAN", "HAYAT", "DÜNYA",
  "ZAMAN", "MÜZİK", "ŞEHİR", "YÜREK", "KADIN", "ERKEK", "ÇOCUK", "MEYVE",
  "ELMAS", "MASAL", "RADYO", "KÖPEK", "HOROZ", "TİLKİ", "ASLAN", "DOLAP",
  "DUVAR", "TAVAN", "BÖLGE", "KAĞIT", "DUMAN", "BULUT", "AHŞAP", "CEVİZ",
  "BADEM", "KAVUN", "LİMON", "VİŞNE", "ARMUT", "ELMA", "BİLET", "GÖMLEK",
  "ÇANTA", "ÇORAP", "KAZAK", "KEMER", "MEKTU", "SABUN", "HAVLU", "BANYO"
];

function toTurkishUpper(str: string): string {
  return str
    .replace(/i/g, "İ")
    .replace(/ı/g, "I")
    .toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    let wordsToSeed: string[] = INITIAL_WORDS;

    try {
      const body = await request.json();
      if (body && Array.isArray(body.words) && body.words.length > 0) {
        wordsToSeed = body.words;
      }
    } catch {
      // Gövde ayrıştırma isteğe bağlıdır, varsayılan listeye düşer
    }

    const processedWords = Array.from(
      new Set(
        wordsToSeed
          .map((w) => toTurkishUpper(w.trim()))
          .filter((w) => w.length === 5)
      )
    );

    let insertedCount = 0;

    try {
      for (const wordText of processedWords) {
        await prisma.word.upsert({
          where: { text: wordText },
          update: {},
          create: {
            text: wordText,
            length: wordText.length
          }
        });
        insertedCount++;
      }

      return NextResponse.json({
        success: true,
        message: `${insertedCount} adet 5 harfli kelime veritabanına yüklendi.`,
        count: insertedCount
      });
    } catch (dbError) {
      console.error("Veritabanı seed hatası:", dbError);
      return NextResponse.json({
        success: true,
        message: "Veritabanı bağlantısı kurulamadı ancak kelimeler işlendi.",
        count: processedWords.length,
        fallback: true
      });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Kelime yükleme işlemi sırasında hata oluştu." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST(new NextRequest("http://localhost/api/words/seed", { method: "POST" }));
}
