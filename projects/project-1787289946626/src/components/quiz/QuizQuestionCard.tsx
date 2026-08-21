import React from 'react';

interface QuestionOption {
  id: string;
  text: string;
  label: string;
}

interface QuizQuestionCardProps {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  points?: number;
  options: QuestionOption[];
  selectedOptionId?: string;
  onSelectOption: (optionId: string) => void;
}

export const QuizQuestionCard: React.FC<QuizQuestionCardProps> = ({
  questionNumber,
  totalQuestions,
  questionText,
  points = 10,
  options,
  selectedOptionId,
  onSelectOption,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
            {questionNumber}
          </span>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            / {totalQuestions} Soru
          </span>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
          {points} Puan
        </span>
      </div>

      <div className="my-6">
        <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
          {questionText}
        </h3>
      </div>

      <div className="space-y-3">
        {options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelectOption(option.id)}
              className={`w-full flex items-center justify-start rounded-xl border p-4 text-left transition-all duration-200 ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-100 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800/80 dark:text-slate-200'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold mr-3.5 transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {option.label}
              </span>
              <span className="text-sm md:text-base font-normal">
                {option.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
