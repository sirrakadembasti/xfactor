import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

function slugify(text: string): string {
  const trMap: Record<string, string> = {
    ç: 'c',
    Ç: 'c',
    ğ: 'g',
    Ğ: 'g',
    ş: 's',
    Ş: 's',
    ü: 'u',
    Ü: 'u',
    ı: 'i',
    İ: 'i',
    ö: 'o',
    Ö: 'o',
  };

  return text
    .split('')
    .map((char) => trMap[char] || char)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const createCategorySchema = z.object({
  name: z
    .string({ required_error: 'Kategori adı zorunludur.' })
    .min(2, 'Kategori adı en az 2 karakter olmalıdır.')
    .max(50, 'Kategori adı en fazla 50 karakter olabilir.'),
  slug: z.string().optional(),
  description: z.string().max(300, 'Açıklama en fazla 300 karakter olabilir.').optional().nullable(),
  order: z.coerce.number().int().default(0),
});

export async function GET() {
  try {
    const categories = await db.category.findMany({
      orderBy: [
        { order: 'asc' },
        { name: 'asc' },
      ],
      include: {
        _count: {
          select: {
            properties: {
              where: {
                isPublished: true,
              },
            },
          },
        },
      },
    });

    const formatted = categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      order: category.order,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      propertyCount: category._count.properties,
    }));

    return NextResponse.json(formatted, { status: 200 });
  } catch (error) {
    console.error('Kategoriler listelenirken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kategoriler alınırken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createCategorySchema.parse(body);

    let slug = validatedData.slug?.trim() || slugify(validatedData.name);

    if (!slug) {
      slug = `category-${Date.now()}`;
    }

    const existingSlug = await db.category.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const newCategory = await db.category.create({
      data: {
        name: validatedData.name,
        slug,
        description: validatedData.description || null,
        order: validatedData.order,
      },
    });

    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Kategori oluşturulurken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Kategori eklenirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}
