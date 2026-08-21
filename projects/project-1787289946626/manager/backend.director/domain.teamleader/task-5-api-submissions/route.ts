import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const submissionSchema = z.object({
  examId: z.string().min(1, "Sınav ID zorunludur."),
  userId: z.string().min(1, "Kullanıcı ID zorunludur."),
  answers: z.array(
    z.object({
      questionId: z.string().min(1, "Soru ID zorunludur."),
      selectedOptionId: z.string().optional().nullable(),
      textAnswer: z.string().optional().nullable(),
    })
  ).default([]),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get("examId");
    const userId = searchParams.get("userId");
    const courseId = searchParams.get("courseId");

    const whereClause: Record<string, unknown> = {};

    if (examId) {
      whereClause.examId = examId;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (courseId) {
      whereClause.exam = { courseId };
    }

    const submissions = await prisma.submission.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            durationMinutes: true,
            course: {
              select: {
                id: true,
                title: true,
                code: true,
              },
            },
          },
        },
        answers: {
          include: {
            question: true,
            selectedOption: true,
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });

    return NextResponse.json(submissions, { status: 200 });
  } catch (error) {
    console.error("[SUBMISSIONS_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Sınav yanıtları listelenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = submissionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Doğrulama hatası",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { examId, userId, answers: userAnswers } = validationResult.data;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { message: "Sınav bulunamadı." },
        { status: 404 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Kullanıcı bulunamadı." },
        { status: 404 }
      );
    }

    let totalScore = 0;
    const answerDataToCreate: Array<{
      questionId: string;
      selectedOptionId: string | null;
      textAnswer: string | null;
      isCorrect: boolean;
      pointsEarned: number;
    }> = [];

    for (const question of exam.questions) {
      const studentAnswer = userAnswers.find((a) => a.questionId === question.id);
      let isCorrect = false;
      let pointsEarned = 0;

      if (studentAnswer) {
        if (question.type === "MULTIPLE_CHOICE" || question.type === "TRUE_FALSE") {
          if (studentAnswer.selectedOptionId) {
            const chosenOption = question.options.find(
              (opt) => opt.id === studentAnswer.selectedOptionId
            );
            if (chosenOption && chosenOption.isCorrect) {
              isCorrect = true;
              pointsEarned = question.points;
              totalScore += question.points;
            }
          }
        } else if (question.type === "OPEN_ENDED") {
          if (
            question.correctAnswer &&
            studentAnswer.textAnswer &&
            question.correctAnswer.trim().toLowerCase() ===
              studentAnswer.textAnswer.trim().toLowerCase()
          ) {
            isCorrect = true;
            pointsEarned = question.points;
            totalScore += question.points;
          }
        }

        answerDataToCreate.push({
          questionId: question.id,
          selectedOptionId: studentAnswer.selectedOptionId || null,
          textAnswer: studentAnswer.textAnswer || null,
          isCorrect,
          pointsEarned,
        });
      } else {
        answerDataToCreate.push({
          questionId: question.id,
          selectedOptionId: null,
          textAnswer: null,
          isCorrect: false,
          pointsEarned: 0,
        });
      }
    }

    const submission = await prisma.submission.create({
      data: {
        examId,
        userId,
        score: totalScore,
        submittedAt: new Date(),
        answers: {
          create: answerDataToCreate,
        },
      },
      include: {
        answers: {
          include: {
            question: true,
            selectedOption: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "Sınav yanıtları başarıyla kaydedildi ve puanlandı.",
        submission,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[SUBMISSIONS_POST_ERROR]", error);
    return NextResponse.json(
      { message: "Sınav gönderimi işlenirken bir sunucu hatası meydana geldi." },
      { status: 500 }
    );
  }
}
