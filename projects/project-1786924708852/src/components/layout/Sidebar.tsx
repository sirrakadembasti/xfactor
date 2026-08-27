'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  GraduationCap,
  BookmarkCheck,
  BarChart3,
  Settings,
  X,
  Library,
  ShieldAlert,
} from 'lucide-react';
import { UserProfile } from './UserProfileMenu';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  roles: ('admin' | 'teacher')[];
  badge?: string;
}

export const navItems: NavItem[] = [
  {
    title: 'Genel Bakış',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin'],
  },
  {
    title: 'Kitap Kataloğu',
    href: '/dashboard/books',
    icon: BookOpen,
    roles: ['admin', 'teacher'],
  },
  {
    title: 'Öğretmen Yönetimi',
    href: '/dashboard/teachers',
    icon: Users,
    roles: ['admin'],
  },
  {
    title: 'Sınıflar & Öğrenciler',
    href: '/dashboard/classes',
    icon: GraduationCap,
    roles: ['admin', 'teacher'],
  },
  {
    title: 'Okuma Takibi',
    href: '/dashboard/reading-tracker',
    icon: BookmarkCheck,
    roles: ['admin', 'teacher'],
  },
  {
    title: 'Raporlar & Analiz',
    href: '/dashboard/reports',
    icon: BarChart3,
    roles: ['admin'],
  },
  {
    title: 'Sistem Ayarları',
    href: '/dashboard/settings',
    icon: Settings,
    roles: ['admin'],
  },
];

interface SidebarProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const filteredNavItems = navItems.filter((item) => {
    if (user.role === 'admin') {
      return true;
    }
    return item.roles.includes(user.role);
  });

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 bg-slate-950/50 border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-lg text-white">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <Library className="w-5 h-5" />
            </div>
            <span className="tracking-wide">OkulKütüphane</span>
          </Link>

          <button
            onClick={onClose}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 mx-3 my-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Aktif Rol
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">
              {user.role === 'admin' ? 'Yönetici Paneli' : 'Öğretmen Paneli'}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                user.role === 'admin'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}
            >
              {user.role.toUpperCase()}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 px-3 py-2 uppercase tracking-wider">
            Menü
          </div>

          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="flex-1">{item.title}</span>
                {item.badge && (
                  <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {user.role === 'teacher' && (
          <div className="p-3 mx-3 mb-4 bg-amber-900/20 border border-amber-700/30 rounded-lg text-amber-200/80 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>Öğretmen modundasınız. Yönetici yetkileri kısıtlanmıştır.</span>
          </div>
        )}

        <div className="p-4 text-xs text-slate-500 border-t border-slate-800 text-center">
          v1.0.0 &copy; 2025 OkulKütüphane
        </div>
      </aside>
    </>
  );
}
