'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, GraduationCap, Shield } from 'lucide-react';
import { NAVIGATION_ITEMS } from './Sidebar';

export default function MobileNav({ isOpen, onClose, userRole = 'admin' }) {
  const pathname = usePathname();

  if (!isOpen) return null;

  const filteredNavItems = NAVIGATION_ITEMS.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative flex-1 max-w-xs w-full bg-slate-900 text-slate-100 h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-100 text-base">EduPortal</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Banner */}
        <div className="mx-3 mt-3 px-3 py-2 bg-slate-800/80 rounded-lg flex items-center gap-2 border border-slate-700/50">
          <Shield className="w-4 h-4 text-indigo-400" />
          <span className="text-xs text-slate-300 font-medium">
            Aktif Rol: <strong className="text-indigo-400 capitalize">{userRole}</strong>
          </span>
        </div>

        {/* Navigation items */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="flex-1">{item.title}</span>
                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      item.badgeColor || 'bg-slate-800 text-indigo-300 border border-indigo-500/30'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
          EduPortal AI v2.4 • 2025
        </div>
      </div>
    </div>
  );
}
