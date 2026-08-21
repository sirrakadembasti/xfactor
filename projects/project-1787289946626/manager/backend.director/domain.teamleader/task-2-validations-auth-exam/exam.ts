import { z } from "zod";

export const questionOptionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "Seçenek metni boş olamaz."),
  isCorrect: z.boolean().default(false),
});

export type QuestionOptionInput = z.infer<typeof questionOptionSchema>;

export const questionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "Soru metni zorunludur."),
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ENDED"]).default("MULTIPLE_CHOICE"),
  points: z.coerce.number().min(1, "Puan en az 1 olmalıdır.").default(10),
  options: z.array(questionOptionSchema).optional().default([]),
  correctAnswer: z.string().optional(),
});

export type QuestionInput = z.infer<typeof questionSchema>;

export const examSchema = z.object({
  title: z
    .string()
    .min(1, "Sınav başlığı zorunludur.")
    .max(150, "Sınav başlığı en fazla 150 karakter olabilir."),
  description: z.string().optional().nullable(),
  durationMinutes: z.coerce
    .number()
    .min(1, "Sınav süresi en az 1 dakika olmalıdır.")
    .max(600, "Sınav süresi en fazla 600 dakika olabilir.")
    .default(60),
  startTime: z.string().datetime({ message: "Geçerli bir başlangıç tarihi giriniz." }).optional().nullable(),
  endTime: z.string().datetime({ message: "Geçerli bir bitiş tarihi giriniz." }).optional().nullable(),
  isPublished: z.boolean().default(false),
  courseId: z.string().min(1, "Ders seçimi zorunludur."),
  questions: z.array(questionSchema).optional().default([]),
});

export type ExamInput = z.infer<typeof examSchema>;

export const updateExamSchema = examSchema.partial().extend({
  id: z.string().min(1, "Sınav ID'si zorunludur."),
});

export type UpdateExamInput = z.infer<typeof updateExamSchema>;

export const submitAnswerSchema = z.object({
  questionId: z.string().min(1, "Soru ID zorunludur."),
  selectedOptionId: z.string().optional().nullable(),
  textAnswer: z.string().optional().nullable(),
});

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

export const examSubmissionSchema = z.object({
  examId: z.string().min(1, "Sınav ID zorunludur."),
  answers: z.array(submitAnswerSchema),
});

export type ExamSubmissionInput = z.infer<typeof examSubmissionSchema>;
