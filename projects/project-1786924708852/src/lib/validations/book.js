import { z } from "zod";

export const bookSchema = z.object({
  title: z.string().min(1, { message: "Kitap başlığı boş bırakılamaz." }),
  author: z.string().min(1, { message: "Yazar adı boş bırakılamaz." }),
  isbn: z
    .string()
    .min(10, { message: "ISBN en az 10 karakter olmalıdır." })
    .max(17, { message: "ISBN en fazla 17 karakter olabilir." }),
  category: z.string().min(1, { message: "Kategori seçimi zorunludur." }),
  publisher: z.string().optional(),
  publishYear: z.coerce
    .number()
    .min(1000, { message: "Geçerli bir yıl giriniz." })
    .max(new Date().getFullYear(), { message: "Gelecek bir yıl girilemez." }),
  totalCopies: z.coerce
    .number()
    .int()
    .min(1, { message: "Toplam kopya sayısı en az 1 olmalıdır." }),
  availableCopies: z.coerce.number().int().min(0).optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2, { message: "Kategori adı en az 2 karakter olmalıdır." }),
  description: z.string().optional(),
});
