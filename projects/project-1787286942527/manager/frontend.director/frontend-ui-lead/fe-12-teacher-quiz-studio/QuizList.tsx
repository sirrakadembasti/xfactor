'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import { Clock, BookOpen, Users, BarChart3, Edit3, Trash2, Globe, EyeOff } from 'lucide-react';

export interface QuizItem {
  id: string;
  title: string;
  description?: string;
  className: string;
  questionCount: number;
  durationMinutes: number;
  isPublished: boolean;
  createdAt: string;
  submissionCount?: number;
}

export interface QuizListProps {
  quizzes: QuizItem[];
  onEdit?: (quizId: string) => void;
  onDelete?: (quizId: string) => void;
  onViewAnalytics?: (quizId: string) => void;
  onTogglePublish?: (quizId: string, currentStatus: boolean) => void;
}

export const QuizList: React.FC<QuizListProps> = ({
  quizzes,
  onEdit,
  onDelete,
  onViewAnalytics,
  onTogglePublish,
}) => {
  const handleTogglePublish = async (quizId: string, currentStatus: boolean) => {
    try {
      if (onTogglePublish) {
        await onTogglePublish(quizId, currentStatus);
        toast.success(currentStatus ? 'Sınav yayından kaldırıldı.' : 'Sınav başarıyla yayınlandı.');
      }
    } catch (error) {
      toast.error('Sınav durumu güncellenirken hata oluştu.');
    }
  };

  const handleDelete = async (quizId: string) => {
    if (window.confirm('Bu sınavı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
      try {
        if (onDelete) {
          await onDelete(quizId);
          toast.success('Sınav silindi.');
        }
      } catch (error) {
        toast.error('Sınav silinirken bir hata oluştu.');
      }
    }
  };

  if (quizzes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-12 text-center dark:border-slate-800">
        <BookOpen className="h-12 w-12 text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Kayıtlı Sınav Bulunamadı</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Henüz hiç sınav oluşturmadınız. Yukarıdaki 'Yeni Sınav Oluştur' butonunu kullanarak ilk sınavınızı hazırlayabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {quizzes.map((quiz) => (
        <Card key={quiz.id} className="flex flex-col justify-between transition-shadow hover:shadow-md">
          <div>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    quiz.isPublished
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {quiz.isPublished ? 'Yayında' : 'Taslak'}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(quiz.createdAt).toLocaleDateString('tr-TR')}
                </span>
              </div>
              <CardTitle className="mt-2 text-lg line-clamp-1">{quiz.title}</CardTitle>
              <CardDescription className="line-clamp-2">
                {quiz.description || 'Açıklama girilmedi.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span>Hedef: <strong className="text-slate-800 dark:text-slate-200">{quiz.className}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-slate-400" />
                <span>{quiz.questionCount} Soru</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span>{quiz.durationMinutes} Dakika</span>
              </div>
              {quiz.submissionCount !== undefined && (
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-400" />
                  <span>{quiz.submissionCount} Katılım</span>
                </div>
              )}
            </CardContent>
          </div>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              {onViewAnalytics && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewAnalytics(quiz.id)}
                  title="Sonuçları ve Analitiği Gör"
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Sonuçlar
                </Button>
              )}
              {onTogglePublish && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTogglePublish(quiz.id, quiz.isPublished)}
                  title={quiz.isPublished ? 'Yayından Kaldır' : 'Yayınla'}
                >
                  {quiz.isPublished ? <EyeOff className="h-4 w-4 text-amber-600" /> : <Globe className="h-4 w-4 text-emerald-600" />}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(quiz.id)}
                  title="Düzenle"
                >
                  <Edit3 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(quiz.id)}
                  title="Sil"
                >
                  <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700" />
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
};
