import { z } from "zod";

export const studentSchema = z.object({
  studentNumber: z
    .string()
    .min(3, { message: "Öğrenci numarası en az 3 karakter olmalıdır." }),
  name: z.string().min(2, { message: "Öğrenci adı en az 2 karakter olmalıdır." }),
  email: z.string().email({ message: "Geçerli bir e-posta adresi giriniz." }),
  phone: z.string().min(10, { message: "Geçerli bir telefon numarası giriniz." }),
  department: z.string().min(1, { message: "Bölüm seçiniz." }),
  gradeLevel: z.string().optional(),
  status: z.enum(["ACTIVE", "PASSIVE", "GRADUATED"]).default("ACTIVE"),
  maxBooksLimit: z.coerce.number().int().min(1).default(5),
});
