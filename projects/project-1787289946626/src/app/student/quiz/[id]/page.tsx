'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QuizTimer } from '@/components/quiz/QuizTimer';
import { QuizQuestionCard } from '@/components/quiz/QuizQuestionCard';
import { QuizNavigationMap } from '@/components/quiz/QuizNavigationMap';
import { QuizSubmitModal } from '@/components/quiz/QuizSubmitModal';

interface Question {
  id: string;
  text: string;
  points: number;
  options: {
    id: string;
    text: string;
    label: string;
  }[];
}

interface ExamData {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  questions: Question[];
}

export default function StudentQuizPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params?.id as string;

  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!examId) return;
    const fetchExam = async () => {
      try {
        const res = await fetch(`/api/exams/${examId}`);
        if (res.ok) {
          const data = await res.json();
          setExam(data);
        } else {
          // Fallback demo exam
          setExam({
            id: examId,
            title: 'Genel Değerlendirme Sınavı',
            durationMinutes: 45,
            questions: [
              {
                id: 'q1',
                text: 'Aşağıdakilerden hangisi bir JavaScript veri tipi değildir?',
                points: 10,
                options: [
                  { id: 'opt1', label: 'A', text: 'String' },
                  { id: 'opt2', label: 'B', text: 'Boolean' },
                  { id: 'opt3', label: 'C', text: 'Float' },
                  { id: 'opt4', label: 'D', text: 'Undefined' },
                ],
              },
              {
                id: 'q2',
                text: 'React Hook yapılarında yan etkileri yönetmek için hangi fonksiyon kullanılır?',
                points: 10,
                options: [
                  { id: 'opt5', label: 'A', text: 'useState' },
                  { id: 'opt6', label: 'B', text: 'useEffect' },
                  { id: 'opt7', label: 'C', text: 'useContext' },
                  { id: 'opt8', label: 'D', text: 'useReducer' },
                ],
              },
            ],
          });
        }
      } catch (err) {
        console.error('Sınav yüklenemedi:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchExam();
  }, [examId]);

  const handleSelectOption = (optionId: string) => {
    if (!exam) return;
    const currentQuestion = exam.questions[currentIndex];
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: optionId,
    }));
  };

  const handleTimeUp = () => {
    handleSubmitFinal();
  };

  const handleSubmitFinal = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId,
          answers,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        router.push(`/student/results/${data.submissionId || examId}`);
      } else {
        router.push('/student');
      }
    } catch (err) {
      console.error('Gönderim hatası:', err);
      router.push('/student');
    } finally {
      setSubmitting(false);
      setIsSubmitModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!exam || !exam.questions || exam.questions.length === 0) {
    return (
      <div className="mx-auto max-w-lg text-center py-20">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Sınav Bulunamadı</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Bu sınava ait soru bulunmamaktadır veya sınav kaldırılmıştır.</p>
        <button
          onClick={() => router.push('/student')}
          className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          Öğrenci Paneline Dön
        </button>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentIndex];
  const totalQuestions = exam.questions.length;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {/* Üst Başlık ve Timer */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{exam.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cevaplanan: {answeredCount} / {totalQuestions} Soru
          </p>
        </div>
        <div className="flex items-center gap-4">
          <QuizTimer initialMinutes={exam.durationMinutes || 30} onTimeUp={handleTimeUp} />
          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 transition-colors"
          >
            Sınavı Bitir
          </button>
        </div>
      </div>

      {/* Soru İçeriği ve Navigasyon Haritası */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <QuizQuestionCard
            questionNumber={currentIndex + 1}
            totalQuestions={totalQuestions}
            questionText={currentQuestion.text}
            points={currentQuestion.points}
            options={currentQuestion.options}
            selectedOptionId={answers[currentQuestion.id]}
            onSelectOption={handleSelectOption}
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              ← Önceki Soru
            </button>
            {currentIndex < totalQuestions - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Sonraki Soru →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Testi Tamamla
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <QuizNavigationMap
            totalQuestions={totalQuestions}
            currentIndex={currentIndex}
            answeredQuestions={exam.questions.map((q) => !!answers[q.id])}
            onSelectIndex={(index) => setCurrentIndex(index)}
          />
        </div>
      </div>

      {/* Sınav Bitirme Modalı */}
      <QuizSubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirm={handleSubmitFinal}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
        isSubmitting={submitting}
      />
    </div>
  );
}
