'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  School,
  Users,
  BookOpen,
  FileCheck,
  BarChart3,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  GraduationCap
} from 'lucide-react';

export const NAVIGATION_ITEMS = [
  {
    title: 'Ana Panel',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'teacher', 'student'],
  },
  {
    title: 'Okul Yönetimi',
    href: '/dashboard/school',
    icon: School,
    roles: ['admin'],
  },
  {
    title: 'Öğrenci & Sınıflar',
    href: '/dashboard/students',
    icon: Users,
    roles: ['admin', 'teacher'],
  },
  {
    title: 'Dersler & Müfredat',
    href: '/dashboard/courses',
    icon: BookOpen,
    roles: ['admin', 'teacher', 'student'],
  },
  {
    title: 'Ödev & Sınavlar',
    href: '/dashboard/assignments',
    icon: FileCheck,
    roles: ['admin', 'teacher', 'student'],
    badge: '3 Yeni',
  },
  {
    title: 'Yoklama & Analiz',
    href: '/dashboard/analytics',
    icon: BarChart3,
    roles: ['admin', 'teacher'],
  },
  {
    title: 'AI Öğretmen Asistanı',
    href: '/dashboard/ai-assistant',
    icon: Bot,
    roles: ['admin', 'teacher', 'student'],
    badge: 'Pro',
    badgeColor: 'bg-indigo-500 text-white',
  },
  {
    title: 'Ayarlar',
    href: '/dashboard/settings',
    icon: Settings,
    roles: ['admin'],
  },
];

export default function Sidebar({ userRole = 'admin', isCollapsed, onToggleCollapse }) {
  const pathname = usePathname();

  const filteredNavItems = NAVIGATION_ITEMS.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <aside
      className={`hidden md:flex flex-col bg-slate-900 text-slate-200 border-r border-slate-800 transition-all duration-300 relative z-20 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Sidebar Header / Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-600/30">
            <GraduationCap className="w-6 h-6" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col whitespace-nowrap">
              <span className="font-bold text-slate-100 text-base leading-tight tracking-wide">
                EduPortal
              </span>
              <span className="text-xs text-indigo-400 font-medium">Akıllı Okul Sistemi</span>
            </div>
          )}
        </Link>
      </div>

      {/* Collapse Toggle Button */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3.5 top-20 w-7 h-7 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-indigo-600 transition-colors shadow-md z-30"
        aria-label="Menüyü Daralt/Genişlet"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.title : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all group ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'}`} />
              {!isCollapsed && (
                <span className="flex-1 truncate">{item.title}</span>
              )}
              {!isCollapsed && item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    item.badgeColor || 'bg-slate-800 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer Info */}
      {!isCollapsed && (
        <div className="p-4 m-3 bg-slate-800/50 border border-slate-800 rounded-xl text-xs text-slate-400">
          <p className="font-semibold text-slate-300 mb-1">Erişim Düzeyi</p>
          <p className="capitalize text-indigo-400 font-medium">
            {userRole === 'admin' ? 'Sistem Yöneticisi' : userRole === 'teacher' ? 'Eğitmen' : 'Öğrenci'}
          </p>
        </div>
      )}
    </aside>
  );
}
