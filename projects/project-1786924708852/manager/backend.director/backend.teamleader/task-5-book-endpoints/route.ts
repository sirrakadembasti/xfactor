import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/books/[id] - Detaylı Kitap Bilgisi Getirme (Admin ve Teacher)
export async function GET(
  req: NextRequest,
  context: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !['ADMIN', 'TEACHER'].includes(session.user?.role as string)) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Bu işlem için Admin veya Öğretmen rolü gereklidir.' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const book = await prisma.book.findUnique({
      where: { id },
    });

    if (!book) {
      return NextResponse.json(
        { error: 'Kitap bulunamadı.' },
        { status: 404 }
      );
    }

    return NextResponse.json(book);
  } catch (error: any) {
    console.error('Kitap detayı getirilirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kitap bilgisi getirilirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

// PUT /api/books/[id] - Kitap Bilgisi Güncelleme (Sadece Admin)
export async function PUT(
  req: NextRequest,
  context: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Bu işlem için Admin yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();

    const existingBook = await prisma.book.findUnique({
      where: { id },
    });

    if (!existingBook) {
      return NextResponse.json(
        { error: 'Güncellenecek kitap bulunamadı.' },
        { status: 404 }
      );
    }

    const {
      title,
      author,
      isbn,
      category,
      publisher,
      publishYear,
      quantity,
      availableCopies,
      shelfLocation,
      description,
      coverImage,
      status,
    } = body;

    if (isbn && isbn !== existingBook.isbn) {
      const isbnCheck = await prisma.book.findUnique({
        where: { isbn },
      });
      if (isbnCheck) {
        return NextResponse.json(
          { error: 'Bu ISBN başka bir kitap tarafından kullanılmaktadır.' },
          { status: 409 }
        );
      }
    }

    const updatedBook = await prisma.book.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(author !== undefined && { author }),
        ...(isbn !== undefined && { isbn }),
        ...(category !== undefined && { category }),
        ...(publisher !== undefined && { publisher }),
        ...(publishYear !== undefined && { publishYear: Number(publishYear) }),
        ...(quantity !== undefined && { quantity: Number(quantity) }),
        ...(availableCopies !== undefined && { availableCopies: Number(availableCopies) }),
        ...(shelfLocation !== undefined && { shelfLocation }),
        ...(description !== undefined && { description }),
        ...(coverImage !== undefined && { coverImage }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json(updatedBook);
  } catch (error: any) {
    console.error('Kitap güncellenirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kitap güncellenirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

// DELETE /api/books/[id] - Kitap Silme (Sadece Admin)
export async function DELETE(
  req: NextRequest,
  context: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Bu işlem için Admin yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const existingBook = await prisma.book.findUnique({
      where: { id },
    });

    if (!existingBook) {
      return NextResponse.json(
        { error: 'Silinecek kitap bulunamadı.' },
        { status: 404 }
      );
    }

    await prisma.book.delete({
      where: { id },
    });

    return NextResponse.json(
      { message: 'Kitap başarıyla silindi.' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Kitap silinirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kitap silinirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
