import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { propertyUpdateSchema } from '@/lib/validations/property';

interface RouteParams {
  params: Promise<{ idOrSlug: string }> | { idOrSlug: string };
}

function slugify(text: string): string {
  const trMap: Record<string, string> = {
    ç: 'c',
    Ç: 'c',
    ğ: 'g',
    Ğ: 'g',
    ı: 'i',
    İ: 'i',
    ö: 'o',
    Ö: 'o',
    ş: 's',
    Ş: 's',
    ü: 'u',
    Ü: 'u',
  };

  return text
    .split('')
    .map((char) => trMap[char] || char)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function generateUniqueSlug(baseTitle: string, excludeId?: string): Promise<string> {
  let baseSlug = slugify(baseTitle);
  if (!baseSlug) baseSlug = 'ilan';

  let uniqueSlug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.property.findUnique({
      where: { slug: uniqueSlug },
    });

    if (!existing || (excludeId && existing.id === excludeId)) {
      break;
    }

    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
}

function formatProperty(property: any) {
  return {
    ...property,
    images:
      typeof property.images === 'string'
        ? JSON.parse(property.images || '[]')
        : property.images || [],
    features:
      typeof property.features === 'string'
        ? JSON.parse(property.features || '[]')
        : property.features || [],
  };
}

export async function GET(
  _request: NextRequest,
  context: RouteParams
) {
  try {
    const resolvedParams = await context.params;
    const { idOrSlug } = resolvedParams;

    if (!idOrSlug) {
      return NextResponse.json(
        { error: 'İlan ID veya Slug parametresi gereklidir.' },
        { status: 400 }
      );
    }

    const property = await prisma.property.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            inquiries: true,
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json(
        { error: 'İlan bulunamadı.' },
        { status: 404 }
      );
    }

    return NextResponse.json(formatProperty(property), { status: 200 });
  } catch (error) {
    console.error('İlan detayı alınırken hata oluştu:', error);
    return NextResponse.json(
      { error: 'İlan detayı alınırken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const resolvedParams = await context.params;
    const { idOrSlug } = resolvedParams;

    if (!idOrSlug) {
      return NextResponse.json(
        { error: 'İlan ID veya Slug parametresi gereklidir.' },
        { status: 400 }
      );
    }

    const existingProperty = await prisma.property.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
    });

    if (!existingProperty) {
      return NextResponse.json(
        { error: 'Güncellenecek ilan bulunamadı.' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validationResult = propertyUpdateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Geçersiz ilan verileri.',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const validatedData = validationResult.data;

    let slug = existingProperty.slug;
    if (validatedData.slug && validatedData.slug !== existingProperty.slug) {
      slug = await generateUniqueSlug(validatedData.slug, existingProperty.id);
    } else if (validatedData.title && validatedData.title !== existingProperty.title && !validatedData.slug) {
      slug = await generateUniqueSlug(validatedData.title, existingProperty.id);
    }

    if (validatedData.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: validatedData.categoryId },
      });
      if (!category) {
        return NextResponse.json(
          { error: 'Belirtilen kategori bulunamadı.' },
          { status: 400 }
        );
      }
    }

    const updatePayload: Record<string, any> = {};

    if (validatedData.title !== undefined) updatePayload.title = validatedData.title;
    if (slug !== undefined) updatePayload.slug = slug;
    if (validatedData.description !== undefined) updatePayload.description = validatedData.description;
    if (validatedData.price !== undefined) updatePayload.price = validatedData.price;
    if (validatedData.currency !== undefined) updatePayload.currency = validatedData.currency;
    if (validatedData.type !== undefined) updatePayload.type = validatedData.type;
    if (validatedData.status !== undefined) updatePayload.status = validatedData.status;
    if (validatedData.location !== undefined) updatePayload.location = validatedData.location;
    if (validatedData.address !== undefined) updatePayload.address = validatedData.address;
    if (validatedData.bedrooms !== undefined) updatePayload.bedrooms = validatedData.bedrooms;
    if (validatedData.bathrooms !== undefined) updatePayload.bathrooms = validatedData.bathrooms;
    if (validatedData.area !== undefined) updatePayload.area = validatedData.area;
    if (validatedData.featured !== undefined) updatePayload.featured = validatedData.featured;
    if (validatedData.isPublished !== undefined) updatePayload.isPublished = validatedData.isPublished;
    if (validatedData.categoryId !== undefined) updatePayload.categoryId = validatedData.categoryId;

    if (validatedData.images !== undefined) {
      updatePayload.images = JSON.stringify(validatedData.images);
    }
    if (validatedData.features !== undefined) {
      updatePayload.features = JSON.stringify(validatedData.features);
    }

    const updatedProperty = await prisma.property.update({
      where: { id: existingProperty.id },
      data: updatePayload,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return NextResponse.json(formatProperty(updatedProperty), { status: 200 });
  } catch (error) {
    console.error('İlan güncellenirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'İlan güncellenirken sunucu hatası oluştu.' },
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
    const { idOrSlug } = resolvedParams;

    if (!idOrSlug) {
      return NextResponse.json(
        { error: 'İlan ID veya Slug parametresi gereklidir.' },
        { status: 400 }
      );
    }

    const existingProperty = await prisma.property.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
    });

    if (!existingProperty) {
      return NextResponse.json(
        { error: 'Silinecek ilan bulunamadı.' },
        { status: 404 }
      );
    }

    await prisma.property.delete({
      where: { id: existingProperty.id },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'İlan başarıyla silindi.',
        id: existingProperty.id,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('İlan silinirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'İlan silinirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
