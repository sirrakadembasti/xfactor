import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { quizSchema } from '@/lib/validations/quiz';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const quiz = await prisma.quiz.findUnique({
      where: { id },
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
        attempts: {
          include: {
            user: {
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
        },
        _count: {
          select: {
            quizQuestions: true,
            attempts: true,
          },
        },
      },
    });

    if (!quiz) {
      return NextResponse.json({ error: 'Sınav bulunamadı.' }, { status: 404 });
    }

    const formattedQuiz = {
      ...quiz,
      quizQuestions: quiz.quizQuestions.map((qq) => ({
        ...qq,
        question: {
          ...qq.question,
          options: JSON.parse(qq.question.options || '[]'),
        },
      })),
    };

    return NextResponse.json(formattedQuiz);
  } catch (error) {
    console.error('Quiz getirme hatası:', error);
    return NextResponse.json(
      { error: 'Sınav yüklenirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = quizSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri formatı', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const existingQuiz = await prisma.quiz.findUnique({
      where: { id },
    });

    if (!existingQuiz) {
      return NextResponse.json({ error: 'Güncellenecek sınav bulunamadı.' }, { status: 404 });
    }

    const { questionIds, ...quizData } = parsed.data;

    // Soru bağlantılarını güncellemek için transaction kullanalım
    const updatedQuiz = await prisma.$transaction(async (tx) => {
      if (questionIds !== undefined) {
        await tx.quizQuestion.deleteMany({
          where: { quizId: id },
        });

        if (questionIds.length > 0) {
          await tx.quizQuestion.createMany({
            data: questionIds.map((qId: string, index: number) => ({
              quizId: id,
              questionId: qId,
              order: index + 1,
            })),
          });
        }
      }

      return tx.quiz.update({
        where: { id },
        data: {
          title: quizData.title,
          description: quizData.description || null,
          status: quizData.status,
          durationMinutes: quizData.durationMinutes,
          passScore: quizData.passScore,
          subjectId: quizData.subjectId,
          classroomId: quizData.classroomId || null,
        },
        include: {
          subject: true,
          classroom: true,
          quizQuestions: {
            include: {
              question: true,
            },
            orderBy: {
              order: 'asc',
            },
          },
        },
      });
    });

    const formattedQuiz = {
      ...updatedQuiz,
      quizQuestions: updatedQuiz.quizQuestions.map((qq) => ({
        ...qq,
        question: {
          ...qq.question,
          options: JSON.parse(qq.question.options || '[]'),
        },
      })),
    };

    return NextResponse.json(formattedQuiz);
  } catch (error) {
    console.error('Quiz güncelleme hatası:', error);
    return NextResponse.json(
      { error: 'Sınav güncellenirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const existingQuiz = await prisma.quiz.findUnique({
      where: { id },
    });

    if (!existingQuiz) {
      return NextResponse.json({ error: 'Silinecek sınav bulunamadı.' }, { status: 404 });
    }

    await prisma.quiz.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Sınav başarıyla silindi.' });
  } catch (error) {
    console.error('Quiz silme hatası:', error);
    return NextResponse.json(
      { error: 'Sınav silinirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}
