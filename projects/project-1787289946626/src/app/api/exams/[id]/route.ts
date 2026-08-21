import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { examSchema } from "@/lib/validations/exam";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            code: true,
            teacherId: true,
            teacher: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        questions: {
          include: {
            options: true,
          },
        },
        _count: {
          select: {
            submissions: true,
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

    return NextResponse.json(exam, { status: 200 });
  } catch (error) {
    console.error("[EXAM_DETAIL_GET_ERROR]", error);
    return NextResponse.json(
      { message: "Sınav detayları getirilirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validationResult = examSchema.partial().safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Doğrulama hatası",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const existingExam = await prisma.exam.findUnique({
      where: { id },
    });

    if (!existingExam) {
      return NextResponse.json(
        { message: "Güncellenecek sınav bulunamadı." },
        { status: 404 }
      );
    }

    const data = validationResult.data;

    const updatedExam = await prisma.exam.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes }),
        ...(data.startTime !== undefined && {
          startTime: data.startTime ? new Date(data.startTime) : null,
        }),
        ...(data.endTime !== undefined && {
          endTime: data.endTime ? new Date(data.endTime) : null,
        }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        ...(data.courseId !== undefined && { courseId: data.courseId }),
      },
      include: {
        course: true,
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    return NextResponse.json(updatedExam, { status: 200 });
  } catch (error) {
    console.error("[EXAM_UPDATE_ERROR]", error);
    return NextResponse.json(
      { message: "Sınav güncellenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    const existingExam = await prisma.exam.findUnique({
      where: { id },
    });

    if (!existingExam) {
      return NextResponse.json(
        { message: "Silinecek sınav bulunamadı." },
        { status: 404 }
      );
    }

    await prisma.exam.delete({
      where: { id },
    });

    return NextResponse.json(
      { message: "Sınav başarıyla silindi." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[EXAM_DELETE_ERROR]", error);
    return NextResponse.json(
      { message: "Sınav silinirken bir hata oluştu." },
      { status: 500 }
    );
  }
}
