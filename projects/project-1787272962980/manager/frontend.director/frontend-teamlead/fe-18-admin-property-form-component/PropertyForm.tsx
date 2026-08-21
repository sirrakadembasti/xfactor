'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { propertySchema } from '@/lib/validations/property';
import type { Property, Category } from '@/types/property';
import { z } from 'zod';

type PropertyFormData = z.infer<typeof propertySchema>;

interface PropertyFormProps {
  initialData?: Partial<Property> | null;
  categories?: Category[];
  onSubmit?: (data: PropertyFormData) => Promise<void> | void;
  isSubmitting?: boolean;
  onCancel?: () => void;
}

const COMMON_FEATURES = [
  'Klima',
  'Doğalgaz / Kombi',
  'Yerden Isıtma',
  'Merkezi Isıtma',
  'Balkon',
  'Teras',
  'Asansör',
  'Otopark (Açık)',
  'Otopark (Kapalı)',
  'Yüzme Havuzu',
  'Güvenlik / Kamera',
  'Site İçi',
  'Ebeveyn Banyosu',
  'Giyinme Odası',
  'Çelik Kapı',
  'Akıllı Ev Sistemi',
  'Jeneratör',
  'Isı Yalıtımı',
  'Fiber İnternet',
  'Manzara (Deniz / Doğa)',
];

