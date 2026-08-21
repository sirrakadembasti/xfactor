import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { quizSchema } from '@/lib/validations/quiz';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get('classroomId');
    const subjectId = searchParams.get('subjectId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: any = {};

    if (classroomId && classroomId !== 'all') {
      where.classroomId = classroomId;
    }

    if (subjectId && subjectId !== 'all') {
      where.subjectId = subjectId;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const quizzes = await prisma.quiz.findMany({
      where,
      include: {
        subject: true,
        classroom: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        quizQuestions: {
          include: {
            question: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
        _count: {
          select: {
            quizQuestions: true,
            attempts: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const formattedQuizzes = quizzes.map((quiz) => ({
      ...quiz,
      quizQuestions: quiz.quizQuestions.map((qq) => ({
        ...qq,
        question: {
          ...qq.question,
          options: JSON.parse(qq.question.options || '[]'),
        },
      })),
    }));

    return NextResponse.json(formattedQuizzes);
  } catch (error) {
    console.error('Quiz listeleme hatası:', error);
    return NextResponse.json(
      { error: 'Sınavlar getirilirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = quizSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri formatı', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { questionIds, ...quizData } = parsed.data;

    const newQuiz = await prisma.quiz.create({
      data: {
        title: quizData.title,
        description: quizData.description || null,
        status: quizData.status || 'DRAFT',
        durationMinutes: quizData.durationMinutes,
        passScore: quizData.passScore,
        subjectId: quizData.subjectId,
        classroomId: quizData.classroomId || null,
        createdById: body.createdById || null,
        quizQuestions: questionIds && questionIds.length > 0
          ? {
              create: questionIds.map((qId: string, index: number) => ({
                questionId: qId,
                order: index + 1,
              })),
            }
          : undefined,
      },
      include: {
        subject: true,
        classroom: true,
        quizQuestions: {
          include: {
            question: true,
          },
        },
      },
    });

    return NextResponse.json(newQuiz, { status: 201 });
  } catch (error) {
    console.error('Quiz oluşturma hatası:', error);
    return NextResponse.json(
      { error: 'Sınav oluşturulurken bir hata oluştu.' },
      { status: 500 }
    );
  }
}
