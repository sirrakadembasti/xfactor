'use client';

import React from 'react';
import Link from 'next/link';
import {
  Menu,
  Bell,
  Globe,
  User,
  ShieldCheck,
} from 'lucide-react';

interface AdminTopbarProps {
  onToggleSidebar?: () => void;
  title?: string;
  pendingInquiriesCount?: number;
  adminName?: string;
  adminRole?: string;
}

export function AdminTopbar({
  onToggleSidebar,
  title = 'Yönetim Paneli',
  pendingInquiriesCount = 0,
  adminName = 'Yönetici',
  adminRole = 'Sistem Yöneticisi',
}: AdminTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 lg:px-8 backdrop-blur">
      {/* Left section: Hamburger button & page title */}
      <div className="flex items-center gap-3 lg:gap-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Menüyü Aç/Kapat"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-800 leading-tight lg:text-xl">
            {title}
          </h1>
        </div>
      </div>

      {/* Right section: Quick actions, notifications & profile */}
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Website link */}
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-600"
          title="Siteyi Yeni Sekmede Aç"
        >
          <Globe className="h-4 w-4" />
          <span>Siteyi Gör</span>
        </Link>

        {/* Notification / Inquiries Badge */}
        <Link
          href="/admin/inquiries"
          className="relative inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          title="Talepler"
        >
          <Bell className="h-5 w-5" />
          {pendingInquiriesCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
              {pendingInquiriesCount > 99 ? '99+' : pendingInquiriesCount}
            </span>
          )}
        </Link>

        <div className="h-6 w-px bg-slate-200" />

        {/* Admin profile snippet */}
        <div className="flex items-center gap-3 pl-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden md:flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800">{adminName}</span>
              <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-[11px] text-slate-500">{adminRole}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