export function PropertyForm({
  initialData,
  categories: propCategories,
  onSubmit: customOnSubmit,
  isSubmitting: externalIsSubmitting,
  onCancel,
}: PropertyFormProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>(propCategories || []);
  const [loadingCategories, setLoadingCategories] = useState(!propCategories);
  const [images, setImages] = useState<string[]>(initialData?.images || []);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    initialData?.features || []
  );
  const [customFeature, setCustomFeature] = useState('');
  const [internalSubmitting, setInternalSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSubmitting = externalIsSubmitting || internalSubmitting;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema) as any,
    defaultValues: {
      title: initialData?.title || '',
      slug: initialData?.slug || '',
      description: initialData?.description || '',
      price: initialData?.price ? Number(initialData.price) : 0,
      currency: initialData?.currency || 'TRY',
      type: initialData?.type || 'SALE',
      status: initialData?.status || 'AVAILABLE',
      location: initialData?.location || '',
      address: initialData?.address || '',
      bedrooms: initialData?.bedrooms ?? undefined,
      bathrooms: initialData?.bathrooms ?? undefined,
      area: initialData?.area ? Number(initialData.area) : undefined,
      images: initialData?.images || [],
      features: initialData?.features || [],
      featured: initialData?.featured ?? false,
      isPublished: initialData?.isPublished ?? true,
      categoryId: initialData?.categoryId || '',
    },
  });

  useEffect(() => {
    if (!propCategories) {
      fetchCategories();
    }
  }, [propCategories]);

  const fetchCategories = async () => {
    try {
      setLoadingCategories(true);
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Kategoriler yüklenirken hata:', err);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleAddImage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
      if (!images.includes(trimmed)) {
        const updatedImages = [...images, trimmed];
        setImages(updatedImages);
        setValue('images', updatedImages, { shouldValidate: true });
      }
      setNewImageUrl('');
    } catch {
      alert('Lütfen geçerli bir resim bağlantı adresi (URL) giriniz.');
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const updatedImages = images.filter((_, idx) => idx !== indexToRemove);
    setImages(updatedImages);
    setValue('images', updatedImages, { shouldValidate: true });
  };

  const handleMakeMainImage = (index: number) => {
    if (index === 0) return;
    const targetImage = images[index];
    const filtered = images.filter((_, idx) => idx !== index);
    const updated = [targetImage, ...filtered];
    setImages(updated);
    setValue('images', updated, { shouldValidate: true });
  };

  const toggleFeature = (feature: string) => {
    let updated: string[];
    if (selectedFeatures.includes(feature)) {
      updated = selectedFeatures.filter((f) => f !== feature);
    } else {
      updated = [...selectedFeatures, feature];
    }
    setSelectedFeatures(updated);
    setValue('features', updated, { shouldValidate: true });
  };

  const handleAddCustomFeature = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = customFeature.trim();
    if (!trimmed) return;

    if (!selectedFeatures.includes(trimmed)) {
      const updated = [...selectedFeatures, trimmed];
      setSelectedFeatures(updated);
      setValue('features', updated, { shouldValidate: true });
    }
    setCustomFeature('');
  };

  const onFormSubmit = async (data: PropertyFormData) => {
    setSubmitError(null);
    const finalData: PropertyFormData = {
      ...data,
      images,
      features: selectedFeatures,
    };

    if (customOnSubmit) {
      await customOnSubmit(finalData);
      return;
    }

    try {
      setInternalSubmitting(true);
      const url = initialData?.id
        ? `/api/properties/${initialData.id}`
        : '/api/properties';
      const method = initialData?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || result.message || 'Bir hata oluştu.');
      }

      router.push('/admin/properties');
      router.refresh();
    } catch (err: any) {
      setSubmitError(err.message || 'İlan kaydedilirken bir sorun oluştu.');
    } finally {
      setInternalSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-8">
      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {submitError}
        </div>
      )}

      {/* 1. Temel Bilgiler */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 border-b pb-3 mb-5">
          Temel Bilgiler
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              İlan Başlığı <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('title')}
              placeholder="Örn: Kadıköy Moda'da Deniz Manzaralı Lüks 3+1 Daire"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Kategori <span className="text-red-500">*</span>
            </label>
            <select
              {...register('categoryId')}
              disabled={loadingCategories}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors disabled:opacity-50"
            >
              <option value="">Kategori Seçiniz</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="text-xs text-red-500 mt-1">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                İlan Tipi
              </label>
              <select
                {...register('type')}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
              >
                <option value="SALE">Satılık</option>
                <option value="RENT">Kiralık</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Durum
              </label>
              <select
                {...register('status')}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
              >
                <option value="AVAILABLE">Müsait (Aktif)</option>
                <option value="PENDING">Beklemede / Opsiyonlu</option>
                <option value="SOLD">Satıldı</option>
                <option value="RENTED">Kiralanmış</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fiyat <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                {...register('price')}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
              />
              {errors.price && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.price.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Para Birimi
              </label>
              <select
                {...register('currency')}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
              >
                <option value="TRY">TL (₺)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Özel Slug (Opsiyonel)
            </label>
            <input
              type="text"
              {...register('slug')}
              placeholder="otomatik-uretilsin-mi"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Açıklama <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={5}
              {...register('description')}
              placeholder="İlan hakkında detaylı açıklama yazınız..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors resize-y"
            />
            {errors.description && (
              <p className="text-xs text-red-500 mt-1">
                {errors.description.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 2. Gayrimenkul & Konum Detayları */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 border-b pb-3 mb-5">
          Gayrimenkul ve Konum Detayları
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Konum (İlçe / İl) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('location')}
              placeholder="Örn: Kadıköy, İstanbul"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
            />
            {errors.location && (
              <p className="text-xs text-red-500 mt-1">
                {errors.location.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Net Alan (m²)
            </label>
            <input
              type="number"
              step="any"
              {...register('area')}
              placeholder="Örn: 125"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Oda Sayısı
              </label>
              <input
                type="number"
                {...register('bedrooms')}
                placeholder="3"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Banyo Sayısı
              </label>
              <input
                type="number"
                {...register('bathrooms')}
                placeholder="2"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Açık Adres (Opsiyonel)
            </label>
            <input
              type="text"
              {...register('address')}
              placeholder="Mahalle, Cadde, Sokak, No..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 3. Görsel Yönetimi */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 border-b pb-3 mb-4">
          İlan Görselleri
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Görsel URL adreslerini ekleyerek ilan galerisini oluşturabilirsiniz.
          İlk sıradaki görsel vitrin (kapak) görseli olarak kullanılacaktır.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <input
            type="url"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddImage();
              }
            }}
            placeholder="https://example.com/property-image.jpg"
            className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 text-sm transition-colors"
          />
          <button
            type="button"
            onClick={() => handleAddImage()}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shrink-0"
          >
            Görsel Ekle
          </button>
        </div>

        {images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative group border border-slate-200 rounded-lg overflow-hidden bg-slate-100 aspect-video flex items-center justify-center shadow-xs"
              >
                <img
                  src={img}
                  alt={`Görsel ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).setAttribute(
                      'src',
                      'https://placehold.co/600x400?text=Görsel+Yüklenemedi'
                    );
                  }}
                />
                {idx === 0 && (
                  <span className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                    KAPAK
                  </span>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                  {idx !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleMakeMainImage(idx)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors"
                      title="Kapak Görseli Yap"
                    >
                      Kapak Yap
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded shadow-sm transition-colors"
                    title="Görseli Sil"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
            Henüz görsel eklenmedi. Yukarıdaki alandan görsel URL&apos;si ekleyebilirsiniz.
          </div>
        )}
      </div>

      {/* 4. Özellikler ve Donanımlar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 border-b pb-3 mb-4">
          Özellikler & Donanımlar
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          İlan ile ilişkili donanım ve nitelikleri işaretleyebilir veya özel özellik ekleyebilirsiniz.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
          {COMMON_FEATURES.map((feature) => {
            const isSelected = selectedFeatures.includes(feature);
            return (
              <label
                key={feature}
                onClick={() => toggleFeature(feature)}
                className={`flex items-center space-x-2.5 p-3 rounded-lg border text-sm cursor-pointer select-none transition-all ${
                  isSelected
                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-medium'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 pointer-events-none"
                />
                <span className="truncate">{feature}</span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 max-w-md">
          <input
            type="text"
            value={customFeature}
            onChange={(e) => setCustomFeature(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomFeature();
              }
            }}
            placeholder="Farklı bir özellik ekle..."
            className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 text-sm transition-colors"
          />
          <button
            type="button"
            onClick={() => handleAddCustomFeature()}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            Özellik Ekle
          </button>
        </div>
      </div>

      {/* 5. Yayın ve Görünürlük Durumu */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 border-b pb-3 mb-5">
          Yayın ve Vitrin Tercihleri
        </h3>
        <div className="space-y-4">
          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              {...register('isPublished')}
              className="mt-1 w-5 h-5 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-slate-800">
                İlanı Yayına Al (isPublished)
              </p>
              <p className="text-xs text-slate-500">
                İşaretlenirse ilan ziyaretçiler tarafından web sitesinde görüntülenebilir.
              </p>
            </div>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              {...register('featured')}
              className="mt-1 w-5 h-5 rounded text-amber-500 border-slate-300 focus:ring-amber-400"
            />
            <div>
              <p className="text-sm font-medium text-slate-800">
                Öne Çıkan İlan (featured)
              </p>
              <p className="text-xs text-slate-500">
                İşaretlenirse anasayfadaki &quot;Öne Çıkan Gayrimenkuller&quot; vitrininde sergilenir.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Butonlar */}
      <div className="flex items-center justify-end space-x-4 pt-4">
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : router.back())}
          className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-sm font-medium transition-colors"
          disabled={isSubmitting}
        >
          İptal
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-7 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow transition-colors disabled:opacity-50 flex items-center space-x-2"
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                ></path>
              </svg>
              <span>Kaydediliyor...</span>
            </>
          ) : (
            <span>{initialData?.id ? 'İlanı Güncelle' : 'İlanı Kaydet'}</span>
          )}
        </button>
      </div>
    </form>
  );
}
