import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { questionSchema } from '@/lib/validations/quiz';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId') || undefined;
    const difficulty = searchParams.get('difficulty') || undefined;
    const search = searchParams.get('search')?.trim() || undefined;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (subjectId) {
      whereClause.subjectId = subjectId;
    }

    if (difficulty && ['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
      whereClause.difficulty = difficulty;
    }

    if (search) {
      whereClause.OR = [
        { content: { contains: search } },
        { explanation: { contains: search } },
      ];
    }

    const [total, questions] = await Promise.all([
      prisma.question.count({ where: whereClause }),
      prisma.question.findMany({
        where: whereClause,
        include: {
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
    ]);

    const formattedQuestions = questions.map((q) => {
      let parsedOptions: string[] = [];
      try {
        parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      } catch (e) {
        parsedOptions = [];
      }

      return {
        ...q,
        options: parsedOptions,
      };
    });

    return NextResponse.json({
      questions: formattedQuestions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Sorular alınırken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Sorular listelenirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'TEACHER')) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validationResult = questionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri formatı', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      content,
      options,
      correctAnswer,
      explanation,
      difficulty,
      points,
      subjectId,
    } = validationResult.data;

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
    });

    if (!subject) {
      return NextResponse.json(
        { error: 'Belirtilen ders bulunamadı.' },
        { status: 404 }
      );
    }

    const newQuestion = await prisma.question.create({
      data: {
        content,
        options: JSON.stringify(options),
        correctAnswer,
        explanation,
        difficulty,
        points,
        subjectId,
        createdById: session.user.id,
      },
      include: {
        subject: true,
      },
    });

    return NextResponse.json(
      {
        ...newQuestion,
        options,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Soru oluşturulurken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Soru oluşturulurken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
