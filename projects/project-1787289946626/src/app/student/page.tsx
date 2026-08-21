import React from 'react';
import { Metadata } from 'next';
import { StudentQuizList } from '@/components/student/StudentQuizList';
import { BookOpen, CheckCircle, Clock, Award } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Öğrenci Paneli | Sınav Portalı',
  description: 'Atanmış sınavlarınızı görüntüleyin ve başarı durumunuzu takip edin.',
};

export default function StudentDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Öğrenci Paneli
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Size tanımlanan aktif sınavlara katılabilir, geçmiş sınav sonuçlarınızı inceleyebilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Aktif Sınavlar</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">--</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Tamamlananlar</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">--</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Toplam Soru Çözümü</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">--</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <BookOpen className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Başarı Ortalaması</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">--</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Award className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Atanmış Sınavlar ve Testler
        </h2>
        <StudentQuizList />
      </div>
    </div>
  );
}
