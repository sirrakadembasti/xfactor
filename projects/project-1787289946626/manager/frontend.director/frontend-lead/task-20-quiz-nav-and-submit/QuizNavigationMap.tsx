'use client';

import React from 'react';
import { useQuiz } from '@/context/QuizContext';
import { CheckCircle2, Bookmark, HelpCircle, Send } from 'lucide-react';

interface QuizNavigationMapProps {
  onOpenSubmitModal?: () => void;
  className?: string;
}

export const QuizNavigationMap: React.FC<QuizNavigationMapProps> = ({
  onOpenSubmitModal,
  className = '',
}) => {
  const {
    questions,
    currentIndex,
    setCurrentIndex,
    answers,
    flags,
  } = useQuiz();

  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).filter(
    (key) => answers[key] !== undefined && answers[key] !== null && answers[key] !== ''
  ).length;
  const flaggedCount = Object.values(flags).filter(Boolean).length;
  const emptyCount = Math.max(0, totalQuestions - answeredCount);

  return (
    <div className={`flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
            Soru Listesi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Toplam {totalQuestions} soru
          </p>
        </div>
      </div>

      {/* Durum Özeti */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300">
          <span className="text-lg font-bold">{answeredCount}</span>
          <span className="text-[11px] font-medium">Cevaplanan</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-300">
          <span className="text-lg font-bold">{flaggedCount}</span>
          <span className="text-[11px] font-medium">Bayraklı</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
          <span className="text-lg font-bold">{emptyCount}</span>
          <span className="text-[11px] font-medium">Boş</span>
        </div>
      </div>

      {/* Soru Grid Butonları */}
      <div className="grid grid-cols-5 gap-2.5 max-h-72 overflow-y-auto pr-1 select-none">
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== '';
          const isFlagged = !!flags[q.id];

          let btnStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300';

          if (isCurrent) {
            btnStyle = 'bg-primary-600 text-white border-primary-600 ring-2 ring-primary-500/40 shadow-sm';
          } else if (isFlagged) {
            btnStyle = 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-sm';
          } else if (isAnswered) {
            btnStyle = 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-sm';
          }

          return (
            <button
              key={q.id || idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`relative flex items-center justify-center h-10 w-full rounded-xl text-sm font-semibold border transition-all duration-150 active:scale-95 ${btnStyle}`}
              aria-label={`Soru ${idx + 1}`}
            >
              {idx + 1}
              {isFlagged && !isCurrent && (
                <Bookmark className="w-3 h-3 absolute top-1 right-1 fill-white text-white opacity-90" />
              )}
            </button>
          );
        })}
      </div>

      {/* Gösterge Açıklamaları */}
      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-primary-600 inline-block" />
          <span>Aktif</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-emerald-600 inline-block" />
          <span>Cevaplandı</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-amber-500 inline-block" />
          <span>Gözden Geçir</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700 inline-block" />
          <span>Boş</span>
        </div>
      </div>

      {/* Sınavı Tamamla Aksiyon Butonu */}
      {onOpenSubmitModal && (
        <button
          type="button"
          onClick={onOpenSubmitModal}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-primary-600 dark:hover:bg-primary-700 font-medium text-sm transition-colors shadow-sm active:scale-[0.98]"
        >
          <Send className="w-4 h-4" />
          <span>Sınavı Bitir ve Gönder</span>
        </button>
      )}
    </div>
  );
};
