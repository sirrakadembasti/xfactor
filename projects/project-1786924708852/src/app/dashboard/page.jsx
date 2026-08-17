'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  BookMarked,
  UserCheck,
  Users,
  AlertTriangle,
  Clock,
  TrendingUp,
  Activity,
  CheckCircle2,
  ChevronRight,
  Filter,
} from 'lucide-react';
import MetricsCard from '@/components/dashboard/MetricsCard';
import QuickActions from '@/components/dashboard/QuickActions';

export default function DashboardHomePage() {
  const [currentRole, setCurrentRole] = useState('ADMIN'); // 'ADMIN' | 'TEACHER' | 'STUDENT'

  // Mock data for metrics based on role
  const metricsData = {
    ADMIN: [
      {
        title: 'Toplam Kitap',
        value: '4,520',
        subtitle: 'Geçen aya göre +128 yeni kitap',
        trend: '+3.2%',
        trendType: 'up',
        icon: BookOpen,
        color: 'blue',
      },
      {
        title: 'Aktif Ödünç',
        value: '342',
        subtitle: 'Şu an öğrencilerde olan',
        badgeText: '%85 Kapasite',
        icon: BookMarked,
        color: 'emerald',
      },
      {
        title: 'Onay Bekleyen Öğretmenler',
        value: '3',
        subtitle: 'İnceleme bekleyen başvurular',
        badgeText: 'Acil',
        icon: UserCheck,
        color: 'amber',
      },
      {
        title: 'Geciken Ödünçler',
        value: '14',
        subtitle: 'Teslim tarihi geçen kitaplar',
        trend: '4 Kritik',
        trendType: 'down',
        icon: AlertTriangle,
        color: 'rose',
      },
    ],
    TEACHER: [
      {
        title: 'Sınıf Ödünç Sayısı',
        value: '48',
        subtitle: 'Bu ay okunan toplam kitap',
        trend: '+12%',
        trendType: 'up',
        icon: BookMarked,
        color: 'emerald',
      },
      {
        title: 'Aktif Okuyan Öğrenciler',
        value: '26 / 30',
        subtitle: 'Sınıf katılım oranı',
        badgeText: '%86 Aktif',
        icon: Users,
        color: 'blue',
      },
      {
        title: 'Geciken Kitaplar',
        value: '2',
        subtitle: 'Hatırlatma gönderilmesi gereken',
        icon: AlertTriangle,
        color: 'rose',
      },
    ],
    STUDENT: [
      {
        title: 'Okuduğum Kitaplar',
        value: '18',
        subtitle: 'Bu dönem tamamlanan',
        trend: 'Hedef: 25',
        trendType: 'up',
        icon: BookOpen,
        color: 'indigo',
      },
      {
        title: 'Mevcut Ödünç Kitap',
        value: '2',
        subtitle: 'Son teslim: 18 Mayıs (3 gün kaldı)',
        badgeText: 'Zamanında',
        icon: Clock,
        color: 'emerald',
      },
      {
        title: 'Okuma Rozetleri',
        value: '5',
        subtitle: 'Son kazanılan: Kitap Kurdu 🏆',
        icon: TrendingUp,
        color: 'purple',
      },
    ],
  };

  const recentActivities = [
    {
      id: 1,
      user: 'Ahmet Yılmaz (10-A)',
      action: 'Nutuk - Mustafa Kemal Atatürk',
      type: 'Ödünç Alındı',
      time: '10 dakika önce',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    },
    {
      id: 2,
      user: 'Ayşe Kaya (Matematik Öğr.)',
      action: 'Yeni üyelik başvurusu yapıldı',
      type: 'Onay Bekliyor',
      time: '25 dakika önce',
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    },
    {
      id: 3,
      user: 'Mehmet Demir (11-B)',
      action: 'Suç ve Ceza - Fyodor Dostoyevski',
      type: 'İade Edildi',
      time: '1 saat önce',
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    },
    {
      id: 4,
      user: 'Zeynep Çelik (9-C)',
      action: 'Küçük Prens - Antoine de Saint-Exupéry',
      type: 'Süresi Uzatıldı',
      time: '2 saat önce',
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    },
  ];

  const pendingApprovals = [
    {
      id: 1,
      name: 'Dr. Selin Yılmaz',
      branch: 'Biyoloji Öğretmeni',
      date: 'Bugün, 09:30',
      email: 'selin.yilmaz@okul.k12.tr',
    },
    {
      id: 2,
      name: 'Kemal Sunal',
      branch: 'Edebiyat Öğretmeni',
      date: 'Dün, 16:45',
      email: 'kemal.sunal@okul.k12.tr',
    },
    {
      id: 3,
      name: 'Merve Tan',
      branch: 'Tarih Öğretmeni',
      date: '12 Mayıs, 11:15',
      email: 'merve.tan@okul.k12.tr',
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Hoş Geldiniz, Yönetici 👋
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Kütüphane durum özeti, güncel metrikler ve hızlı işlemler.
          </p>
        </div>

        {/* Role Switcher Demo Control */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Rol Görünümü:
          </span>
          <button
            onClick={() => setCurrentRole('ADMIN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentRole === 'ADMIN'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Yönetici
          </button>
          <button
            onClick={() => setCurrentRole('TEACHER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentRole === 'TEACHER'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Öğretmen
          </button>
          <button
            onClick={() => setCurrentRole('STUDENT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentRole === 'STUDENT'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Öğrenci
          </button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {(metricsData[currentRole] || metricsData.ADMIN).map((metric, idx) => (
          <MetricsCard
            key={idx}
            title={metric.title}
            value={metric.value}
            subtitle={metric.subtitle}
            trend={metric.trend}
            trendType={metric.trendType}
            badgeText={metric.badgeText}
            icon={metric.icon}
            color={metric.color}
          />
        ))}
      </div>

      {/* Quick Actions Component */}
      <QuickActions role={currentRole} />

      {/* Grid Content: Pending Approvals & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Onay Bekleyen Öğretmenler - Only for ADMIN */}
        {currentRole === 'ADMIN' && (
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                      Onay Bekleyenler
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Öğretmen üyelik talepleri
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2 py-1 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full">
                  3 Yeni
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendingApprovals.map((teacher) => (
                  <div key={teacher.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {teacher.name}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {teacher.branch}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {teacher.email}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap">
                        {teacher.date}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button className="flex-1 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Onayla
                      </button>
                      <button className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                        İncele
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <a
                href="/dashboard/teachers/pending"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                Tüm başvuruları görüntüle <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Son Hareketler / Aktivite Akışı */}
        <div
          className={`${
            currentRole === 'ADMIN' ? 'lg:col-span-2' : 'lg:col-span-3'
          } bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm`}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                  Son Kütüphane Hareketleri
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Gerçek zamanlı ödünç, iade ve sistem bildirimleri
                </p>
              </div>
            </div>
            <button className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
              Tümünü Gör <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {act.user}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {act.action}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${act.badgeColor}`}
                  >
                    {act.type}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline-block">
                    {act.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
