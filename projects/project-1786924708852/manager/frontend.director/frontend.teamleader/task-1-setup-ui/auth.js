import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: "E-posta adresi gereklidir." })
    .email({ message: "Geçerli bir e-posta adresi giriniz." }),
  password: z
    .string()
    .min(6, { message: "Şifre en az 6 karakter olmalıdır." }),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, { message: "Ad soyad en az 2 karakter olmalıdır." }),
    email: z.string().email({ message: "Geçerli bir e-posta adresi giriniz." }),
    role: z.enum(["ADMIN", "LIBRARIAN", "STUDENT"]).default("STUDENT"),
    password: z.string().min(6, { message: "Şifre en az 6 karakter olmalıdır." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Şifreler eşleşmiyor.",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z.object({
  email: z.string().email({ message: "Geçerli bir e-posta adresi giriniz." }),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, { message: "Ad soyad en az 2 karakter olmalıdır." }),
  email: z.string().email({ message: "Geçerli bir e-posta adresi giriniz." }),
  phone: z.string().optional(),
});
