import { z } from 'zod';

export const inquiryStatusEnum = z.enum(['PENDING', 'CONTACTED', 'CLOSED']);

export const inquirySchema = z.object({
  name: z
    .string({
      required_error: 'İsim ve soyisim alanı zorunludur.',
    })
    .min(2, 'İsim en az 2 karakter olmalıdır.')
    .max(100, 'İsim en fazla 100 karakter olabilir.'),
  email: z
    .string({
      required_error: 'E-posta adresi zorunludur.',
    })
    .email('Geçerli bir e-posta adresi giriniz.'),
  phone: z
    .string({
      required_error: 'Telefon numarası zorunludur.',
    })
    .min(7, 'Geçerli bir telefon numarası giriniz.')
    .max(20, 'Telefon numarası çok uzun.'),
  message: z
    .string({
      required_error: 'Mesaj alanı zorunludur.',
    })
    .min(5, 'Mesajınız en az 5 karakter olmalıdır.')
    .max(1000, 'Mesajınız en fazla 1000 karakter olabilir.'),
  propertyId: z.string().optional().nullable(),
});

export const inquiryStatusUpdateSchema = z.object({
  status: inquiryStatusEnum,
});

export const inquiryFilterSchema = z.object({
  q: z.string().optional(),
  status: inquiryStatusEnum.optional(),
  propertyId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export type InquiryInput = z.infer<typeof inquirySchema>;
export type InquiryStatusUpdateInput = z.infer<typeof inquiryStatusUpdateSchema>;
export type InquiryFilterParams = z.infer<typeof inquiryFilterSchema>;
