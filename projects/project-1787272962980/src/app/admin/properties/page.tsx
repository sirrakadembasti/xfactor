'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Eye,
  Star,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Property, PropertyType, PropertyStatus, Category } from '@/types/property';

export default function AdminPropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filtreler
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [publishedFilter, setPublishedFilter] = useState<string>('');
  const [featuredFilter, setFeaturedFilter] = useState<string>('');

  // Sayfalama
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Silme Modalı
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Kategorileri yükle
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : data.data || []);
      }
    } catch (error) {
      console.error('Kategoriler alınamadı:', error);
    }
  }, []);

  // İlanları yükle
  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (searchQuery) params.append('q', searchQuery);
      if (selectedCategory) params.append('categoryId', selectedCategory);
      if (selectedType) params.append('type', selectedType);
      if (selectedStatus) params.append('status', selectedStatus);
      if (publishedFilter !== '') params.append('isPublished', publishedFilter);
      if (featuredFilter !== '') params.append('featured', featuredFilter);

      const res = await fetch(`/api/properties?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data || []);
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages || 1);
          setTotalCount(json.pagination.total || 0);
        }
      }
    } catch (error) {
      console.error('İlanlar alınamadı:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, selectedCategory, selectedType, selectedStatus, publishedFilter, featuredFilter]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchProperties();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchProperties]);

  // Vitrin (Featured) Durumu Değiştirme
  const toggleFeatured = async (property: Property) => {
    setActionLoadingId(property.id);
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: !property.featured }),
      });
      if (res.ok) {
        setProperties((prev) =>
          prev.map((item) =>
            item.id === property.id ? { ...item, featured: !item.featured } : item
          )
        );
      }
    } catch (error) {
      console.error('Vitrin durumu güncellenirken hata oluştu:', error);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Yayın Durumu (isPublished) Değiştirme
  const togglePublished = async (property: Property) => {
    setActionLoadingId(property.id);
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !property.isPublished }),
      });
      if (res.ok) {
        setProperties((prev) =>
          prev.map((item) =>
            item.id === property.id ? { ...item, isPublished: !item.isPublished } : item
          )
        );
      }
    } catch (error) {
      console.error('Yayın durumu güncellenirken hata oluştu:', error);
    } finally {
      setActionLoadingId(null);
    }
  };

  // İlan Silme
  const handleDeleteConfirm = async () => {
    if (!propertyToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/properties/${propertyToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProperties((prev) => prev.filter((item) => item.id !== propertyToDelete.id));
        setTotalCount((prev) => Math.max(0, prev - 1));
        setDeleteModalOpen(false);
        setPropertyToDelete(null);
      }
    } catch (error) {
      console.error('İlan silinirken hata oluştu:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedType('');
    setSelectedStatus('');
    setPublishedFilter('');
    setFeaturedFilter('');
    setPage(1);
  };

  const formatPrice = (price: number, currency = 'TRY') => {
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺';
    return `${price.toLocaleString('tr-TR')} ${symbol}`;
  };

  return (
    <div className="space-y-6">
      {/* Başlık ve Aksiyon */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            İlan Yönetimi
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sistemdeki tüm gayrimenkul ilanlarını görüntüleyin, filtreleyin ve düzenleyin.
          </p>
        </div>
        <Link
          href="/admin/properties/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
        >
          <Plus className="h-4 w-4" />
          Yeni İlan Ekle
        </Link>
      </div>

      {/* Filtre ve Arama Alanı */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Arama Input */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="İlan başlığı veya konum ara..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-transparent py-2 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          {/* Kategori Filtresi */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Tüm Kategoriler</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tür Filtresi */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Tür (Tümü)</option>
              <option value="SALE">Satılık</option>
              <option value="RENT">Kiralık</option>
            </select>
          </div>

          {/* Durum Filtresi */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Durum (Tümü)</option>
              <option value="AVAILABLE">Müsait</option>
              <option value="PENDING">Beklemede / Opsiyonlu</option>
              <option value="SOLD">Satıldı</option>
              <option value="RENTED">Kiralandı</option>
            </select>
          </div>

          {/* Yayın Durumu Filtresi */}
          <div>
            <select
              value={publishedFilter}
              onChange={(e) => {
                setPublishedFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Yayın Durumu</option>
              <option value="true">Yayında</option>
              <option value="false">Taslak / Pasif</option>
            </select>
          </div>
        </div>

        {/* Filtre Temizleme & Toplam Bilgisi */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <span>
            Toplam <strong>{totalCount}</strong> ilan bulundu
          </span>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-zinc-600 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400"
          >
            <RefreshCw className="h-3 w-3" />
            Filtreleri Sıfırla
          </button>
        </div>
      </div>

      {/* Tablo Alanı */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-300">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-6 py-4">İlan Bilgisi</th>
                <th scope="col" className="px-6 py-4">Kategori & Tür</th>
                <th scope="col" className="px-6 py-4">Fiyat</th>
                <th scope="col" className="px-6 py-4 text-center">Vitrin</th>
                <th scope="col" className="px-6 py-4 text-center">Yayın Durumu</th>
                <th scope="col" className="px-6 py-4 text-center">Durum</th>
                <th scope="col" className="px-6 py-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-zinc-500">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                      <span>İlanlar yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : properties.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    Kriterlere uygun ilan bulunamadı.
                  </td>
                </tr>
              ) : (
                properties.map((property) => {
                  const firstImage =
                    Array.isArray(property.images) && property.images.length > 0
                      ? property.images[0]
                      : '/placeholder-property.jpg';

                  return (
                    <tr
                      key={property.id}
                      className="transition hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30"
                    >
                      {/* İlan Başlığı & Görsel */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                            {firstImage.startsWith('http') || firstImage.startsWith('/') ? (
                              <Image
                                src={firstImage}
                                alt={property.title}
                                fill
                                className="object-cover"
                                sizes="80px"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                                Görsel Yok
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                              {property.title}
                            </p>
                            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {property.location}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Kategori & Tür */}
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <span className="inline-block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {property.category?.name || '-'}
                          </span>
                          <div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                property.type === 'SALE'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              }`}
                            >
                              {property.type === 'SALE' ? 'Satılık' : 'Kiralık'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Fiyat */}
                      <td className="px-6 py-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatPrice(property.price, property.currency)}
                      </td>

                      {/* Vitrin Toggle */}
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleFeatured(property)}
                          disabled={actionLoadingId === property.id}
                          title={property.featured ? 'Vitrinden Kaldır' : 'Vitrine Ekle'}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
                            property.featured
                              ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-400'
                              : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {actionLoadingId === property.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Star
                              className={`h-4 w-4 ${
                                property.featured ? 'fill-yellow-500 text-yellow-500' : ''
                              }`}
                            />
                          )}
                        </button>
                      </td>

                      {/* Yayın Durumu */}
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => togglePublished(property)}
                          disabled={actionLoadingId === property.id}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                            property.isPublished
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          {property.isPublished ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5" />
                              Yayında
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5" />
                              Taslak
                            </>
                          )}
                        </button>
                      </td>

                      {/* Satış/Kiralama Durumu */}
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            property.status === 'AVAILABLE'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                              : property.status === 'SOLD'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                              : property.status === 'RENTED'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {property.status === 'AVAILABLE'
                            ? 'Müsait'
                            : property.status === 'SOLD'
                            ? 'Satıldı'
                            : property.status === 'RENTED'
                            ? 'Kiralandı'
                            : 'Beklemede'}
                        </span>
                      </td>

                      {/* İşlemler */}
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/properties/${property.slug}`}
                            target="_blank"
                            title="Sitede İncele"
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          <Link
                            href={`/admin/properties/${property.id}/edit`}
                            title="Düzenle"
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => {
                              setPropertyToDelete(property);
                              setDeleteModalOpen(true);
                            }}
                            title="Sil"
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Sayfalama Kontrolleri */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Sayfa <strong>{page}</strong> / <strong>{totalPages}</strong>
            </div>
            <div className="flex gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
              >
                Önceki
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Silme Onay Modalı */}
      {deleteModalOpen && propertyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="rounded-full bg-rose-100 p-2 dark:bg-rose-950/60">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                İlanı Sil
              </h3>
            </div>

            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              <strong>&quot;{propertyToDelete.title}&quot;</strong> başlıklı ilanı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setPropertyToDelete(null);
                }}
                disabled={isDeleting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
