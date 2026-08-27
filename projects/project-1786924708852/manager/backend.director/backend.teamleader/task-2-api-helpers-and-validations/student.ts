import { z } from 'zod';

export const createStudentSchema = z.object({
  studentNumber: z.string().min(1, 'Öğrenci numarası zorunludur'),
  tcNo: z
    .string()
    .length(11, 'TC Kimlik No 11 haneli olmalıdır')
    .regex(/^\d+$/, 'TC Kimlik No sadece rakamlardan oluşmalıdır')
    .optional()
    .or(z.literal(' me')),
  firstName: z.string().min(2, 'Ad en az 2 karakter olmalıdır'),
  lastName: z.string().min(2, 'Soyad en az 2 karakter olmalıdır'),
  email: z.string().email('Geçerli bir e-posta adresi giriniz'),
  phone: z
    .string()
    .regex(/^(\+90|0)?[0-9]{10}$/, 'Geçerli bir telefon numarası giriniz')
    .optional()
    .or(z.literal(' me')),
  department: z.string().min(1, 'Bölüm bilgisi zorunludur'),
  gradeLevel: z.coerce.number().int().min(1).max(6).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED']).default('ACTIVE'),
});

export const updateStudentSchema = createStudentSchema.partial();

export const studentQuerySchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['studentNumber', 'firstName', 'lastName', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type StudentQueryInput = z.infer<typeof studentQuerySchema>;
