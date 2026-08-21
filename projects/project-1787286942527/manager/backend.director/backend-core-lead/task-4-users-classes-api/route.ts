import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { classroomSchema } from '@/lib/validations/quiz';

export async function GET() {
  try {
    const classrooms = await prisma.classroom.findMany({
      include: {
        _count: {
          select: {
            students: true,
            quizzes: true,
          },
        },
      },
      orderBy: [
        { grade: 'asc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json(classrooms, { status: 200 });
  } catch (error) {
    console.error('Sınıflar alınırken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Sınıflar listelenemedi.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = classroomSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Geçersiz sınıf bilgileri.',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, grade, description } = validationResult.data;

    const existingClassroom = await prisma.classroom.findUnique({
      where: { name },
    });

    if (existingClassroom) {
      return NextResponse.json(
        { error: 'Bu isimde bir sınıf zaten mevcut.' },
        { status: 409 }
      );
    }

    const classroom = await prisma.classroom.create({
      data: {
        name,
        grade,
        description,
      },
      include: {
        _count: {
          select: {
            students: true,
            quizzes: true,
          },
        },
      },
    });

    return NextResponse.json(classroom, { status: 201 });
  } catch (error) {
    console.error('Sınıf oluşturulurken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Sınıf oluşturulamadı.' },
      { status: 500 }
    );
  }
}
