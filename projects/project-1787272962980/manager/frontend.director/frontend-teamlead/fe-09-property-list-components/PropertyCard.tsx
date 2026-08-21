'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Bed, Bath, Maximize2, Tag } from 'lucide-react';
import { PropertyCardItem } from '@/types/property';

interface PropertyCardProps {
  property: PropertyCardItem;
  variant?: 'grid' | 'list';
  className?: string;
}

export function PropertyCard({
  property,
  variant = 'grid',
  className = '',
}: PropertyCardProps) {
  const formatPrice = (price: number, currency: string = 'TRY') => {
    const formattedNumber = new Intl.NumberFormat('tr-TR', {
      maximumFractionDigits: 0,
    }).format(price);

    const currencySymbols: Record<string, string> = {
      TRY: '₺',
      USD: '$',
      EUR: '€',
      GBP: '£',
    };

    const symbol = currencySymbols[currency] || currency;
    return `${formattedNumber} ${symbol}`;
  };

  const isSale = property.type === 'SALE';
  const typeLabel = isSale ? 'Satılık' : 'Kiralık';
  const primaryImage =
    property.images && property.images.length > 0
      ? property.images[0]
      : '/images/property-placeholder.jpg';

  const isList = variant === 'list';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-white border border-slate-100 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 ${
        isList ? 'flex flex-col sm:flex-row' : 'flex flex-col'
      } ${className}`}
    >
      {/* Görsel Alanı */}
      <div
        className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${
          isList ? 'h-64 sm:h-auto sm:w-2/5 shrink-0' : 'aspect-[16/10] w-full'
        }`}
      >
        <Image
          src={primaryImage}
          alt={property.title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Badges */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2 z-10">
          <span
            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-md ${
              isSale
                ? 'bg-blue-600/90 text-white'
                : 'bg-emerald-600/90 text-white'
            }`}
          >
            {typeLabel}
          </span>

          {property.featured && (
            <span className="inline-flex items-center rounded-lg bg-amber-500/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md">
              Öne Çıkan
            </span>
          )}

          {property.category && (
            <span className="inline-flex items-center rounded-lg bg-slate-900/75 px-2.5 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-md">
              <Tag className="mr-1 h-3 w-3" />
              {property.category.name}
            </span>
          )}
        </div>

        {property.status === 'SOLD' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
            <span className="rounded-lg border-2 border-red-500 bg-red-600/90 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
              Satıldı
            </span>
          </div>
        )}

        {property.status === 'RENTED' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
            <span className="rounded-lg border-2 border-amber-500 bg-amber-600/90 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg">
              Kiralanmıştır
            </span>
          </div>
        )}
      </div>

      {/* İçerik Alanı */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          {/* Fiyat */}
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400 sm:text-2xl">
              {formatPrice(property.price, property.currency)}
              {!isSale && (
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  {' '}/ ay
                </span>
              )}
            </p>
          </div>

          {/* Başlık */}
          <Link href={`/ilanlar/${property.slug}`} className="group-hover:text-blue-600 transition-colors">
            <h3 className="line-clamp-2 text-base font-semibold text-slate-900 dark:text-white transition-colors duration-200">
              {property.title}
            </h3>
          </Link>

          {/* Konum */}
          <div className="mt-2 flex items-center text-xs text-slate-500 dark:text-slate-400">
            <MapPin className="mr-1.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
            <span className="truncate">{property.location}</span>
          </div>
        </div>

        {/* Özellikler Özeti */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
          {property.bedrooms !== null && property.bedrooms !== undefined && (
            <div className="flex items-center gap-1.5" title="Oda Sayısı">
              <Bed className="h-4 w-4 text-slate-400" />
              <span>{property.bedrooms} Oda</span>
            </div>
          )}

          {property.bathrooms !== null && property.bathrooms !== undefined && (
            <div className="flex items-center gap-1.5" title="Banyo Sayısı">
              <Bath className="h-4 w-4 text-slate-400" />
              <span>{property.bathrooms} Banyo</span>
            </div>
          )}

          {property.area !== null && property.area !== undefined && (
            <div className="flex items-center gap-1.5" title="Net Alan">
              <Maximize2 className="h-4 w-4 text-slate-400" />
              <span>{property.area} m²</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
