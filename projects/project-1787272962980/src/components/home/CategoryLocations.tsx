import React from 'react';
import Link from 'next/link';
import {
  Building2,
  Home,
  Trees,
  Briefcase,
  Palmtree,
  Warehouse,
  MapPin,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import { Category } from '@/types/property';

interface CategoryLocationsProps {
  categories?: Category[];
}

const defaultCategories = [
  {
    name: 'Lüks Daireler',
    slug: 'daire',
    description: 'Şehrin merkezinde modern yaşam alanları',
    icon: Home,
    count: '120+',
    color: 'from-blue-600 to-indigo-700',
  },
  {
    name: 'Müstakil Villalar',
    slug: 'villa',
    description: 'Geniş bahçeli, havuzlu ve konforlu villalar',
    icon: Building2,
    count: '45+',
    color: 'from-emerald-600 to-teal-700',
  },
  {
    name: 'Yatırımlık Arsalar',
    slug: 'arsa',
    description: 'İmarlı, geleceği parlak değer kazanan arsalar',
    icon: Trees,
    count: '60+',
    color: 'from-amber-600 to-orange-700',
  },
  {
    name: 'Ticari & Ofis',
    slug: 'ticari',
    description: 'İş dünyasının kalbinde mağaza ve plazalar',
    icon: Briefcase,
    count: '35+',
    color: 'from-purple-600 to-indigo-800',
  },
  {
    name: 'Yazlık Konutlar',
    slug: 'yazlik',
    description: 'Ege ve Akdeniz kıyılarında tatil evleri',
    icon: Palmtree,
    count: '50+',
    color: 'from-cyan-600 to-blue-700',
  },
  {
    name: 'Depo & Fabrika',
    slug: 'depo',
    description: 'Lojistik ve üretim için uygun sanayi alanları',
    icon: Warehouse,
    count: '20+',
    color: 'from-slate-700 to-gray-900',
  },
];

const popularLocations = [
  {
    city: 'İstanbul',
    district: 'Kadıköy & Beşiktaş',
    propertyCount: 142,
    image: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=800&q=80',
    tag: 'Popüler',
  },
  {
    city: 'Muğla',
    district: 'Bodrum & Fethiye',
    propertyCount: 88,
    image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=800&q=80',
    tag: 'Trend',
  },
  {
    city: 'İzmir',
    district: 'Çeşme & Urla',
    propertyCount: 76,
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
    tag: 'Yatırımlık',
  },
  {
    city: 'Antalya',
    district: 'Kaş & Muratpaşa',
    propertyCount: 94,
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80',
    tag: 'Fırsat',
  },
];

export const CategoryLocations: React.FC<CategoryLocationsProps> = ({
  categories: initialCategories,
}) => {
  const displayCategories = defaultCategories.map((item) => {
    const matched = initialCategories?.find(
      (c) => c.slug.toLowerCase() === item.slug.toLowerCase()
    );
    return {
      ...item,
      name: matched?.name || item.name,
      slug: matched?.slug || item.slug,
      count: matched?.propertyCount ? `${matched.propertyCount} İlan` : item.count,
    };
  });

  return (
    <section className="py-16 md:py-24 bg-slate-50 border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
        {/* KATEGORİLER BÖLÜMÜ */}
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                Portföyümüz
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-2">
                Popüler Emlak Kategorileri
              </h2>
              <p className="text-slate-600 mt-2 text-base max-w-xl">
                İhtiyacınıza en uygun gayrimenkulü hızlıca bulabilmeniz için kategorilere ayrılmış geniş portföy.
              </p>
            </div>
            <Link
              href="/properties"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition group self-start md:self-auto"
            >
              Tüm İlanları Gör
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayCategories.map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={idx}
                  href={`/properties?categorySlug=${cat.slug}`}
                  className="group relative bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-300 flex flex-col justify-between overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 shadow-sm">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
                      {cat.count}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {cat.name}
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:text-blue-600 transition-all transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                    <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">
                      {cat.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* POPÜLER LOKASYONLAR BÖLÜMÜ */}
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                Gözde Bölgeler
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-2">
                Öne Çıkan Lokasyonlar
              </h2>
              <p className="text-slate-600 mt-2 text-base max-w-xl">
                Yatırım değeri yüksek, yaşam kalitesi en üst seviyede olan popüler bölgeleri keşfedin.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {popularLocations.map((loc, idx) => (
              <Link
                key={idx}
                href={`/properties?location=${encodeURIComponent(loc.city)}`}
                className="group relative h-80 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 block"
              >
                {/* Görsel Arka Plan */}
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                  style={{ backgroundImage: `url(${loc.image})` }}
                />
                {/* Gradyan Katman */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

                {/* Rozet */}
                <div className="absolute top-4 left-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/90 backdrop-blur-sm text-slate-900 shadow-sm">
                    {loc.tag}
                  </span>
                </div>

                {/* İçerik */}
                <div className="absolute bottom-0 inset-x-0 p-5 text-white flex flex-col justify-end">
                  <div className="flex items-center gap-1.5 text-blue-300 text-xs font-medium mb-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{loc.district}</span>
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-white mb-1 group-hover:text-blue-200 transition-colors">
                    {loc.city}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <span>{loc.propertyCount} Aktif İlan</span>
                    <span className="inline-flex items-center gap-0.5 text-white underline underline-offset-2 group-hover:text-blue-200">
                      İncele <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
