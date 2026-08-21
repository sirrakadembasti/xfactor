import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          message: "Geçersiz giriş bilgileri",
          errors: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        {
          message: "E-posta adresi veya şifre hatalı.",
        },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return NextResponse.json(
        {
          message: "E-posta adresi veya şifre hatalı.",
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        message: "Giriş başarılı.",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[LOGIN_ERROR]", error);
    return NextResponse.json(
      {
        message: "Giriş yapılırken bir sunucu hatası meydana geldi.",
      },
      { status: 500 }
    );
  }
}
