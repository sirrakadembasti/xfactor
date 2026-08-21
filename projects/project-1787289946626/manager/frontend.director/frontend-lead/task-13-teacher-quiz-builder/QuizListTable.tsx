import React from 'react';
import {
  Calendar,
  Clock,
  Eye,
  Edit3,
  Trash2,
  Send,
  FileText,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

export interface QuizSummary {
  id: string;
  title: string;
  className: string;
  questionCount: number;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED';
  submissionCount: number;
}

interface QuizListTableProps {
  quizzes?: QuizSummary[];
  onEdit?: (quizId: string) => void;
  onDelete?: (quizId: string) => void;
  onViewResults?: (quizId: string) => void;
  onToggleStatus?: (quizId: string, currentStatus: QuizSummary['status']) => void;
}

const DEFAULT_QUIZZES: QuizSummary[] = [
  {
    id: 'quiz-1',
    title: '10-A Fonksiyonlar Ara Sınavı',
    className: '10-A Matematik',
    questionCount: 10,
    durationMinutes: 40,
    startDate: '2025-05-10 09:00',
    endDate: '2025-05-10 10:00',
    status: 'PUBLISHED',
    submissionCount: 21
  },
  {
    id: 'quiz-2',
    title: 'Trigonometri Tarama Testi',
    className: '11-A İleri Düzey',
    questionCount: 15,
    durationMinutes: 45,
    startDate: '2025-05-15 14:00',
    endDate: '2025-05-15 15:00',
    status: 'DRAFT',
    submissionCount: 0
  },
  {
    id: 'quiz-3',
    title: 'Polinomlar Kazanım Değerlendirme',
    className: '10-B Matematik',
    questionCount: 8,
    durationMinutes: 30,
    startDate: '2025-05-01 10:00',
    endDate: '2025-05-01 11:00',
    status: 'COMPLETED',
    submissionCount: 22
  }
];

export function QuizListTable({
  quizzes = DEFAULT_QUIZZES,
  onEdit,
  onDelete,
  onViewResults,
  onToggleStatus
}: QuizListTableProps) {
  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`"${title}" isimli quizi silmek istediğinizden emin misiniz?`)) {
      if (onDelete) {
        onDelete(id);
      }
      toast.success('Quiz başarıyla silindi.');
    }
  };

  const handleToggle = (quiz: QuizSummary) => {
    if (onToggleStatus) {
      onToggleStatus(quiz.id, quiz.status);
    }
    const nextStatus = quiz.status === 'PUBLISHED' ? 'Taslak' : 'Yayınlandı';
    toast.info(`Quiz durumu güncellendi: ${nextStatus}`);
  };

  const getStatusBadge = (status: QuizSummary['status']) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle className="w-3 h-3" /> Yayında
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <AlertCircle className="w-3 h-3" /> Taslak
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            Tamamlandı
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 tracking-wider">
            <tr>
              <th className="px-6 py-4">Quiz Başlığı & Sınıf</th>
              <th className="px-4 py-4">Soru / Süre</th>
              <th className="px-4 py-4">Tarih Aralığı</th>
              <th className="px-4 py-4">Durum</th>
              <th className="px-4 py-4">Katılım</th>
              <th className="px-6 py-4 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quizzes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                  Kayıtlı quiz bulunmamaktadır.
                </td>
              </tr>
            ) : (
              quizzes.map((quiz) => (
                <tr key={quiz.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{quiz.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{quiz.className}</div>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className="flex items-center gap-1 text-slate-700 font-medium">
                      <FileText className="w-3.5 h-3.5 text-slate-400" /> {quiz.questionCount} Soru
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" /> {quiz.durationMinutes} Dk
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className="flex items-center gap-1 text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" /> {quiz.startDate}
                    </div>
                    <div className="text-slate-400 text-[11px] mt-0.5">Bitiş: {quiz.endDate}</div>
                  </td>
                  <td className="px-4 py-4">
                    {getStatusBadge(quiz.status)}
                  </td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-700">
                    {quiz.submissionCount} Teslim
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {quiz.status === 'PUBLISHED' && (
                        <button
                          onClick={() => onViewResults && onViewResults(quiz.id)}
                          title="Sonuçları Gör"
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleToggle(quiz)}
                        title={quiz.status === 'PUBLISHED' ? 'Taslağa Al' : 'Yayınla'}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onEdit && onEdit(quiz.id)}
                        title="Düzenle"
                        className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(quiz.id, quiz.title)}
                        title="Sil"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
