'use client';

import React from 'react';
import Link from 'next/link';
import {
  PlusCircle,
  BookOpen,
  UserCheck,
  Search,
  FileText,
  Users,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export default function QuickActions({ role = 'ADMIN' }) {
  const actionsByRole = {
    ADMIN: [
      {
        id: 'add-book',
        title: 'Yeni Kitap Ekle',
        description: 'Kütüphane envanterine yeni eser ekle',
        icon: PlusCircle,
        href: '/dashboard/books/new',
        color: 'from-blue-500 to-indigo-600',
      },
      {
        id: 'approve-teachers',
        title: 'Öğretmen Onayları',
        description: 'Bekleyen öğretmen başvurularını incele',
        icon: UserCheck,
        href: '/dashboard/teachers/pending',
        color: 'from-amber-500 to-orange-600',
        badge: '3 Bekliyor',
      },
      {
        id: 'issue-book',
        title: 'Kitap Ödünç Ver',
        description: 'Öğrenci veya öğretmene kitap ver',
        icon: BookOpen,
        href: '/dashboard/loans/new',
        color: 'from-emerald-500 to-teal-600',
      },
      {
        id: 'reports',
        title: 'Rapor Oluştur',
        description: 'Ödünç ve envanter raporlarını dışa aktar',
        icon: FileText,
        href: '/dashboard/reports',
        color: 'from-purple-500 to-pink-600',
      },
    ],
    TEACHER: [
      {
        id: 'issue-book-student',
        title: 'Öğrenciye Ödünç Ver',
        description: 'Sınıfındaki öğrenciye kitap tanımla',
        icon: BookOpen,
        href: '/dashboard/loans/new',
        color: 'from-emerald-500 to-teal-600',
      },
      {
        id: 'search-catalog',
        title: 'Katalogda Ara',
        description: 'Kütüphanedeki mevcut kitapları sorgula',
        icon: Search,
        href: '/dashboard/books',
        color: 'from-blue-500 to-indigo-600',
      },
      {
        id: 'my-class',
        title: 'Sınıfım ve Öğrenciler',
        description: 'Öğrenci okuma istatistiklerini gör',
        icon: Users,
        href: '/dashboard/students',
        color: 'from-purple-500 to-indigo-600',
      },
    ],
    STUDENT: [
      {
        id: 'search-catalog-student',
        title: 'Kitap Ara ve Rezerve Et',
        description: 'Okumak istediğin kitabı bul',
        icon: Search,
        href: '/dashboard/books',
        color: 'from-blue-500 to-cyan-600',
      },
      {
        id: 'my-loans',
        title: 'Aktif Kitaplarım',
        description: 'Elinizdeki kitapları ve teslim tarihlerini inceleyin',
        icon: BookOpen,
        href: '/dashboard/my-loans',
        color: 'from-emerald-500 to-teal-600',
      },
    ],
  };

  const currentActions = actionsByRole[role] || actionsByRole.ADMIN;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">
              Hızlı Erişim & Aksiyonlar
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sık kullanılan işlemlere doğrudan ulaşın
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {currentActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.id}
              href={action.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 transition-all duration-200 hover:shadow-md hover:border-transparent hover:ring-2 hover:ring-indigo-500/20 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`p-3 rounded-xl bg-gradient-to-br ${action.color} text-white shadow-sm transition-transform duration-200 group-hover:scale-105`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                {action.badge && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                    {action.badge}
                  </span>
                )}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-slate-900 dark:text-white font-semibold text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  <span>{action.title}</span>
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {action.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
