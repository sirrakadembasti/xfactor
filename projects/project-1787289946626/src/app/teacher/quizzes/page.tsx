"use client";

import React, { useState, useEffect } from 'react';
import { QuizListTable } from '@/components/teacher/QuizListTable';
import { QuizBuilderWizard } from '@/components/teacher/QuizBuilderWizard';

interface QuizItem {
  id: string;
  title: string;
  description?: string | null;
  duration: number;
  passingScore: number;
  startTime: string;
  endTime: string;
  isPublished: boolean;
  _count?: {
    questions: number;
    submissions: number;
  };
}

export default function TeacherQuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL');

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/exams');
      if (response.ok) {
        const data = await response.json();
        setQuizzes(data);
      }
    } catch (error) {
      console.error('Sınavlar yüklenirken hata oluştu:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm('Bu sınavı silmek istediğinize emin misiniz?')) return;
    try {
      const response = await fetch(`/api/exams/${quizId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
      } else {
        alert('Sınav silinirken bir hata oluştu.');
      }
    } catch (error) {
      console.error('Silme hatası:', error);
      alert('Sınav silinemedi.');
    }
  };

  const handleWizardSuccess = () => {
    setIsWizardOpen(false);
    fetchQuizzes();
  };

  const filteredQuizzes = quizzes.filter((quiz) => {
    const matchesSearch = quiz.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'PUBLISHED' && quiz.isPublished) ||
      (statusFilter === 'DRAFT' && !quiz.isPublished);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Başlık ve İşlem Butonları */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sınav Yönetimi</h1>
          <p className="text-sm text-gray-600 mt-1">
            Tüm sınavlarınızı listeleyin, düzenleyin ve yeni sınavlar oluşturun.
          </p>
        </div>
        <button
          onClick={() => setIsWizardOpen(true)}
          className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Yeni Sınav Oluştur
        </button>
      </div>

      {/* Filtre ve Arama Alanı */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="w-full md:w-1/3">
          <div className="relative">
            <input
              type="text"
              placeholder="Sınav başlığına göre ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <svg
              className="w-5 h-5 text-gray-400 absolute left-3 top-2.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <span className="text-sm text-gray-500 whitespace-nowrap">Durum:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'PUBLISHED' | 'DRAFT')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tümü</option>
            <option value="PUBLISHED">Yayında</option>
            <option value="DRAFT">Taslak</option>
          </select>
        </div>
      </div>

      {/* Sınav Listesi Tablosu */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mb-3"></div>
            <p>Sınavlar yükleniyor...</p>
          </div>
        ) : filteredQuizzes.length === 0 ? (
          <div className="p-12 text-center">
            <svg
              className="w-12 h-12 text-gray-400 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-gray-600 font-medium">Hiç sınav bulunamadı.</p>
            <p className="text-gray-400 text-sm mt-1">Yeni bir sınav oluşturarak başlayabilirsiniz.</p>
          </div>
        ) : (
          <QuizListTable quizzes={filteredQuizzes} onDelete={handleDeleteQuiz} />
        )}
      </div>

      {/* Sınav Oluşturma Sihirbazı Modal */}
      {isWizardOpen && (
        <QuizBuilderWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onSuccess={handleWizardSuccess}
        />
      )}
    </div>
  );
}
