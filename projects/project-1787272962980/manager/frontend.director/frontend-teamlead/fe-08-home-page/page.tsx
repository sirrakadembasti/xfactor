import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/prisma';
import { PropertyCardItem } from '@/types/property';
import {
  Search,
  Building2,
  Home as HomeIcon,
  Key,
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  ShieldCheck,
  Headphones,
  TrendingUp,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatProperty(property: any): PropertyCardItem {
  let parsedImages: string[] = [];
  try {
    parsedImages = typeof property.images === 'string' ? JSON.parse(property.images || '[]') : property.images || [];
  } catch {
    parsedImages = [];
  }

  return {
    id: property.id,
    title: property.title,
    slug: property.slug,
    price: property.price,
    currency: property.currency,
    type: property.type as 'SALE' | 'RENT',
    status: property.status as any,
    location: property.location,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    area: property.area,
    images: parsedImages,
    featured: property.featured,
    category: property.category
      ? {
          id: property.category.id,
          name: property.category.name,
          slug: property.category.slug,
        }
      : undefined,
    createdAt: property.createdAt,
  };
}

async function getHomePageData() {
  try {
    const [featuredPropertiesRaw, latestPropertiesRaw, categories, totalPropertiesCount] = await Promise.all([
      prisma.property.findMany({
        where: {
          isPublished: true,
          featured: true,
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.property.findMany({
        where: {
          isPublished: true,
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.category.findMany({
        orderBy: { order: 'asc' },
        include: {
          _count: {
            select: {
              properties: {
                where: { isPublished: true },
              },
            },
          },
        },
        take: 8,
      }),
      prisma.property.count({ where: { isPublished: true } }),
    ]);

    return {
      featuredProperties: featuredPropertiesRaw.map(formatProperty),
      latestProperties: latestPropertiesRaw.map(formatProperty),
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        propertyCount: cat._count.properties,
      })),
      totalPropertiesCount,
    };
  } catch (error) {
    console.error('Anasayfa verileri çekilirken hata oluştu:', error);
    return {
      featuredProperties: [],
      latestProperties: [],
      categories: [],
      totalPropertiesCount: 0,
    };
  }
}

export default async function HomePage() {
  const { featuredProperties, latestProperties, categories, totalPropertiesCount } = await getHomePageData();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Hero Bölümü */}
      <section className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />
        <div className="container mx-auto px-4 relative z-10 max-w-6xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/20 border border-primary/40 text-primary-foreground text-xs md:text-sm font-medium mb-6 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Seçkin Gayrimenkul Portföyü</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6 max-w-4xl mx-auto leading-tight">
            Hayalinizdeki Yaşam Alanını <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">Keşfedin</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            Satılık ve kiralık en prestijli konut, villa, arsa ve ticari mülkleri güvenle inceleyin.
          </p>

          {/* Hızlı Arama Kutusu */}
          <form action="/ilanlar" method="GET" className="bg-white/95 backdrop-blur-md p-3 md:p-4 rounded-2xl shadow-2xl max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-slate-800 border border-white/20">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                name="q"
                placeholder="Kelime veya ilan başlığı..."
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white"
              />
            </div>

            <div>
              <select
                name="type"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white text-slate-700"
              >
                <option value="">Tüm Durumlar (Satılık / Kiralık)</option>
                <option value="SALE">Satılık</option>
                <option value="RENT">Kiralık</option>
              </select>
            </div>

            <div>
              <select
                name="categoryId"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white text-slate-700"
              >
                <option value="">Tüm Kategoriler</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              İlanları Ara
            </button>
          </form>

          {/* İstatistik Rozetleri */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-3 gap-6 max-w-2xl mx-auto pt-8 border-t border-white/10 text-slate-300">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-white">{totalPropertiesCount}+</div>
              <div className="text-xs md:text-sm text-slate-400">Aktif İlan Portföyü</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-white">{categories.length}</div>
              <div className="text-xs md:text-sm text-slate-400">Farklı Kategori</div>
            </div>
            <div className="col-span-2 md:col-span-1">
              <div className="text-2xl md:text-3xl font-bold text-white">%100</div>
              <div className="text-xs md:text-sm text-slate-400">Müşteri Memnuniyeti</div>
            </div>
          </div>
        </div>
      </section>

      {/* Kategoriler Bölümü */}
      {categories.length > 0 && (
        <section className="py-16 bg-white border-b border-slate-100">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                  Kategorilere Göre Keşfedin
                </h2>
                <p className="text-sm md:text-base text-slate-500 mt-1">
                  İhtiyacınıza uygun mülk türlerini inceleyin
                </p>
              </div>
              <Link
                href="/ilanlar"
                className="text-blue-600 hover:text-blue-700 font-semibold text-sm inline-flex items-center gap-1 group"
              >
                Tümünü Gör
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/ilanlar?categoryId=${category.id}`}
                  className="group p-5 bg-slate-50 hover:bg-blue-50/60 border border-slate-200/80 hover:border-blue-200 rounded-2xl transition-all duration-200 flex flex-col items-center text-center shadow-xs hover:shadow-sm"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-100/70 text-blue-600 flex items-center justify-center mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-200">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-slate-800 group-hover:text-blue-600 text-sm md:text-base mb-1 transition-colors">
                    {category.name}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {category.propertyCount} İlan
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Öne Çıkan İlanlar */}
      {featuredProperties.length > 0 && (
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-10 gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Özel Fırsatlar</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                  Öne Çıkan İlanlar
                </h2>
                <p className="text-sm md:text-base text-slate-500 mt-1">
                  Sizin için özenle seçilmiş en popüler gayrimenkuller
                </p>
              </div>
              <Link
                href="/ilanlar?featured=true"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-sm rounded-xl transition-colors"
              >
                Öne Çıkanları Listele
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProperties.map((property) => {
                const defaultImage =
                  property.images && property.images.length > 0
                    ? property.images[0]
                    : 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop';

                return (
                  <div
                    key={property.id}
                    className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col group"
                  >
                    <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
                      <Image
                        src={defaultImage}
                        alt={property.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white shadow-sm">
                          {property.type === 'SALE' ? 'Satılık' : 'Kiralık'}
                        </span>
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 text-white shadow-sm flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Öne Çıkan
                        </span>
                      </div>
                      {property.category && (
                        <span className="absolute bottom-3 left-3 px-2.5 py-1 text-xs font-medium rounded-lg bg-black/60 backdrop-blur-sm text-white">
                          {property.category.name}
                        </span>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center text-xs text-slate-500 mb-2 gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{property.location}</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-base md:text-lg mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          <Link href={`/ilanlar/${property.slug}`}>{property.title}</Link>
                        </h3>
                      </div>

                      <div className="pt-4 border-t border-slate-100 mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-4">
                          {property.bedrooms !== null && property.bedrooms !== undefined && (
                            <div className="flex items-center gap-1">
                              <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                              <span>{property.bedrooms} Oda</span>
                            </div>
                          )}
                          {property.bathrooms !== null && property.bathrooms !== undefined && (
                            <div className="flex items-center gap-1">
                              <Bath className="w-3.5 h-3.5 text-slate-400" />
                              <span>{property.bathrooms} Banyo</span>
                            </div>
                          )}
                          {property.area !== null && property.area !== undefined && (
                            <div className="flex items-center gap-1">
                              <Maximize className="w-3.5 h-3.5 text-slate-400" />
                              <span>{property.area} m²</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-slate-400 block">Fiyat</span>
                            <span className="text-lg md:text-xl font-bold text-blue-600">
                              {property.price.toLocaleString('tr-TR')} {property.currency}
                            </span>
                          </div>
                          <Link
                            href={`/ilanlar/${property.slug}`}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            İncele
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Neden Biz / Avantajlar */}
      <section className="py-16 bg-slate-900 text-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Neden Bizimle Çalışmalısınız?
            </h2>
            <p className="text-slate-400 text-sm md:text-base">
              Gayrimenkul alım, satım ve kiralama süreçlerinde kurumsal ve şeffaf hizmet anlayışı.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center sm:text-left">
            <div className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-4 mx-auto sm:mx-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Güvenilir & Şeffaf</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Tüm gayrimenkullerimiz detaylı incelemeden geçer ve doğru fiyat politikasıyla sunulur.
              </p>
            </div>

            <div className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 mx-auto sm:mx-0">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Geniş Portföy</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Bütçenize ve kriterlerinize en uygun konut, arsa ve ticari gayrimenkul seçenekleri.
              </p>
            </div>

            <div className="bg-slate-800/60 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-4 mx-auto sm:mx-0">
                <Headphones className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Uzman Danışmanlık</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Tapu, finansman ve kiralama süreçlerinde profesyonel danışman kadromuz yanınızda.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Son Eklenen İlanlar */}
      {latestProperties.length > 0 && (
        <section className="py-16 md:py-20 bg-white">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-10 gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                  Yeni Eklenen İlanlar
                </h2>
                <p className="text-sm md:text-base text-slate-500 mt-1">
                  Portföyümüze en son eklenen güncel gayrimenkuller
                </p>
              </div>
              <Link
                href="/ilanlar"
                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-semibold text-sm group"
              >
                Tüm İlanları Gör
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {latestProperties.map((property) => {
                const defaultImage =
                  property.images && property.images.length > 0
                    ? property.images[0]
                    : 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?q=80&w=800&auto=format&fit=crop';

                return (
                  <div
                    key={property.id}
                    className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col group"
                  >
                    <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
                      <Image
                        src={defaultImage}
                        alt={property.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white shadow-sm">
                          {property.type === 'SALE' ? 'Satılık' : 'Kiralık'}
                        </span>
                      </div>
                      {property.category && (
                        <span className="absolute bottom-3 left-3 px-2.5 py-1 text-xs font-medium rounded-lg bg-black/60 backdrop-blur-sm text-white">
                          {property.category.name}
                        </span>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center text-xs text-slate-500 mb-2 gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{property.location}</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-base md:text-lg mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          <Link href={`/ilanlar/${property.slug}`}>{property.title}</Link>
                        </h3>
                      </div>

                      <div className="pt-4 border-t border-slate-100 mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-4">
                          {property.bedrooms !== null && property.bedrooms !== undefined && (
                            <div className="flex items-center gap-1">
                              <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                              <span>{property.bedrooms} Oda</span>
                            </div>
                          )}
                          {property.bathrooms !== null && property.bathrooms !== undefined && (
                            <div className="flex items-center gap-1">
                              <Bath className="w-3.5 h-3.5 text-slate-400" />
                              <span>{property.bathrooms} Banyo</span>
                            </div>
                          )}
                          {property.area !== null && property.area !== undefined && (
                            <div className="flex items-center gap-1">
                              <Maximize className="w-3.5 h-3.5 text-slate-400" />
                              <span>{property.area} m²</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-slate-400 block">Fiyat</span>
                            <span className="text-lg md:text-xl font-bold text-slate-900">
                              {property.price.toLocaleString('tr-TR')} {property.currency}
                            </span>
                          </div>
                          <Link
                            href={`/ilanlar/${property.slug}`}
                            className="px-3.5 py-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                          >
                            İncele
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* İletişim / CTA Bölümü */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Mülkünüzü Değerinde Satmak veya Kiralamak mı İstiyorsunuz?
          </h2>
          <p className="text-blue-100 text-base md:text-lg mb-8 max-w-2xl mx-auto">
            Profesyonel ekibimiz gayrimenkulünüz için en doğru değerlemeyi yapsın ve potansiyel alıcılarla hızlıca buluştursun.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/iletisim"
              className="px-8 py-3.5 bg-white text-blue-700 hover:bg-slate-100 font-bold rounded-xl shadow-lg transition-colors inline-flex items-center justify-center gap-2"
            >
              Bizimle İletişime Geçin
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/ilanlar"
              className="px-8 py-3.5 bg-blue-700/60 hover:bg-blue-800/80 text-white border border-white/20 font-bold rounded-xl transition-colors inline-flex items-center justify-center"
            >
              Tüm Portföyü Gör
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
