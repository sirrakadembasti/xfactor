'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Plus, Users, School } from 'lucide-react';

interface Classroom {
  id: string;
  name: string;
  grade: string;
  studentCount?: number;
}

interface ClassroomManagerProps {
  initialClassrooms?: Classroom[];
}

export function ClassroomManager({ initialClassrooms = [] }: ClassroomManagerProps) {
  const [classrooms, setClassrooms] = useState<Classroom[]>(initialClassrooms);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('9. Sınıf');

  const handleAddClassroom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newClassroom: Classroom = {
      id: `class-${Date.now()}`,
      name: newName.trim(),
      grade: newGrade,
      studentCount: 0
    };

    setClassrooms([...classrooms, newClassroom]);
    setNewName('');
    setIsModalOpen(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <School size={18} className="text-indigo-600" /> Sınıf ve Şube Yönetimi
          </h3>
          <p className="text-xs text-gray-500 mt-1">Okuldaki aktif sınıfları ve şubeleri yönetin</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} size="sm" className="flex items-center gap-1.5">
          <Plus size={14} /> Yeni Sınıf Ekle
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classrooms.map((cls) => (
          <div key={cls.id} className="p-4 rounded-xl border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/20 transition flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
                {cls.name.slice(0, 2)}
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">{cls.name}</h4>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Users size={12} /> {cls.studentCount || 0} Öğrenci
                </p>
              </div>
            </div>
            <Badge variant="purple">{cls.grade}</Badge>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Yeni Sınıf Oluştur">
        <form onSubmit={handleAddClassroom} className="space-y-4">
          <Input
            label="Sınıf/Şube Adı"
            placeholder="Örn: 10-C Sınıfı"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Seviye / Kademe</label>
            <select
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="9. Sınıf">9. Sınıf</option>
              <option value="10. Sınıf">10. Sınıf</option>
              <option value="11. Sınıf">11. Sınıf</option>
              <option value="12. Sınıf">12. Sınıf</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit">
              Oluştur
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
