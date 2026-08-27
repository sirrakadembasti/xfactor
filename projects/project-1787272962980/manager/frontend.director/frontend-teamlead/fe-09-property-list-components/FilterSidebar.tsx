'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, Filter, RotateCcw, ChevronDown, Check } from 'lucide-react';
import { Category } from '@/types/property';

interface FilterSidebarProps {
  categories?: Category[];
  className?: string;
  onCloseMobile?: () => void;
}

export function FilterSidebar({
  categories = [],
  className = '',
  onCloseMobile,
}: FilterSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [categorySlug, setCategorySlug] = useState(searchParams.get('categorySlug') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');
  const [bedrooms, setBedrooms] = useState(searchParams.get('bedrooms') || '');
  const [bathrooms, setBathrooms] = useState(searchParams.get('bathrooms') || '');
  const [minArea, setMinArea] = useState(searchParams.get('minArea') || '');
  const [maxArea, setMaxArea] = useState(searchParams.get('maxArea') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'createdAt');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc');

  // Sync state when URL params change
  useEffect(() => {
    setQ(searchParams.get('q') || '');
    setType(searchParams.get('type') || '');
    setCategorySlug(searchParams.get('categorySlug') || '');
    setLocation(searchParams.get('location') || '');
    setMinPrice(searchParams.get('minPrice') || '');
    setMaxPrice(searchParams.get('maxPrice') || '');
    setBedrooms(searchParams.get('bedrooms') || '');
    setBathrooms(searchParams.get('bathrooms') || '');
    setMinArea(searchParams.get('minArea') || '');
    setMaxArea(searchParams.get('maxArea') || '');
    setSortBy(searchParams.get('sortBy') || 'createdAt');
    setSortOrder(searchParams.get('sortOrder') || 'desc');
  }, [searchParams]);

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();

    if (q) params.set('q', q.trim());
    if (type) params.set('type', type);
    if (categorySlug) params.set('categorySlug', categorySlug);
    if (location) params.set('location', location.trim());
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (bedrooms) params.set('bedrooms', bedrooms);
    if (bathrooms) params.set('bathrooms', bathrooms);
    if (minArea) params.set('minArea', minArea);
    if (maxArea) params.set('maxArea', maxArea);
    if (sortBy) params.set('sortBy', sortBy);
    if (sortOrder) params.set('sortOrder', sortOrder);

    // Reset pagination on filter change
    params.set('page', '1');

    router.push(`${pathname}?${params.toString()}`);
    if (onCloseMobile) {
      onCloseMobile();
    }
  }, [q, type, categorySlug, location, minPrice, maxPrice, bedrooms, bathrooms, minArea, maxArea, sortBy, sortOrder, pathname, router, onCloseMobile]);

  const handleReset = () => {
    setQ('');
    setType('');
    setCategorySlug('');
    setLocation('');
    setMinPrice('');
    setMaxPrice('');
    setBedrooms('');
    setBathrooms('');
    setMinArea('');
    setMaxArea('');
    setSortBy('createdAt');
    setSortOrder('desc');

    router.push(pathname);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters();
  };

  const bedroomOptions = [
    { label: 'Tümü', value: '' },
    { label: '1+0 / 1+1', value: '1' },
    { label: '2+1', value: '2' },
    { label: '3+1', value: '3' },
    { label: '4+1', value: '4' },
    { label: '5+ ve üzeri', value: '5' },
  ];

  const sortOptions = [
    { label: 'En Yeni İlanlar', sortBy: 'createdAt', sortOrder: 'desc' },
    { label: 'En Eski İlanlar', sortBy: 'createdAt', sortOrder: 'asc' },
    { label: 'Fiyat (Önce En Düşük)', sortBy: 'price', sortOrder: 'asc' },
    { label: 'Fiyat (Önce En Yüksek)', sortBy: 'price', sortOrder: 'desc' },
    { label: 'Metrekare (Büyükten Küçüğe)', sortBy: 'area', sortOrder: 'desc' },
    { label: 'Metrekare (Küçükten Büyüğe)', sortBy: 'area', sortOrder: 'asc' },
  ];

  const currentSortKey = `${sortBy}-${sortOrder}`;

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <Filter className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span>Filtreleme</span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors dark:text-slate-400 dark:hover:text-red-400"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Sıfırla
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        {/* Arama Kelimesi */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Arama
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="İlan başlığı, açıklama..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
          </div>
        </div>

        {/* İlan Türü (Satılık / Kiralık) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            İlan Türü
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Tümü', value: '' },
              { label: 'Satılık', value: 'SALE' },
              { label: 'Kiralık', value: 'RENT' },
            ].map((item) => {
              const isSelected = type === item.value;
              return (
                <button
                  type="button"
                  key={item.value}
                  onClick={() => setType(item.value)}
                  className={`rounded-xl py-2 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'border border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kategori Seçimi */}
        {categories.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Kategori
            </label>
            <div className="relative">
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-3 pr-9 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
              >
                <option value="">Tüm Kategoriler</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name} {cat.propertyCount !== undefined ? `(${cat.propertyCount})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>
          </div>
        )}

        {/* Konum / Şehir */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Konum / İl / İlçe
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Örn: İstanbul, Kadıköy"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
          />
        </div>

        {/* Fiyat Aralığı */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Fiyat Aralığı (₺)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min TL"
              min="0"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max TL"
              min="0"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
          </div>
        </div>

        {/* Metrekare Aralığı */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Metrekare (m²)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={minArea}
              onChange={(e) => setMinArea(e.target.value)}
              placeholder="Min m²"
              min="0"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
            <input
              type="number"
              value={maxArea}
              onChange={(e) => setMaxArea(e.target.value)}
              placeholder="Max m²"
              min="0"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
          </div>
        </div>

        {/* Oda Sayısı */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Oda Sayısı
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {bedroomOptions.map((opt) => {
              const isSelected = bedrooms === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setBedrooms(opt.value)}
                  className={`rounded-lg py-1.5 px-2 text-xs font-medium text-center transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : 'border border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sıralama Seçeneği */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
            Sıralama
          </label>
          <div className="relative">
            <select
              value={currentSortKey}
              onChange={(e) => {
                const selected = sortOptions.find(
                  (opt) => `${opt.sortBy}-${opt.sortOrder}` === e.target.value
                );
                if (selected) {
                  setSortBy(selected.sortBy);
                  setSortOrder(selected.sortOrder);
                }
              }}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-3 pr-9 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
            >
              {sortOptions.map((opt) => (
                <option
                  key={`${opt.sortBy}-${opt.sortOrder}`}
                  value={`${opt.sortBy}-${opt.sortOrder}`}
                >
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          </div>
        </div>

        {/* Uygula Butonu */}
        <div className="pt-2">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 hover:shadow-blue-600/35 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-[0.99] dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Check className="h-4 w-4" />
            Filtreleri Uygula
          </button>
        </div>
      </form>
    </div>
  );
}
