'use client';

import React, { useState } from 'react';
import { QuestionFilterBar } from '@/components/teacher/QuestionFilterBar';
import { QuestionList } from '@/components/teacher/QuestionList';
import { QuestionModal } from '@/components/teacher/QuestionModal';

export interface QuestionItem {
  id: string;
  subject: string;
  topic: string;
  text: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
  }[];
}

export default function TeacherQuestionsPage() {
  const [questions, setQuestions] = useState<QuestionItem[]>([
    {
      id: '1',
      subject: 'Matematik',
      topic: 'Türev',
      text: 'f(x) = 3x^2 + 5x - 2 fonksiyonunun x=2 noktasındaki türevi kaçtır?',
      difficulty: 'MEDIUM',
      points: 10,
      options: [
        { id: '1a', text: '17', isCorrect: true },
        { id: '1b', text: '12', isCorrect: false },
        { id: '1c', text: '15', isCorrect: false },
        { id: '1d', text: '21', isCorrect: false },
      ],
    },
    {
      id: '2',
      subject: 'Fizik',
      topic: 'Kuvvet ve Hareket',
      text: 'Sürtünmesiz ortamda serbest düşmeye bırakılan bir cismin 3. saniyedeki hızı nedir? (g=10 m/s²)',
      difficulty: 'EASY',
      points: 10,
      options: [
        { id: '2a', text: '30 m/s', isCorrect: true },
        { id: '2b', text: '45 m/s', isCorrect: false },
        { id: '2c', text: '15 m/s', isCorrect: false },
        { id: '2d', text: '60 m/s', isCorrect: false },
      ],
    },
  ]);

  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);

  const handleSaveQuestion = (questionData: Partial<QuestionItem>) => {
    if (editingQuestion) {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === editingQuestion.id ? ({ ...q, ...questionData } as QuestionItem) : q
        )
      );
    } else {
      const newQ: QuestionItem = {
        id: Date.now().toString(),
        subject: questionData.subject || 'Genel',
        topic: questionData.topic || 'Genel Konu',
        text: questionData.text || '',
        difficulty: questionData.difficulty || 'MEDIUM',
        points: questionData.points || 10,
        options: questionData.options || [],
      };
      setQuestions((prev) => [newQ, ...prev]);
    }
    setIsModalOpen(false);
    setEditingQuestion(null);
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const filteredQuestions = questions.filter((q) => {
    const matchSearch = q.text.toLowerCase().includes(search.toLowerCase()) || q.topic.toLowerCase().includes(search.toLowerCase());
    const matchSubject = selectedSubject === 'ALL' || q.subject === selectedSubject;
    const matchDifficulty = selectedDifficulty === 'ALL' || q.difficulty === selectedDifficulty;
    return matchSearch && matchSubject && matchDifficulty;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 dark:border-slate-800 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Soru Bankası</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Sınavlarınızda kullanabileceğiniz soruları oluşturun, düzenleyin ve filtreleyin.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingQuestion(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Yeni Soru Ekle
        </button>
      </div>

      <QuestionFilterBar
        search={search}
        onSearchChange={setSearch}
        selectedSubject={selectedSubject}
        onSubjectChange={setSelectedSubject}
        selectedDifficulty={selectedDifficulty}
        onDifficultyChange={setSelectedDifficulty}
      />

      <div className="mt-6">
        <QuestionList
          questions={filteredQuestions}
          onEdit={(q) => {
            setEditingQuestion(q);
            setIsModalOpen(true);
          }}
          onDelete={handleDeleteQuestion}
        />
      </div>

      {isModalOpen && (
        <QuestionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveQuestion}
          initialData={editingQuestion}
        />
      )}
    </div>
  );
}
