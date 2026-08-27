'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Bed, Bath, Square, MapPin, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { PropertyCardItem } from '@/types/property';

interface FeaturedPropertiesProps {
  properties?: PropertyCardItem[];
  title?: string;
  subtitle?: string;
}

export const FeaturedProperties: React.FC<FeaturedPropertiesProps> = ({
  properties = [],
  title = 'Öne Çıkan Vitrin İlanları',
  subtitle = 'Sizin için özenle seçilmiş, en popüler ve fırsat niteliğindeki gayrimenkuller.',
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const itemsPerPage = 3;
  const maxIndex = Math.max(0, properties.length - itemsPerPage);

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
  };

  const formatPrice = (price: number, currency: string = 'TRY') => {
    const formatted = new Intl.NumberFormat('tr-TR').format(price);
    switch (currency) {
      case 'USD':
        return `$${formatted}`;
      case 'EUR':
        return `€${formatted}`;
      case 'TRY':
      default:
        return `${formatted} ₺`;
    }
  };

  if (!properties || properties.length === 0) {
    return null;
  }

  return (
    <section className="py-16 md:py-24 bg-slate-50 dark:bg-slate-900/50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Başlık ve Kontroller */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Vitrin Fırsatları</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
              {title}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base max-w-xl">
              {subtitle}
            </p>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {properties.length > itemsPerPage && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  aria-label="Önceki ilanlar"
                  className="p-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentIndex >= maxIndex}
                  aria-label="Sonraki ilanlar"
                  className="p-2.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            <Link
              href="/ilanlar"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors ml-2"
            >
              <span>Tümünü Gör</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* İlan Kartları Grid / Slider */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {properties.slice(currentIndex, currentIndex + itemsPerPage).map((item) => {
            const mainImage =
              item.images && item.images.length > 0
                ? item.images[0]
                : 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80';

            return (
              <div
                key={item.id}
                className="group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
              >
                {/* Görsel Alanı */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                  <Image
                    src={mainImage}
                    alt={item.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                  {/* Rozetler */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    <span
                      className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider text-white shadow-md ${
                        item.type === 'SALE' ? 'bg-emerald-600' : 'bg-blue-600'
                      }`}
                    >
                      {item.type === 'SALE' ? 'Satılık' : 'Kiralık'}
                    </span>
                    {item.category && (
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-black/50 text-white backdrop-blur-sm">
                        {item.category.name}
                      </span>
                    )}
                  </div>

                  {/* Fiyat */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <span className="text-xl sm:text-2xl font-black text-white drop-shadow-md">
                      {formatPrice(item.price, item.currency)}
                    </span>
                  </div>
                </div>

                {/* İçerik Alanı */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span className="truncate">{item.location}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      <Link href={`/ilanlar/${item.slug}`}>{item.title}</Link>
                    </h3>
                  </div>

                  {/* Özellik İkonları */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-medium">
                    {item.bedrooms !== null && item.bedrooms !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <Bed className="w-4 h-4 text-slate-400" />
                        <span>{item.bedrooms} Yatak O.</span>
                      </div>
                    )}
                    {item.bathrooms !== null && item.bathrooms !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <Bath className="w-4 h-4 text-slate-400" />
                        <span>{item.bathrooms} Banyo</span>
                      </div>
                    )}
                    {item.area !== null && item.area !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <Square className="w-4 h-4 text-slate-400" />
                        <span>{item.area} m²</span>
                      </div>
                    )}
                  </div>

                  {/* İncele Butonu */}
                  <Link
                    href={`/ilanlar/${item.slug}`}
                    className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all duration-200"
                  >
                    <span>İlanı İncele</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
