'use client';

import React, { useState, useMemo } from 'react';
import { User, Role } from '@/types';
import {
  Search,
  Filter,
  Shield,
  GraduationCap,
  UserCheck,
  MoreVertical,
  Trash2,
  Edit3,
  UserX,
  Mail,
  Calendar,
  RefreshCw,
} from 'lucide-react';

interface UserManagementTableProps {
  users: User[];
  isLoading?: boolean;
  onDeleteUser?: (userId: string) => Promise<void> | void;
  onChangeRole?: (userId: string, newRole: Role) => Promise<void> | void;
  onRefresh?: () => void;
}

export const UserManagementTable: React.FC<UserManagementTableProps> = ({
  users,
  isLoading = false,
  onDeleteUser,
  onChangeRole,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesQuery =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const toggleSelectAll = () => {
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map((u) => u.id));
    }
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
            <Shield className="h-3.5 w-3.5" />
            Yönetici
          </span>
        );
      case 'TEACHER':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            <UserCheck className="h-3.5 w-3.5" />
            Öğretmen
          </span>
        );
      case 'STUDENT':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <GraduationCap className="h-3.5 w-3.5" />
            Öğrenci
          </span>
        );
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Üst Filtreleme ve Arama Çubuğu */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="İsim veya e-posta ile kullanıcı ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | 'ALL')}
              className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none dark:text-slate-300"
            >
              <option value="ALL">Tüm Roller</option>
              <option value="ADMIN">Yöneticiler</option>
              <option value="TEACHER">Öğretmenler</option>
              <option value="STUDENT">Öğrenciler</option>
            </select>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Yenile"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Tablo Alanı */}
      <div className="relative overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th scope="col" className="p-4">
                <input
                  type="checkbox"
                  checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                />
              </th>
              <th scope="col" className="px-6 py-3 font-semibold">
                Kullanıcı Bilgisi
              </th>
              <th scope="col" className="px-6 py-3 font-semibold">
                Rol
              </th>
              <th scope="col" className="px-6 py-3 font-semibold">
                Kayıt Tarihi
              </th>
              <th scope="col" className="px-6 py-3 text-right font-semibold">
                İşlemler
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isLoading ? (
              [...Array(5)].map((_, index) => (
                <tr key={index} className="animate-pulse">
                  <td className="p-4">
                    <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="space-y-1">
                        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-44 rounded bg-slate-100 dark:bg-slate-800" />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="ml-auto h-8 w-8 rounded bg-slate-200 dark:bg-slate-800" />
                  </td>
                </tr>
              ))
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-500 dark:text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <UserX className="h-8 w-8 text-slate-400" />
                    <p className="font-medium">Kullanıcı bulunamadı.</p>
                    <p className="text-xs text-slate-400">
                      Arama kriterlerinizi değiştirerek tekrar deneyebilirsiniz.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedUserIds.includes(user.id);
                const isMenuOpen = activeMenuUserId === user.id;

                return (
                  <tr
                    key={user.id}
                    className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${
                      isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectUser(user.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {user.name}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(user.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() =>
                            setActiveMenuUserId(isMenuOpen ? null : user.id)
                          }
                          className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute right-0 z-20 mt-2 w-48 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-slate-400">
                              Rolü Değiştir
                            </div>
                            {user.role !== 'STUDENT' && (
                              <button
                                onClick={() => {
                                  onChangeRole?.(user.id, 'STUDENT');
                                  setActiveMenuUserId(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <GraduationCap className="h-3.5 w-3.5 text-blue-500" />
                                Öğrenci Yap
                              </button>
                            )}
                            {user.role !== 'TEACHER' && (
                              <button
                                onClick={() => {
                                  onChangeRole?.(user.id, 'TEACHER');
                                  setActiveMenuUserId(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <UserCheck className="h-3.5 w-3.5 text-purple-500" />
                                Öğretmen Yap
                              </button>
                            )}
                            {user.role !== 'ADMIN' && (
                              <button
                                onClick={() => {
                                  onChangeRole?.(user.id, 'ADMIN');
                                  setActiveMenuUserId(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <Shield className="h-3.5 w-3.5 text-rose-500" />
                                Yönetici Yap
                              </button>
                            )}
                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                            <button
                              onClick={() => {
                                onDeleteUser?.(user.id);
                                setActiveMenuUserId(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Kullanıcıyı Sil
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Alt Bilgi */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          Toplam <strong>{filteredUsers.length}</strong> kullanıcı listeleniyor
        </span>
        {selectedUserIds.length > 0 && (
          <span>
            <strong>{selectedUserIds.length}</strong> kullanıcı seçildi
          </span>
        )}
      </div>
    </div>
  );
};
