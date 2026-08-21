import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const classroomId = searchParams.get('classroomId');
    const search = searchParams.get('search');

    const whereClause: Record<string, unknown> = {};

    if (role) {
      whereClause.role = role;
    }

    if (classroomId) {
      whereClause.classroomId = classroomId;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        classroomId: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            attempts: true,
            createdQuestions: true,
            createdQuizzes: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(users, { status: 200 });
  } catch (error) {
    console.error('Kullanıcılar alınırken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kullanıcı listesi alınamadı.' },
      { status: 500 }
    );
  }
}
