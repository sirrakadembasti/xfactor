'use client';

import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Settings, Shield, ChevronDown } from 'lucide-react';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'teacher';
  avatarUrl?: string;
}

interface UserProfileMenuProps {
  user?: UserProfile;
  onLogout?: () => void;
  onRoleChange?: (role: 'admin' | 'teacher') => void;
}

export default function UserProfileMenu({
  user = {
    id: '1',
    name: 'Ahmet Yılmaz',
    email: 'ahmet@okulapp.com',
    role: 'admin',
  },
  onLogout,
  onRoleChange,
}: UserProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roleLabels = {
    admin: { label: 'Yönetici (Admin)', badgeBg: 'bg-purple-100 text-purple-800 border-purple-200' },
    teacher: { label: 'Öğretmen', badgeBg: 'bg-blue-100 text-blue-800 border-blue-200' },
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-100 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center font-semibold text-sm shadow-sm ring-2 ring-white">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            getInitials(user.name)
          )}
        </div>
        <div className="hidden md:flex flex-col text-left">
          <span className="text-sm font-semibold text-gray-800 leading-tight">{user.name}</span>
          <span className="text-xs text-gray-500 capitalize">{user.role === 'admin' ? 'Sistem Yöneticisi' : 'Öğretmen'}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${roleLabels[user.role]?.badgeBg}`}>
                <Shield className="w-3 h-3 mr-1" />
                {roleLabels[user.role]?.label}
              </span>
            </div>
          </div>

          {onRoleChange && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Rol Değiştir (Test)</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onRoleChange('admin');
                    setIsOpen(false);
                  }}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                    user.role === 'admin' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRoleChange('teacher');
                    setIsOpen(false);
                  }}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                    user.role === 'teacher' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  Öğretmen
                </button>
              </div>
            </div>
          )}

          <div className="py-1">
            <a
              href="#profile"
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <User className="w-4 h-4 mr-3 text-gray-400" />
              Profil Bilgileri
            </a>
            <a
              href="#settings"
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="w-4 h-4 mr-3 text-gray-400" />
              Ayarlar
            </a>
          </div>

          <div className="border-t border-gray-100 pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                if (onLogout) onLogout();
              }}
              className="w-full text-left flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-3 text-red-500" />
              Oturumu Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
