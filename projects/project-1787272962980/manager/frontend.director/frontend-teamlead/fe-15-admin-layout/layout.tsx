'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  FolderTree,
  MessageSquare,
  Settings,
  ExternalLink,
  Menu,
  X,
  Building2,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  exact?: boolean;
}

const navItems: NavItem[] = [
  {
    label: 'Kontrol Paneli',
    href: '/admin',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'İlan Yönetimi',
    href: '/admin/properties',
    icon: Home,
  },
  {
    label: 'Kategoriler',
    href: '/admin/categories',
    icon: FolderTree,
  },
  {
    label: 'Gelen Talepler',
    href: '/admin/inquiries',
    icon: MessageSquare,
  },
  {
    label: 'Genel Ayarlar',
    href: '/admin/settings',
    icon: Settings,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Sayfa değiştiğinde mobil menüyü kapat
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const isLinkActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Mobil Menü Arka Planı */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Başlığı */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
          <Link href="/admin" className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-white hover:opacity-90">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <span>Admin Panel</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg lg:hidden hover:bg-slate-800 transition-colors"
            aria-label="Menüyü Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigasyon Linkleri */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Yönetim Menüsü
          </div>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isLinkActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {active && <ChevronRight className="w-4 h-4 opacity-70" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Alt Panel Bilgisi ve Web Sitesine Git Linki */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/60 hover:bg-slate-800 hover:text-white transition-colors border border-slate-700/50"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              Siteyi Görüntüle
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Yeni Sekme</span>
          </Link>

          <div className="flex items-center gap-3 px-3.5 py-2 bg-slate-950/40 rounded-lg text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div className="truncate">
              <p className="font-medium text-slate-200 truncate">Yönetici Hesabı</p>
              <p className="text-[10px] text-slate-500">Güvenli Oturum</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Ana İçerik Kapsayıcısı */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Üst Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg lg:hidden hover:bg-slate-100 transition-colors"
              aria-label="Menüyü Aç"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 font-medium">
              <Link href="/admin" className="hover:text-slate-800 transition-colors">
                Admin
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-800 capitalize font-semibold">
                {pathname === '/admin'
                  ? 'Kontrol Paneli'
                  : pathname.split('/')[2]?.replace(/-/g, ' ') || 'Panel'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors border border-slate-200"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Canlı Site</span>
            </Link>
          </div>
        </header>

        {/* Dinamik Sayfa İçeriği */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
