'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { UserAssignmentModal } from '@/components/admin/UserAssignmentModal';
import { toast } from 'sonner';

export interface Course {
  id: string;
  code: string;
  name: string;
  description?: string;
  gradeLevel: number;
  isActive: boolean;
  _count?: {
    users: number;
    topics: number;
  };
  assignedUserIds?: string[];
}

interface CourseFormData {
  code: string;
  name: string;
  description: string;
  gradeLevel: number;
  isActive: boolean;
}

const initialFormData: CourseFormData = {
  code: '',
  name: '',
  description: '',
  gradeLevel: 9,
  isActive: true,
};

export const CourseManager: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');

  const [formModalOpen, setFormModalOpen] = useState<boolean>(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState<CourseFormData>(initialFormData);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [assignmentModalOpen, setAssignmentModalOpen] = useState<boolean>(false);
  const [selectedCourseForAssignment, setSelectedCourseForAssignment] = useState<Course | null>(null);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/courses');
      if (!res.ok) throw new Error('Ders listesi yüklenemedi.');
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingCourse(null);
    setFormData(initialFormData);
    setFormModalOpen(true);
  };

  const handleOpenEditModal = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      code: course.code,
      name: course.name,
      description: course.description || '',
      gradeLevel: course.gradeLevel,
      isActive: course.isActive,
    });
    setFormModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error('Ders adı ve ders kodu zorunludur.');
      return;
    }

    setSubmitting(true);
    try {
      const url = editingCourse ? `/api/admin/courses/${editingCourse.id}` : '/api/admin/courses';
      const method = editingCourse ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'İşlem başarısız.');
      }

      toast.success(editingCourse ? 'Ders başarıyla güncellendi.' : 'Ders başarıyla eklendi.');
      setFormModalOpen(false);
      fetchCourses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kaydetme hatası';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCourse = async (courseId: string, courseName: string) => {
    if (!window.confirm(`"${courseName}" dersini silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Ders silinemedi.');
      }

      toast.success('Ders başarıyla silindi.');
      fetchCourses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Silme hatası';
      toast.error(msg);
    }
  };

  const handleOpenAssignment = (course: Course) => {
    setSelectedCourseForAssignment(course);
    setAssignmentModalOpen(true);
  };

  const filteredCourses = courses.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                          c.code.toLowerCase().includes(search.toLowerCase());
    const matchesGrade = gradeFilter === 'ALL' || c.gradeLevel.toString() === gradeFilter;
    return matchesSearch && matchesGrade;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Müfredat ve Ders Yönetimi</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tüm dersleri tanımlayın, düzenleyin ve kullanıcı atamalarını yönetin.</p>
        </div>
        <Button onClick={handleOpenCreateModal}>+ Yeni Ders Ekle</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <Input
          placeholder="Ders adı veya kodu ile ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sınıf:</label>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="ALL">Tümü</option>
            <option value="9">9. Sınıf</option>
            <option value="10">10. Sınıf</option>
            <option value="11">11. Sınıf</option>
            <option value="12">12. Sınıf</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Dersler yükleniyor...</div>
      ) : filteredCourses.length === 0 ? (
        <div className="py-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-gray-500">
          Eşleşen ders bulunamadı.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3.5">Kod</th>
                <th className="px-6 py-3.5">Ders Adı</th>
                <th className="px-6 py-3.5">Sınıf Düzeyi</th>
                <th className="px-6 py-3.5">Kayıtlı Kişi</th>
                <th className="px-6 py-3.5">Durum</th>
                <th className="px-6 py-3.5 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredCourses.map((course) => (
                <tr key={course.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-6 py-4 font-mono font-medium text-gray-900 dark:text-gray-100">
                    {course.code}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{course.name}</div>
                    {course.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                        {course.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-750/10 dark:bg-blue-900/30 dark:text-blue-300">
                      {course.gradeLevel}. Sınıf
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                    {course._count?.users ?? 0} Kullanıcı
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        course.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {course.isActive ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAssignment(course)}
                    >
                      Kullanıcı Ata
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEditModal(course)}
                    >
                      Düzenle
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteCourse(course.id, course.name)}
                    >
                      Sil
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title={editingCourse ? 'Dersi Düzenle' : 'Yeni Ders Oluştur'}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ders Kodu *
            </label>
            <Input
              placeholder="Örn: MAT-101"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ders Adı *
            </label>
            <Input
              placeholder="Örn: Temel Matematik"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sınıf Seviyesi
            </label>
            <select
              value={formData.gradeLevel}
              onChange={(e) => setFormData({ ...formData, gradeLevel: Number(e.target.value) })}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value={9}>9. Sınıf</option>
              <option value={10}>10. Sınıf</option>
              <option value={11}>11. Sınıf</option>
              <option value={12}>12. Sınıf</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Açıklama
            </label>
            <textarea
              rows={3}
              placeholder="Ders hakkında kısa açıklama..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300 font-medium">
              Ders Aktif
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" type="button" onClick={() => setFormModalOpen(false)} disabled={submitting}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : editingCourse ? 'Güncelle' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </Modal>

      {selectedCourseForAssignment && (
        <UserAssignmentModal
          isOpen={assignmentModalOpen}
          onClose={() => {
            setAssignmentModalOpen(false);
            setSelectedCourseForAssignment(null);
          }}
          courseId={selectedCourseForAssignment.id}
          courseTitle={selectedCourseForAssignment.name}
          initialAssignedUserIds={selectedCourseForAssignment.assignedUserIds || []}
          onAssignSuccess={fetchCourses}
        />
      )}
    </div>
  );
};
