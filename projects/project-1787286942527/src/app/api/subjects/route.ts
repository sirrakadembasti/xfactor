import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { subjectSchema } from '@/lib/validations/quiz';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();

    const subjects = await prisma.subject.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search } },
              { code: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : undefined,
      include: {
        _count: {
          select: {
            questions: true,
            quizzes: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json(subjects, { status: 200 });
  } catch (error) {
    console.error('Dersler alınırken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Dersler listelenirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'TEACHER')) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validationResult = subjectSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri formatı', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { name, code, description } = validationResult.data;

    const existingSubject = await prisma.subject.findFirst({
      where: {
        OR: [{ code: code.toUpperCase() }, { name }],
      },
    });

    if (existingSubject) {
      return NextResponse.json(
        { error: 'Bu isim veya kodda bir ders zaten mevcut.' },
        { status: 409 }
      );
    }

    const newSubject = await prisma.subject.create({
      data: {
        name,
        code: code.toUpperCase(),
        description,
      },
    });

    return NextResponse.json(newSubject, { status: 201 });
  } catch (error) {
    console.error('Ders oluşturulurken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Ders oluşturulurken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
