import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { inquiryStatusUpdateSchema } from '@/lib/validations/inquiry';
import { ZodError } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
) {
  try {
    const resolvedParams = await context.params;
    const { id } = resolvedParams;

    const inquiry = await prisma.inquiry.findUnique({
      where: { id },
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
            location: true,
            images: true,
          },
        },
      },
    });

    if (!inquiry) {
      return NextResponse.json(
        { error: 'Talep bulunamadı.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: inquiry });
  } catch (error) {
    console.error('Talep detayı alınırken hata:', error);
    return NextResponse.json(
      { error: 'Talep bilgisi alınırken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const resolvedParams = await context.params;
    const { id } = resolvedParams;

    const existingInquiry = await prisma.inquiry.findUnique({
      where: { id },
    });

    if (!existingInquiry) {
      return NextResponse.json(
        { error: 'Güncellenecek talep bulunamadı.' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = inquiryStatusUpdateSchema.parse(body);

    const updatedInquiry = await prisma.inquiry.update({
      where: { id },
      data: {
        status: validatedData.status,
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            currency: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Talep durumu başarıyla güncellendi.',
      data: updatedInquiry,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Geçersiz talep verisi.',
          details: error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    console.error('Talep güncellenirken hata:', error);
    return NextResponse.json(
      { error: 'Talep güncellenirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteParams
) {
  try {
    const resolvedParams = await context.params;
    const { id } = resolvedParams;

    const existingInquiry = await prisma.inquiry.findUnique({
      where: { id },
    });

    if (!existingInquiry) {
      return NextResponse.json(
        { error: 'Silinecek talep bulunamadı.' },
        { status: 404 }
      );
    }

    await prisma.inquiry.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Talep başarıyla silindi.',
    });
  } catch (error) {
    console.error('Talep silinirken hata:', error);
    return NextResponse.json(
      { error: 'Talep silinirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}
