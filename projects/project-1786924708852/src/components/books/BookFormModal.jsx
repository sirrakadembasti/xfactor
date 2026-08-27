import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, BookPlus, Save } from 'lucide-react';

const bookSchema = z.object({
  title: z.string().min(2, 'Kitap başlığı en az 2 karakter olmalıdır.'),
  author: z.string().min(2, 'Yazar adı en az 2 karakter olmalıdır.'),
  isbn: z.string().min(10, 'Geçerli bir ISBN numarası giriniz.'),
  category: z.string().min(1, 'Kategori seçimi zorunludur.'),
  publisher: z.string().optional(),
  publicationYear: z.coerce
    .number()
    .min(1000, 'Geçerli bir yıl giriniz.')
    .max(new Date().getFullYear(), 'Gelecek bir yıl girilemez.'),
  totalCopies: z.coerce.number().min(1, 'Toplam kopya en az 1 olmalıdır.'),
  availableCopies: z.coerce.number().min(0, 'Mevcut kopya negatif olamaz.'),
  status: z.enum(['Mevcut', 'Tükendi', 'Bakımda']),
  coverUrl: z.string().url('Geçerli bir URL giriniz.').or(z.literal('')).optional(),
  description: z.string().optional()
}).refine(data => data.availableCopies <= data.totalCopies, {
  message: 'Mevcut kopya sayısı toplam kopya sayısından fazla olamaz.',
  path: ['availableCopies']
});

export default function BookFormModal({ isOpen, onClose, onSubmit, initialData = null, categories = [] }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      title: '',
      author: '',
      isbn: '',
      category: '',
      publisher: '',
      publicationYear: new Date().getFullYear(),
      totalCopies: 1,
      availableCopies: 1,
      status: 'Mevcut',
      coverUrl: '',
      description: ''
    }
  });

  useEffect(() => {
    if (initialData) {
      reset({
        title: initialData.title || '',
        author: initialData.author || '',
        isbn: initialData.isbn || '',
        category: initialData.category || '',
        publisher: initialData.publisher || '',
        publicationYear: initialData.publicationYear || new Date().getFullYear(),
        totalCopies: initialData.totalCopies ?? 1,
        availableCopies: initialData.availableCopies ?? 1,
        status: initialData.status || 'Mevcut',
        coverUrl: initialData.coverUrl || '',
        description: initialData.description || ''
      });
    } else {
      reset({
        title: '',
        author: '',
        isbn: '',
        category: categories[0] || '',
        publisher: '',
        publicationYear: new Date().getFullYear(),
        totalCopies: 1,
        availableCopies: 1,
        status: 'Mevcut',
        coverUrl: '',
        description: ''
      });
    }
  }, [initialData, reset, categories]);

  if (!isOpen) return null;

  const handleFormSubmit = (data) => {
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8 transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <BookPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-800">
              {initialData ? 'Kitap Bilgilerini Düzenle' : 'Yeni Kitap Ekle'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Kitap Adı *
              </label>
              <input
                type="text"
                {...register('title')}
                placeholder="Örn: Nutuk"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.title && (
                <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
              )}
            </div>

            {/* Author */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Yazar *
              </label>
              <input
                type="text"
                {...register('author')}
                placeholder="Örn: Mustafa Kemal Atatürk"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.author && (
                <p className="mt-1 text-xs text-red-500">{errors.author.message}</p>
              )}
            </div>

            {/* ISBN */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                ISBN *
              </label>
              <input
                type="text"
                {...register('isbn')}
                placeholder="978-975-..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.isbn && (
                <p className="mt-1 text-xs text-red-500">{errors.isbn.message}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Kategori *
              </label>
              <select
                {...register('category')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Seçiniz</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-xs text-red-500">{errors.category.message}</p>
              )}
            </div>

            {/* Publisher */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Yayınevi
              </label>
              <input
                type="text"
                {...register('publisher')}
                placeholder="Örn: Yapı Kredi Yayınları"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Publication Year */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Yayın Yılı
              </label>
              <input
                type="number"
                {...register('publicationYear')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.publicationYear && (
                <p className="mt-1 text-xs text-red-500">{errors.publicationYear.message}</p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Durum
              </label>
              <select
                {...register('status')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Mevcut">Mevcut</option>
                <option value="Tükendi">Tükendi</option>
                <option value="Bakımda">Bakımda</option>
              </select>
            </div>

            {/* Total Copies */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Toplam Stok
              </label>
              <input
                type="number"
                {...register('totalCopies')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.totalCopies && (
                <p className="mt-1 text-xs text-red-500">{errors.totalCopies.message}</p>
              )}
            </div>

            {/* Available Copies */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Mevcut Stok
              </label>
              <input
                type="number"
                {...register('availableCopies')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.availableCopies && (
                <p className="mt-1 text-xs text-red-500">{errors.availableCopies.message}</p>
              )}
            </div>

            {/* Cover URL */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Kapak Görseli URL
              </label>
              <input
                type="url"
                {...register('coverUrl')}
                placeholder="https://example.com/cover.jpg"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.coverUrl && (
                <p className="mt-1 text-xs text-red-500">{errors.coverUrl.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Açıklama / Özet
              </label>
              <textarea
                rows={3}
                {...register('description')}
                placeholder="Kitap hakkında kısa bilgi..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              ></textarea>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{initialData ? 'Güncelle' : 'Kaydet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
