'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

interface Classroom {
  id: string;
  name: string;
  grade: string;
  studentCount: number;
}

export const ClassroomManager: React.FC = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([
    { id: '1', name: '10-A Sınıfı', grade: '10. Sınıf', studentCount: 28 },
    { id: '2', name: '11-B Sınıfı', grade: '11. Sınıf', studentCount: 32 },
    { id: '3', name: '12-C Sınıfı', grade: '12. Sınıf', studentCount: 24 },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('10. Sınıf');

  const handleAddClassroom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const newClass: Classroom = {
      id: Date.now().toString(),
      name: newName,
      grade: newGrade,
      studentCount: 0,
    };
    setClassrooms([...classrooms, newClass]);
    setNewName('');
    setIsModalOpen(false);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Şube & Sınıf Yönetimi</h3>
          <p className="text-xs text-slate-500">Okul bünyesindeki şubeleri tanımlayın ve yönetin.</p>
        </div>
        <Button size="sm" onClick={() => setIsModalOpen(true)}>
          + Yeni Sınıf Ekle
        </Button>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {classrooms.map((cls) => (
          <div key={cls.id} className="py-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">{cls.name}</p>
              <p className="text-xs text-slate-500">{cls.studentCount} Kayıtlı Öğrenci</p>
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
            <label