"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TaskQueryParams,
} from "@/lib/validations/entity.schema";
import type { ApiResponse, PaginatedResponse, Task } from "@/types";

export async function getTasksAction(
  params?: Partial<TaskQueryParams>
): Promise<PaginatedResponse<Task>> {
  try {
    const validatedParams = taskQuerySchema.safeParse(params ?? {});
    const query = validatedParams.success ? validatedParams.data : taskQuerySchema.parse({});

    const { page, limit, completed, search, userId, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const whereClause: Record<string, unknown> = {};

    if (completed !== undefined) {
      whereClause.completed = completed;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [tasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where: whereClause,
        include: { user: true },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.task.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return {
      success: true,
      data: tasks as Task[],
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Görevler listelenirken hata oluştu.",
      pagination: {
        page: 1,
        limit: 10,
        totalCount: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }
}

export async function getTaskByIdAction(id: string): Promise<ApiResponse<Task>> {
  try {
    const task = await prisma.task.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!task) {
      return {
        success: false,
        error: "Görev bulunamadı.",
      };
    }

    return {
      success: true,
      data: task as Task,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Görev detayı getirilemedi.",
    };
  }
}

export async function createTaskAction(
  data: CreateTaskInput
): Promise<ApiResponse<Task>> {
  try {
    const validated = createTaskSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.errors[0]?.message || "Geçersiz görev verisi.",
      };
    }

    const createdTask = await prisma.task.create({
      data: {
        title: validated.data.title,
        description: validated.data.description ?? null,
        completed: validated.data.completed ?? false,
        dueDate: validated.data.dueDate ?? null,
        userId: validated.data.userId ?? null,
      },
      include: { user: true },
    });

    revalidatePath("/tasks");
    revalidatePath("/");

    return {
      success: true,
      data: createdTask as Task,
      message: "Görev başarıyla oluşturuldu.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Görev oluşturulurken bir hata oluştu.",
    };
  }
}

export async function updateTaskAction(
  id: string,
  data: UpdateTaskInput
): Promise<ApiResponse<Task>> {
  try {
    const validated = updateTaskSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.errors[0]?.message || "Geçersiz güncelleme verisi.",
      };
    }

    const existingTask = await prisma.task.findUnique({ where: { id } });
    if (!existingTask) {
      return {
        success: false,
        error: "Güncellenecek görev bulunamadı.",
      };
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: validated.data,
      include: { user: true },
    });

    revalidatePath("/tasks");
    revalidatePath(`/tasks/${id}`);
    revalidatePath("/");

    return {
      success: true,
      data: updatedTask as Task,
      message: "Görev başarıyla güncellendi.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Görev güncellenirken bir hata oluştu.",
    };
  }
}

export async function toggleTaskStatusAction(id: string): Promise<ApiResponse<Task>> {
  try {
    const existingTask = await prisma.task.findUnique({ where: { id } });
    if (!existingTask) {
      return {
        success: false,
        error: "Görev bulunamadı.",
      };
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        completed: !existingTask.completed,
      },
      include: { user: true },
    });

    revalidatePath("/tasks");
    revalidatePath(`/tasks/${id}`);
    revalidatePath("/");

    return {
      success: true,
      data: updatedTask as Task,
      message: `Görev durumu "${updatedTask.completed ? "Tamamlandı" : "Devam Ediyor"}" olarak güncellendi.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Görev durumu değiştirilemedi.",
    };
  }
}

export async function deleteTaskAction(id: string): Promise<ApiResponse<{ id: string }>> {
  try {
    const existingTask = await prisma.task.findUnique({ where: { id } });
    if (!existingTask) {
      return {
        success: false,
        error: "Silinecek görev bulunamadı.",
      };
    }

    await prisma.task.delete({ where: { id } });

    revalidatePath("/tasks");
    revalidatePath("/");

    return {
      success: true,
      data: { id },
      message: "Görev başarıyla silindi.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Görev silinirken bir hata oluştu.",
    };
  }
}
