import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
  HelpCircle,
  Calendar,
  Clock,
  Award,
  Users,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Plus,
  Trash2
} from 'lucide-react';

const quizSchema = z.object({
  title: z.string().min(3, 'Sınav başlığı en az 3 karakter olmalıdır'),
  description: z.string().optional(),
  durationMinutes: z.number().min(1, 'Süre en az 1 dakika olmalıdır'),
  passingScore: z.number().min(0).max(100, 'Geçme notu 0-100 arasında olmalıdır'),
  startTime: z.string().min(1, 'Başlangıç tarihi zorunludur'),
  endTime: z.string().min(1, 'Bitiş tarihi zorunludur'),
  assignedClassIds: z.array(z.string()).min(1, 'En az bir sınıf seçmelisiniz'),
  questionIds: z.array(z.string()).min(1, 'En az bir soru seçmelisiniz')
});

type QuizFormValues = z.infer<typeof quizSchema>;

interface QuestionItem {
  id: string;
  text: string;
  topic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  points: number;
}

interface ClassItem {
  id: string;
  name: string;
  studentCount: number;
}

interface QuizBuilderWizardProps {
  availableQuestions?: QuestionItem[];
  availableClasses?: ClassItem[];
  onSubmitSuccess?: (quizData: QuizFormValues) => void;
}

const DEFAULT_CLASSES: ClassItem[] = [
  { id: 'c1', name: '10-A Matematik', studentCount: 24 },
  { id: 'c2', name: '10-B Matematik', studentCount: 22 },
  { id: 'c3', name: '11-A İleri Düzey', studentCount: 18 }
];

const DEFAULT_QUESTIONS: QuestionItem[] = [
  { id: 'q1', text: 'Fonksiyonlarda bileşke işleminin tersi nedir?', topic: 'Fonksiyonlar', difficulty: 'MEDIUM', points: 10 },
  { id: 'q2', text: 'Parabolün tepe noktası formülü nedir?', topic: 'İkinci Dereceden Denklemler', difficulty: 'EASY', points: 10 },
  { id: 'q3', text: 'Trigonometrik özdeşlikler ve yarım açı formülü uygulaması.', topic: 'Trigonometri', difficulty: 'HARD', points: 15 },
  { id: 'q4', text: 'Polinomlarda kalan bulma teoremi uygulaması.', topic: 'Polinomlar', difficulty: 'MEDIUM', points: 10 }
];

