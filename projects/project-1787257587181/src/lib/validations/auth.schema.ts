import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email({ message: "Geçerli bir e-posta adresi giriniz." }),
  password: z.string().min(6, { message: "Şifre en az 6 karakter olmalıdır." }),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, { message: "İsim en az 2 karakter olmalıdır." }).max(50, { message: "İsim en fazla 50 karakter olabilir." }).optional(),
  email: z.string().trim().email({ message: "Geçerli bir e-posta adresi giriniz." }),
  password: z.string().min(6, { message: "Şifre en az 6 karakter olmalıdır." }).max(100, { message: "Şifre en fazla 100 karakter olabilir." }),
  role: z.enum(["USER", "ADMIN"]).default("USER").optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, { message: "İsim en az 2 karakter olmalıdır." }).max(50).optional(),
  email: z.string().trim().email({ message: "Geçerli bir e-posta adresi giriniz." }).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
