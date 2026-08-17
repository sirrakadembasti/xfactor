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
    const { borrowId } = body;

    if (!borrowId) {
      return NextResponse.json(
        { error: 'Ödünç kaydı ID (borrowId) bilgisi gereklidir.' },
        { status: 400 }
      );
    }

    const borrowRecord = await prisma.borrowRecord.findUnique({
      where: { id: borrowId },
    });

    if (!borrowRecord) {
      return NextResponse.json({ error: 'Ödünç kaydı bulunamadı.' }, { status: 404 });
    }

    if (borrowRecord.status === 'RETURNED') {
      return NextResponse.json(
        { error: 'Bu ödünç kaydı zaten iade alınmış.' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: borrowRecord.bookId },
        data: { stock: { increment: 1 } },
      });

      const updatedRecord = await tx.borrowRecord.update({
        where: { id: borrowId },
        data: {
          status: 'RETURNED',
          returnDate: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          book: { select: { id: true, title: true, author: true, isbn: true, stock: true } },
        },
      });

      return updatedRecord;
    });

    return NextResponse.json(
      { message: 'Kitap başarıyla iade alındı.', data: result },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    return NextResponse.json(
      { error: 'İade alma işlemi sırasında bir hata oluştu: ' + message },
      { status: 500 }
    );
  }
}
