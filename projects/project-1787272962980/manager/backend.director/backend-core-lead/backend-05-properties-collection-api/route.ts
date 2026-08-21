import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { propertySchema } from '@/lib/validations/property';
import { Prisma } from '@prisma/client';

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

async function generateUniqueSlug(baseTitle: string): Promise<string> {
  let baseSlug = slugify(baseTitle);
  if (!baseSlug) baseSlug = 'ilan';

  let uniqueSlug = baseSlug;
  let counter = 1;

  while (await prisma.property.findUnique({ where: { slug: uniqueSlug } })) {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
}

function formatProperty(property: any) {
  return {
    ...property,
    images: typeof property.images === 'string' ? JSON.parse(property.images || '[]') : property.images,
    features: typeof property.features === 'string' ? JSON.parse(property.features || '[]') : property.features,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q') || undefined;
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;
    const categoryId = searchParams.get('categoryId') || undefined;
    const categorySlug = searchParams.get('categorySlug') || undefined;
    const location = searchParams.get('location') || undefined;
    const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
    const bedrooms = searchParams.get('bedrooms') ? Number(searchParams.get('bedrooms')) : undefined;
    const bathrooms = searchParams.get('bathrooms') ? Number(searchParams.get('bathrooms')) : undefined;
    const minArea = searchParams.get('minArea') ? Number(searchParams.get('minArea')) : undefined;
    const maxArea = searchParams.get('maxArea') ? Number(searchParams.get('maxArea')) : undefined;
    const featuredParam = searchParams.get('featured');
    const featured = featuredParam !== null ? featuredParam === 'true' : undefined;
    const isPublishedParam = searchParams.get('isPublished');
    const isPublished = isPublishedParam !== null ? isPublishedParam === 'true' : undefined;

    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 12));
    const skip = (page - 1) * limit;

    const where: Prisma.PropertyWhereInput = {};

    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
        { location: { contains: q } },
        { address: { contains: q } },
      ];
    }

    if (type) where.type = type;
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (categorySlug) where.category = { slug: categorySlug };
    if (location) where.location = { contains: location };
    if (featured !== undefined) where.featured = featured;
    if (isPublished !== undefined) where.isPublished = isPublished;

    if (bedrooms !== undefined && !isNaN(bedrooms)) {
      where.bedrooms = bedrooms >= 5 ? { gte: 5 } : bedrooms;
    }

    if (bathrooms !== undefined && !isNaN(bathrooms)) {
      where.bathrooms = bathrooms;
    }

    if ((minPrice !== undefined && !isNaN(minPrice)) || (maxPrice !== undefined && !isNaN(maxPrice))) {
      where.price = {};
      if (minPrice !== undefined && !isNaN(minPrice)) where.price.gte = minPrice;
      if (maxPrice !== undefined && !isNaN(maxPrice)) where.price.lte = maxPrice;
    }

    if ((minArea !== undefined && !isNaN(minArea)) || (maxArea !== undefined && !isNaN(maxArea))) {
      where.area = {};
      if (minArea !== undefined && !isNaN(minArea)) where.area.gte = minArea;
      if (maxArea !== undefined && !isNaN(maxArea)) where.area.lte = maxArea;
    }

    const validSortFields: Record<string, string> = {
      createdAt: 'createdAt',
      price: 'price',
      area: 'area',
      bedrooms: 'bedrooms',
      title: 'title',
    };
    const orderByField = validSortFields[sortBy] || 'createdAt';

    const [total, properties] = await Promise.all([
      prisma.property.count({ where }),
      prisma.property.findMany({
        where,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { [orderByField]: sortOrder },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data: properties.map(formatProperty),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('İlanlar listelenirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'İlanlar yüklenirken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = propertySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Doğrulama hatası',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const categoryExists = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });

    if (!categoryExists) {
      return NextResponse.json(
        { error: 'Seçilen kategori bulunamadı.' },
        { status: 400 }
      );
    }

    const slug = data.slug ? slugify(data.slug) : await generateUniqueSlug(data.title);

    const existingSlug = await prisma.property.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      return NextResponse.json(
        { error: 'Bu ilan bağlantısı (slug) zaten kullanılmaktadır.' },
        { status: 409 }
      );
    }

    const newProperty = await prisma.property.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        price: data.price,
        currency: data.currency || 'TRY',
        type: data.type || 'SALE',
        status: data.status || 'AVAILABLE',
        location: data.location,
        address: data.address || null,
        bedrooms: data.bedrooms !== undefined ? data.bedrooms : null,
        bathrooms: data.bathrooms !== undefined ? data.bathrooms : null,
        area: data.area !== undefined ? data.area : null,
        images: JSON.stringify(data.images || []),
        features: JSON.stringify(data.features || []),
        featured: data.featured ?? false,
        isPublished: data.isPublished ?? true,
        categoryId: data.categoryId,
      },
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

    return NextResponse.json(
      {
        message: 'İlan başarıyla oluşturuldu.',
        data: formatProperty(newProperty),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('İlan oluşturulurken hata oluştu:', error);
    return NextResponse.json(
      { error: 'İlan oluşturulurken bir sunucu hatası meydana geldi.' },
      { status: 500 }
    );
  }
}
