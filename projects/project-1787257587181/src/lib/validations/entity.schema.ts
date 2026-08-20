import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, { message: "Başlık alanı zorunludur." }).max(200, { message: "Başlık en fazla 200 karakter olabilir." }),
  description: z.string().trim().max(1000, { message: "Açıklama en fazla 1000 karakter olabilir." }).optional().nullable(),
  completed: z.boolean().default(false),
  dueDate: z.coerce.date().optional().nullable(),
  userId: z.string().cuid().optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  completed: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  search: z.string().trim().optional(),
  userId: z.string().cuid().optional(),
  sortBy: z.enum(["createdAt", "dueDate", "title"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQueryParams = z.infer<typeof taskQuerySchema>;
