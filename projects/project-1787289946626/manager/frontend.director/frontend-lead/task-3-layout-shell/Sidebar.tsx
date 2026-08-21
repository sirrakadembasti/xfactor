'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  PieChart,
  FileText,
  ShieldAlert,
  Search,
  BarChart3,
  FileCheck,
  Settings,
  Coins
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Array<'INVESTOR' | 'PORTFOLIO_MANAGER' | 'ANALYST' | 'AUDITOR'>;
}

const NAV_ITEMS: NavItem[] = [
  {
    title: 'Genel Bakış',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['INVESTOR', 'PORTFOLIO_MANAGER', 'ANALYST', 'AUDITOR']
  },
  // Yatırımcı Menüsü
  {
    title: 'Portföyüm',
    href: '/portfolio',
    icon: Coins,
    roles: ['INVESTOR']
  },
  {
    title: 'Yatırım Geçmişi',
    href: '/investments',
    icon: TrendingUp,
    roles: ['INVESTOR']
  },
  // Portföy Yöneticisi Menüsü
  {
    title: 'Portföy Yönetimi',
    href: '/management/portfolios',
    icon: Briefcase,
    roles: ['PORTFOLIO_MANAGER']
  },
  {
    title: 'Varlık Dağılımı',
    href: '/management/assets',
    icon: PieChart,
    roles: ['PORTFOLIO_MANAGER']
  },
  // Finansal Analist Menüsü
  {
    title: 'Piyasa Analitiği',
    href: '/analysis/markets',
    icon: BarChart3,
    roles: ['ANALYST']
  },
  {
    title: 'Varlık Tarayıcı',
    href: '/analysis/screener',
    icon: Search,
    roles: ['ANALYST']
  },
  // Denetçi Menüsü
  {
    title: 'Denetim Günlükleri',
    href: '/audit/logs',
    icon: FileCheck,
    roles: ['AUDITOR']
  },
  {
    title: 'Risk ve İhlaller',
    href: '/audit/violations',
    icon: ShieldAlert,
    roles: ['AUDITOR']
  },
  // Ortak Raporlama
  {
    title: 'Raporlar',
    href: '/reports',
    icon: FileText,
    roles: ['INVESTOR', 'PORTFOLIO_MANAGER', 'ANALYST', 'AUDITOR']
  }
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { role } = useAuth();

  const filteredNavItems = NAV_ITEMS.filter((item) =>
    role ? item.roles.includes(role) : false
  );

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-slate-950 text-slate-300 min-h-screen">
      {/* Logo Alanı */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold">
          IP
        </div>
        <div className="flex flex-col">
          <span className="font-bold tracking-tight text-white text-base leading-tight">InvestPulse</span>
          <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Varlık Yönetimi</span>
        </div>
      </div>

      {/* Menü Linkleri */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Navigasyon
        </div>
        <nav className="space-y-1.5">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Alt Bilgi / Ayarlar */}
      <div className="p-4 border-t border-slate-800">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors"
        >
          <Settings className="h-4 w-4 text-slate-400" />
          <span>Sistem Ayarları</span>
        </Link>
      </div>
    </aside>
  );
};
