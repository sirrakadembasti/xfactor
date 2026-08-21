import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface AdminStatsProps {
  stats: {
    totalStudents: number;
    totalTeachers: number;
    activeQuizzes: number;
    totalClassrooms?: number;
  };
  isLoading?: boolean;
}

export const AdminStats: React.FC<AdminStatsProps> = ({
  stats,
  isLoading = false,
}) => {
  const statItems = [
    {
      title: 'Toplam Öğrenci',
      value: stats.totalStudents,
      description: 'Sisteme kayıtlı aktif öğrenciler',
      icon: (
        <svg
          className="w-6 h-6 text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      title: 'Toplam Öğretmen',
      value: stats.totalTeachers,
      description: 'Sistemdeki eğitmen kadrosu',
      icon: (
        <svg
          className="w-6 h-6 text-emerald-600 dark:text-emerald-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
          />
        </svg>
      ),
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      title: 'Aktif Sınavlar',
      value: stats.activeQuizzes,
      description: 'Şu anda yayında olan sınavlar',
      icon: (
        <svg
          className="w-6 h-6 text-violet-600 dark:text-violet-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
      bgColor: 'bg-violet-50 dark:bg-violet-900/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {statItems.map((item, index) => (
        <Card key={index} className="border border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {item.title}
            </CardTitle>
            <div className={`p-2.5 rounded-lg ${item.bgColor}`}>
              {item.icon}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 animate-pulse rounded my-1" />
            ) : (
              <div className="text-3xl font-bold text-slate-900 dark:text-white">
                {item.value.toLocaleString('tr-TR')}
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {item.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
