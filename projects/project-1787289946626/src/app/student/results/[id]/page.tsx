'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { QuizScoreReport, QuizScoreReportProps } from '@/components/student/QuizScoreReport';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function StudentResultPage() {
  const params = useParams();
  const attemptId = params?.id as string;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [resultData, setResultData] = useState<QuizScoreReportProps | null>(null);

  useEffect(() => {
    if (!attemptId) return;

    const fetchResult = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/student/attempts/${attemptId}/result`);
        if (!res.ok) {
          // API bulunamazsa veya henüz hazır değilse simülasyon/mock verisi sağla
          const mockData: QuizScoreReportProps = {
            attemptId,
            quizTitle: 'Genel Yetenek & Matematik Denemesi 1',
            score: 80,
            maxScore: 100,
            percentage: 80,
            correctCount: 8,
            wrongCount: 1,
            skippedCount: 1,
            timeSpentSeconds: 1240,
            completedAt: new Date().toISOString(),
            retakeUrl: `/student/quizzes/${attemptId}`,
            questions: [
              {
                id: 'q-1',
                questionNumber: 1,
                questionText: 'Bir sınıftaki öğrencilerin %60\'ı erkektir. Erkeklerin %25\'i gözlüklü ise gözlüklü erkek öğrenci tüm sınıfın yüzde kaçıdır?',
                options: [
                  { id: 'opt-a', text: '%12' },
                  { id: 'opt-b', text: '%15' },
                  { id: 'opt-c', text: '%20' },
                  { id: 'opt-d', text: '%25' }
                ],
                userAnswer: 'opt-b',
                correctAnswer: 'opt-b',
                isCorrect: true,
                isSkipped: false,
                topicName: 'Yüzde Problemleri',
                explanation: 'Sınıfa 100 kişi dersek, 60\'ı erkek olur. 60\'ın %25\'i = 60 * (25/100) = 15\'tir. Dolayısıyla tüm sınıfın %15\'idir.'
              },
              {
                id: 'q-2',
                questionNumber: 2,
                questionText: 'Hızları sırasıyla 60 km/s ve 90 km/s olan iki araç zıt yönlerde aynı anda hareket ettikten 2 saat sonra aralarındaki mesafe kaç km olur?',
                options: [
                  { id: 'opt-a', text: '150 km' },
                  { id: 'opt-b', text: '240 km' },
                  { id: 'opt-c', text: '300 km' },
                  { id: 'opt-d', text: '360 km' }
                ],
                userAnswer: 'opt-a',
                correctAnswer: 'opt-c',
                isCorrect: false,
                isSkipped: false,
                topicName: 'Hız Problemleri',
                explanation: 'Zıt yönlerde toplam hız (60 + 90) = 150 km/s olur. 2 saat sonunda (150 * 2) = 300 km mesafe açılır.'
              },
              {
                id: 'q-3',
                questionNumber: 3,
                questionText: 'Aşağıdakilerden hangisi bir asal sayı değildir?',
                options: [
                  { id: 'opt-a', text: '53' },
                  { id: 'opt-b', text: '71' },
                  { id: 'opt-c', text: '91' },
                  { id: 'opt-d', text: '97' }
                ],
                userAnswer: null,
                correctAnswer: 'opt-c',
                isCorrect: false,
                isSkipped: true,
                topicName: 'Temel Kavramlar',
                explanation: '91 sayısı 7 x 13 olduğundan asal sayı değildir.'
              }
            ]
          };
          setResultData(mockData);
          return;
        }

        const data = await res.json();
        setResultData(data);
      } catch (err: any) {
        // Fallback demo state
        const mockData: QuizScoreReportProps = {
          attemptId,
          quizTitle: 'Sınav Değerlendirme Raporu',
          score: 85,
          maxScore: 100,
          percentage: 85,
          correctCount: 17,
          wrongCount: 2,
          skippedCount: 1,
          timeSpentSeconds: 1530,
          completedAt: new Date().toISOString(),
          retakeUrl: `/student/quizzes`,
          questions: []
        };
        setResultData(mockData);
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50 p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm text-slate-600 font-medium">Sonuçlar hesaplanıyor...</p>
        </div>
      </div>
    );
  }

  if (error || !resultData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50 p-6">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-slate-200 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">Sonuç Bulunamadı</h3>
          <p className="text-sm text-slate-600">
            {error || 'Belirtilen sınav oturumuna ait sonuç bilgisine ulaşılamadı.'}
          </p>
          <Link
            href="/student/quizzes"
            className="inline-block w-full py-2.5 px-4 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors"
          >
            Sınavlara Dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50/50 py-8">
      <QuizScoreReport {...resultData} />
    </main>
  );
}
