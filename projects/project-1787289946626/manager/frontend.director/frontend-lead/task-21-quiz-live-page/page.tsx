"use client";

import React, { use, useState } from "react";
import { useRouter } from "next/navigation";
import { QuizProvider, useQuiz } from "@/context/QuizContext";
import { QuizTimer } from "@/components/quiz/QuizTimer";
import { QuizQuestionCard } from "@/components/quiz/QuizQuestionCard";
import { QuizNavigationMap } from "@/components/quiz/QuizNavigationMap";
import { QuizSubmitModal } from "@/components/quiz/QuizSubmitModal";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  SendHorizontal,
  Menu,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface QuizPageProps {
  params: Promise<{ id: string }>;
}

function QuizRoomContent() {
  const router = useRouter();
  const {
    quiz,
    currentQuestionIndex,
    questions,
    isLoading,
    error,
    isSubmitting,
  } = useQuiz();

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
        <p className="mt-4 text-sm text-slate-400">Sınav yükleniyor, lütfen bekleyin...</p>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-4 text-white">
        <div className="flex max-w-md flex-col items-center text-center">
          <AlertCircle className="h-12 w-12 text-rose-500" />
          <h2 className="mt-4 text-xl font-bold">Sınav Yüklenemedi</h2>
          <p className="mt-2 text-sm text-slate-400">
            {error || "Sınav oturumu bulunamadı veya süresi dolmuş olabilir."}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/student/quizzes")}
            className="mt-6 border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Sınavlar Listesine Dön
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
      {/* Üst Çubuk - Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 font-bold text-emerald-400 ring-1 ring-emerald-500/20">
            Q
          </div>
          <div className="hidden sm:block">
            <h1 className="line-clamp-1 max-w-xs text-sm font-semibold text-white md:max-w-md lg:max-w-lg">
              {quiz.title}
            </h1>
            <p className="text-xs text-slate-400">
              Soru {currentQuestionIndex + 1} / {questions.length}
            </p>
          </div>
        </div>

        {/* Zamanlayıcı Bileşeni */}
        <div className="flex items-center gap-3">
          <QuizTimer onTimeExpire={() => setIsSubmitModalOpen(true)} />
        </div>

        {/* Sağ Eylemler: Bitir Butonu & Mobil Menü Tetikleyici */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsSubmitModalOpen(true)}
            disabled={isSubmitting}
            size="sm"
            className="bg-emerald-600 font-medium text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-500"
          >
            <SendHorizontal className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Sınavı Bitir</span>
            <span className="sm:hidden">Bitir</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            className="border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Soru Haritası"
          >
            {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Ana Çalışma Alanı */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Sol / Orta Panel: Soru Kartı */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-4xl">
            <QuizQuestionCard onFinishQuiz={() => setIsSubmitModalOpen(true)} />
          </div>
        </div>

        {/* Sağ Panel: Masaüstü Soru Haritası & Navigasyon */}
        <aside className="hidden w-80 shrink-0 border-l border-slate-800/80 bg-slate-900/50 p-6 lg:block">
          <QuizNavigationMap />
        </aside>

        {/* Mobil Soru Haritası Drawer / Overlay */}
        {isMobileNavOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setIsMobileNavOpen(false)}
            />
            <div className="relative ml-auto flex h-full w-full max-w-xs flex-col border-l border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Soru Gezgini</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white"
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <QuizNavigationMap onSelectQuestion={() => setIsMobileNavOpen(false)} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sınavı Tamamlama Onay Modalı */}
      <QuizSubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
      />
    </div>
  );
}

export default function QuizLivePage({ params }: QuizPageProps) {
  const resolvedParams = use(params);

  return (
    <QuizProvider quizId={resolvedParams.id}>
      <QuizRoomContent />
    </QuizProvider>
  );
}
