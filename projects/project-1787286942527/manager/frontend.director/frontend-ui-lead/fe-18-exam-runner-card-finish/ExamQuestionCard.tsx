import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export interface OptionItem {
  id: string;
  text: string;
  order: number;
}

export interface QuestionItem {
  id: string;
  prompt: string;
  questionType?: string;
  order: number;
  points: number;
  options: OptionItem[];
}

interface ExamQuestionCardProps {
  question: QuestionItem;
  currentIndex: number;
  totalQuestions: number;
  selectedOptionId?: string;
  textAnswer?: string;
  onSelectOption: (questionId: string, optionId: string) => void;
  onTextAnswerChange?: (questionId: string, text: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinishRequest: () => void;
  isSubmitting?: boolean;
}

export const ExamQuestionCard: React.FC<ExamQuestionCardProps> = ({
  question,
  currentIndex,
  totalQuestions,
  selectedOptionId,
  textAnswer,
  onSelectOption,
  onTextAnswerChange,
  onPrev,
  onNext,
  onFinishRequest,
  isSubmitting = false,
}) => {
  const isFirstQuestion = currentIndex === 0;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const isTextQuestion = question.questionType === 'OPEN_ENDED' || (!question.options || question.options.length === 0);

  const getOptionLetter = (index: number) => {
    return String.fromCharCode(65 + index); // A, B, C, D, ...
  };

  return (
    <Card className="w-full shadow-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
              Soru {currentIndex + 1} / {totalQuestions}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {question.points} Puan
            </span>
          </div>
          {selectedOptionId || textAnswer ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cevaplandı
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Boş
            </span>
          )}
        </div>
        <CardTitle className="mt-4 text-lg md:text-xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line">
          {question.prompt}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-6 pb-6">
        {isTextQuestion ? (
          <div className="space-y-2">
            <label htmlFor="openEndedAnswer" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Cevabınız:
            </label>
            <textarea
              id="openEndedAnswer"
              value={textAnswer || ''}
              onChange={(e) => onTextAnswerChange?.(question.id, e.target.value)}
              placeholder="Cevabınızı buraya yazınız..."
              rows={5}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 transition"
              disabled={isSubmitting}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {question.options.map((option, idx) => {
              const isSelected = selectedOptionId === option.id;
              const letter = getOptionLetter(idx);

              return (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => onSelectOption(question.id, option.id)}
                  disabled={isSubmitting}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 group ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 text-blue-950 dark:text-blue-100 shadow-sm ring-1 ring-blue-500/30'
                      : 'border-slate-200 dark:border-slate-750 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span
                    className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg text-sm font-bold transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 group-hover:border-slate-300 dark:group-hover:border-slate-500'
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="pt-1 text-sm md:text-base font-normal leading-normal select-none flex-1">
                    {option.text}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t border-slate-100 dark:border-slate-800/80 pt-4 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onPrev}
          disabled={isFirstQuestion || isSubmitting}
          className="gap-1.5 min-w-[100px]"
        >
          <svg
            className="w-4 h-4 rtl:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Önceki
        </Button>

        <div className="flex items-center gap-2">
          {isLastQuestion ? (
            <Button
              type="button"
              variant="primary"
              onClick={onFinishRequest}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 shadow-sm shadow-emerald-500/20 gap-1.5 min-w-[120px]"
            >
              Sınavı Bitir
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={onNext}
              disabled={isSubmitting}
              className="gap-1.5 min-w-[100px]"
            >
              Sonraki
              <svg
                className="w-4 h-4 rtl:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};
