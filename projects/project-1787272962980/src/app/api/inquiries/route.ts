import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { inquirySchema, inquiryFilterSchema } from '@/lib/validations/inquiry';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryObj = Object.fromEntries(searchParams.entries());

    const validationResult = inquiryFilterSchema.safeParse(queryObj);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Geçersiz filtre parametreleri',
          details: validationResult.error.flatten().fieldErrors,
        },
        {
          status: 400,
        }
      );
    }

    const { q, status, propertyId, page, limit } = validationResult.data;

    const where: Prisma.InquiryWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (propertyId) {
      where.propertyId = propertyId;
    }

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
        { message: { contains: q } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, inquiries] = await Promise.all([
      prisma.inquiry.count({ where }),
      prisma.inquiry.findMany({
        where,
        include: {
          property: {
            select: {
              id: true,
              title: true,
              slug: true,
              price: true,
              currency: true,
              type: true,
              status: true,
              images: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      data: inquiries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    return NextResponse.json(
      { error: 'Talepler getirilirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = inquirySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Doğrulama hatası',
          details: validationResult.error.flatten().fieldErrors,
        },
        {
          status: 400,
        }
      );
    }

    const validatedData = validationResult.data;

    if (validatedData.propertyId) {
      const propertyExists = await prisma.property.findUnique({
        where: { id: validatedData.propertyId },
        select: { id: true },
      });

      if (!propertyExists) {
        return NextResponse.json(
          { error: 'İlgili ilan bulunamadı.' },
          { status: 404 }
        );
      }
    }

    const inquiry = await prisma.inquiry.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        message: validatedData.message,
        propertyId: validatedData.propertyId || null,
        status: 'PENDING',
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Talebiniz başarıyla alındı.',
        data: inquiry,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error('Error creating inquiry:', error);
    return NextResponse.json(
      { error: 'Talep oluşturulurken bir hata oluştu.' },
      { status: 500 }
    );
  }
}
