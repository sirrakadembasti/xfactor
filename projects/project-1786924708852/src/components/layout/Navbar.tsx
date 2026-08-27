'use client';

import React from 'react';
import { Menu, Bell, Search } from 'lucide-react';
import UserProfileMenu, { UserProfile } from './UserProfileMenu';

interface NavbarProps {
  user: UserProfile;
  onToggleSidebar: () => void;
  onRoleChange?: (role: 'admin' | 'teacher') => void;
  onLogout?: () => void;
  title?: string;
}

export default function Navbar({
  user,
  onToggleSidebar,
  onRoleChange,
  onLogout,
  title = 'Dashboard',
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
          aria-label="Menüyü Aç/Kapat"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-lg font-semibold text-gray-800 hidden sm:block">{title}</h1>
      </div>

      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Kitap, öğrenci veya sınıf ara..."
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Bildirimler"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-600 rounded-full ring-2 ring-white"></span>
        </button>

        <div className="h-6 w-px bg-gray-200"></div>

        <UserProfileMenu user={user} onRoleChange={onRoleChange} onLogout={onLogout} />
      </div>
    </header>
  );
}
