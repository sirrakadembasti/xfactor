import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { propertySchema } from '@/lib/validations/property';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const city = searchParams.get('city');

    const whereClause: Record<string, unknown> = {};
    if (type) whereClause.type = type;
    if (city) whereClause.city = { contains: city, mode: 'insensitive' };

    const properties = await prisma.property.findMany({
      where: whereClause,
      include: {
        images: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(properties, { status: 200 });
  } catch (error) {
    console.error('İlanları getirme hatası:', error);
    return NextResponse.json({ error: 'İlanlar yüklenirken hata oluştu' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsedData = propertySchema.safeParse(body);

    if (!parsedData.success) {
      return NextResponse.json({ error: parsedData.error.flatten() }, { status: 400 });
    }

    const { images, ...data } = parsedData.data;

    // Örnek kullanıcı ID'si (gerçek ortamda auth oturumundan alınır)
    const user = await prisma.user.upsert({
      where: { email: 'demo@emlak.com' },
      update: {},
      create: {
        email: 'demo@emlak.com',
        name: 'Demo Danışman',
        password: 'demo_secure_hash',
      },
    });

    const property = await prisma.property.create({
      data: {
        ...data,
        userId: user.id,
        images: {
          create: images.map((url) => ({ url })),
        },
      },
      include: {
        images: true,
      },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error('İlan oluşturma hatası:', error);
    return NextResponse.json({ error: 'İlan oluşturulamadı' }, { status: 500 });
  }
}
