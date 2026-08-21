import React from 'react';
import Link from 'next/link';
import {
  Users,
  FileText,
  CheckCircle2,
  TrendingUp,
  PlusCircle,
  BarChart3,
  Clock,
  ArrowRight,
  Calendar
} from 'lucide-react';

interface QuickStat {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const quickStats: QuickStat[] = [
  {
    label: 'Aktif Sınavlar',
    value: '4',
    change: '+1 bu hafta',
    isPositive: true,
    icon: FileText
  },
  {
    label: 'Toplam Öğrenci',
    value: '148',
    change: '3 şube',
    isPositive: true,
    icon: Users
  },
  {
    label: 'Tamamlanan Değerlendirme',
    value: '520',
    change: '%94 katılım',
    isPositive: true,
    icon: CheckCircle2
  },
  {
    label: 'Genel Ortalama',
    value: '%76.4',
    change: '+3.2 puan',
    isPositive: true,
    icon: TrendingUp
  }
];

interface RecentExam {
  id: string;
  title: string;
  grade: string;
  participants: number;
  averageScore: number;
  date: string;
  status: 'active' | 'completed' | 'scheduled';
}

const recentExams: RecentExam[] = [
  {
    id: '1',
    title: '11. Sınıf Fizik 1. Dönem 2. Yazılı',
    grade: '11-A, 11-B',
    participants: 58,
    averageScore: 78.5,
    date: '24 Mayıs 2024',
    status: 'completed'
  },
  {
    id: '2',
    title: 'TYT Deneme Sınavı - 4',
    grade: '12-Sayısal',
    participants: 42,
    averageScore: 68.2,
    date: '22 Mayıs 2024',
    status: 'completed'
  },
  {
    id: '3',
    title: 'Vektörler ve Bağıl Hareket Mini Test',
    grade: '11-C',
    participants: 28,
    averageScore: 84.0,
    date: 'Bugün (Devam Ediyor)',
    status: 'active'
  }
];

export default function TeacherDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Başlık ve Hızlı İşlemler */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Öğretmen Kontrol Paneli</h1>
            <p className="text-slate-500 mt-1">
              Sınavlarınızı yönetin, öğrenci performanslarını inceleyin ve analiz raporlarına erişin.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/teacher/exams/create"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Yeni Sınav Oluştur
            </Link>
            <Link
              href="/teacher/results"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Sonuç Analizi
            </Link>
          </div>
        </div>

        {/* İstatistik Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {quickStats.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div
                key={idx}
                className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between"
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-xs text-emerald-600 font-medium">{stat.change}</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Ana İçerik Izgarası */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Son Sınavlar ve Performans */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Son Sınavlar ve Başarı Durumu</h2>
                <p className="text-xs text-slate-500 mt-0.5">Son uygulanan sınavların katılım ve ortalama metrikleri</p>
              </div>
              <Link
                href="/teacher/results"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
              >
                Tümünü Gör <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-4">
              {recentExams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200/60 gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{exam.title}</h3>
                      {exam.status === 'active' && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full animate-pulse">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-3">
                      <span>Şube: {exam.grade}</span>
                      <span>•</span>
                      <span>{exam.date}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-slate-500">Katılım</p>
                      <p className="text-sm font-bold text-slate-800">{exam.participants} Öğrenci</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-slate-500">Ortalama</p>
                      <p className="text-sm font-bold text-indigo-600">%{exam.averageScore}</p>
                    </div>
                    <Link
                      href={`/teacher/results?examId=${exam.id}`}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      Rapor
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Yaklaşan Planlar ve Hızlı Bilgi Panosu */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                Yaklaşan Sınav Takvimi
              </h2>
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> 28 Mayıs 2024 - 09:30
                  </p>
                  <p className="text-sm font-bold mt-1">10. Sınıf Kimya Ortak Sınavı</p>
                  <p className="text-xs text-amber-700 mt-0.5">10-A, 10-B, 10-C (Süre: 40 dk)</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-blue-900">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> 31 Mayıs 2024 - 14:00
                  </p>
                  <p className="text-sm font-bold mt-1">AYT Genel Değerlendirme</p>
                  <p className="text-xs text-blue-700 mt-0.5">12-Tüm Şubeler (Süre: 180 dk)</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 text-white rounded-xl p-6 shadow-sm space-y-3">
              <h3 className="text-base font-bold">Yapay Zeka Destekli Soru Analizi</h3>
              <p className="text-xs text-indigo-100 leading-relaxed">
                Öğrencilerin en çok zorlandığı soru ve kazanımları tek tıkla analiz edin, otomatik pekiştirme ödevleri oluşturun.
              </p>
              <Link
                href="/teacher/results"
                className="inline-block text-xs font-semibold bg-white text-indigo-900 px-3.5 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                Detaylı Analizi Başlat
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
