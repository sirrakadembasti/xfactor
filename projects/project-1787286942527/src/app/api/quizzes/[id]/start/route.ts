import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmalısınız." },
        { status: 401 }
      );
    }

    const { id: quizId } = await params;

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            prompt: true,
            questionType: true,
            order: true,
            points: true,
            options: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                text: true,
                order: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      return NextResponse.json(
        { error: "Sınav bulunamadı." },
        { status: 404 }
      );
    }

    if (quiz.questions.length === 0) {
      return NextResponse.json(
        { error: "Bu sınavda henüz soru bulunmamaktadır." },
        { status: 400 }
      );
    }

    // Devam eden açık sınav denemesi var mı kontrol et
    let attempt = await prisma.quizAttempt.findFirst({
      where: {
        quizId,
        studentId: session.user.id,
        completedAt: null,
      },
    });

    if (!attempt) {
      attempt = await prisma.quizAttempt.create({
        data: {
          quizId,
          studentId: session.user.id,
          startedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        duration: quiz.duration,
        totalPoints: quiz.totalPoints,
        passingScore: quiz.passingScore,
        questions: quiz.questions,
      },
    });
  } catch (error) {
    console.error("Sınav başlatma hatası:", error);
    return NextResponse.json(
      { error: "Sınav başlatılırken bir sunucu hatası oluştu." },
      { status: 500 }
    );
  }
}
