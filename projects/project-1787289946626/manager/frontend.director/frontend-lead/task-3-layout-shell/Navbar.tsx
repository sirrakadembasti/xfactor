'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Bell, ChevronDown, LogOut, Shield, UserCircle, RefreshCw } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  INVESTOR: 'Yatırımcı',
  PORTFOLIO_MANAGER: 'Portföy Yöneticisi',
  ANALYST: 'Finansal Analist',
  AUDITOR: 'Denetçi'
};

const ROLES: Array<'INVESTOR' | 'PORTFOLIO_MANAGER' | 'ANALYST' | 'AUDITOR'> = [
  'INVESTOR',
  'PORTFOLIO_MANAGER',
  'ANALYST',
  'AUDITOR'
];

export const Navbar: React.FC = () => {
  const { user, role, switchRole, logout } = useAuth();
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-800 bg-slate-900/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 md:hidden">
          <span className="text-lg font-bold tracking-tight text-white">InvestPulse</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Rol Değiştirici Butonu ve Açılır Menü */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsRoleMenuOpen(!isRoleMenuOpen);
              setIsProfileMenuOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            <Shield className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline text-slate-400">Aktif Rol:</span>
            <span className="font-semibold text-indigo-300">{role ? ROLE_LABELS[role] : 'Rol Seçilmedi'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {isRoleMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-2xl ring-1 ring-black/50 z-50">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Rolü Simüle Et
              </div>
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    switchRole(r);
                    setIsRoleMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                    role === r
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{ROLE_LABELS[r]}</span>
                  {role === r && <RefreshCw className="h-3 w-3 animate-spin" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bildirim Butonu */}
        <button
          type="button"
          className="relative rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 transition-colors hover:border-slate-700 hover:text-white"
          aria-label="Bildirimler"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-slate-900" />
        </button>

        {/* Profil ve Çıkış Menüsü */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsProfileMenuOpen(!isProfileMenuOpen);
              setIsRoleMenuOpen(false);
            }}
            className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900 p-1.5 pr-3 transition-colors hover:border-slate-700"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600/20 text-indigo-400 font-semibold text-xs border border-indigo-500/30">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-medium text-slate-200 leading-none">{user?.name || 'Kullanıcı'}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{user?.email || 'kullanici@finans.com'}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-2xl ring-1 ring-black/50 z-50">
              <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                <p className="text-xs font-semibold text-white">{user?.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Oturumu Kapat</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
