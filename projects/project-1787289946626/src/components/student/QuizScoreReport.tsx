'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Trophy,
  Clock,
  Target,
  RotateCcw,
  ArrowLeft,
  HelpCircle,
  Check,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';

export interface QuestionReviewItem {
  id: string;
  questionNumber: number;
  questionText: string;
  options: {
    id: string;
    text: string;
  }[];
  userAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  isSkipped: boolean;
  explanation?: string;
  topicName?: string;
}

export interface QuizScoreReportProps {
  attemptId: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeSpentSeconds: number;
  completedAt: string;
  questions: QuestionReviewItem[];
  retakeUrl?: string;
}

export const QuizScoreReport: React.FC<QuizScoreReportProps> = ({
  quizTitle,
  score,
  maxScore,
  percentage,
  correctCount,
  wrongCount,
  skippedCount,
  timeSpentSeconds,
  completedAt,
  questions,
  retakeUrl
}) => {
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'skipped'>('all');
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  const toggleExplanation = (questionId: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins} dk ${secs} sn`;
  };

  const chartData = [
    { name: 'Doğru', value: correctCount, color: '#10B981' },
    { name: 'Yanlış', value: wrongCount, color: '#EF4444' },
    { name: 'Boş', value: skippedCount, color: '#9CA3AF' }
  ].filter((item) => item.value > 0);

  const filteredQuestions = questions.filter((q) => {
    if (filter === 'correct') return q.isCorrect;
    if (filter === 'wrong') return !q.isCorrect && !q.isSkipped;
    if (filter === 'skipped') return q.isSkipped;
    return true;
  });

  const getScoreBadgeColor = (pct: number) => {
    if (pct >= 85) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (pct >= 60) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (pct >= 45) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 sm:p-6">
      {/* Başlık ve Butonlar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <Link
            href="/student/quizzes"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Sınavlara Geri Dön
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{quizTitle} - Karne</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tamamlanma Tarihi: {new Date(completedAt).toLocaleString('tr-TR')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {retakeUrl && (
            <Link
              href={retakeUrl}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Yeniden Çöz
            </Link>
          )}
          <Link
            href="/student/quizzes"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-medium text-sm shadow-sm transition-colors"
          >
            Tüm Sınavlar
          </Link>
        </div>
      </div>

      {/* Üst İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Puan</p>
            <p className="text-2xl font-black text-slate-900">
              {score} <span className="text-sm font-medium text-slate-400">/ {maxScore}</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Başarı Oranı</p>
            <span className={`inline-block px-2 py-0.5 mt-0.5 rounded-md text-sm font-bold border ${getScoreBadgeColor(percentage)}`}>
              %{percentage.toFixed(1)}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Harcanan Süre</p>
            <p className="text-xl font-bold text-slate-900">{formatTime(timeSpentSeconds)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Toplam Soru</p>
            <p className="text-2xl font-black text-slate-900">{questions.length}</p>
          </div>
        </div>
      </div>

      {/* Grafik ve Doğru/Yanlış Dağılımı */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
          <h3 className="text-base font-semibold text-slate-900 mb-2 w-full text-left">Cevap Dağılımı</h3>
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Performans Detayları</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 flex flex-col items-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mb-2" />
              <span className="text-2xl font-black text-emerald-700">{correctCount}</span>
              <span className="text-xs font-semibold text-emerald-600 mt-1 uppercase">Doğru</span>
            </div>

            <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-100 flex flex-col items-center">
              <XCircle className="w-7 h-7 text-rose-600 mb-2" />
              <span className="text-2xl font-black text-rose-700">{wrongCount}</span>
              <span className="text-xs font-semibold text-rose-600 mt-1 uppercase">Yanlış</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center">
              <MinusCircle className="w-7 h-7 text-slate-500 mb-2" />
              <span className="text-2xl font-black text-slate-700">{skippedCount}</span>
              <span className="text-xs font-semibold text-slate-500 mt-1 uppercase">Boş</span>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600">
            <p className="font-medium text-slate-800 mb-1">Özet Değerlendirme</p>
            <p>
              Toplam {questions.length} sorudan {correctCount} tanesini doğru yanıtladınız. Net başarı yüzdeniz %{percentage.toFixed(1)} olarak hesaplandı.
            </p>
          </div>
        </div>
      </div>

      {/* Soru Bazlı İnceleme Bölümü */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">Soru Bazlı İnceleme</h2>
          
          {/* Filtreleme Butonları */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tümü ({questions.length})
            </button>
            <button
              onClick={() => setFilter('correct')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'correct'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Doğrular ({correctCount})
            </button>
            <button
              onClick={() => setFilter('wrong')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'wrong'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Yanlışlar ({wrongCount})
            </button>
            <button
              onClick={() => setFilter('skipped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'skipped'
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Boş Bırakılanlar ({skippedCount})
            </button>
          </div>
        </div>

        {/* Soruların Listesi */}
        <div className="space-y-6">
          {filteredQuestions.map((q) => {
            const isExpanded = !!expandedExplanations[q.id];
            let statusBadge = null;

            if (q.isCorrect) {
              statusBadge = (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  <Check className="w-3.5 h-3.5" /> Doğru
                </span>
              );
            } else if (q.isSkipped) {
              statusBadge = (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  Boş
                </span>
              );
            } else {
              statusBadge = (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                  <X className="w-3.5 h-3.5" /> Yanlış
                </span>
              );
            }

            return (
              <div
                key={q.id}
                className={`p-5 rounded-2xl border transition-all ${
                  q.isCorrect
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : q.isSkipped
                    ? 'border-slate-200 bg-slate-50/30'
                    : 'border-rose-200 bg-rose-50/20'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">
                      Soru {q.questionNumber}
                    </span>
                    {q.topicName && (
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {q.topicName}
                      </span>
                    )}
                  </div>
                  {statusBadge}
                </div>

                <p className="text-slate-900 font-medium mb-4 text-sm sm:text-base leading-relaxed">
                  {q.questionText}
                </p>

                {/* Seçenekler Listesi */}
                <div className="space-y-2 mb-4">
                  {q.options.map((opt) => {
                    const isCorrectOpt = opt.id === q.correctAnswer;
                    const isSelectedOpt = opt.id === q.userAnswer;

                    let optClasses = 'border-slate-200 bg-white text-slate-700';
                    if (isCorrectOpt) {
                      optClasses = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium';
                    } else if (isSelectedOpt && !q.isCorrect) {
                      optClasses = 'border-rose-400 bg-rose-50 text-rose-900';
                    }

                    return (
                      <div
                        key={opt.id}
                        className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-colors ${optClasses}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border ${
                              isCorrectOpt
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : isSelectedOpt
                                ? 'bg-rose-500 text-white border-rose-500'
                                : 'border-slate-300 text-slate-500'
                            }`}
                          >
                            {opt.id.slice(-1).toUpperCase()}
                          </div>
                          <span>{opt.text}</span>
                        </div>

                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          {isCorrectOpt && (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Doğru Cevap
                            </span>
                          )}
                          {isSelectedOpt && !isCorrectOpt && (
                            <span className="text-rose-600 flex items-center gap-1">
                              <X className="w-3.5 h-3.5" /> Sizin Cevabınız
                            </span>
                          )}
                          {isSelectedOpt && isCorrectOpt && (
                            <span className="text-emerald-700 font-bold">
                              (Seçiminiz)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Açıklama / Çözüm Akordeonu */}
                {q.explanation && (
                  <div>
                    <button
                      onClick={() => toggleExplanation(q.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {isExpanded ? (
                        <>
                          Çözümü Gizle <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          Çözümü & Açıklamayı Göster <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-sm text-slate-700 leading-relaxed">
                        <p className="font-semibold text-blue-900 mb-1">Çözüm Açıklaması:</p>
                        <p>{q.explanation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filteredQuestions.length === 0 && (
            <div className="text-center py-10 text-slate-500">
              Seçili filtreye uygun soru bulunamadı.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
