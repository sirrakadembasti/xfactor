import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, role } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Ad, e-posta ve şifre alanları zorunludur.' },
        { status: 400 }
      );
    }

    // Rol kısıtlaması: Yönetici rolü kayıt API'si üzerinden atanamaz
    const requestedRole = (role || 'STUDENT').toUpperCase();
    if (requestedRole === 'ADMIN') {
      return NextResponse.json(
        { error: 'Yönetici (ADMIN) rolü ile doğrudan kayıt olunamaz.' },
        { status: 403 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Bu e-posta adresi zaten kullanımda.' },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Öğretmen hesapları varsayılan olarak onay bekler (isApproved: false)
    const isApproved = requestedRole === 'TEACHER' ? false : true;

    const newUser = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: requestedRole,
        isApproved,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isApproved: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: isApproved
          ? 'Kayıt başarılı.'
          : 'Kayıt başarılı. Öğretmen hesabınız yönetici onayı bekliyor.',
        user: newUser,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: 'Sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
