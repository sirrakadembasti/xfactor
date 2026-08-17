import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "TEACHER"].includes(session.user?.role)) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const search = searchParams.get("search") || "";
    const classId = searchParams.get("classId");
    const status = searchParams.get("status");

    const skip = (page - 1) * limit;

    const where: any = {
      AND: [
        search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { studentNumber: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        classId ? { classId } : {},
        status ? { status } : {},
      ],
    };

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        include: {
          class: true,
          parent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.student.count({ where }),
    ]);

    return NextResponse.json({
      data: students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Öğrenciler getirilirken bir hata oluştu", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir" }, { status: 403 });
    }

    const body = await req.json();
    const { firstName, lastName, studentNumber, email, phone, birthDate, gender, classId, parentId, status, address } = body;

    if (!firstName || !lastName || !studentNumber) {
      return NextResponse.json(
        { error: "Ad, soyad ve öğrenci numarası zorunludur" },
        { status: 400 }
      );
    }

    const existingStudent = await prisma.student.findFirst({
      where: {
        OR: [
          { studentNumber },
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (existingStudent) {
      return NextResponse.json(
        { error: "Bu öğrenci numarası veya e-posta zaten kullanımda" },
        { status: 400 }
      );
    }

    const student = await prisma.student.create({
      data: {
        firstName,
        lastName,
        studentNumber,
        email,
        phone,
        birthDate: birthDate ? new Date(birthDate) : null,
        gender,
        classId,
        parentId,
        status: status || "ACTIVE",
        address,
      },
      include: {
        class: true,
        parent: true,
      },
    });

    return NextResponse.json(student, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Öğrenci eklenirken bir hata oluştu", details: error.message },
      { status: 500 }
    );
  }
}
