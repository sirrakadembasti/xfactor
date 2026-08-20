import { NextRequest } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { createTaskSchema, taskQuerySchema } from "@/lib/validations/entity.schema";
import { apiSuccess, apiPaginated, handleApiError } from "@/lib/api-response";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryObj = Object.fromEntries(searchParams.entries());
    const query = taskQuerySchema.parse(queryObj);

    const where: Prisma.TaskWhereInput = {};

    if (typeof query.completed === "boolean") {
      where.completed = query.completed;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }

    const totalCount = await prisma.task.count({ where });
    const totalPages = Math.ceil(totalCount / query.limit) || 1;
    const skip = (query.page - 1) * query.limit;

    const tasks = await prisma.task.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { [query.sortBy]: query.sortOrder },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return apiPaginated(tasks, {
      page: query.page,
      limit: query.limit,
      totalCount,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createTaskSchema.parse(body);

    const task = await prisma.task.create({
      data: {
        title: validatedData.title,
        description: validatedData.description,
        completed: validatedData.completed,
        dueDate: validatedData.dueDate,
        userId: validatedData.userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return apiSuccess(task, "Görev başarıyla oluşturuldu.", 201);
  } catch (error) {
    return handleApiError(error);
  }
}
