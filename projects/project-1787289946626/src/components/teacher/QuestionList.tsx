import React from 'react';
import { HelpCircle, CheckCircle2, Edit3, Trash2, Award, ListFilter } from 'lucide-react';
import { Question, QuestionType } from '@/types';

interface QuestionListProps {
  questions: Question[];
  onEdit?: (question: Question) => void;
  onDelete?: (questionId: string) => void;
  isLoading?: boolean;
}

const typeLabels: Record<QuestionType, { label: string; bg: string; text: string }> = {
  MULTIPLE_CHOICE: {
    label: 'Çoktan Seçmeli',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  TRUE_FALSE: {
    label: 'Doğru / Yanlış',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  OPEN_ENDED: {
    label: 'Açık Uçlu',
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
};

export const QuestionList: React.FC<QuestionListProps> = ({
  questions,
  onEdit,
  onDelete,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm animate-pulse space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded"></div>
              <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            </div>
            <div className="h-4 w-5/6 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
              <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 mx-auto flex items-center justify-center mb-3">
          <HelpCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          Soru Bulunamadı
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
          Kriterlerinize uygun herhangi bir soru mevcut değil veya henüz soru eklenmemiş.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((question, index) => {
        const typeConfig = typeLabels[question.type] || typeLabels.MULTIPLE_CHOICE;

        return (
          <div
            key={question.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-5 shadow-sm transition-all"
          >
            {/* Üst Kısım: Soru Numarası, Türü, Puan ve Eylemler */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                  #{index + 1}
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${typeConfig.bg} ${typeConfig.text}`}
                >
                  {typeConfig.label}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-900/50">
                  <Award className="w-3.5 h-3.5" />
                  <span>{question.points} Puan</span>
                </div>

                {(onEdit || onDelete) && (
                  <div className="flex items-center gap-1 pl-2 border-l border-slate-200 dark:border-slate-700">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(question)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Soruyu Düzenle"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(question.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Soruyu Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Soru Metni */}
            <div className="mt-3.5 text-slate-900 dark:text-slate-100 text-sm font-medium leading-relaxed whitespace-pre-wrap">
              {question.text}
            </div>

            {/* Çoktan Seçmeli & Doğru Yanlış Seçenekleri */}
            {question.options && question.options.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {question.options.map((option, optIdx) => {
                  const optionLetter = String.fromCharCode(65 + optIdx);
                  const isCorrect = Boolean(option.isCorrect);

                  return (
                    <div
                      key={option.id || optIdx}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg text-xs font-normal border transition-colors ${
                        isCorrect
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded font-bold text-[11px] shrink-0 ${
                          isCorrect
                            ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {optionLetter}
                      </span>
                      <span className="flex-1 mt-0.5 leading-snug break-words">
                        {option.text}
                      </span>
                      {isCorrect && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Açık Uçlu Soru Doğru Cevap / Anahtar Bilgisi */}
            {question.type === 'OPEN_ENDED' && question.correctAnswer && (
              <div className="mt-4 p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-lg">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>Beklenen Yanıt / Çözüm Anahtarı:</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {question.correctAnswer}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
