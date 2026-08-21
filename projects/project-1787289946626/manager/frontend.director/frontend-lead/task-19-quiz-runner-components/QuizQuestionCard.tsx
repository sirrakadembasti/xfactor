'use client';

import React from 'react';
import { Flag, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';

export interface QuizOption {
  id: string;
  label: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  questionNumber: number;
  totalQuestions: number;
  text: string;
  codeSnippet?: string;
  imageUrl?: string;
  options: QuizOption[];
  points?: number;
}

interface QuizQuestionCardProps {
  question: QuizQuestion;
  selectedOptionId?: string | null;
  isFlagged?: boolean;
  onSelectOption: (optionId: string) => void;
  onClearSelection: () => void;
  onToggleFlag: () => void;
  className?: string;
}

export const QuizQuestionCard: React.FC<QuizQuestionCardProps> = ({
  question,
  selectedOptionId,
  isFlagged = false,
  onSelectOption,
  onClearSelection,
  onToggleFlag,
  className = '',
}) => {
  const handleClear = () => {
    if (!selectedOptionId) return;
    onClearSelection();
    toast.info('Cevap seçimi temizlendi.');
  };

  const handleFlagToggle = () => {
    onToggleFlag();
    if (!isFlagged) {
      toast.warning('Soru daha sonra incelenmek üzere bayraklandı.');
    } else {
      toast.info('Soru bayrağı kaldırıldı.');
    }
  };

  return (
    <div
      className={`w-full max-w-4xl mx-auto bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 sm:p-8 flex flex-col gap-6 transition-all ${className}`}
    >
      {/* Üst Başlık & Kontroller */}
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
            Soru {question.questionNumber} / {question.totalQuestions}
          </span>
          {question.points !== undefined && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              {question.points} Puan
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFlagToggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors ${
              isFlagged
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700'
                : 'bg-transparent text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
            }`}
            title={isFlagged ? 'Bayrağı kaldır' : 'Daha sonra incelemek için bayrak ekle'}
          >
            <Flag
              className={`w-4 h-4 ${
                isFlagged
                  ? 'fill-amber-500 text-amber-600 dark:text-amber-400'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            />
            <span className="hidden sm:inline">
              {isFlagged ? 'İşaretli' : 'İşaretle'}
            </span>
          </button>

          {selectedOptionId && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900 transition-colors"
              title="Cevabı temizle"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Temizle</span>
            </button>
          )}
        </div>
      </div>

      {/* Soru Gövdesi */}
      <div className="space-y-4">
        <h2 className="text-lg sm:text-xl font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed">
          {question.text}
        </h2>

        {question.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 max-h-80 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.imageUrl}
              alt={`Soru ${question.questionNumber} görseli`}
              className="max-h-80 w-auto object-contain"
            />
          </div>
        )}

        {question.codeSnippet && (
          <div className="rounded-xl bg-zinc-950 text-zinc-100 p-4 font-mono text-sm overflow-x-auto border border-zinc-800 shadow-inner">
            <pre>
              <code>{question.codeSnippet}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Şıklar */}
      <div className="grid grid-cols-1 gap-3 pt-2">
        {question.options.map((option) => {
          const isSelected = selectedOptionId === option.id;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelectOption(option.id)}
              className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-all duration-150 group ${
                isSelected
                  ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-600 dark:border-blue-500 shadow-sm ring-1 ring-blue-500/20'
                  : 'bg-zinc-50/50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-600'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {isSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Circle className="w-5 h-5 text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-600 dark:group-hover:text-zinc-400" />
                )}
              </div>

              <div className="flex items-baseline gap-3 flex-1">
                <span
                  className={`font-semibold text-sm sm:text-base shrink-0 ${
                    isSelected
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {option.label})
                </span>
                <span
                  className={`text-sm sm:text-base leading-snug ${
                    isSelected
                      ? 'font-medium text-blue-950 dark:text-blue-100'
                      : 'text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {option.text}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
