'use client';

import React from 'react';
import { useQuiz } from '@/context/QuizContext';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
  Loader2,
  X,
} from 'lucide-react';

interface QuizSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAutoSubmit?: boolean;
}

export const QuizSubmitModal: React.FC<QuizSubmitModalProps> = ({
  isOpen,
  onClose,
  isAutoSubmit = false,
}) => {
  const {
    questions,
    answers,
    flags,
    submitQuiz,
    isSubmitting,
  } = useQuiz();

  if (!isOpen) return null;

  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).filter(
    (key) => answers[key] !== undefined && answers[key] !== null && answers[key] !== ''
  ).length;
  const flaggedCount = Object.values(flags).filter(Boolean).length;
  const emptyCount = Math.max(0, totalQuestions - answeredCount);

  const handleConfirmSubmit = async () => {
    await submitQuiz();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 transition-all scale-100"
      >
        {/* Kapat Butonu (Sadece manuel teslimde aktif) */}
        {!isAutoSubmit && !isSubmitting && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Başlık ve İkon */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              isAutoSubmit
                ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'
                : emptyCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {isAutoSubmit ? (
              <Clock className="w-6 h-6 animate-pulse" />
            ) : emptyCount > 0 ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <CheckCircle2 className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {isAutoSubmit ? 'Süre Doldu! Otomatik Teslim' : 'Sınavı Tamamlamak İstiyor Musunuz?'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {isAutoSubmit
                ? 'Sınav süreniz sona erdi, cevaplarınız kaydediliyor.'
                : 'Cevaplarınızı onayladıktan sonra tekrar değişiklik yapamazsınız.'}
            </p>
          </div>
        </div>

        {/* Durum Kartları */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 mb-6">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                Cevaplanan
              </span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {answeredCount}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                Boş
              </span>
              <span className={`text-xl font-bold ${emptyCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                {emptyCount}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200/60 dark:border-slate-700/60">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                Bayraklı
              </span>
              <span className="text-xl font-bold text-amber-500">
                {flaggedCount}
              </span>
            </div>
          </div>

          {emptyCount > 0 && !isAutoSubmit && (
            <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs">
              <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Henüz cevaplamadığınız <strong>{emptyCount} soru</strong> bulunmaktadır. İsterseniz sınava dönüp boş soruları tamamlayabilirsiniz.
              </span>
            </div>
          )}
        </div>

        {/* Butonlar */}
        <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
          {!isAutoSubmit && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="w-full sm:w-1/2 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              Sınava Dön
            </button>
          )}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmSubmit}
            className={`w-full ${isAutoSubmit ? 'sm:w-full' : 'sm:w-1/2'} flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition-all shadow-md shadow-primary-500/20 active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Teslim Ediliyor...</span>
              </>
            ) : (
              <span>{isAutoSubmit ? 'Sonuçları Kaydet ve Bitir' : 'Evet, Sınavı Tamamla'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
