import { z } from 'zod';

export const createBorrowSchema = z.object({
  studentId: z.string().min(1, 'Öğrenci seçimi zorunludur'),
  bookId: z.string().min(1, 'Kitap seçimi zorunludur'),
  dueDate: z.string().datetime().or(z.date()).or(z.string().min(1, 'Teslim tarihi zorunludur')),
  notes: z.string().optional().nullable(),
});

export const returnBorrowSchema = z.object({
  borrowId: z.string().min(1, 'Ödünç kaydı seçimi zorunludur'),
  returnDate: z.string().datetime().or(z.date()).optional(),
  notes: z.string().optional().nullable(),
});

export const extendBorrowSchema = z.object({
  borrowId: z.string().min(1, 'Ödünç kaydı seçimi zorunludur'),
  newDueDate: z.string().datetime().or(z.date()).or(z.string().min(1, 'Yeni teslim tarihi zorunludur')),
});

export const borrowFilterSchema = z.object({
  search: z.string().optional(),
  studentId: z.string().optional(),
  bookId: z.string().optional(),
  status: z.enum(['BORROWED', 'RETURNED', 'OVERDUE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export type CreateBorrowInput = z.infer<typeof createBorrowSchema>;
export type ReturnBorrowInput = z.infer<typeof returnBorrowSchema>;
export type ExtendBorrowInput = z.infer<typeof extendBorrowSchema>;
export type BorrowFilterInput = z.infer<typeof borrowFilterSchema>;
