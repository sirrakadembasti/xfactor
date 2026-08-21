import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export interface Classroom {
  id: string;
  name: string;
  gradeLevel?: number | null;
  studentCount?: number;
  createdAt?: string | Date;
}

interface ClassroomManagerProps {
  classrooms: Classroom[];
  onCreateClassroom: (data: { name: string; gradeLevel: number }) => Promise<void>;
  onDeleteClassroom: (classroomId: string) => Promise<void>;
  isLoading?: boolean;
}

export const ClassroomManager: React.FC<ClassroomManagerProps> = ({
  classrooms,
  onCreateClassroom,
  onDeleteClassroom,
  isLoading = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState<number>(9);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenModal = () => {
    setName('');
    setGradeLevel(9);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Lütfen sınıf adı giriniz.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onCreateClassroom({
        name: name.trim(),
        gradeLevel: Number(gradeLevel),
      });
      handleCloseModal();
    } catch (err: any) {
      setErrorMessage(err.message || 'Sınıf oluşturulurken bir hata meydana geldi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu sınıfı silmek istediğinize emin misiniz?')) {
      return;
    }
    try {
      setDeleteTargetId(id);
      await onDeleteClassroom(id);
    } catch (err: any) {
      alert(err.message || 'Sınıf silinirken hata oluştu.');
    } finally {
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Sınıf Yönetimi
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Okul bünyesindeki aktif şubeleri ve sınıfları yönetin.
          </p>
        </div>
        <Button onClick={handleOpenModal} className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Yeni Sınıf Ekle
        </Button>
      </div>

      <Card className="border border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle>Mevcut Sınıflar</CardTitle>
          <CardDescription>
            Toplam {classrooms.length} sınıf bulunmaktadır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : classrooms.length === 0 ? (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400">
              Henüz kayıtlı sınıf bulunmamaktadır. "Yeni Sınıf Ekle" butonu ile ekleyebilirsiniz.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white uppercase text-xs tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Sınıf Adı</th>
                    <th className="px-6 py-3 font-semibold">Kademe / Sınıf Seviyesi</th>
                    <th className="px-6 py-3 font-semibold">Öğrenci Sayısı</th>
                    <th className="px-6 py-3 font-semibold text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {classrooms.map((cls) => (
                    <tr
                      key={cls.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                        {cls.name}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          {cls.gradeLevel ? `${cls.gradeLevel}. Sınıf` : 'Belirtilmemiş'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {cls.studentCount ?? 0} Öğrenci
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(cls.id)}
                          disabled={deleteTargetId === cls.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/40"
                        >
                          {deleteTargetId === cls.id ? 'Siliniyor...' : 'Sil'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Yeni Sınıf Oluştur"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg">
              {errorMessage}
            </div>
          )}
          <div>
            <label
              htmlFor="classroom-name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Sınıf Adı (Örn: 9-A, 11-B Fen)
            </label>
            <input
              id="classroom-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sınıf adını girin"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
              required
            />
          </div>

          <div>
            <label
              htmlFor="grade-level"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Sınıf Seviyesi
            </label>
            <select
              id="grade-level"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
            >
              <option value={5}>5. Sınıf</option>
              <option value={6}>6. Sınıf</option>
              <option value={7}>7. Sınıf</option>
              <option value={8}>8. Sınıf</option>
              <option value={9}>9. Sınıf</option>
              <option value={10}>10. Sınıf</option>
              <option value={11}>11. Sınıf</option>
              <option value={12}>12. Sınıf</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseModal}
              disabled={isSubmitting}
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
