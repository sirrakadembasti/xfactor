import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface QuestionOptionForm {
  key: string;
  text: string;
}

export interface QuestionFormData {
  id?: string;
  subject: string;
  topic?: string;
  difficulty: QuestionDifficulty;
  text: string;
  options: QuestionOptionForm[];
  correctAnswer: string;
  explanation?: string;
}

interface QuestionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: QuestionFormData) => void;
  initialData?: QuestionFormData | null;
  isSubmitting?: boolean;
}

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isSubmitting = false,
}) => {
  const defaultOptions: QuestionOptionForm[] = [
    { key: 'A', text: '' },
    { key: 'B', text: '' },
    { key: 'C', text: '' },
    { key: 'D', text: '' },
  ];

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<QuestionFormData>({
    defaultValues: initialData || {
      subject: '',
      topic: '',
      difficulty: 'MEDIUM',
      text: '',
      options: defaultOptions,
      correctAnswer: 'A',
      explanation: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'options',
  });

  React.useEffect(() => {
    if (initialData) {
      reset(initialData);
    } else {
      reset({
        subject: '',
        topic: '',
        difficulty: 'MEDIUM',
        text: '',
        options: defaultOptions,
        correctAnswer: 'A',
        explanation: '',
      });
    }
  }, [initialData, isOpen, reset]);

  const selectedCorrectAnswer = watch('correctAnswer');

  const handleFormSubmit = (data: QuestionFormData) => {
    onSubmit(data);
  };

  const addOption = () => {
    const nextChar = String.fromCharCode(65 + fields.length);
    if (fields.length < 5) {
      append({ key: nextChar, text: '' });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Soruyu Düzenle' : 'Yeni Soru Ekle'}
      size="lg"
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ders Adı *
            </label>
            <Input
              placeholder="Örn: Matematik, Fizik"
              {...register('subject', { required: 'Ders alanı zorunludur' })}
              error={errors.subject?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Konu / Ünite
            </label>
            <Input
              placeholder="Örn: Türev, Dinamik"
              {...register('topic')}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Zorluk Seviyesi *
          </label>
          <select
            {...register('difficulty', { required: true })}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="EASY">Kolay</option>
            <option value="MEDIUM">Orta</option>
            <option value="HARD">Zor</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Soru Metni *
          </label>
          <textarea
            rows={4}
            placeholder="Soru içeriğini buraya yazınız..."
            {...register('text', { required: 'Soru metni gereklidir' })}
            className="w-full rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          {errors.text && (
            <p className="mt-1 text-xs text-red-500">{errors.text.message}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cevap Şıkları *
            </label>
            {fields.length < 5 && (
              <button
                type="button"
                onClick={addOption}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                + Şık Ekle
              </button>
            )}
          </div>

          {fields.map((field, index) => {
            const optionKey = String.fromCharCode(65 + index);
            const isSelected = selectedCorrectAnswer === optionKey;

            return (
              <div key={field.id} className="flex items-center space-x-2">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="radio"
                    value={optionKey}
                    {...register('correctAnswer', { required: true })}
                    checked={isSelected}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 w-5">
                    {optionKey})
                  </span>
                </label>

                <input
                  type="hidden"
                  {...register(`options.${index}.key` as const)}
                  value={optionKey}
                />

                <div className="flex-1">
                  <Input
                    placeholder={`${optionKey} seçeneği metni`}
                    {...register(`options.${index}.text` as const, {
                      required: 'Şık içeriği boş olamaz',
                    })}
                    error={errors.options?.[index]?.text?.message}
                  />
                </div>

                {fields.length > 2 && index >= 2 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-gray-400 hover:text-red-500 p-1 text-sm"
                    title="Şıkkı Kaldır"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Çözüm Açıklaması (Opsiyonel)
          </label>
          <textarea
            rows={2}
            placeholder="Doğru cevabın çözüm açıklaması..."
            {...register('explanation')}
            className="w-full rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Kaydediliyor...' : initialData ? 'Güncelle' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
