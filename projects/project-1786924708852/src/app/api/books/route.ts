import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/books - Kitap listeleme, arama ve filtreleme (Admin ve Teacher)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !['ADMIN', 'TEACHER'].includes(session.user?.role as string)) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Bu işlem için Admin veya Öğretmen rolü gereklidir.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (q) {
      whereClause.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { contains: q, mode: 'insensitive' } },
        { isbn: { contains: q, mode: 'insensitive' } },
        { publisher: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (category) {
      whereClause.category = category;
    }

    if (status) {
      whereClause.status = status;
    }

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      prisma.book.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      data: books,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Kitaplar getirilirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kitaplar listelenirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

// POST /api/books - Yeni Kitap Ekleme (Sadece Admin)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim. Bu işlem için Admin yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      title,
      author,
      isbn,
      category,
      publisher,
      publishYear,
      quantity = 1,
      shelfLocation,
      description,
      coverImage,
    } = body;

    if (!title || !author) {
      return NextResponse.json(
        { error: 'Kitap adı ve yazar alanları zorunludur.' },
        { status: 400 }
      );
    }

    if (isbn) {
      const existingBook = await prisma.book.findUnique({
        where: { isbn },
      });
      if (existingBook) {
        return NextResponse.json(
          { error: 'Bu ISBN numarasına sahip bir kitap zaten mevcut.' },
          { status: 409 }
        );
      }
    }

    const newBook = await prisma.book.create({
      data: {
        title,
        author,
        isbn,
        category,
        publisher,
        publishYear: publishYear ? Number(publishYear) : null,
        quantity: Number(quantity),
        availableCopies: Number(quantity),
        shelfLocation,
        description,
        coverImage,
        status: Number(quantity) > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
      },
    });

    return NextResponse.json(newBook, { status: 201 });
  } catch (error: any) {
    console.error('Kitap eklenirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kitap eklenirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
