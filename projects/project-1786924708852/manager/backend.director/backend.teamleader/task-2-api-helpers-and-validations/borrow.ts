import { z } from 'zod';

export const createBorrowSchema = z.object({
  studentId: z.string().min(1, 'Öğrenci seçimi zorunludur'),
  bookId: z.string().min(1, 'Kitap seçimi zorunludur'),
  dueDate: z.string().datetime({ message: 'Geçerli bir teslim tarihi giriniz' }).or(z.coerce.date()),
  notes: z.string().optional(),
});

export const returnBorrowSchema = z.object({
  borrowId: z.string().min(1, 'Ödünç kaydı zorunludur'),
  returnCondition: z.enum(['EXCELLENT', 'GOOD', 'DAMAGED', 'LOST']).default('GOOD'),
  notes: z.string().optional(),
  fineAmount: z.coerce.number().min(0).default(0),
  isFinePaid: z.boolean().default(false),
});

export const extendBorrowSchema = z.object({
  borrowId: z.string().min(1, 'Ödünç kaydı zorunludur'),
  daysToExtend: z.coerce.number().int().min(1).max(30).default(7),
  newDueDate: z.string().datetime().or(z.coerce.date()).optional(),
});

export const borrowQuerySchema = z.object({
  studentId: z.string().optional(),
  bookId: z.string().optional(),
  status: z.enum(['BORROWED', 'RETURNED', 'OVERDUE', 'CANCELLED']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['borrowDate', 'dueDate', 'returnDate', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateBorrowInput = z.infer<typeof createBorrowSchema>;
export type ReturnBorrowInput = z.infer<typeof returnBorrowSchema>;
export type ExtendBorrowInput = z.infer<typeof extendBorrowSchema>;
export type BorrowQueryInput = z.infer<typeof borrowQuerySchema>;
