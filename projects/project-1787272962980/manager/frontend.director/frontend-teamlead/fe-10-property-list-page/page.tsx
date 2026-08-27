'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { LayoutGrid, List, SlidersHorizontal, ArrowUpDown, SearchX, Loader2 } from 'lucide-react';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { PropertyFilters } from '@/components/properties/PropertyFilters';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Pagination } from '@/components/ui/pagination';

export interface PropertyItem {
  id: string;
  title: string;
  slug: string;
  description?: string;
  price: number;
  currency: string;
  type: 'SALE' | 'RENT';
  category: string;
  city: string;
  district: string;
  bedrooms?: number;
  bathrooms?: number;
  grossSquareMeters?: number;
  netSquareMeters?: number;
  images: { url: string; isCover?: boolean }[];
  featured?: boolean;
  createdAt: string;
}

interface PropertyListResponse {
  data: PropertyItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export default function PropertiesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    pageSize: 12,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentSort = searchParams.get('sort') || 'createdAt-desc';

  const fetchProperties = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      if (!params.has('page')) params.set('page', '1');
      if (!params.has('pageSize')) params.set('pageSize', '12');

      const res = await fetch(`/api/properties?${params.toString()}`);
      if (!res.ok) throw new Error('İlanlar alınırken bir hata oluştu');
      
      const json: PropertyListResponse = await res.json();
      setProperties(json.data || []);
      setMeta(json.meta || { total: 0, page: 1, pageSize: 12, totalPages: 1 });
    } catch (error) {
      console.error('Fetch error:', error);
      setProperties([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const updateUrlParam = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    if (name !== 'page') {
      params.set('page', '1');
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleSortChange = (value: string) => {
    updateUrlParam('sort', value);
  };

  const handlePageChange = (page: number) => {
    updateUrlParam('page', page.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-slate-50 py-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Başlık ve Üst Çubuk */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Tüm İlanlar
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isLoading
                ? 'İlanlar aranıyor...'
                : `Toplam ${meta.total} aktif ilan bulundu`}
            </p>      
          </div>

          {/* Kontroller: Filtrele (Mobil), Sıralama, Görünüm Modu */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* Mobil Filtre Butonu */}
            <div className="lg:hidden">
              <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Filtreler</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[320px] sm:w-[400px] overflow-y-auto">
                  <SheetHeader className="mb-4">
                    <SheetTitle>İlanları Filtrele</SheetTitle>
                  </SheetHeader>
                  <PropertyFilters onFilterApplied={() => setIsFilterSheetOpen(false)} />
                </SheetContent>
              </Sheet>
            </div>

            {/* Sıralama Seçimi */}
            <div className="w-44">
              <Select value={currentSort} onValueChange={handleSortChange}>
                <SelectTrigger className="h-9 text-xs bg-white">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-2 text-slate-500" />
                  <SelectValue placeholder="Sıralama" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt-desc">En Yeniler</SelectItem>
                  <SelectItem value="createdAt-asc">En Eskiler</SelectItem>
                  <SelectItem value="price-asc">Fiyat: Düşükten Yükseğe</SelectItem>
                  <SelectItem value="price-desc">Fiyat: Yüksekten Düşüğe</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Görünüm Değiştirici (Grid / List) */}
            <div className="hidden sm:flex items-center border border-slate-200 rounded-md bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-slate-100 text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Izgara Görünümü"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-slate-100 text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Liste Görünümü"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Ana İçerik Izgarası: Sidebar + Liste */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* Masaüstü Filtreleme Kenar Çubuğu */}
          <aside className="hidden lg:block lg:col-span-1 bg-white p-5 rounded-xl border border-slate-200 shadow-sm sticky top-24">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-base flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Filtreler
              </h2>
            </div>
            <PropertyFilters />
          </aside>

          {/* İlanlar Alanı */}
          <div className="lg:col-span-3 space-y-6">
            {isLoading || isPending ? (
              <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-slate-200">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                <p className="text-slate-500 text-sm">İlanlar yükleniyor...</p>
              </div>
            ) : properties.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
                  <SearchX className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">İlan Bulunamadı</h3>
                <p className="text-sm text-slate-500 max-w-sm mb-6">
                  Arama kriterlerinize uygun gayrimenkul bulunamadı. Filtreleri temizleyerek tekrar deneyebilirsiniz.
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push(pathname)}
                >
                  Filtreleri Sıfırla
                </Button>
              </div>
            ) : (
              <>
                <div
                  className={`grid gap-6 ${
                    viewMode === 'grid'
                      ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                      : 'grid-cols-1'
                  }`}
                >
                  {properties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      layout={viewMode}
                    />
                  ))}
                </div>

                {/* Sayfalama */}
                {meta.totalPages > 1 && (
                  <div className="pt-8 flex justify-center">
                    <Pagination
                      currentPage={meta.page}
                      totalPages={meta.totalPages}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}