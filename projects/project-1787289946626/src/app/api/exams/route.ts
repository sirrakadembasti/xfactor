import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { examSchema } from "@/lib/validations/exam";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");
    const teacherId = searchParams.get("teacherId");
    const isPublishedParam = searchParams.get("isPublished");

    const whereClause: Record<string, unknown> = {};

    if (courseId) {
      whereClause.courseId = courseId;
    }

    if (teacherId) {
      whereClause.course = { teacherId };
    }

    if (isPublishedParam !== null) {
      whereClause.isPublished = isPublishedParam === "true";
    }

    const exams = await prisma.exam.findMany({
      where: whereClause,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            code: true,
            teacher: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            questions: true,
            submissions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(exams, { status: 200 });
  } catch (error) {
    console.error("[EXAMS_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Sınavlar listelenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = examSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Doğrulama hatası",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      title,
      description,
      durationMinutes,
      startTime,
      endTime,
      isPublished,
      courseId,
      questions,
    } = validationResult.data;

    // Dersin varlığını kontrol et
    const existingCourse = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!existingCourse) {
      return NextResponse.json(
        { message: "Seçilen ders bulunamadı." },
        { status: 404 }
      );
    }

    const createdExam = await prisma.exam.create({
      data: {
        title,
        description,
        durationMinutes,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        isPublished,
        courseId,
        questions: questions && questions.length > 0
          ? {
              create: questions.map((q) => ({
                text: q.text,
                type: q.type,
                points: q.points,
                correctAnswer: q.correctAnswer || null,
                options: q.options && q.options.length > 0
                  ? {
                      create: q.options.map((opt) => ({
                        text: opt.text,
                        isCorrect: opt.isCorrect,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
        course: true,
      },
    });

    return NextResponse.json(createdExam, { status: 201 });
  } catch (error) {
    console.error("[EXAMS_POST_ERROR]", error);
    return NextResponse.json(
      { message: "Sınav oluşturulurken bir hata oluştu." },
      { status: 500 }
    );
  }
}
