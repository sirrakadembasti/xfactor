'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ExamTimer } from '@/components/student/ExamTimer';
import { ExamQuestionNav } from '@/components/student/ExamQuestionNav';
import { ExamQuestionCard } from '@/components/student/ExamQuestionCard';
import { ExamFinishModal } from '@/components/student/ExamFinishModal';

interface Question {
  id: string;
  text: string;
  imageUrl?: string | null;
  options: {
    id: string;
    text: string;
  }[];
  points: number;
}

interface ExamData {
  id: string;
  title: string;
  durationMinutes: number;
  questions: Question[];
}

interface ExamRunnerPageProps {
  params: Promise<{ quizId: string }>;
}

export default function ExamRunnerPage({ params }: ExamRunnerPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { quizId } = resolvedParams;

  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([]);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchExam() {
      try {
        setLoading(true);
        const res = await fetch(`/api/quizzes/${quizId}`);
        if (!res.ok) {
          throw new Error('Sınav verisi yüklenemedi');
        }
        const data = await res.json();
        setExam(data.quiz || data);
      } catch (error) {
        console.error('Sınav yüklenirken hata:', error);
      } finally {
        setLoading(false);
      }
    }

    if (quizId) {
      fetchExam();
    }
  }, [quizId]);

  const handleSelectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  const handleToggleFlag = (questionId: string) => {
    setFlaggedQuestions((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleTimeExpire = () => {
    handleSubmitExam();
  };

  const handleSubmitExam = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        throw new Error('Sınav gönderilemedi.');
      }

      const result = await response.json();
      router.push(`/student/results/${result.attemptId || quizId}`);
    } catch (error) {
      console.error('Sınav bitirilirken hata:', error);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300 font-medium">Sınav yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!exam || !exam.questions || exam.questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white p-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-red-400 mb-2">Sınav Bulunamadı</h2>
          <p className="text-slate-400 mb-6">Bu sınava ulaşılamıyor veya sınavda soru bulunmuyor.</p>
          <button
            onClick={() => router.push('/student/dashboard')}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Panele Dön
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentIndex];
  const totalQuestions = exam.questions.length;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* Top Header / Status Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide truncate max-w-md">
            {exam.title}
          </h1>
          <p className="text-xs text-slate-400">
            Soru {currentIndex + 1} / {totalQuestions} • {answeredCount} Cevaplandı
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <ExamTimer
            durationMinutes={exam.durationMinutes}
            onExpire={handleTimeExpire}
          />
          <button
            onClick={() => setIsFinishModalOpen(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-semibold text-sm rounded-lg transition-all shadow-md hover:shadow-red-500/20"
          >
            Sınavı Bitir
          </button>
        </div>
      </header>

      {/* Main Focus Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Question Area */}
        <div className="lg:col-span-3 space-y-6">
          <ExamQuestionCard
            questionNumber={currentIndex + 1}
            totalQuestions={totalQuestions}
            question={currentQuestion}
            selectedOptionId={answers[currentQuestion.id] || null}
            isFlagged={flaggedQuestions.includes(currentQuestion.id)}
            onSelectOption={(optId) => handleSelectOption(currentQuestion.id, optId)}
            onToggleFlag={() => handleToggleFlag(currentQuestion.id)}
            onNext={() => currentIndex < totalQuestions - 1 && setCurrentIndex((prev) => prev + 1)}
            onPrev={() => currentIndex > 0 && setCurrentIndex((prev) => prev - 1)}
            hasNext={currentIndex < totalQuestions - 1}
            hasPrev={currentIndex > 0}
          />
        </div>

        {/* Sidebar Question Matrix Navigation */}
        <aside className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 sticky top-20 shadow-xl">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Soru Navigasyonu
          </h3>
          <ExamQuestionNav
            questions={exam.questions}
            currentIndex={currentIndex}
            answers={answers}
            flaggedQuestions={flaggedQuestions}
            onNavigate={(index) => setCurrentIndex(index)}
          />
        </aside>
      </main>

      {/* Finish Confirmation Modal */}
      <ExamFinishModal
        isOpen={isFinishModalOpen}
        onClose={() => setIsFinishModalOpen(false)}
        onConfirm={handleSubmitExam}
        isSubmitting={isSubmitting}
        totalQuestions={totalQuestions}
        answeredCount={answeredCount}
        unansweredCount={totalQuestions - answeredCount}
      />
    </div>
  );
}