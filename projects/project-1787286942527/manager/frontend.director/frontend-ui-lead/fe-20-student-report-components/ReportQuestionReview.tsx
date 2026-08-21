import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  CheckCircle,
  XCircle,
  HelpCircle,
  Info,
  Filter,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface OptionItem {
  id: string;
  text: string;
  isCorrect?: boolean;
  order?: number;
}

export interface QuestionReviewItem {
  id: string;
  order: number;
  prompt: string;
  points: number;
  questionType?: string;
  explanation?: string | null;
  options?: OptionItem[];
  userAnswer?: {
    selectedOptionId?: string | null;
    textAnswer?: string | null;
    isCorrect: boolean;
    scoreEarned: number;
  } | null;
}

export interface ReportQuestionReviewProps {
  questions: QuestionReviewItem[];
}

type FilterType = 'ALL' | 'CORRECT' | 'INCORRECT' | 'BLANK';

export const ReportQuestionReview: React.FC<ReportQuestionReviewProps> = ({
  questions = [],
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  const toggleExplanation = (questionId: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const filteredQuestions = questions.filter((q) => {
    const isBlank = !q.userAnswer?.selectedOptionId && !q.userAnswer?.textAnswer;
    const isCorrect = Boolean(q.userAnswer?.isCorrect);

    if (activeFilter === 'CORRECT') return isCorrect;
    if (activeFilter === 'INCORRECT') return !isCorrect && !isBlank;
    if (activeFilter === 'BLANK') return isBlank;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Filtreleme ve Başlık Barı */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Soru Detayları ve Çözüm İncelemesi
          </h3>
        </div>

        {/* Filtre Butonları */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-1">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'ALL'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Tümü ({questions.length})
          </button>
          <button
            onClick={() => setActiveFilter('CORRECT')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'CORRECT'
                ? 'bg-emerald-500/10 text-emerald-600 font-semibold dark:text-emerald-400'
                : 'text-muted-foreground hover:text-emerald-600'
            }`}
          >
            Doğrular
          </button>
          <button
            onClick={() => setActiveFilter('INCORRECT')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'INCORRECT'
                ? 'bg-rose-500/10 text-rose-600 font-semibold dark:text-rose-400'
                : 'text-muted-foreground hover:text-rose-600'
            }`}
          >
            Yanlışlar
          </button>
          <button
            onClick={() => setActiveFilter('BLANK')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === 'BLANK'
                ? 'bg-amber-500/10 text-amber-600 font-semibold dark:text-amber-400'
                : 'text-muted-foreground hover:text-amber-600'
            }`}
          >
            Boşlar
          </button>
        </div>
      </div>

      {/* Soru Listesi */}
      {filteredQuestions.length === 0 ? (
        <Card className="border-dashed border-border/80 p-8 text-center">
          <Filter className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">
            Seçili filtre kriterine uygun soru bulunamadı.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((question, index) => {
            const userAnswer = question.userAnswer;
            const isBlank = !userAnswer?.selectedOptionId && !userAnswer?.textAnswer;
            const isCorrect = Boolean(userAnswer?.isCorrect);
            const isExpanded = Boolean(expandedExplanations[question.id]);

            return (
              <Card
                key={question.id}
                className={`border transition-all ${
                  isCorrect
                    ? 'border-emerald-500/30 bg-card hover:border-emerald-500/50'
                    : isBlank
                    ? 'border-amber-500/30 bg-card hover:border-amber-500/50'
                    : 'border-rose-500/30 bg-card hover:border-rose-500/50'
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                        {question.order || index + 1}
                      </span>
                      <CardTitle className="text-base font-semibold leading-snug">
                        Soru {question.order || index + 1}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">({question.points} Puan)</span>
                    </div>

                    {/* Durum Rozeti */}
                    <div className="flex items-center gap-2">
                      {isCorrect ? (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Doğru (+{userAnswer?.scoreEarned ?? question.points} P)
                        </Badge>
                      ) : isBlank ? (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <HelpCircle className="h-3.5 w-3.5" />
                          Boş Bırakıldı (0 P)
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5" />
                          Yanlış (0 P)
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Soru Metni */}
                  <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap font-medium">
                    {question.prompt}
                  </div>

                  {/* Çoktan Seçmeli Şıklar Listesi */}
                  {question.options && question.options.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {question.options.map((option, optIdx) => {
                        const isStudentChoice = userAnswer?.selectedOptionId === option.id;
                        const isCorrectOption = Boolean(option.isCorrect);
                        const optionLetter = String.fromCharCode(65 + optIdx);

                        let optionStyle = 'border-border/60 bg-muted/20 text-muted-foreground';

                        if (isCorrectOption) {
                          optionStyle =
                            'border-emerald-500/50 bg-emerald-50/40 text-emerald-950 font-medium dark:bg-emerald-950/20 dark:text-emerald-200';
                        } else if (isStudentChoice && !isCorrectOption) {
                          optionStyle =
                            'border-rose-500/50 bg-rose-50/40 text-rose-950 font-medium dark:bg-rose-950/20 dark:text-rose-200';
                        }

                        return (
                          <div
                            key={option.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${optionStyle}`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                                isCorrectOption
                                  ? 'bg-emerald-500 text-white'
                                  : isStudentChoice
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {optionLetter}
                            </span>

                            <div className="flex-1 pt-0.5 leading-tight">
                              {option.text}
                            </div>

                            {/* Rozet Bilgisi */}
                            <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs font-semibold">
                              {isStudentChoice && (
                                <span
                                  className={`rounded px-2 py-0.5 text-[11px] ${
                                    isCorrectOption
                                      ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                                      : 'bg-rose-200 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                                  }`}
                                >
                                  Senin Cevabın
                                </span>
                              )}
                              {isCorrectOption && !isStudentChoice && (
                                <span className="rounded bg-emerald-200 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                                  Doğru Cevap
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Klasik / Açık Uçlu Soru Metin Cevap Gösterimi */}
                  {question.options?.length === 0 && userAnswer?.textAnswer && (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                      <div className="mb-1 text-xs font-semibold text-muted-foreground">
                        Senin Yazılı Cevabın:
                      </div>
                      <div className="text-foreground">{userAnswer.textAnswer}</div>
                    </div>
                  )}

                  {/* Çözüm ve Açıklama Alanı */}
                  {question.explanation && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => toggleExplanation(question.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                      >
                        <Info className="h-3.5 w-3.5" />
                        {isExpanded ? 'Çözüm Açıklamasını Gizle' : 'Çözüm Açıklamasını Göster'}
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-sm text-foreground/90">
                          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-primary">
                            Çözüm ve Açıklama:
                          </div>
                          <p className="leading-relaxed whitespace-pre-wrap">
                            {question.explanation}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
