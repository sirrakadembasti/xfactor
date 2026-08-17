'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { User, Settings, LogOut, Shield, ChevronDown } from 'lucide-react';

export default function UserMenu({ user, onRoleChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roles = [
    { id: 'admin', label: 'Yönetici' },
    { id: 'teacher', label: 'Öğretmen' },
    { id: 'student', label: 'Öğrenci' },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            user?.name?.slice(0, 2).toUpperCase() || 'TR'
          )}
        </div>
        <div className="hidden sm:flex flex-col text-left">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">
            {user?.name || 'Ahmet Yılmaz'}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
            {user?.role === 'admin' ? 'Okul Yöneticisi' : user?.role === 'teacher' ? 'Matematik Öğretmeni' : 'Öğrenci'}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Giriş Yapılan Hesap</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1">{user?.email || 'ahmet@okul.k12.tr'}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
              <Shield className="w-3 h-3" />
              <span className="capitalize">{user?.role || 'admin'} Rolü Aktif</span>
            </div>
          </div>

          {/* Quick Role Switcher for Demo/RBAC Testing */}
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Rol Değiştir (Test):</p>
            <div className="grid grid-cols-3 gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-lg">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onRoleChange && onRoleChange(r.id);
                    setIsOpen(false);
                  }}
                  className={`text-xs py-1 rounded-md transition-all font-medium ${
                    user?.role === r.id
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/dashboard/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <User className="w-4 h-4 text-slate-400" />
              Profilim
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              Sistem Ayarları
            </Link>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-1 mt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                alert('Çıkış yapıldı.');
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Oturumu Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
