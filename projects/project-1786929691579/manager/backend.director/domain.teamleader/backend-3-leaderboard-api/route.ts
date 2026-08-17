import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// POST isteği için Zod doğrulama şeması
const scoreSubmissionSchema = z.object({
  playerName: z
    .string()
    .min(2, 'Oyuncu adı en az 2 karakter olmalıdır')
    .max(25, 'Oyuncu adı en fazla 25 karakter olabilir')
    .trim(),
  gameType: z.string().min(1, 'Oyun türü gereklidir'),
  score: z.number().int('Skor tam sayı olmalıdır').min(0, 'Skor negatif olamaz'),
  timeSpent: z.number().min(0, 'Süre negatif olamaz').optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  userId: z.string().optional(),
});

/**
 * GET /api/leaderboard
 * Query Parametreleri:
 * - gameType: Oyun türüne göre filtreleme (örn: 'memory', 'speed', 'sudoku')
 * - difficulty: Zorluk derecesine göre filtreleme ('easy', 'medium', 'hard')
 * - limit: Getirilecek maksimum kayıt sayısı (varsayılan: 10, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameType = searchParams.get('gameType') || undefined;
    const difficulty = searchParams.get('difficulty') || undefined;
    const limitParam = searchParams.get('limit');
    
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 100) : 10;

    const whereClause: { gameType?: string; difficulty?: string } = {};
    if (gameType) whereClause.gameType = gameType;
    if (difficulty) whereClause.difficulty = difficulty;

    const leaderboard = await prisma.leaderboard.findMany({
      where: whereClause,
      orderBy: [
        { score: 'desc' },
        { createdAt: 'asc' }
      ],
      take: limit,
      select: {
        id: true,
        playerName: true,
        gameType: true,
        score: true,
        timeSpent: true,
        difficulty: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: leaderboard,
      count: leaderboard.length,
    });
  } catch (error) {
    console.error('Leaderboard GET Hatası:', error);
    return NextResponse.json(
      { success: false, error: 'Liderlik tablosu verileri alınırken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leaderboard
 * Gövde (Body):
 * - playerName: string (2-25 karakter)
 * - gameType: string
 * - score: number (>= 0)
 * - timeSpent?: number
 * - difficulty?: 'easy' | 'medium' | 'hard'
 * - userId?: string
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Zod doğrulama
    const validationResult = scoreSubmissionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Geçersiz veri biçimi',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Veritabanına yeni skor ekleme
    const newEntry = await prisma.leaderboard.create({
      data: {
        playerName: data.playerName,
        gameType: data.gameType,
        score: data.score,
        timeSpent: data.timeSpent,
        difficulty: data.difficulty,
        userId: data.userId,
      },
    });

    // Oyuncunun mevcut oyun türündeki sıralamasını bulma
    const higherScoresCount = await prisma.leaderboard.count({
      where: {
        gameType: data.gameType,
        score: { gt: data.score },
      },
    });

    const rank = higherScoresCount + 1;

    return NextResponse.json(
      {
        success: true,
        message: 'Skor başarıyla kaydedildi.',
        data: newEntry,
        rank,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Leaderboard POST Hatası:', error);
    return NextResponse.json(
      { success: false, error: 'Skor kaydedilirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
