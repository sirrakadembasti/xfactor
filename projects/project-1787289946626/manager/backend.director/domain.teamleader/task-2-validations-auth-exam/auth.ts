import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta adresi zorunludur.")
    .email("Geçerli bir e-posta adresi giriniz."),
  password: z
    .string()
    .min(1, "Şifre zorunludur.")
    .min(6, "Şifre en az 6 karakter olmalıdır."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, "Ad Soyad alanı zorunludur.")
      .min(2, "Ad Soyad en az 2 karakter olmalıdır.")
      .max(100, "Ad Soyad en fazla 100 karakter olabilir."),
    email: z
      .string()
      .min(1, "E-posta adresi zorunludur.")
      .email("Geçerli bir e-posta adresi giriniz."),
    password: z
      .string()
      .min(1, "Şifre zorunludur.")
      .min(6, "Şifre en az 6 karakter olmalıdır.")
      .max(100, "Şifre en fazla 100 karakter olabilir."),
    confirmPassword: z
      .string()
      .min(1, "Şifre onayı zorunludur."),
    role: z
      .enum(["STUDENT", "TEACHER"])
      .default("STUDENT"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Şifreler eşleşmiyor.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
