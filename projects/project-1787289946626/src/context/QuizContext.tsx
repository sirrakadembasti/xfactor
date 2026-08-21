"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Exam, Question } from "@/types";
import { useAuth } from "./AuthContext";

export interface QuizAnswer {
  questionId: string;
  selectedOptionId?: string | null;
  textAnswer?: string | null;
}

interface QuizContextType {
  exam: Exam | null;
  questions: Question[];
  currentIndex: number;
  currentQuestion: Question | null;
  answers: Record<string, QuizAnswer>;
  flaggedQuestions: string[];
  timeLeft: number;
  formattedTime: string;
  isTimerRunning: boolean;
  isSubmitting: boolean;
  isCompleted: boolean;
  startExam: (examData: Exam) => void;
  setAnswer: (questionId: string, answer: { selectedOptionId?: string | null; textAnswer?: string | null }) => void;
  toggleFlag: (questionId: string) => void;
  isQuestionFlagged: (questionId: string) => boolean;
  isQuestionAnswered: (questionId: string) => boolean;
  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  submitExam: () => Promise<boolean>;
  resetQuiz: () => void;
}

const QuizContext = createContext<QuizContextType | undefined>(undefined);

export const QuizProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const questions = useMemo(() => exam?.questions || [], [exam]);
  const currentQuestion = useMemo(() => questions[currentIndex] || null, [questions, currentIndex]);

  // Geri sayım formatlayıcı (SS:DD veya DD:SS)
  const formattedTime = useMemo(() => {
    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;

    const pad = (n: number) => n.toString().padStart(2, "0");

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [timeLeft]);

  const resetQuiz = useCallback(() => {
    setExam(null);
    setCurrentIndex(0);
    setAnswers({});
    setFlaggedQuestions([]);
    setTimeLeft(0);
    setIsTimerRunning(false);
    setIsSubmitting(false);
    setIsCompleted(false);
  }, []);

  const startExam = useCallback((examData: Exam) => {
    setExam(examData);
    setCurrentIndex(0);
    setAnswers({});
    setFlaggedQuestions([]);
    setIsCompleted(false);
    setIsSubmitting(false);

    const initialSeconds = (examData.durationMinutes || 60) * 60;
    setTimeLeft(initialSeconds);
    setIsTimerRunning(true);
    toast.info(`"${examData.title}" sınavı başladı. Başarılar dileriz!`);
  }, []);

  const setAnswer = useCallback((questionId: string, answer: { selectedOptionId?: string | null; textAnswer?: string | null }) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        questionId,
        selectedOptionId: answer.selectedOptionId !== undefined ? answer.selectedOptionId : prev[questionId]?.selectedOptionId,
        textAnswer: answer.textAnswer !== undefined ? answer.textAnswer : prev[questionId]?.textAnswer,
      },
    }));
  }, []);

  const toggleFlag = useCallback((questionId: string) => {
    setFlaggedQuestions((prev) => {
      if (prev.includes(questionId)) {
        return prev.filter((id) => id !== questionId);
      } else {
        return [...prev, questionId];
      }
    });
  }, []);

  const isQuestionFlagged = useCallback(
    (questionId: string) => flaggedQuestions.includes(questionId),
    [flaggedQuestions]
  );

  const isQuestionAnswered = useCallback(
    (questionId: string) => {
      const ans = answers[questionId];
      if (!ans) return false;
      if (ans.selectedOptionId) return true;
      if (ans.textAnswer && ans.textAnswer.trim().length > 0) return true;
      return false;
    },
    [answers]
  );

  const goToQuestion = useCallback(
    (index: number) => {
      if (index >= 0 && index < questions.length) {
        setCurrentIndex(index);
      }
    },
    [questions.length]
  );

  const nextQuestion = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, questions.length]);

  const prevQuestion = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const submitExam = useCallback(async (): Promise<boolean> => {
    if (!exam || isSubmitting || isCompleted) return false;

    setIsSubmitting(true);
    setIsTimerRunning(false);

    try {
      const submissionPayload = {
        examId: exam.id,
        userId: user?.id || "guest-user",
        answers: Object.values(answers),
      };

      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionPayload),
      });

      if (!response.ok) {
        throw new Error("Sınav teslim edilirken sunucu hatası oluştu.");
      }

      setIsCompleted(true);
      toast.success("Sınavınız başarıyla tamamlandı ve teslim edildi!");
      return true;
    } catch (error) {
      console.error("Sınav teslim hatası:", error);
      toast.error("Sınav gönderilirken bir hata oluştu. Lütfen tekrar deneyin.");
      setIsTimerRunning(true); // Gönderim başarısızsa sayacı tekrar başlat
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [exam, isSubmitting, isCompleted, user?.id, answers]);

  // Sayaç ve Otomatik Gönderim Mekanizması
  useEffect(() => {
    if (!isTimerRunning || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          toast.warning("Süreniz doldu! Sınavınız otomatik olarak teslim ediliyor.");
          submitExam();
          return 0;
        }
        if (prev === 300) {
          toast.warning("Dikkat! Sınavın bitmesine son 5 dakika kaldı.");
        }
        if (prev === 60) {
          toast.error("Dikkat! Son 1 dakikanız kaldı.");
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimerRunning, timeLeft, submitExam]);

  return (
    <QuizContext.Provider
      value={{
        exam,
        questions,
        currentIndex,
        currentQuestion,
        answers,
        flaggedQuestions,
        timeLeft,
        formattedTime,
        isTimerRunning,
        isSubmitting,
        isCompleted,
        startExam,
        setAnswer,
        toggleFlag,
        isQuestionFlagged,
        isQuestionAnswered,
        goToQuestion,
        nextQuestion,
        prevQuestion,
        submitExam,
        resetQuiz,
      }}
    >
      {children}
    </QuizContext.Provider>
  );
};

export const useQuiz = (): QuizContextType => {
  const context = useContext(QuizContext);
  if (!context) {
    throw new Error("useQuiz QuizProvider kapsayıcısı içinde kullanılmalıdır.");
  }
  return context;
};
