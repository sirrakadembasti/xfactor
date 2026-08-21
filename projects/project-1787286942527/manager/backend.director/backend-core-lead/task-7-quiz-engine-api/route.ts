import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SubmitPayload {
  attemptId: string;
  answers: Array<{
    questionId: string;
    selectedOptionId?: string;
    textAnswer?: string;
  }>;
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
    const body: SubmitPayload = await req.json();
    const { attemptId, answers } = body;

    if (!attemptId) {
      return NextResponse.json(
        { error: "Geçersiz sınav deneme kimliği (attemptId)." },
        { status: 400 }
      );
    }

    const attempt = await prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: {
          include: {
            questions: {
              include: {
                options: true,
              },
            },
          },
        },
      },
    });

    if (!attempt || attempt.quizId !== quizId || attempt.studentId !== session.user.id) {
      return NextResponse.json(
        { error: "Sınav denemesi bulunamadı veya yetkiniz yok." },
        { status: 404 }
      );
    }

    if (attempt.completedAt) {
      return NextResponse.json(
        { error: "Bu sınav denemesi daha önce tamamlanmış." },
        { status: 400 }
      );
    }

    const questions = attempt.quiz.questions;
    let earnedScore = 0;
    let maxPossibleScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let blankCount = 0;

    const answerDetails = [];
    const answerRecordsToCreate = [];

    for (const question of questions) {
      maxPossibleScore += question.points;
      const userSubmission = answers?.find((a) => a.questionId === question.id);
      const selectedOptionId = userSubmission?.selectedOptionId;
      const textAnswer = userSubmission?.textAnswer?.trim();

      let isCorrect = false;
      let isBlank = false;

      if (!selectedOptionId && !textAnswer) {
        isBlank = true;
        blankCount += 1;
      } else if (question.questionType === "MULTIPLE_CHOICE" || question.questionType === "TRUE_FALSE") {
        const correctOption = question.options.find((o) => o.isCorrect);
        if (selectedOptionId && correctOption && selectedOptionId === correctOption.id) {
          isCorrect = true;
          correctCount += 1;
          earnedScore += question.points;
        } else {
          incorrectCount += 1;
        }
      } else if (question.questionType === "OPEN_ENDED") {
        // Açık uçlu için birebir veya eğitmen değerlendirmesi
        const correctOption = question.options.find((o) => o.isCorrect);
        if (textAnswer && correctOption && textAnswer.toLowerCase() === correctOption.text.trim().toLowerCase()) {
          isCorrect = true;
          correctCount += 1;
          earnedScore += question.points;
        } else {
          incorrectCount += 1;
        }
      }

      answerRecordsToCreate.push({
        attemptId: attempt.id,
        questionId: question.id,
        selectedOptionId: selectedOptionId || null,
        textAnswer: textAnswer || null,
        isCorrect,
        earnedScore: isCorrect ? question.points : 0,
      });

      answerDetails.push({
        questionId: question.id,
        prompt: question.prompt,
        points: question.points,
        isCorrect,
        isBlank,
        selectedOptionId,
        correctOptionId: question.options.find((o) => o.isCorrect)?.id,
        explanation: question.explanation || null,
      });
    }

    const percentage = maxPossibleScore > 0 ? Math.round((earnedScore / maxPossibleScore) * 100) : 0;
    const isPassed = percentage >= (attempt.quiz.passingScore ?? 50);

    const completedAttempt = await prisma.$transaction(async (tx) => {
      // Mevcut cevap kayıtlarını oluştur
      if (answerRecordsToCreate.length > 0) {
        await tx.studentAnswer.createMany({
          data: answerRecordsToCreate,
        });
      }

      return tx.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          score: earnedScore,
          maxScore: maxPossibleScore,
          percentage,
          isPassed,
          correctCount,
          incorrectCount,
          blankCount,
          completedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      report: {
        attemptId: completedAttempt.id,
        quizId: attempt.quizId,
        quizTitle: attempt.quiz.title,
        score: earnedScore,
        maxScore: maxPossibleScore,
        percentage,
        isPassed,
        passingScore: attempt.quiz.passingScore,
        summary: {
          totalQuestions: questions.length,
          correctCount,
          incorrectCount,
          blankCount,
        },
        details: answerDetails,
        completedAt: completedAttempt.completedAt,
      },
    });
  } catch (error) {
    console.error("Sınav tamamlama ve puanlama hatası:", error);
    return NextResponse.json(
      { error: "Sınav sonuçları hesaplanırken bir hata oluştu." },
      { status: 500 }
    );
  }
}
