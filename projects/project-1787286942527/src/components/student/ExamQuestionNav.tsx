"use client";

import React from "react";
import { CheckCircle, Circle, Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export interface QuestionNavItem {
  id: string;
  order: number;
}

interface ExamQuestionNavProps {
  questions: QuestionNavItem[];
  currentIndex: number;
  answeredQuestionIds: string[] | Set<string>;
  flaggedQuestionIds?: string[] | Set<string>;
  onSelectQuestion: (index: number) => void;
}

export function ExamQuestionNav({
  questions,
  currentIndex,
  answeredQuestionIds,
  flaggedQuestionIds = new Set(),
  onSelectQuestion,
}: ExamQuestionNavProps) {
  const answeredSet = React.useMemo(() => {
    return answeredQuestionIds instanceof Set
      ? answeredQuestionIds
      : new Set(answeredQuestionIds);
  }, [answeredQuestionIds]);

  const flaggedSet = React.useMemo(() => {
    return flaggedQuestionIds instanceof Set
      ? flaggedQuestionIds
      : new Set(flaggedQuestionIds);
  }, [flaggedQuestionIds]);

  const totalCount = questions.length;
  const answeredCount = questions.filter((q) => answeredSet.has(q.id)).length;
  const unansweredCount = totalCount - answeredCount;

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
      {/* Başlık ve Özet Sayaçları */}
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="font-semibold text-sm text-foreground">Soru Gezgini</h3>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="flex items-center gap-1 text-xs">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            {answeredCount} Dolu
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Circle className="w-3 h-3 text-muted-foreground" />
            {unansweredCount} Boş
          </Badge>
        </div>
      </div>

      {/* Soru Buton Matrisi */}
      <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-y-auto pr-1">
        {questions.map((question, index) => {
          const isCurrent = index === currentIndex;
          const isAnswered = answeredSet.has(question.id);
          const isFlagged = flaggedSet.has(question.id);

          let buttonStyles = "bg-secondary/40 text-secondary-foreground border-transparent hover:bg-secondary/70";

          if (isCurrent) {
            buttonStyles = "bg-primary text-primary-foreground font-bold shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background";
          } else if (isAnswered) {
            buttonStyles = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 font-medium";
          }

          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelectQuestion(index)}
              className={`relative h-10 w-full rounded-lg border text-xs sm:text-sm font-medium flex items-center justify-center transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary ${buttonStyles}`}
              aria-label={`Soru ${index + 1}`}
            >
              <span>{index + 1}</span>

              {/* İşaretli / Flagged Bayrağı */}
              {isFlagged && (
                <span className="absolute -top-1 -right-1 text-amber-500 bg-background rounded-full p-0.5 shadow">
                  <Bookmark className="w-2.5 h-2.5 fill-amber-500" />
                </span>
              )}

              {/* Cevaplandı Simgesi (aktif değilse) */}
              {isAnswered && !isCurrent && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Renk Açıklama / Legend */}
      <div className="pt-2 border-t text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-primary" />
          <span>Aktif</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/30" />
          <span>Cevaplanmış</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-secondary/40 border" />
          <span>Boş</span>
        </div>
      </div>
    </div>
  );
}
