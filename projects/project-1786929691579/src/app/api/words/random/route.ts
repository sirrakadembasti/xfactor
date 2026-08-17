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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const length = parseInt(searchParams.get("length") || "5", 10);

    try {
      const count = await prisma.word.count({
        where: { length }
      });

      if (count > 0) {
        const randomIndex = Math.floor(Math.random() * count);
        const randomWordObj = await prisma.word.findFirst({
          where: { length },
          skip: randomIndex
        });

        if (randomWordObj) {
          return NextResponse.json({
            success: true,
            word: randomWordObj.text.toUpperCase(),
            id: randomWordObj.id,
            length: randomWordObj.length
          });
        }
      }
    } catch (dbError) {
      console.warn("Veritabanından kelime alınamadı, yedek kelime listesi kullanılıyor.", dbError);
    }

    const filteredFallback = FALLBACK_WORDS.filter((w) => w.length === length);
    const targetList = filteredFallback.length > 0 ? filteredFallback : FALLBACK_WORDS;
    const randomIndex = Math.floor(Math.random() * targetList.length);
    const word = targetList[randomIndex];

    return NextResponse.json({
      success: true,
      word,
      length: word.length,
      fallback: true
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Rastgele kelime getirilirken bir hata oluştu." },
      { status: 500 }
    );
  }
}
