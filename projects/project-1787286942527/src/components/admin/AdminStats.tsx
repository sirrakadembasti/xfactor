'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';

interface AdminStatsProps {
  stats?: {
    totalUsers: number;
    totalCourses: number;
    totalQuizzes: number;
    totalAttempts: number;
  };
}

export const AdminStats: React.FC<AdminStatsProps> = ({
  stats = {
    totalUsers: 142,
    totalCourses: 12,
    totalQuizzes: 48,
    totalAttempts: 1250,
  },
}) => {
  const statItems = [
    {
      label: 'Toplam Kullanıcı',
      value: stats.totalUsers,
      icon: '👥',
      change: '+8% bu ay',
    },
    {
      label: 'Aktif Dersler',
      value: stats.totalCourses,
      icon: '📚',
      change: '+2 yeni',
    },
    {
      label: 'Sınav & Quiz',
      value: stats.totalQuizzes,
      icon: '📝',
      change: '48 hazır',
    },
    {
      label: 'Tamamlanan Sınav',
      value: stats.totalAttempts,
      icon: '📊',
      change: '+18% katılım',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {statItems.map((item, idx) => (
        <Card key={idx} className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{item.value}</p>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 inline-block">
              {item.change}
            </span>
          </div>
          <div className="text-3xl p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {item.icon}
          </div>
        </Card>
      ))}
    </div>
  );
};
