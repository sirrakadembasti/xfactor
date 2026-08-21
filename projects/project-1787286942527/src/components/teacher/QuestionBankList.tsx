import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { QuestionEditorModal, QuestionFormData, QuestionDifficulty } from './QuestionEditorModal';

export interface QuestionItem extends QuestionFormData {
  id: string;
  createdAt?: string;
  usageCount?: number;
}

interface QuestionBankListProps {
  questions: QuestionItem[];
  onSaveQuestion: (data: QuestionFormData) => Promise<void> | void;
  onDeleteQuestion?: (id: string) => Promise<void> | void;
  isLoading?: boolean;
}

export const QuestionBankList: React.FC<QuestionBankListProps> = ({
  questions,
  onSaveQuestion,
  onDeleteQuestion,
  isLoading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const subjects = useMemo(() => {
    const list = Array.from(new Set(questions.map((q) => q.subject))).filter(Boolean);
    return list;
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesSearch =
        q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (q.topic && q.topic.toLowerCase().includes(searchQuery.toLowerCase())) ||
        q.subject.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSubject =
        selectedSubject === 'ALL' || q.subject === selectedSubject;

      const matchesDifficulty =
        selectedDifficulty === 'ALL' || q.difficulty === selectedDifficulty;

      return matchesSearch && matchesSubject && matchesDifficulty;
    });
  }, [questions, searchQuery, selectedSubject, selectedDifficulty]);

  const handleOpenAddModal = () => {
    setEditingQuestion(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (question: QuestionItem) => {
    setEditingQuestion(question);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (formData: QuestionFormData) => {
    setIsSaving(true);
    try {
      await onSaveQuestion({
        ...formData,
        id: editingQuestion?.id,
      });
      setIsModalOpen(false);
      setEditingQuestion(null);
    } finally {
      setIsSaving(false);
    }
  };

  const getDifficultyBadge = (difficulty: QuestionDifficulty) => {
    switch (difficulty) {
      case 'EASY':
        return <Badge variant="success">Kolay</Badge>;
      case 'MEDIUM':
        return <Badge variant="warning">Orta</Badge>;
      case 'HARD':
        return <Badge variant="danger">Zor</Badge>;
      default:
        return <Badge variant="neutral">{difficulty}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Soru Havuzu
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Toplam {questions.length} adet kayıtlı soru bulunmaktadır.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          + Yeni Soru Ekle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200/80 dark:border-gray-700">
        <div>
          <Input
            placeholder="Soru veya konu ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="ALL">Tüm Dersler</option>
            {subjects.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="ALL">Tüm Zorluk Seviyeleri</option>
            <option value="EASY">Kolay</option>
            <option value="MEDIUM">Orta</option>
            <option value="HARD">Zor</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Sorular yükleniyor...
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Kriterlere uygun soru bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3">Ders & Konu</th>
                  <th className="px-4 py-3">Soru İçeriği</th>
                  <th className="px-4 py-3">Zorluk</th>
                  <th className="px-4 py-3">Doğru Şık</th>
                  <th className="px-4 py-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 font-normal text-gray-700 dark:text-gray-200">
                {filteredQuestions.map((question) => (
                  <tr
                    key={question.id}
                    className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {question.subject}
                      </div>
                      {question.topic && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {question.topic}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top max-w-md">
                      <p className="line-clamp-2 text-sm text-gray-800 dark:text-gray-200 font-medium">
                        {question.text}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {question.options.map((opt) => (
                          <span
                            key={opt.key}
                            className={`text-xs px-2 py-0.5 rounded ${
                              opt.key === question.correctAnswer
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 font-semibold'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300'
                            }`}
                          >
                            {opt.key}: {opt.text.slice(0, 15)}...
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-top whitespace-nowrap">
                      {getDifficultyBadge(question.difficulty)}
                    </td>
                    <td className="px-4 py-3.5 align-top whitespace-nowrap font-bold text-green-600 dark:text-green-400">
                      {question.correctAnswer}
                    </td>
                    <td className="px-4 py-3.5 align-top whitespace-nowrap text-right space-x-2">
                      <button
                        onClick={() => handleOpenEditModal(question)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline"
                      >
                        Düzenle
                      </button>
                      {onDeleteQuestion && (
                        <button
                          onClick={() => onDeleteQuestion(question.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-800 dark:text-red-400 hover:underline"
                        >
                          Sil
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QuestionEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialData={editingQuestion}
        isSubmitting={isSaving}
      />
    </div>
  );
};
