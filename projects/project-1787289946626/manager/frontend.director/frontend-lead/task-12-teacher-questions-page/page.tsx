'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, HelpCircle, RefreshCw } from 'lucide-react';
import { QuestionFilterBar } from '@/components/teacher/questions/QuestionFilterBar';
import { QuestionList } from '@/components/teacher/questions/QuestionList';
import { QuestionModal } from '@/components/teacher/questions/QuestionModal';
import { Question, QuestionFilterState } from '@/types/question';

export default function TeacherQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<QuestionFilterState>({
    search: '',
    subject: '',
    gradeLevel: '',
    difficulty: '',
    type: ''
  });

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);

  const fetchQuestions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      if (filters.search) queryParams.set('search', filters.search);
      if (filters.subject) queryParams.set('subject', filters.subject);
      if (filters.gradeLevel) queryParams.set('gradeLevel', filters.gradeLevel);
      if (filters.difficulty) queryParams.set('difficulty', filters.difficulty);
      if (filters.type) queryParams.set('type', filters.type);

      const response = await fetch(`/api/teacher/questions?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Sorular yüklenirken bir sorun oluştu.');
      }
      const data = await response.json();
      setQuestions(data.questions || data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleOpenCreateModal = () => {
    setSelectedQuestion(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (question: Question) => {
    setSelectedQuestion(question);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedQuestion(null);
  };

  const handleSaveQuestion = async () => {
    handleCloseModal();
    await fetchQuestions();
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!window.confirm('Bu soruyu silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      const response = await fetch(`/api/teacher/questions/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Soru silinemedi.');
      }

      setQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Soru silinirken hata oluştu.';
      alert(message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Başlık Alanı */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <HelpCircle className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Soru Bankası</h1>
              <p className="text-sm text-slate-500">
                Tüm derslere ait soru havuzunu yönetin, filtreleyin ve yeni sorular ekleyin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchQuestions()}
              className="p-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition border border-slate-200"
              title="Yenile"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition shadow-sm hover:shadow"
            >
              <Plus className="w-5 h-5" />
              <span>Yeni Soru Ekle</span>
            </button>
          </div>
        </div>

        {/* Filtreleme Çubuğu */}
        <QuestionFilterBar
          filters={filters}
          onFilterChange={(newFilters) => setFilters((prev) => ({ ...prev, ...newFilters }))}
          onReset={() =>
            setFilters({
              search: '',
              subject: '',
              gradeLevel: '',
              difficulty: '',
              type: ''
            })
          }
        />

        {/* Hata Mesajı */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => fetchQuestions()}
              className="text-xs font-semibold underline ml-4"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {/* Soru Listesi */}
        <QuestionList
          questions={questions}
          isLoading={isLoading}
          onEdit={handleOpenEditModal}
          onDelete={handleDeleteQuestion}
        />

        {/* Soru Ekleme / Düzenleme Modalı */}
        {isModalOpen && (
          <QuestionModal
            isOpen={isModalOpen}
            question={selectedQuestion}
            onClose={handleCloseModal}
            onSave={handleSaveQuestion}
          />
        )}
      </div>
    </div>
  );
}
