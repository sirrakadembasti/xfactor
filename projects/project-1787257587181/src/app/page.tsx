import React, { Suspense } from 'react';
import FilterBar from '@/components/features/FilterBar';
import ContentList from '@/components/features/ContentList';

interface HomePageProps {
  searchParams?: Promise<{
    query?: string;
    category?: string;
    city?: string;
    sortBy?: string;
  }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const query = resolvedParams.query || '';
  const category = resolvedParams.category || 'all';
  const city = resolvedParams.city || 'all';
  const sortBy = resolvedParams.sortBy || 'recommended';

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center md:text-left space-y-2 mb-6">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Şehri ve Mekanları Keşfedin
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
              En popüler restoranlar, kafeler, etkinlikler ve kültürel rotalar tek bir platformda.
            </p>
          </div>

          <Suspense fallback={<div className="h-16 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-xl" />}>
            <FilterBar initialFilters={{ query, category, city, sortBy }} />
          </Suspense>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<ContentListSkeleton />}>
          <ContentList
            filters={{
              query,
              category,
              city,
              sortBy,
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}

function ContentListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4 animate-pulse"
        >
          <div className="h-48 w-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-5 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      ))}
    </div>
  );
}
