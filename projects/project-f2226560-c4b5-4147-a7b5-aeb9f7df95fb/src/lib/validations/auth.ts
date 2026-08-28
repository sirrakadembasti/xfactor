import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: "E-posta adresi zorunludur" })
    .email({ message: "Geçerli bir e-posta adresi giriniz" }),
  password: z
    .string()
    .min(1, { message: "Şifre zorunludur" })
    .min(6, { message: "Şifre en az 6 karakter olmalıdır" }),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: "Ad Soyad zorunludur" })
      .min(2, { message: "Ad Soyad en az 2 karakter olmalıdır" }),
    email: z
      .string()
      .min(1, { message: "E-posta adresi zorunludur" })
      .email({ message: "Geçerli bir e-posta adresi giriniz" }),
    password: z
      .string()
      .min(1, { message: "Şifre zorunludur" })
      .min(6, { message: "Şifre en az 6 karakter olmalıdır" }),
    confirmPassword: z
      .string()
      .min(1, { message: "Şifre tekrarı zorunludur" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
