import { z } from 'zod';

export const createBookSchema = z.object({
  title: z.string().min(1, 'Kitap adı zorunludur'),
  author: z.string().min(1, 'Yazar adı zorunludur'),
  isbn: z.string().min(10, 'Geçerli bir ISBN numarası giriniz').max(17, 'ISBN numarası çok uzun'),
  categoryId: z.string().min(1, 'Kategori seçimi zorunludur'),
  quantity: z.number().int().min(0, 'Stok adedi 0 veya daha büyük olmalıdır'),
  publicationYear: z.number().int().min(1000).max(new Date().getFullYear()).optional().nullable(),
  publisher: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
});

export const updateBookSchema = createBookSchema.partial();

export const bookFilterSchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type BookFilterInput = z.infer<typeof bookFilterSchema>;
