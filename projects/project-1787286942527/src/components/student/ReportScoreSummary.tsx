import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Award,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';

export interface ReportScoreSummaryProps {
  score: number;
  maxScore?: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  startedAt: string | Date;
  completedAt?: string | Date | null;
  classAverage?: number;
  quizTitle?: string;
}

export const ReportScoreSummary: React.FC<ReportScoreSummaryProps> = ({
  score,
  maxScore = 100,
  correctCount,
  incorrectCount,
  blankCount,
  startedAt,
  completedAt,
  classAverage,
  quizTitle,
}) => {
  const totalQuestions = correctCount + incorrectCount + blankCount;
  const netCount = Math.max(0, correctCount - incorrectCount * 0.25);
  const formattedNet = Number.isInteger(netCount) ? netCount : netCount.toFixed(2);

  const successRate = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  const getDurationString = () => {
    if (!completedAt) return '-';
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const diffMinutes = Math.max(0, Math.floor((end - start) / 60000));
    const diffSeconds = Math.max(0, Math.floor(((end - start) % 60000) / 1000));

    if (diffMinutes === 0) {
      return `${diffSeconds} sn`;
    }
    return `${diffMinutes} dk ${diffSeconds} sn`;
  };

  const getScoreBadgeVariant = () => {
    if (successRate >= 85) return 'success';
    if (successRate >= 50) return 'warning';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Ana Başarı Banner Kartı */}
      <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-muted/20 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Award className="h-6 w-6 text-primary" />
                <CardTitle className="text-xl font-bold tracking-tight">
                  {quizTitle ? `${quizTitle} - Sınav Sonucu` : 'Sınav Karnesi Özeti'}
                </CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Sınav tamamlama ve performans metrikleriniz aşağıda detaylandırılmıştır.
              </p>
            </div>
            <Badge variant={getScoreBadgeVariant()} className="px-3 py-1 text-sm font-semibold">
              %{successRate} Başarı Oranı
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {/* Toplam Puan */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-background/50 p-4 text-center shadow-xs transition-all hover:bg-background">
              <div className="mb-2 rounded-full bg-primary/10 p-2 text-primary">
                <Zap className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Toplam Puan</span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {score}
                <span className="text-xs font-normal text-muted-foreground"> / {maxScore}</span>
              </span>
            </div>

            {/* Doğru */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-50/30 p-4 text-center shadow-xs transition-all hover:bg-emerald-50/50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20">
              <div className="mb-2 rounded-full bg-emerald-500/15 p-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Doğru</span>
              <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                {correctCount}
              </span>
            </div>

            {/* Yanlış */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-50/30 p-4 text-center shadow-xs transition-all hover:bg-rose-50/50 dark:bg-rose-950/10 dark:hover:bg-rose-950/20">
              <div className="mb-2 rounded-full bg-rose-500/15 p-2 text-rose-600 dark:text-rose-400">
                <XCircle className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Yanlış</span>
              <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                {incorrectCount}
              </span>
            </div>

            {/* Boş */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-50/30 p-4 text-center shadow-xs transition-all hover:bg-amber-50/50 dark:bg-amber-950/10 dark:hover:bg-amber-950/20">
              <div className="mb-2 rounded-full bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
                <MinusCircle className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Boş</span>
              <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                {blankCount}
              </span>
            </div>

            {/* Net */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-background/50 p-4 text-center shadow-xs transition-all hover:bg-background">
              <div className="mb-2 rounded-full bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                <Target className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Net Sayısı</span>
              <span className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                {formattedNet}
              </span>
            </div>

            {/* Harcanan Süre */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-background/50 p-4 text-center shadow-xs transition-all hover:bg-background">
              <div className="mb-2 rounded-full bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400">
                <Clock className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Geçen Süre</span>
              <span className="text-xl font-bold tracking-tight text-foreground">
                {getDurationString()}
              </span>
            </div>
          </div>

          {/* İlerleme Çubuğu ve Ekstra İstatistikler */}
          <div className="mt-6 space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Doğruluk Dağılımı ({totalQuestions} Soru)</span>
              <span>%{successRate} Tamamlandı</span>
            </div>

            {/* Görsel Dağılım Barı */}
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted/60 p-0.5">
              {totalQuestions > 0 && (
                <>
                  <div
                    title={`Doğru: ${correctCount}`}
                    className="h-full rounded-l-full bg-emerald-500 transition-all"
                    style={{ width: `${(correctCount / totalQuestions) * 100}%` }}
                  />
                  <div
                    title={`Yanlış: ${incorrectCount}`}
                    className="h-full bg-rose-500 transition-all"
                    style={{ width: `${(incorrectCount / totalQuestions) * 100}%` }}
                  />
                  <div
                    title={`Boş: ${blankCount}`}
                    className="h-full rounded-r-full bg-amber-400 transition-all"
                    style={{ width: `${(blankCount / totalQuestions) * 100}%` }}
                  />
                </>
              )}
            </div>

            {classAverage !== undefined && (
              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>
                  Sınıf Ortalaması: <strong className="text-foreground">{classAverage} Puan</strong>
                  {' '}({score >= classAverage ? 'Ortalamanın üzerinde 🎉' : 'Ortalamanın altında'})
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
