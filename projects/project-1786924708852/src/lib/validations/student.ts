import { z } from 'zod';

export const createStudentSchema = z.object({
  studentNumber: z.string().min(1, 'Öğrenci numarası zorunludur'),
  name: z.string().min(2, 'Ad Soyad en az 2 karakter olmalıdır'),
  email: z.string().email('Geçerli bir e-posta adresi giriniz').optional().or(z.literal('')),
  phone: z.string().min(10, 'Telefon numarası en az 10 karakter olmalıdır').optional().or(z.literal('')),
  tcNo: z.string().length(11, 'T.C. Kimlik numarası 11 haneli olmalıdır').optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  grade: z.string().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'PASSIVE', 'GRADUATED']).default('ACTIVE'),
});

export const updateStudentSchema = createStudentSchema.partial();

export const studentFilterSchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(['ACTIVE', 'PASSIVE', 'GRADUATED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type StudentFilterInput = z.infer<typeof studentFilterSchema>;
