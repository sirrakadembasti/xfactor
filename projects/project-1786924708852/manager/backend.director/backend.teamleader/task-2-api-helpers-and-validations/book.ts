import { z } from 'zod';

export const createBookSchema = z.object({
  title: z.string().min(1, 'Kitap adı zorunludur'),
  author: z.string().min(1, 'Yazar adı zorunludur'),
  isbn: z
    .string()
    .min(10, 'Geçerli bir ISBN giriniz')
    .max(17, 'ISBN en fazla 17 karakter olabilir'),
  categoryId: z.string().min(1, 'Kategori seçimi zorunludur'),
  publisher: z.string().optional(),
  publishYear: z
    .number({ invalid_type_error: 'Yayın yılı sayı olmalıdır' })
    .int()
    .min(1000)
    .max(new Date().getFullYear())
    .optional(),
  totalCopies: z
    .number({ invalid_type_error: 'Toplam kopya sayısı sayı olmalıdır' })
    .int()
    .min(1, 'En az 1 kopya olmalıdır')
    .default(1),
  availableCopies: z.number().int().min(0).optional(),
  shelfLocation: z.string().optional(),
  description: z.string().optional(),
  coverImage: z.string().url('Geçerli bir görsel adresi giriniz').or(z.literal('')).optional(),
});

export const updateBookSchema = createBookSchema.partial();

export const bookQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  availableOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['title', 'author', 'createdAt', 'publishYear']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type BookQueryInput = z.infer<typeof bookQuerySchema>;
