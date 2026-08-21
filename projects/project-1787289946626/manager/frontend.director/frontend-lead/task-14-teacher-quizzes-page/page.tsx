"use client";

import React, { useState } from "react";
import { Plus, HelpCircle, CheckCircle2, Clock, BarChart3, Sparkles } from "lucide-react";
import { QuizBuilderWizard } from "@/components/quiz/QuizBuilderWizard";
import { QuizListTable } from "@/components/quiz/QuizListTable";

export default function TeacherQuizzesPage() {
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);

  const handleQuizSaved = () => {
    setIsWizardOpen(false);
    setSelectedQuizId(null);
    setRefreshKey((prev) => prev + 1);
  };

  const handleEditQuiz = (quizId: string) => {
    setSelectedQuizId(quizId);
    setIsWizardOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Üst Başlık & Eylemler */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                Quiz ve Değerlendirme Yönetimi
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Öğretmen Paneli
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Öğrencileriniz için yapay zeka destekli veya manuel sınavlar oluşturun, yayınlayın ve performansları analiz edin.
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedQuizId(null);
              setIsWizardOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shadow-indigo-200"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Yeni Quiz Oluştur
          </button>
        </div>

        {/* İstatistik / Özet Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Toplam Quiz</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">24</h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Aktif Yayınlanan</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">18</h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Taslaklar</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">6</h3>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ortalama Başarı</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">%76.4</h3>
            </div>
          </div>
        </div>

        {/* Quiz Sihirbazı Modalı veya Katmanı */}
        {isWizardOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in duration-200">
            <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    {selectedQuizId ? "Quiz Düzenle" : "Quiz Oluşturma Sihirbazı"}
                  </h2>
                </div>
                <button
                  onClick={() => setIsWizardOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <span className="sr-only">Kapat</span>
                  ✕
                </button>
              </div>
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <QuizBuilderWizard
                  quizId={selectedQuizId || undefined}
                  onComplete={handleQuizSaved}
                  onCancel={() => setIsWizardOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Quiz Tablo Bileşeni */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tüm Quizler</h2>
              <p className="text-xs text-slate-500">Mevcut quizlerin durumunu kontrol edin, düzenleyin veya sonuçları görüntüleyin.</p>
            </div>
          </div>
          <QuizListTable
            key={refreshKey}
            onEditQuiz={handleEditQuiz}
            onRefresh={() => setRefreshKey((prev) => prev + 1)}
          />
        </div>
      </div>
    </div>
  );
}
