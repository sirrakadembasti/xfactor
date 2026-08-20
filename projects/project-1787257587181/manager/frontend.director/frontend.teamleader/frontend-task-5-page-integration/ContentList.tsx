'use client';

import React, { useState } from 'react';

export interface Item {
  id: string;
  title: string;
  category: string;
  city: string;
  rating: number;
  reviewCount: number;
  priceRange: string;
  imageUrl: string;
  address: string;
  tags: string[];
}

interface ContentListProps {
  filters: {
    query: string;
    category: string;
    city: string;
    sortBy: string;
  };
}

const MOCK_DATA: Item[] = [
  {
    id: '1',
    title: 'Galata Kahvecisi & Roastery',
    category: 'cafe',
    city: 'istanbul',
    rating: 4.8,
    reviewCount: 342,
    priceRange: '₺₺',
    imageUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&auto=format&fit=crop&q=60',
    address: 'Beyoğlu, İstanbul',
    tags: ['Kahve', 'Sessiz', 'Çalışma Dostu'],
  },
  {
    id: '2',
    title: 'Ege Esintisi Balık Restoranı',
    category: 'restaurant',
    city: 'izmir',
    rating: 4.9,
    reviewCount: 512,
    priceRange: '₺₺₺',
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=60',
    address: 'Alsancak, İzmir',
    tags: ['Deniz Ürünleri', 'Manzara', 'Akşam Yemeği'],
  },
  {
    id: '3',
    title: 'Modern Sanat Müzesi ve Sergi Alanı',
    category: 'culture',
    city: 'istanbul',
    rating: 4.7,
    reviewCount: 1204,
    priceRange: '₺',
    imageUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=60',
    address: 'Karaköy, İstanbul',
    tags: ['Sanat', 'Sergi', 'Müze'],
  },
  {
    id: '4',
    title: 'Ankara Caz Geceleri & Sahne',
    category: 'event',
    city: 'ankara',
    rating: 4.6,
    reviewCount: 189,
    priceRange: '₺₺',
    imageUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800&auto=format&fit=crop&q=60',
    address: 'Çankaya, Ankara',
    tags: ['Canlı Müzik', 'Kokteyl', 'Caz'],
  },
  {
    id: '5',
    title: 'Toros Dağ Butik Oteli',
    category: 'hotel',
    city: 'antalya',
    rating: 4.9,
    reviewCount: 88,
    priceRange: '₺₺₺₺',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=60',
    address: 'Kemer, Antalya',
    tags: ['Doğa', 'Huzur', 'Spa'],
  },
  {
    id: '6',
    title: 'Tarihi Taş Fırın Pidecisi',
    category: 'restaurant',
    city: 'bursa',
    rating: 4.7,
    reviewCount: 420,
    priceRange: '₺₺',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=60',
    address: 'Osmangazi, Bursa',
    tags: ['Geleneksel', 'Aile Mekanı', 'Öğle Yemeği'],
  },
];

export default function ContentList({ filters }: ContentListProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');

  const filteredItems = MOCK_DATA.filter((item) => {
    const matchQuery =
      !filters.query ||
      item.title.toLowerCase().includes(filters.query.toLowerCase()) ||
      item.tags.some((tag) => tag.toLowerCase().includes(filters.query.toLowerCase()));

    const matchCategory =
      !filters.category || filters.category === 'all' || item.category === filters.category;

    const matchCity =
      !filters.city || filters.city === 'all' || item.city === filters.city;

    return matchQuery && matchCategory && matchCity;
  }).sort((a, b) => {
    if (filters.sortBy === 'rating') return b.rating - a.rating;
    if (filters.sortBy === 'popular') return b.reviewCount - a.reviewCount;
    return 0;
  });

  if (filteredItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl bg-white/50 dark:bg-slate-900/50">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 text-slate-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Sonuç Bulunamadı
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Arama kriterlerinize uygun mekan bulunamadı. Lütfen filtrelerinizi kontrol edin veya farklı bir arama yapın.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-slate-200 font-semibold">{filteredItems.length}</strong> mekan bulundu
        </p>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
            title="Grid Görünüm"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('compact')}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'compact' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
            title="Kompakt Liste Görünümü"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className={`grid gap-6 ${
          viewMode === 'grid'
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-1'
        }`}
      >
        {filteredItems.map((item) => (
          <article
            key={item.id}
            className={`group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all flex ${
              viewMode === 'compact' ? 'flex-col sm:flex-row' : 'flex-col'
            }`}
          >
            <div
              className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${
                viewMode === 'compact' ? 'sm:w-64 h-48 sm:h-auto shrink-0' : 'h-48 w-full'
              }`}
            >
              <img
                src={item.imageUrl}
                alt={item.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute top-3 right-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm">
                {item.priceRange}
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {item.city}
                  </span>
                  <div className="flex items-center text-amber-500 text-xs font-semibold gap-1">
                    <span>★</span>
                    <span>{item.rating.toFixed(1)}</span>
                    <span className="text-slate-400 font-normal">({item.reviewCount})</span>
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                  {item.title}
                </h3>

                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {item.address}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
