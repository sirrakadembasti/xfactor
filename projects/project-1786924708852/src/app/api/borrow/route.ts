import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function checkAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as { role?: string }).role !== 'ADMIN') {
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  try {
    const isAdmin = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Bu işlem sadece yöneticiler içindir.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const userId = searchParams.get('userId');
    const bookId = searchParams.get('bookId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (bookId) where.bookId = bookId;

    const [records, total] = await Promise.all([
      prisma.borrowRecord.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          book: {
            select: {
              id: true,
              title: true,
              author: true,
              isbn: true,
              stock: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.borrowRecord.count({ where }),
    ]);

    return NextResponse.json({
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json(
      { error: 'Ödünç kayıtları alınırken bir hata oluştu: ' + message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const isAdmin = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Bu işlem sadece yöneticiler içindir.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, bookId, dueDate } = body;

    if (!userId || !bookId || !dueDate) {
      return NextResponse.json(
        { error: 'Kullanıcı ID, kitap ID ve son teslim tarihi (dueDate) alanları zorunludur.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 404 });
    }

    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      return NextResponse.json({ error: 'Kitap bulunamadı.' }, { status: 404 });
    }

    if (book.stock <= 0) {
      return NextResponse.json(
        { error: 'Kitap stokta bulunmamaktadır.' },
        { status: 400 }
      );
    }

    const activeBorrow = await prisma.borrowRecord.findFirst({
      where: {
        userId,
        bookId,
        status: 'BORROWED',
      },
    });

    if (activeBorrow) {
      return NextResponse.json(
        { error: 'Bu kullanıcı bu kitabı zaten ödünç almış ve henüz iade etmemiş.' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: bookId },
        data: { stock: { decrement: 1 } },
      });

      const borrowRecord = await tx.borrowRecord.create({
        data: {
          userId,
          bookId,
          dueDate: new Date(dueDate),
          status: 'BORROWED',
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          book: { select: { id: true, title: true, author: true, isbn: true, stock: true } },
        },
      });

      return borrowRecord;
    });

    return NextResponse.json(
      { message: 'Kitap başarıyla ödünç verildi.', data: result },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json(
      { error: 'Ödünç verme işlemi sırasında bir hata oluştu: ' + message },
      { status: 500 }
    );
  }
}
