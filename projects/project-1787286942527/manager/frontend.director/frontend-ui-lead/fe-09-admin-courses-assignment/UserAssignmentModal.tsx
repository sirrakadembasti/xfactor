'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

export interface AssignedUser {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'TEACHER';
  gradeLevel?: number;
}

interface UserAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  initialAssignedUserIds?: string[];
  onAssignSuccess?: () => void;
}

export const UserAssignmentModal: React.FC<UserAssignmentModalProps> = ({
  isOpen,
  onClose,
  courseId,
  courseTitle,
  initialAssignedUserIds = [],
  onAssignSuccess,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'STUDENT' | 'TEACHER'>('ALL');
  const [users, setUsers] = useState<AssignedUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(initialAssignedUserIds);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedUserIds(initialAssignedUserIds);
      fetchUsers();
    }
  }, [isOpen, courseId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Kullanıcılar yüklenirken bir hata oluştu.');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Veriler alınamadı';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = (filteredIds: string[]) => {
    const allSelected = filteredIds.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedUserIds }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Atama işlemi başarısız oldu.');
      }

      toast.success('Kullanıcı atamaları başarıyla güncellendi.');
      onAssignSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Kayıt sırasında bir hata oluştu.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredIds = filteredUsers.map((u) => u.id);
  const isAllFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedUserIds.includes(id));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Kullanıcı Ata: ${courseTitle}`}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="İsim veya e-posta ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRoleFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                roleFilter === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Tümü
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('TEACHER')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                roleFilter === 'TEACHER'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Öğretmenler
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('STUDENT')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                roleFilter === 'STUDENT'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Öğrenciler
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b pb-2 text-sm text-gray-500 dark:text-gray-400">
          <span>{filteredUsers.length} kullanıcı bulundu ({selectedUserIds.length} seçildi)</span>
          {filteredUsers.length > 0 && (
            <button
              type="button"
              onClick={() => handleSelectAll(filteredIds)}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              {isAllFilteredSelected ? 'Filtrelenenlerin Seçimini Kaldır' : 'Filtrelenenleri Seç'}
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border rounded-lg p-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Kullanıcılar yükleniyor...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">Eşleşen kullanıcı bulunamadı.</div>
          ) : (
            filteredUsers.map((user) => {
              const isSelected = selectedUserIds.includes(user.id);
              return (
                <label
                  key={user.id}
                  className="flex items-center justify-between p-2.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleUser(user.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        user.role === 'TEACHER'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      }`}
                    >
                      {user.role === 'TEACHER' ? 'Öğretmen' : `Öğrenci ${user.gradeLevel ? `(${user.gradeLevel}. Sınıf)` : ''}`}
                    </span>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            İptal
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Kaydediliyor...' : 'Atamaları Kaydet'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
