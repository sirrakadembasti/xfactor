import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmalısınız." },
        { status: 401 }
      );
    }

    const { id: attemptId } = await params;

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        quiz: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
            questions: {
              orderBy: { order: "asc" },
              include: {
                options: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
        answers: {
          include: {
            selectedOption: true,
          },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: "Sınav karnesi bulunamadı." },
        { status: 404 }
      );
    }

    // Yetkilendirme kontrolü: Öğrenci yalnızca kendi karnesini, Öğretmen/Admin tüm karneleri görebilir.
    const isOwner = attempt.studentId === session.user.id;
    const isTeacherOrAdmin =
      session.user.role === "TEACHER" || session.user.role === "ADMIN";

    if (!isOwner && !isTeacherOrAdmin) {
      return NextResponse.json(
        { error: "Bu karnaye erişim yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    // İlgili sınavın genel ortalamasını hesapla
    const quizStats = await prisma.quizAttempt.aggregate({
      where: {
        quizId: attempt.quizId,
        completedAt: { not: null },
      },
      _avg: {
        score: true,
      },
      _count: {
        id: true,
      },
    });

    const answerMap = new Map(
      attempt.answers.map((ans) => [ans.questionId, ans])
    );

    // Soru bazlı detaylı rapor listesi oluştur
    const questionDetails = attempt.quiz.questions.map((question) => {
      const studentAnswer = answerMap.get(question.id);
      const correctOption = question.options.find((opt) => opt.isCorrect);

      let isBlank = true;
      let isCorrect = false;
      let selectedOptionId: string | null = null;
      let textAnswer: string | null = null;
      let earnedPoints = 0;

      if (studentAnswer) {
        isBlank = false;
        isCorrect = studentAnswer.isCorrect;
        selectedOptionId = studentAnswer.selectedOptionId;
        textAnswer = studentAnswer.textAnswer;
        earnedPoints = studentAnswer.earnedPoints;
      }

      return {
        id: question.id,
        prompt: question.prompt,
        questionType: question.questionType,
        order: question.order,
        points: question.points,
        explanation: question.explanation,
        options: question.options.map((opt) => ({
          id: opt.id,
          text: opt.text,
          isCorrect: opt.isCorrect,
          order: opt.order,
        })),
        userAnswer: {
          isBlank,
          isCorrect,
          selectedOptionId,
          textAnswer,
          earnedPoints,
        },
        correctOptionId: correctOption?.id || null,
      };
    });

    // Tamamlanma süresi hesaplama (saniye)
    let durationInSeconds = 0;
    if (attempt.startedAt && attempt.completedAt) {
      durationInSeconds = Math.round(
        (new Date(attempt.completedAt).getTime() -
          new Date(attempt.startedAt).getTime()) /
          1000
      );
    }

    return NextResponse.json({
      success: true,
      attempt: {
        id: attempt.id,
        score: attempt.score,
        earnedScore: attempt.earnedScore,
        maxScore: attempt.maxScore,
        correctCount: attempt.correctCount,
        incorrectCount: attempt.incorrectCount,
        blankCount: attempt.blankCount,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        durationInSeconds,
        student: attempt.student,
        quiz: {
          id: attempt.quiz.id,
          title: attempt.quiz.title,
          description: attempt.quiz.description,
          timeLimit: attempt.quiz.timeLimit,
          createdByName: attempt.quiz.createdBy?.name || "Eğitmen",
          totalQuestions: attempt.quiz.questions.length,
        },
        questions: questionDetails,
        benchmark: {
          averageScore: Math.round((quizStats._avg.score || 0) * 10) / 10,
          totalAttempts: quizStats._count.id,
        },
      },
    });
  } catch (error) {
    console.error("Attempt getirme hatası:", error);
    return NextResponse.json(
      { error: "Karne detayları yüklenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}
