export type Role = "ADMIN" | "TEACHER" | "STUDENT";

export type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN_ENDED";

export type ExamStatus = "UPCOMING" | "ACTIVE" | "COMPLETED" | "EXPIRED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuthSession {
  user: SafeUser;
  token?: string;
}

export interface Course {
  id: string;
  title: string;
  description?: string | null;
  code: string;
  teacherId: string;
  teacher?: SafeUser;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: {
    exams?: number;
    enrollments?: number;
  };
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: string | Date;
  user?: SafeUser;
  course?: Course;
}

export interface QuestionOption {
  id: string;
  questionId?: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  examId: string;
  text: string;
  type: QuestionType;
  points: number;
  options: QuestionOption[];
  correctAnswer?: string | null;
  orderIndex?: number;
}

export interface Exam {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  isPublished: boolean;
  courseId: string;
  course?: Course;
  createdAt: string | Date;
  updatedAt: string | Date;
  questions?: Question[];
  _count?: {
    questions?: number;
    submissions?: number;
  };
}

export interface SubmissionAnswer {
  id?: string;
  submissionId?: string;
  questionId: string;
  selectedOptionId?: string | null;
  textAnswer?: string | null;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
  question?: Question;
  selectedOption?: QuestionOption;
}

export interface Submission {
  id: string;
  examId: string;
  userId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  submittedAt: string | Date;
  user?: SafeUser;
  exam?: Exam;
  answers: SubmissionAnswer[];
}

export interface ExamSessionState {
  examId: string;
  currentQuestionIndex: number;
  answers: Record<string, { selectedOptionId?: string; textAnswer?: string }>;
  timeRemainingSeconds: number;
  isSubmitting: boolean;
  isCompleted: boolean;
}

export interface QuestionPerformance {
  questionId: string;
  questionText: string;
  correctAnswersCount: number;
  totalAnswersCount: number;
  successRate: number;
}

export interface ScoreDistribution {
  range: string;
  count: number;
}

export interface ExamAnalytics {
  examId: string;
  examTitle: string;
  totalSubmissions: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passingRate: number;
  scoreDistribution: ScoreDistribution[];
  questionPerformances: QuestionPerformance[];
}

export interface TeacherDashboardStats {
  totalCourses: number;
  totalExams: number;
  totalStudents: number;
  totalSubmissions: number;
  recentSubmissions: Submission[];
}

export interface StudentDashboardStats {
  enrolledCoursesCount: number;
  completedExamsCount: number;
  upcomingExamsCount: number;
  averageGrade: number;
  recentSubmissions: Submission[];
}

export interface AdminDashboardStats {
  totalUsers: number;
  totalTeachers: number;
  totalStudents: number;
  totalCourses: number;
  totalExams: number;
  totalSubmissions: number;
}

export interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}
