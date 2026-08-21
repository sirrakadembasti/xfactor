'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export interface QuestionData {
  id?: string;
  title: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'OPEN_ENDED';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  options: { id?: string; text: string; isCorrect: boolean }[];
  rubric?: string;
  courseId?: string;
}

interface QuestionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: QuestionData) => void;
  initialData?: QuestionData | null;
}

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'OPEN_ENDED'>('MULTIPLE_CHOICE');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [points, setPoints] = useState(10);
  const [options, setOptions] = useState<{ text: string; isCorrect: boolean }[]>([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);
  const [rubric, setRubric] = useState('');

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setType(initialData.type || 'MULTIPLE_CHOICE');
      setDifficulty(initialData.difficulty || 'MEDIUM');
      setPoints(initialData.points || 10);
      setOptions(
        initialData.options && initialData.options.length > 0
          ? initialData.options
          : [
              { text: '', isCorrect: true },
              { text: '', isCorrect: false },
            ]
      );
      setRubric(initialData.rubric || '');
    } else {
      setTitle('');
      setType('MULTIPLE_CHOICE');
      setDifficulty('MEDIUM');
      setPoints(10);
      setOptions([
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
      ]);
      setRubric('');
    }
  }, [initialData, isOpen]);

  const handleOptionTextChange = (index: number, text: string) => {
    const newOpts = [...options];
    newOpts[index].text = text;
    setOptions(newOpts);
  };

  const handleSetCorrect = (index: number) => {
    const newOpts = options.map((opt, i) => ({
      ...opt,
      isCorrect: i === index,
    }));
    setOptions(newOpts);
  };

  const handleAddOption = () => {
    setOptions([...options, { text: '', isCorrect: false }]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id,
      title,
      type,
      difficulty,
      points: Number(points),
      options,
      rubric,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Soruyu Düzenle' : 'Yeni Soru Oluştur'}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Soru Metni"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Soru içeriğini buraya girin..."
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Soru Tipi
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="MULTIPLE_CHOICE">Çoktan Seçmeli</option>
              <option value="TRUE_FALSE">Doğru / Yanlış</option>
              <option value="OPEN_ENDED">Açık Uçlu (Klasik)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Zorluk Seviyesi
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="EASY">Kolay</option>
              <option value="MEDIUM">Orta</option>
              <option value="HARD">Zor</option>
            </select>
          </div>

          <Input
            label="Puan Değeri"
            type="number"
            min={1}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            required
          />
        </div>

        {type !== 'OPEN_ENDED' ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Seçenekler ve Doğru Cevap
            </label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correctAnswer"
                  checked={opt.isCorrect}
                  onChange={() => handleSetCorrect(idx)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  value={opt.text}
                  onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                  placeholder={`Seçenek ${idx + 1}`}
                  className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    className="text-rose-500 hover:text-rose-700 p-1 text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {type === 'MULTIPLE_CHOICE' && (
              <Button type="button" variant="outline" size="sm" onClick={handleAddOption}>
                + Seçenek Ekle
              </Button>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Değerlendirme Rubriği / Çözüm Anahtarı
            </label>
            <textarea
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              placeholder="Öğretmenin değerlendirirken dikkat edeceği kriterler..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose}>
            İptal
          </Button>
          <Button type="submit" variant="primary">
            Kaydet
          </Button>
        </div>
      </form>
    </Modal>
  );
};
