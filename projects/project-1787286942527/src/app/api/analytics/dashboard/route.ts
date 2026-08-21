import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Bu işlem için giriş yapmalısınız." },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const userRole = session.user.role || "STUDENT";

    if (userRole === "STUDENT") {
      // Öğrenci Analitikleri
      const [completedAttempts, totalAssignedQuizzes] = await Promise.all([
        prisma.quizAttempt.findMany({
          where: {
            studentId: userId,
            completedAt: { not: null },
          },
          include: {
            quiz: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: { completedAt: "desc" },
        }),
        prisma.quiz.count({
          where: { isPublished: true },
        }),
      ]);

      const totalAttemptsCount = completedAttempts.length;
      const totalScoreSum = completedAttempts.reduce(
        (sum, att) => sum + (att.score || 0),
        0
      );
      const averageScore =
        totalAttemptsCount > 0
          ? Math.round((totalScoreSum / totalAttemptsCount) * 10) / 10
          : 0;

      const totalCorrect = completedAttempts.reduce(
        (sum, att) => sum + att.correctCount,
        0
      );
      const totalIncorrect = completedAttempts.reduce(
        (sum, att) => sum + att.incorrectCount,
        0
      );
      const totalBlank = completedAttempts.reduce(
        (sum, att) => sum + att.blankCount,
        0
      );
      const totalAnsweredQuestions = totalCorrect + totalIncorrect + totalBlank;

      // Son 6 deneme başarı trendi
      const recentTrend = completedAttempts
        .slice(0, 6)
        .reverse()
        .map((att) => ({
          id: att.id,
          quizTitle: att.quiz.title,
          score: att.score,
          date: att.completedAt,
        }));

      // Son 5 karne listesi
      const recentAttempts = completedAttempts.slice(0, 5).map((att) => ({
        id: att.id,
        quizId: att.quiz.id,
        quizTitle: att.quiz.title,
        score: att.score,
        correctCount: att.correctCount,
        incorrectCount: att.incorrectCount,
        blankCount: att.blankCount,
        completedAt: att.completedAt,
      }));

      return NextResponse.json({
        role: "STUDENT",
        summary: {
          completedQuizzes: totalAttemptsCount,
          totalAvailableQuizzes: totalAssignedQuizzes,
          averageScore,
          totalAnsweredQuestions,
          totalCorrect,
          totalIncorrect,
          totalBlank,
          accuracyRate:
            totalAnsweredQuestions > 0
              ? Math.round((totalCorrect / totalAnsweredQuestions) * 100)
              : 0,
        },
        recentTrend,
        recentAttempts,
      });
    } else {
      // Öğretmen / Admin Analitikleri
      const isTeacher = userRole === "TEACHER";
      const quizFilter = isTeacher ? { createdById: userId } : {};
      const attemptFilter = isTeacher
        ? { quiz: { createdById: userId }, completedAt: { not: null } }
        : { completedAt: { not: null } };

      const [
        totalStudents,
        totalQuizzes,
        completedAttemptsCount,
        attemptsAggregates,
        recentAttemptsRaw,
        popularQuizzes,
      ] = await Promise.all([
        prisma.user.count({ where: { role: "STUDENT" } }),
        prisma.quiz.count({ where: quizFilter }),
        prisma.quizAttempt.count({ where: attemptFilter }),
        prisma.quizAttempt.aggregate({
          where: attemptFilter,
          _avg: {
            score: true,
          },
        }),
        prisma.quizAttempt.findMany({
          where: attemptFilter,
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            quiz: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: { completedAt: "desc" },
          take: 10,
        }),
        prisma.quiz.findMany({
          where: quizFilter,
          select: {
            id: true,
            title: true,
            _count: {
              select: { attempts: true },
            },
          },
          orderBy: {
            attempts: {
              _count: "desc",
            },
          },
          take: 5,
        }),
      ]);

      const recentAttempts = recentAttemptsRaw.map((att) => ({
        id: att.id,
        quizId: att.quiz.id,
        quizTitle: att.quiz.title,
        studentName: att.student.name || att.student.email,
        score: att.score,
        correctCount: att.correctCount,
        incorrectCount: att.incorrectCount,
        completedAt: att.completedAt,
      }));

      const popularQuizzesData = popularQuizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        attemptCount: quiz._count.attempts,
      }));

      return NextResponse.json({
        role: userRole,
        summary: {
          totalStudents,
          totalQuizzes,
          completedAttemptsCount,
          averageOverallScore:
            Math.round((attemptsAggregates._avg.score || 0) * 10) / 10,
        },
        popularQuizzes: popularQuizzesData,
        recentAttempts,
      });
    }
  } catch (error) {
    console.error("Analitik dashboard verisi çekme hatası:", error);
    return NextResponse.json(
      { error: "Analitik verileri yüklenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}
