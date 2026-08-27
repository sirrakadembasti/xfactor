import { z } from 'zod';

export const propertyTypeEnum = z.enum(['SALE', 'RENT']);
export const propertyStatusEnum = z.enum([
  'AVAILABLE',
  'SOLD',
  'RENTED',
  'PENDING',
]);

export const propertySchema = z.object({
  title: z
    .string({
      required_error: 'İlan başlığı zorunludur.',
    })
    .min(3, 'İlan başlığı en az 3 karakter olmalıdır.')
    .max(150, 'İlan başlığı en fazla 150 karakter olabilir.'),
  slug: z
    .string()
    .min(3, 'Slug en az 3 karakter olmalıdır.')
    .max(160, 'Slug en fazla 160 karakter olabilir.')
    .optional(),
  description: z
    .string({
      required_error: 'İlan açıklaması zorunludur.',
    })
    .min(10, 'Açıklama en az 10 karakter olmalıdır.'),
  price: z.coerce
    .number({
      required_error: 'Fiyat zorunludur.',
      invalid_type_error: 'Geçerli bir fiyat giriniz.',
    })
    .positive('Fiyat 0\'dan büyük olmalıdır.'),
  currency: z.string().default('TRY'),
  type: propertyTypeEnum.default('SALE'),
  status: propertyStatusEnum.default('AVAILABLE'),
  location: z
    .string({
      required_error: 'Konum/Şehir bilgisi zorunludur.',
    })
    .min(2, 'Konum bilgisi en az 2 karakter olmalıdır.'),
  address: z.string().optional().nullable(),
  bedrooms: z.coerce
    .number()
    .int()
    .nonnegative('Oda sayısı negatif olamaz.')
    .optional()
    .nullable(),
  bathrooms: z.coerce
    .number()
    .int()
    .nonnegative('Banyo sayısı negatif olamaz.')
    .optional()
    .nullable(),
  area: z.coerce
    .number()
    .positive('Metrekare 0\'dan büyük olmalıdır.')
    .optional()
    .nullable(),
  images: z.array(z.string().url('Geçerli bir görsel bağlantısı giriniz.')).default([]),
  features: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  categoryId: z
    .string({
      required_error: 'Kategori seçimi zorunludur.',
    })
    .min(1, 'Kategori seçimi zorunludur.'),
});

export const propertyUpdateSchema = propertySchema.partial();

export const propertyFilterSchema = z.object({
  q: z.string().optional(),
  type: propertyTypeEnum.optional(),
  status: propertyStatusEnum.optional(),
  categoryId: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  bedrooms: z.coerce.number().int().optional(),
  bathrooms: z.coerce.number().int().optional(),
  minArea: z.coerce.number().positive().optional(),
  maxArea: z.coerce.number().positive().optional(),
  location: z.string().optional(),
  featured: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean())
    .optional(),
  isPublished: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean())
    .optional(),
  sort: z
    .enum(['price_asc', 'price_desc', 'newest', 'oldest'])
    .default('newest')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export type PropertyInput = z.infer<typeof propertySchema>;
export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;
export type PropertyFilterParams = z.infer<typeof propertyFilterSchema>;
