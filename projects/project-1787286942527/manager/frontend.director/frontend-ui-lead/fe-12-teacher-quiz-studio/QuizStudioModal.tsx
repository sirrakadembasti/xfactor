'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import { X, CheckCircle, Clock, BookOpen, Layers, Plus, Trash2, Search } from 'lucide-react';

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionItem {
  id: string;
  text: string;
  subject: string;
  gradeLevel: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  options: QuestionOption[];
}

export interface ClassOption {
  id: string;
  name: string;
  gradeLevel: number;
}

export interface QuizStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (quizData: any) => void;
  availableQuestions?: QuestionItem[];
  classes?: ClassOption[];
}

export const QuizStudioModal: React.FC<QuizStudioModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  availableQuestions = [],
  classes = [],
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [isPublished, setIsPublished] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleToggleQuestion = (id: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((qId) => qId !== id) : [...prev, id]
    );
  };

  const filteredQuestions = availableQuestions.filter((q) => {
    const matchesSearch = q.text.toLowerCase().includes(searchFilter.toLowerCase()) ||
      q.subject.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesDifficulty = difficultyFilter === 'ALL' || q.difficulty === difficultyFilter;
    return matchesSearch && matchesDifficulty;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Lütfen sınav başlığını girin.');
      return;
    }
    if (!targetClassId) {
      toast.error('Lütfen hedef sınıfı seçin.');
      return;
    }
    if (selectedQuestionIds.length === 0) {
      toast.error('Lütfen en az bir soru seçin.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title,
        description,
        targetClassId,
        durationMinutes,
        isPublished,
        questionIds: selectedQuestionIds,
      };

      if (onSuccess) {
        await onSuccess(payload);
      }
      toast.success(isPublished ? 'Sınav başarıyla yayınlandı!' : 'Sınav taslak olarak kaydedildi.');
      onClose();
    } catch (error) {
      toast.error('Sınav oluşturulurken bir hata meydana geldi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Quiz Oluşturma Sihirbazı</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Havuzdan soru seçin, hedef sınıf ve sınav süresi ayarlarını belirleyin.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Adım Göstergesi */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-center text-sm font-medium dark:border-slate-800 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`py-3 px-4 transition-colors ${step === 1 ? 'border-b-2 border-primary-600 font-semibold text-primary-600 dark:border-primary-400 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            1. Temel Bilgiler
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`py-3 px-4 transition-colors ${step === 2 ? 'border-b-2 border-primary-600 font-semibold text-primary-600 dark:border-primary-400 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            2. Soru Seçimi ({selectedQuestionIds.length})
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className={`py-3 px-4 transition-colors ${step === 3 ? 'border-b-2 border-primary-600 font-semibold text-primary-600 dark:border-primary-400 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            3. Onay & Yayınlama
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {/* ADIM 1 */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Sınav Başlığı *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Örn: Matematik 1. Dönem 1. Değerlendirme Sınavı"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Açıklama / Talimatlar
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Sınav kuralları veya öğrenciye notlar..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Hedef Sınıf *
                    </label>
                    <select
                      value={targetClassId}
                      onChange={(e) => setTargetClassId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      required
                    >
                      <option value="">Sınıf Seçiniz</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} ({cls.gradeLevel}. Sınıf)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Sınav Süresi (Dakika) *
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ADIM 2 */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Soru metni veya ders ara..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <select
                    value={difficultyFilter}
                    onChange={(e) => setDifficultyFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="ALL">Tüm Zorluklar</option>
                    <option value="EASY">Kolay</option>
                    <option value="MEDIUM">Orta</option>
                    <option value="HARD">Zor</option>
                  </select>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
                  {filteredQuestions.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      Aramaya uygun soru bulunamadı.
                    </div>
                  ) : (
                    filteredQuestions.map((q) => {
                      const isSelected = selectedQuestionIds.includes(q.id);
                      return (
                        <div
                          key={q.id}
                          onClick={() => handleToggleQuestion(q.id)}
                          className={`cursor-pointer rounded-lg border p-3.5 transition-colors flex items-start gap-3 ${
                            isSelected
                              ? 'border-primary-500 bg-primary-50/50 dark:border-primary-500 dark:bg-primary-950/20'
                              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-700"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{q.text}</p>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {q.subject}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {q.gradeLevel}. Sınıf
                              </span>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                                q.difficulty === 'EASY' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
                                q.difficulty === 'MEDIUM' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                                'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                              }`}>
                                {q.difficulty === 'EASY' ? 'Kolay' : q.difficulty === 'MEDIUM' ? 'Orta' : 'Zor'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ADIM 3 */}
            {step === 3 && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sınav Özeti</CardTitle>
                    <CardDescription>Oluşturulan sınav parametrelerini gözden geçirin.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                      <span className="text-slate-500">Başlık:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{title || '-'}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                      <span className="text-slate-500">Hedef Sınıf:</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {classes.find((c) => c.id === targetClassId)?.name || 'Seçilmedi'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                      <span className="text-slate-500">Süre:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{durationMinutes} Dakika</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-slate-500">Seçilen Soru Sayısı:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{selectedQuestionIds.length} Adet</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <input
                    type="checkbox"
                    id="isPublishedCheckbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-700"
                  />
                  <label htmlFor="isPublishedCheckbox" className="text-sm text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                    Kaydettikten sonra bu sınavı doğrudan öğrencilere yayınla
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40 rounded-b-xl">
            <div>
              {step > 1 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => (s - 1) as any)}>
                  Geri
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                İptal
              </Button>
              {step < 3 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    if (step === 1 && (!title.trim() || !targetClassId)) {
                      toast.error('Lütfen başlık ve sınıf seçimini tamamlayın.');
                      return;
                    }
                    setStep((s) => (s + 1) as any);
                  }}
                >
                  İlerle
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Kaydediliyor...' : isPublished ? 'Kaydet ve Yayınla' : 'Taslak Olarak Kaydet'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
