'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ReportHeader } from '@/components/student/ReportHeader';
import { ReportSummary } from '@/components/student/ReportSummary';
import { ReportQuestionList } from '@/components/student/ReportQuestionList';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Printer, AlertCircle, RefreshCw } from 'lucide-react';

interface AttemptReportData {
  id: string;
  examTitle: string;
  studentName: string;
  completedAt: string;
  durationMinutes: number;
  score: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  emptyCount: number;
  successRate: number;
  questions: Array<{
    id: string;
    questionNumber: number;
    text: string;
    subject?: string;
    userAnswer?: string | null;
    correctAnswer: string;
    isCorrect: boolean;
    points: number;
    explanation?: string;
  }>;
}

export default function StudentReportPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params?.attemptId as string;

  const [report, setReport] = useState<AttemptReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;

    const fetchReport = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(`/api/attempts/${attemptId}/report`);
        if (!res.ok) {
          throw new Error('Sınav sonuç karnesi yüklenemedi.');
        }
        const data = await res.json();
        setReport(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [attemptId]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 print:bg-white print:p-0">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Üst Eylem Çubuğu (Baskıda gizlenir) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/student')}
                className="flex items-center gap-2 text-slate-700 hover:text-slate-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Panele Dön
              </Button>
              <h1 className="text-lg font-bold text-slate-900">Sınav Sonuç Raporu</h1>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrint}
                className="flex items-center gap-2 w-full sm:w-auto"
                disabled={isLoading || !!error}
              >
                <Printer className="w-4 h-4" />
                Raporu Yazdır / PDF İndir
              </Button>
            </div>
          </div>

          {/* Durum Yönetimi: Yükleniyor */}
          {isLoading && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-slate-600 font-medium">Karne verileri yükleniyor...</p>
            </div>
          )}

          {/* Durum Yönetimi: Hata */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center space-y-4 shadow-sm">
              <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
              <div>
                <h3 className="text-base font-semibold text-red-900">Sonuç Yüklenemedi</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Tekrar Dene
                </Button>
                <Link href="/student">
                  <Button variant="secondary">Öğrenci Paneline Dön</Button>
                </Link>
              </div>
            </div>
          )}

          {/* Rapor İçeriği */}
          {!isLoading && !error && report && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-8 print:border-none print:shadow-none print:p-0">
              {/* Başlık ve Öğrenci Bilgileri */}
              <ReportHeader
                examTitle={report.examTitle}
                studentName={report.studentName}
                completedAt={report.completedAt}
                durationMinutes={report.durationMinutes}
              />

              <hr className="border-slate-200 print:border-slate-300" />

              {/* İstatistik & Skor Özeti */}
              <ReportSummary
                score={report.score}
                maxScore={report.maxScore}
                correctCount={report.correctCount}
                incorrectCount={report.incorrectCount}
                emptyCount={report.emptyCount}
                successRate={report.successRate}
              />

              <hr className="border-slate-200 print:border-slate-300" />

              {/* Soru Bazlı Detay Listesi */}
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4 print:text-base">
                  Soru Bazlı Yanıt ve Değerlendirme Detayları
                </h2>
                <ReportQuestionList questions={report.questions} />
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
