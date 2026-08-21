'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Car,
  Wrench,
  Calendar,
  FileText,
  CreditCard,
  Settings,
  ShieldCheck,
  BarChart3,
  Package,
  HelpCircle,
  ChevronRight,
  X
} from 'lucide-react';
import { useRole } from '@/context/RoleContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Genel Bakış',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'CUSTOMER']
  },
  {
    label: 'Araçlar & Filo',
    href: '/dashboard/cars',
    icon: Car,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'CUSTOMER']
  },
  {
    label: 'Randevular',
    href: '/dashboard/appointments',
    icon: Calendar,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'CUSTOMER']
  },
  {
    label: 'İş Emirleri & Servis',
    href: '/dashboard/work-orders',
    icon: Wrench,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN']
  },
  {
    label: 'Müşteriler',
    href: '/dashboard/customers',
    icon: Users,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER']
  },
  {
    label: 'Yedek Parça & Stok',
    href: '/dashboard/inventory',
    icon: Package,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER']
  },
  {
    label: 'Faturalar & Ödemeler',
    href: '/dashboard/invoices',
    icon: CreditCard,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CUSTOMER']
  },
  {
    label: 'Raporlar & Analiz',
    href: '/dashboard/reports',
    icon: BarChart3,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER']
  },
  {
    label: 'Dökümanlar',
    href: '/dashboard/documents',
    icon: FileText,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'CUSTOMER']
  },
  {
    label: 'Kullanıcı Yetkileri',
    href: '/dashboard/roles',
    icon: ShieldCheck,
    roles: ['SUPER_ADMIN', 'ADMIN']
  },
  {
    label: 'Ayarlar',
    href: '/dashboard/settings',
    icon: Settings,
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'CUSTOMER']
  }
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const { currentRole } = useRole();

  const filteredNavItems = NAV_ITEMS.filter((item) =>
    currentRole ? item.roles.includes(currentRole) : true
  );

  return (
    <>
      {/* Mobil Karartma Arka Planı */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Paneli */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 flex-col justify-between border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900 lg:static lg:flex lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Başlık */}
        <div>
          <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-900 dark:text-white leading-tight">
                  OtoServis Pro
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Servis Yönetim Sistemi
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Rol Rozeti */}
          <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Aktif Yetki
              </span>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {currentRole || 'STANDART'}
              </span>
            </div>
          </div>

          {/* Navigasyon Listesi */}
          <nav className="mt-4 space-y-1 px-4 overflow-y-auto max-h-[calc(100vh-220px)] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className={`group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-5 w-5 transition-transform duration-150 group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-400 dark:group-hover:text-slate-200'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : (
                    <ChevronRight
                      className={`h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${
                        isActive ? 'opacity-100 text-white' : 'text-slate-400'
                      }`}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Alt Bilgi / Destek */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <Link
            href="/dashboard/support"
            className="flex items-center gap-3 rounded-xl p-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <HelpCircle className="h-5 w-5 text-slate-400" />
            <div className="flex flex-col text-left">
              <span>Yardım & Destek</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">
                Kılavuz & Talep Hattı
              </span>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
};