export function QuizBuilderWizard({
  availableQuestions = DEFAULT_QUESTIONS,
  availableClasses = DEFAULT_CLASSES,
  onSubmitSuccess
}: QuizBuilderWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<QuizFormValues>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: '',
      description: '',
      durationMinutes: 40,
      passingScore: 60,
      startTime: '',
      endTime: '',
      assignedClassIds: [],
      questionIds: []
    }
  });

  const selectedClasses = watch('assignedClassIds') || [];
  const selectedQuestions = watch('questionIds') || [];

  const toggleClass = (id: string) => {
    const current = [...selectedClasses];
    const index = current.indexOf(id);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(id);
    }
    setValue('assignedClassIds', current, { shouldValidate: true });
  };

  const toggleQuestion = (id: string) => {
    const current = [...selectedQuestions];
    const index = current.indexOf(id);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(id);
    }
    setValue('questionIds', current, { shouldValidate: true });
  };

  const totalSelectedPoints = availableQuestions
    .filter((q) => selectedQuestions.includes(q.id))
    .reduce((sum, q) => sum + q.points, 0);

  const onSubmit = async (data: QuizFormValues) => {
    setIsSubmitting(true);
    try {
      if (onSubmitSuccess) {
        await onSubmitSuccess(data);
      }
      toast.success('Quiz başarıyla oluşturuldu ve yayınlandı!');
    } catch (err) {
      toast.error('Quiz kaydedilirken bir hata meydana geldi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Yeni Quiz Oluşturucu</h2>
          <p className="text-sm text-slate-500">4 adımda sınav oluşturun, sınıf atayın ve soru havuzundan soru seçin.</p>
        </div>

        {/* Adım Göstergesi */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step === s
                    ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                    : step > s
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
              {s < 4 && <div className={`w-6 h-0.5 ${step > s ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-6">
        {/* ADIM 1: Genel Bilgiler */}
        {step === 1 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Adım 1: Temel Bilgiler ve Süre
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Quiz Başlığı *
              </label>
              <input
                {...register('title')}
                type="text"
                placeholder="Örn: 1. Dönem Fonksiyonlar Ara Sınavı"
                className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.title && <p className="text-xs text-rose-500 mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Açıklama / Yönergeler
              </label>
              <textarea
                {...register('description')}
                rows={3}
                placeholder="Öğrenciler için sınav kuralları ve açıklamalar..."
                className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Süre (Dakika) *
                </label>
                <input
                  {...register('durationMinutes', { valueAsNumber: true })}
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.durationMinutes && <p className="text-xs text-rose-500 mt-1">{errors.durationMinutes.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Geçme Notu (0-100) *
                </label>
                <input
                  {...register('passingScore', { valueAsNumber: true })}
                  type="number"
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.passingScore && <p className="text-xs text-rose-500 mt-1">{errors.passingScore.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Başlangıç Tarih & Saati *
                </label>
                <input
                  {...register('startTime')}
                  type="datetime-local"
                  className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.startTime && <p className="text-xs text-rose-500 mt-1">{errors.startTime.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Bitiş Tarih & Saati *
                </label>
                <input
                  {...register('endTime')}
                  type="datetime-local"
                  className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.endTime && <p className="text-xs text-rose-500 mt-1">{errors.endTime.message}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ADIM 2: Sınıf Atama */}
        {step === 2 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-base font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Adım 2: Sınavı Atayacağınız Sınıflar
            </h3>
            <p className="text-sm text-slate-500">Bu quize katılması zorunlu olan sınıf gruplarını seçin.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {availableClasses.map((cls) => {
                const isSelected = selectedClasses.includes(cls.id);
                return (
                  <div
                    key={cls.id}
                    onClick={() => toggleClass(cls.id)}
                    className={`cursor-pointer p-4 rounded-xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-sm">{cls.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{cls.studentCount} Kayıtlı Öğrenci</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                    />
                  </div>
                );
              })}
            </div>
            {errors.assignedClassIds && (
              <p className="text-xs text-rose-500 mt-2">{errors.assignedClassIds.message}</p>
            )}
          </div>
        )}

        {/* ADIM 3: Soru Havuzu */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-blue-600" />
                  Adım 3: Soru Havuzundan Soru Seçimi
                </h3>
                <p className="text-sm text-slate-500">Quize eklemek istediğiniz soruları işaretleyin.</p>
              </div>
              <div className="text-sm font-semibold bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200">
                Seçilen: {selectedQuestions.length} Soru | Toplam Puan: {totalSelectedPoints}
              </div>
            </div>

            <div className="space-y-2 mt-4 max-h-96 overflow-y-auto pr-1">
              {availableQuestions.map((q) => {
                const isSelected = selectedQuestions.includes(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => toggleQuestion(q.id)}
                    className={`cursor-pointer p-3.5 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-800">{q.text}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600">{q.topic}</span>
                        <span
                          className={`px-2 py-0.5 rounded font-medium ${
                            q.difficulty === 'EASY'
                              ? 'bg-emerald-100 text-emerald-700'
                              : q.difficulty === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {q.difficulty === 'EASY' ? 'Kolay' : q.difficulty === 'MEDIUM' ? 'Orta' : 'Zor'}
                        </span>
                        <span>{q.points} Puan</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                    />
                  </div>
                );
              })}
            </div>
            {errors.questionIds && (
              <p className="text-xs text-rose-500 mt-2">{errors.questionIds.message}</p>
            )}
          </div>
        )}

        {/* ADIM 4: Önizleme & Onay */}
        {step === 4 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Adım 4: Önizleme ve Yayınlama
            </h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-sm">
              <div>
                <span className="text-slate-500 font-medium">Başlık:</span>
                <p className="text-slate-800 font-semibold">{watch('title') || '-'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 font-medium">Süre:</span>
                  <p className="text-slate-800">{watch('durationMinutes')} Dakika</p>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Geçme Notu:</span>
                  <p className="text-slate-800">{watch('passingScore')} / 100</p>
                </div>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Atanan Sınıf Sayısı:</span>
                <p className="text-slate-800">{selectedClasses.length} Sınıf Seçildi</p>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Toplam Soru ve Puan:</span>
                <p className="text-slate-800">{selectedQuestions.length} Soru (Toplam {totalSelectedPoints} Puan)</p>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Alt Gezinme Butonları */}
        <div className="mt-8 pt-4 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Geri
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
            >
              İleri
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Quiz Oluştur ve Yayınla'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
