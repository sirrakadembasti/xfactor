import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "TEACHER"].includes(session.user?.role)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { id } = await context.params;

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        class: true,
        parent: true,
        attendances: {
          take: 10,
          orderBy: { date: "desc" },
        },
        grades: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Öğrenci bulunamadı" }, { status: 404 });
    }

    return NextResponse.json(student);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Öğrenci bilgisi alınırken hata oluştu", details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();

    const existingStudent = await prisma.student.findUnique({
      where: { id },
    });

    if (!existingStudent) {
      return NextResponse.json({ error: "Öğrenci bulunamadı" }, { status: 404 });
    }

    const updatedStudent = await prisma.student.update({
      where: { id },
      data: {
        ...body,
        birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      },
      include: {
        class: true,
        parent: true,
      },
    });

    return NextResponse.json(updatedStudent);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Öğrenci güncellenirken hata oluştu", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir" }, { status: 403 });
    }

    const { id } = await context.params;

    const student = await prisma.student.findUnique({
      where: { id },
    });

    if (!student) {
      return NextResponse.json({ error: "Öğrenci bulunamadı" }, { status: 404 });
    }

    await prisma.student.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Öğrenci başarıyla silindi", id });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Öğrenci silinirken hata oluştu", details: error.message },
      { status: 500 }
    );
  }
}
