export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type AttemptStatus = 'IN_PROGRESS' | 'COMPLETED' | 'TIMED_OUT';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroomId?: string | null;
  classroom?: Classroom | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Classroom {
  id: string;
  name: string;
  grade: number;
  description?: string | null;
  students?: UserProfile[];
  quizzes?: Quiz[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Question {
  id: string;
  content: string;
  options: string[];
  correctAnswer: string;
  explanation?: string | null;
  difficulty: Difficulty;
  points: number;
  subjectId: string;
  subject?: Subject;
  createdById?: string | null;
  createdBy?: UserProfile | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  questionId: string;
  order: number;
  question: Question;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string | null;
  status: QuizStatus;
  durationMinutes: number;
  passScore: number;
  subjectId: string;
  subject?: Subject;
  classroomId?: string | null;
  classroom?: Classroom | null;
  createdById?: string | null;
  createdBy?: UserProfile | null;
  quizQuestions?: QuizQuestion[];
  attempts?: QuizAttempt[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UserAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  question?: Question;
  selectedOption: string;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  quiz?: Quiz;
  userId: string;
  user?: UserProfile;
  status: AttemptStatus;
  score: number;
  totalPoints: number;
  startedAt: Date | string;
  completedAt?: Date | string | null;
  answers?: UserAnswer[];
}

export interface QuizResultSummary {
  attemptId: string;
  quizTitle: string;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  correctAnswersCount: number;
  totalQuestionsCount: number;
  durationSeconds: number;
}
