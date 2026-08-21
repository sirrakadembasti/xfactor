'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Menu, Bell, Search, Sun, Moon, LogOut, User } from 'lucide-react';
import { useRole } from '@/context/RoleContext';
import Link from 'next/link';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentRole, setRole } = useRole();

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans antialiased">
      {/* Sidebar Navigasyonu */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Ana İçerik Kapsayıcısı */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header / Üst Çubuk */}
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-4 sm:px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            {/* Mobil Menü Butonu */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
              aria-label="Menüyü Aç"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Hızlı Arama Barı */}
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Plaka, müşteri adı veya iş emri ara..."
                className="w-72 md:w-96 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:focus:border-blue-500"
              />
            </div>
          </div>

          {/* Sağ Eylem Araçları */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Rol Değiştirici Demo Seçimi */}
            <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 pl-2">
                Rol Simülasyonu:
              </span>
              <select
                value={currentRole || 'ADMIN'}
                onChange={(e) => setRole(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 border-none outline-none focus:ring-0 cursor-pointer"
              >
                <option value="SUPER_ADMIN" className="dark:bg-slate-800">SUPER_ADMIN</option>
                <option value="ADMIN" className="dark:bg-slate-800">ADMIN</option>
                <option value="MANAGER" className="dark:bg-slate-800">MANAGER</option>
                <option value="TECHNICIAN" className="dark:bg-slate-800">TECHNICIAN</option>
                <option value="CUSTOMER" className="dark:bg-slate-800">CUSTOMER</option>
              </select>
            </div>

            {/* Bildirimler */}
            <button
              type="button"
              className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              aria-label="Bildirimler"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />
            </button>

            {/* Kullanıcı Profili Menü */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold text-sm shadow-sm">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                  Yetkili Kullanıcı
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {currentRole || 'ADMIN'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Dinamik Sayfa İçeriği */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-950">
          <div className="mx-auto max-w-7xl space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
