'use client';

import React, { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface FilterBarProps {
  initialFilters: {
    query: string;
    category: string;
    city: string;
    sortBy: string;
  };
}

const CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'restaurant', label: 'Restoran' },
  { id: 'cafe', label: 'Kafe' },
  { id: 'culture', label: 'Kültür & Sanat' },
  { id: 'event', label: 'Etkinlik' },
  { id: 'hotel', label: 'Konaklama' },
];

const CITIES = [
  { id: 'all', label: 'Tüm Şehirler' },
  { id: 'istanbul', label: 'İstanbul' },
  { id: 'ankara', label: 'Ankara' },
  { id: 'izmir', label: 'İzmir' },
  { id: 'antalya', label: 'Antalya' },
  { id: 'bursa', label: 'Bursa' },
];

const SORT_OPTIONS = [
  { id: 'recommended', label: 'Önerilenler' },
  { id: 'rating', label: 'En Yüksek Puan' },
  { id: 'popular', label: 'En Popüler' },
  { id: 'newest', label: 'En Yeniler' },
];

export default function FilterBar({ initialFilters }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    
    startTransition(() => {
      router.push(`/?${params.toString()}`, { scroll: false });
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set('query', value);
    } else {
      params.delete('query');
    }
    startTransition(() => {
      router.push(`/?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="relative flex-1">
          <input
            type="text"
            defaultValue={initialFilters.query}
            onChange={handleSearchChange}
            placeholder="Mekan, lezzet veya aktivite ara..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
          />
          <svg
            className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div className="flex gap-2 sm:gap-3">
          <select
            value={initialFilters.city}
            onChange={(e) => updateParam('city', e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {CITIES.map((city) => (
              <option key={city.id} value={city.id}>
                {city.label}
              </option>
            ))}
          </select>

          <select
            value={initialFilters.sortBy}
            onChange={(e) => updateParam('sortBy', e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {SORT_OPTIONS.map((sort) => (
              <option key={sort.id} value={sort.id}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isSelected = initialFilters.category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => updateParam('category', cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
      
      {isPending && (
        <div className="text-xs text-blue-500 font-medium animate-pulse">
          Sonuçlar güncelleniyor...
        </div>
      )}
    </div>
  );
}
