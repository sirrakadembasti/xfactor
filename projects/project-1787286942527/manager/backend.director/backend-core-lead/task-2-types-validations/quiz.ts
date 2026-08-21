import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi giriniz.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır.'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'İsim en az 2 karakter olmalıdır.'),
  email: z.string().email('Geçerli bir e-posta adresi giriniz.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır.'),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT']).default('STUDENT'),
  classroomId: z.string().optional().nullable(),
});

export const subjectSchema = z.object({
  name: z.string().min(2, 'Ders adı en az 2 karakter olmalıdır.'),
  code: z.string().min(2, 'Ders kodu en az 2 karakter olmalıdır.').toUpperCase(),
  description: z.string().optional().nullable(),
});

export const classroomSchema = z.object({
  name: z.string().min(2, 'Sınıf adı en az 2 karakter olmalıdır.'),
  grade: z.coerce.number().int().min(1, 'Sınıf seviyesi 1 ile 12 arasında olmalıdır.').max(12),
  description: z.string().optional().nullable(),
});

export const questionSchema = z.object({
  content: z.string().min(5, 'Soru metni en az 5 karakter olmalıdır.'),
  options: z
    .array(z.string().min(1, 'Seçenek boş bırakılamaz.'))
    .min(2, 'En az 2 seçenek eklenmelidir.')
    .max(6, 'En fazla 6 seçenek eklenebilir.'),
  correctAnswer: z.string().min(1, 'Doğru cevap belirtilmelidir.'),
  explanation: z.string().optional().nullable(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  points: z.coerce.number().int().min(1, 'Soru puanı en az 1 olmalıdır.').default(10),
  subjectId: z.string().min(1, 'Ders seçimi zorunludur.'),
});

export const quizSchema = z.object({
  title: z.string().min(3, 'Quiz başlığı en az 3 karakter olmalıdır.'),
  description: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  durationMinutes: z.coerce.number().int().min(1, 'Süre en az 1 dakika olmalıdır.'),
  passScore: z.coerce.number().min(0, 'Geçme puanı en az 0 olmalıdır.').max(100),
  subjectId: z.string().min(1, 'Ders seçimi zorunludur.'),
  classroomId: z.string().optional().nullable(),
  questionIds: z.array(z.string()).min(1, 'Quiz için en az 1 soru seçilmelidir.'),
});

export const submitAnswerSchema = z.object({
  questionId: z.string().min(1, 'Soru ID zorunludur.'),
  selectedOption: z.string().min(1, 'Lütfen bir seçenek işaretleyiniz.'),
});

export const submitQuizAttemptSchema = z.object({
  quizId: z.string().min(1, 'Quiz ID zorunludur.'),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedOption: z.string().min(1),
    })
  ),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type ClassroomInput = z.infer<typeof classroomSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type QuizInput = z.infer<typeof quizSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type SubmitQuizAttemptInput = z.infer<typeof submitQuizAttemptSchema>;
