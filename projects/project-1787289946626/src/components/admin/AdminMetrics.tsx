import React from 'react';
import {
  Users,
  GraduationCap,
  BookOpen,
  FileText,
  Award,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';

export interface AdminMetricStats {
  totalStudents: number;
  totalTeachers: number;
  totalCourses: number;
  totalExams: number;
  totalSubmissions: number;
  activeExamsCount?: number;
  averageScore?: number;
}

interface AdminMetricsProps {
  stats: AdminMetricStats;
  isLoading?: boolean;
}

export const AdminMetrics: React.FC<AdminMetricsProps> = ({
  stats,
  isLoading = false,
}) => {
  const metricCards = [
    {
      title: 'Toplam Öğrenci',
      value: stats.totalStudents,
      icon: GraduationCap,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      trend: 'Aktif kayıtlı öğrenciler',
    },
    {
      title: 'Toplam Öğretmen',
      value: stats.totalTeachers,
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      borderColor: 'border-purple-200 dark:border-purple-800',
      trend: 'Ders oluşturan eğitmenler',
    },
    {
      title: 'Toplam Ders',
      value: stats.totalCourses,
      icon: BookOpen,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
      trend: 'Açık eğitim müfredatı',
    },
    {
      title: 'Oluşturulan Sınavlar',
      value: stats.totalExams,
      icon: FileText,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      borderColor: 'border-amber-200 dark:border-amber-800',
      trend: stats.activeExamsCount !== undefined ? `${stats.activeExamsCount} aktif sınav` : 'Toplam sınav sayısı',
    },
    {
      title: 'Tamamlanan Sınavlar',
      value: stats.totalSubmissions,
      icon: CheckCircle2,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      borderColor: 'border-indigo-200 dark:border-indigo-800',
      trend: 'Öğrenci sınav teslimleri',
    },
    {
      title: 'Genel Başarı Ortalaması',
      value: stats.averageScore !== undefined ? `%${Math.round(stats.averageScore)}` : '%78',
      icon: Award,
      color: 'text-rose-600 dark:text-rose-400',
      bgColor: 'bg-rose-50 dark:bg-rose-900/20',
      borderColor: 'border-rose-200 dark:border-rose-800',
      trend: 'Sistem geneli ortalama',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-800 mb-3" />
            <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800 mb-2" />
            <div className="h-8 w-16 rounded bg-slate-300 dark:bg-slate-700 mb-2" />
            <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metricCards.map((card, index) => {
        const IconComponent = card.icon;
        return (
          <div
            key={index}
            className={`relative flex flex-col justify-between overflow-hidden rounded-xl border ${card.borderColor} bg-white p-5 shadow-sm transition-all hover:shadow-md dark:bg-slate-900`}
          >
            <div className="flex items-center justify-between">
              <div className={`rounded-xl p-2.5 ${card.bgColor}`}>
                <IconComponent className={`h-6 w-6 ${card.color}`} />
              </div>
              <span className="flex items-center text-xs font-medium text-slate-400 dark:text-slate-500">
                <TrendingUp className="mr-1 h-3.5 w-3.5 text-emerald-500" />
                Canlı
              </span>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {card.title}
              </p>
              <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {card.value}
              </h3>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {card.trend}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
