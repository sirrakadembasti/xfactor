import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  Award,
  Clock,
  HelpCircle,
} from 'lucide-react';

export interface MostMissedQuestion {
  id: string;
  order?: number;
  prompt: string;
  incorrectRate: number; // 0 - 100
  incorrectCount: number;
  totalAttempts: number;
  correctOptionText?: string;
}

export interface ScoreDistributionItem {
  range: string;
  count: number;
  percentage: number;
}

export interface ExamAnalyticsData {
  quizId: string;
  quizTitle: string;
  totalAttempts: number;
  averageScore: number; // 0 - 100
  highestScore: number;
  lowestScore: number;
  passRate?: number; // 0 - 100
  averageTimeMinutes?: number;
  mostMissedQuestions: MostMissedQuestion[];
  scoreDistribution?: ScoreDistributionItem[];
}

interface ExamAnalyticsCardProps {
  data: ExamAnalyticsData;
  className?: string;
}

export function ExamAnalyticsCard({ data, className = '' }: ExamAnalyticsCardProps) {
  const {
    quizTitle,
    totalAttempts,
    averageScore,
    highestScore,
    lowestScore,
    passRate = 0,
    averageTimeMinutes,
    mostMissedQuestions = [],
    scoreDistribution = [],
  } = data;

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getProgressColorClass = (rate: number) => {
    if (rate > 60) return 'bg-rose-500';
    if (rate > 35) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Ana Başlık ve Özet Metrikler */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {quizTitle} - Sınav Analizi
              </CardTitle>
              <CardDescription>
                Tamamlanan toplam {totalAttempts} sınav denemesine ait başarı ve soru analizi verileri
              </CardDescription>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-full w-fit">
              <Users className="w-3.5 h-3.5" />
              <span>{totalAttempts} Katılım</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Ortalama Başarı */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-xs font-medium uppercase tracking-wider">Ortalama Puan</span>
                <Award className="w-4 h-4" />
              </div>
              <div className={`text-2xl font-bold ${getScoreColor(averageScore)}`}>
                %{Math.round(averageScore)}
              </div>
              <div className="mt-2">
                <Progress value={averageScore} />
              </div>
            </div>

            {/* Geçme Oranı */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-xs font-medium uppercase tracking-wider">Başarı Oranı</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                %{Math.round(passRate)}
              </div>
              <div className="mt-2">
                <Progress value={passRate} />
              </div>
            </div>

            {/* En Yüksek / En Düşük Puan */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-xs font-medium uppercase tracking-wider">Puan Aralığı</span>
                <TrendingUp className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                <span className="text-emerald-600 dark:text-emerald-400">{highestScore}</span>
                <span className="text-slate-400 mx-1">/</span>
                <span className="text-rose-600 dark:text-rose-400">{lowestScore}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                En Yüksek / En Düşük
              </p>
            </div>

            {/* Ortalama Süre */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-xs font-medium uppercase tracking-wider">Ortalama Süre</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {averageTimeMinutes ? `${Math.round(averageTimeMinutes)} dk` : 'N/A'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Tamamlama süresi
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Soru Bazlı Analiz ve En Çok Yanlış Yapılan Sorular */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* En Çok Yanlış Yapılan Sorular */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                  En Çok Yanlış Yapılan Sorular
                </CardTitle>
                <CardDescription>
                  Öğrencilerin en çok zorlandığı ve tekrar edilmesi önerilen sorular
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {mostMissedQuestions.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
                <p className="text-sm font-medium">Kritik oranda yanlış yapılan soru bulunamadı.</p>
                <p className="text-xs text-slate-400 mt-1">Öğrenciler tüm sorularda dengeli ve başarılı bir performans sergiledi.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {mostMissedQuestions.map((q, index) => (
                  <div
                    key={q.id || index}
                    className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold shrink-0 mt-0.5">
                          {q.order !== undefined ? q.order : index + 1}
                        </span>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                          {q.prompt}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" />
                          %{Math.round(q.incorrectRate)} Yanlış
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Hata Oranı Dağılımı</span>
                        <span>
                          {q.incorrectCount} / {q.totalAttempts} Yanıt
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${getProgressColorClass(q.incorrectRate)}`}
                          style={{ width: `${Math.min(q.incorrectRate, 100)}%` }}
                        />
                      </div>
                    </div>

                    {q.correctOptionText && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-800">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Doğru Cevap: </span>
                        {q.correctOptionText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Puan Dağılımı Grafiği / Analiz Kartı */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-500" />
              Puan Dağılımı
            </CardTitle>
            <CardDescription>
              Sınava katılan öğrencilerin not aralıklarına göre dağılımı
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scoreDistribution.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                Henüz puan dağılım verisi oluşmadı.
              </div>
            ) : (
              <div className="space-y-4">
                {scoreDistribution.map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span>{item.range} Puan</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {item.count} Öğrenci (%{Math.round(item.percentage)})
                      </span>
                    </div>
                    <Progress value={item.percentage} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ExamAnalyticsCard;
