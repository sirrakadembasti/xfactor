"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loginSchema,
  registerSchema,
  updateUserSchema,
  type LoginInput,
  type RegisterInput,
  type UpdateUserInput,
} from "@/lib/validations/auth.schema";
import type { ApiResponse, User } from "@/types";

export async function loginAction(data: LoginInput): Promise<ApiResponse<User>> {
  try {
    const validated = loginSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.errors[0]?.message || "Geçersiz giriş bilgileri.",
      };
    }

    const user = await prisma.user.findUnique({
      where: { email: validated.data.email },
    });

    if (!user) {
      return {
        success: false,
        error: "Kullanıcı bulunamadı.",
      };
    }

    return {
      success: true,
      data: user,
      message: "Giriş başarılı.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Giriş sırasında bir hata oluştu.",
    };
  }
}

export async function registerAction(data: RegisterInput): Promise<ApiResponse<User>> {
  try {
    const validated = registerSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.errors[0]?.message || "Geçersiz kayıt bilgileri.",
      };
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.data.email },
    });

    if (existingUser) {
      return {
        success: false,
        error: "Bu e-posta adresi zaten kullanımda.",
      };
    }

    const user = await prisma.user.create({
      data: {
        email: validated.data.email,
        name: validated.data.name ?? null,
        role: validated.data.role ?? "USER",
      },
    });

    revalidatePath("/admin/users");

    return {
      success: true,
      data: user,
      message: "Kayıt başarıyla tamamlandı.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Kayıt sırasında bir hata oluştu.",
    };
  }
}

export async function updateUserAction(
  id: string,
  data: UpdateUserInput
): Promise<ApiResponse<User>> {
  try {
    const validated = updateUserSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.errors[0]?.message || "Geçersiz güncelleme verisi.",
      };
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return {
        success: false,
        error: "Güncellenecek kullanıcı bulunamadı.",
      };
    }

    if (validated.data.email && validated.data.email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: validated.data.email },
      });
      if (emailTaken) {
        return {
          success: false,
          error: "Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor.",
        };
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: validated.data,
    });

    revalidatePath("/admin/users");
    revalidatePath(`/profile`);

    return {
      success: true,
      data: updatedUser,
      message: "Kullanıcı başarıyla güncellendi.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Kullanıcı güncellenirken hata oluştu.",
    };
  }
}

export async function deleteUserAction(id: string): Promise<ApiResponse<{ id: string }>> {
  try {
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return {
        success: false,
        error: "Silinecek kullanıcı bulunamadı.",
      };
    }

    await prisma.user.delete({ where: { id } });

    revalidatePath("/admin/users");

    return {
      success: true,
      data: { id },
      message: "Kullanıcı başarıyla silindi.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Kullanıcı silinirken hata oluştu.",
    };
  }
}

export async function getUsersAction(): Promise<ApiResponse<User[]>> {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: users,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Kullanıcılar getirilemedi.",
    };
  }
}
