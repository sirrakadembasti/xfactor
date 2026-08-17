import { z } from "zod";

export const borrowSchema = z.object({
  studentId: z.string().min(1, { message: "Öğrenci seçilmelidir." }),
  bookId: z.string().min(1, { message: "Kitap seçilmelidir." }),
  borrowDate: z.string().min(1, { message: "Ödünç alma tarihi gereklidir." }),
  dueDate: z.string().min(1, { message: "Teslim tarihi gereklidir." }),
  notes: z.string().optional(),
});

export const returnSchema = z.object({
  borrowId: z.string().min(1, { message: "Ödünç kaydı gereklidir." }),
  returnDate: z.string().min(1, { message: "İade tarihi gereklidir." }),
  condition: z.enum(["GOOD", "DAMAGED", "LOST"]).default("GOOD"),
  fineAmount: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

export const extendLoanSchema = z.object({
  borrowId: z.string().min(1, { message: "Ödünç kaydı gereklidir." }),
  extensionDays: z.coerce.number().int().min(1).max(30).default(7),
});
