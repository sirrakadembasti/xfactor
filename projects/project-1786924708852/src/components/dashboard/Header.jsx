'use client';

import React from 'react';
import { Menu, Search, Bell, Sparkles } from 'lucide-react';
import UserMenu from './UserMenu';

export default function Header({
  user,
  onRoleChange,
  onOpenMobileNav,
}) {
  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      {/* Left side: Mobile menu toggle + Search */}
      <div className="flex items-center gap-3 md:gap-4 flex-1 max-w-xl">
        <button
          onClick={onOpenMobileNav}
          className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Menüyü Aç"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Global Search Bar */}
        <div className="relative w-full max-w-xs sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Ders, öğrenci veya ödev ara..."
            className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-transparent transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Right side: AI Quick action, Notifications & User Menu */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Quick AI Tag */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-semibold border border-indigo-100 dark:border-indigo-900">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
          <span>AI Modu Aktif</span>
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Bildirimler"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
        </button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

        {/* User Menu */}
        <UserMenu user={user} onRoleChange={onRoleChange} />
      </div>
    </header>
  );
}
