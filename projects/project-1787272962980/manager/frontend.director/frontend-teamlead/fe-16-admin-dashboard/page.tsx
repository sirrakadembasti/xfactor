import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  Building2,
  Home,
  Key,
  MessageSquare,
  Plus,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Layers,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getDashboardData() {
  try {
    const [
      totalProperties,
      saleProperties,
      rentProperties,
      publishedProperties,
      totalInquiries,
      pendingInquiries,
      totalCategories,
      recentProperties,
      recentInquiries,
    ] = await Promise.all([
      prisma.property.count(),
      prisma.property.count({ where: { type: 'SALE' } }),
      prisma.property.count({ where: { type: 'RENT' } }),
      prisma.property.count({ where: { isPublished: true } }),
      prisma.inquiry.count(),
      prisma.inquiry.count({ where: { status: 'PENDING' } }),
      prisma.category.count(),
      prisma.property.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: { name: true, slug: true },
          },
        },
      }),
      prisma.inquiry.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
      }),
    ]);

    return {
      stats: {
        totalProperties,
        saleProperties,
        rentProperties,
        publishedProperties,
        totalInquiries,
        pendingInquiries,
        totalCategories,
      },
      recentProperties,
      recentInquiries,
    };
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    return {
      stats: {
        totalProperties: 0,
        saleProperties: 0,
        rentProperties: 0,
        publishedProperties: 0,
        totalInquiries: 0,
        pendingInquiries: 0,
        totalCategories: 0,
      },
      recentProperties: [],
      recentInquiries: [],
    };
  }
}

function formatPrice(amount: number, currency: string = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export default async function AdminDashboardPage() {
  const { stats, recentProperties, recentInquiries } = await getDashboardData();

  const statCards = [
    {
      title: 'Toplam İlan',
      value: stats.totalProperties,
      subtext: `${stats.publishedProperties} yayında`,
      icon: Building2,
      color: 'bg-blue-500/10 text-blue-600',
      href: '/admin/properties',
    },
    {
      title: 'Satılık İlanlar',
      value: stats.saleProperties,
      subtext: 'Aktif portföy',
      icon: Home,
      color: 'bg-emerald-500/10 text-emerald-600',
      href: '/admin/properties?type=SALE',
    },
    {
      title: 'Kiralık İlanlar',
      value: stats.rentProperties,
      subtext: 'Aktif portföy',
      icon: Key,
      color: 'bg-amber-500/10 text-amber-600',
      href: '/admin/properties?type=RENT',
    },
    {
      title: 'Müşteri Talepleri',
      value: stats.totalInquiries,
      subtext: `${stats.pendingInquiries} bekleyen talep`,
      icon: MessageSquare,
      color: 'bg-purple-500/10 text-purple-600',
      highlight: stats.pendingInquiries > 0,
      href: '/admin/inquiries',
    },
  ];

  const statusBadges: Record<string, { label: string; className: string }> = {
    AVAILABLE: { label: 'Yayında', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    PENDING: { label: 'İşlemde', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
    SOLD: { label: 'Satıldı', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    RENTED: { label: 'Kiralanan', className: 'bg-purple-50 text-purple-700 ring-purple-600/20' },
    CONTACTED: { label: 'İletişime Geçildi', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    CLOSED: { label: 'Tamamlandı', className: 'bg-gray-50 text-gray-700 ring-gray-600/20' },
  };

  return (
    <div className="space-y-8 p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Başlık ve Aksiyon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-gray-900">
            Yönetim Paneli
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Emlak portföyünüzün genel durumunu ve son müşteri aktivitelerini buradan takip edin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/categories"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Layers className="h-4 w-4 text-gray-500" />
            Kategoriler ({stats.totalCategories})
          </Link>
          <Link
            href="/admin/properties/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Yeni İlan Ekle
          </Link>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, idx) => {
          const IconComponent = card.icon;
          return (
            <Link
              key={idx}
              href={card.href}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-gray-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    {card.title}
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
                    {card.value}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${card.color}`}>
                  <IconComponent className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-gray-500">{card.subtext}</span>
                <span className="inline-flex items-center gap-1 font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                  Görüntüle <ArrowUpRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 2 Sütunlu Tablolar Alanı */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Son Eklenen İlanlar */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gray-500" />
              <h2 className="text-base font-semibold text-gray-900">Son Eklenen İlanlar</h2>
            </div>
            <Link
              href="/admin/properties"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              Tümünü Gör <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100 overflow-hidden">
            {recentProperties.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Henüz eklenmiş bir ilan bulunmuyor.
              </div>
            ) : (
              recentProperties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/properties/${property.id}/edit`}
                        className="font-medium text-sm text-gray-900 hover:text-blue-600 truncate block"
                      >
                        {property.title}
                      </Link>
                      <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
                        {property.category?.name || 'Genel'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span className="font-semibold text-gray-800">
                        {formatPrice(property.price, property.currency)}
                      </span>
                      <span>•</span>
                      <span className={property.type === 'SALE' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                        {property.type === 'SALE' ? 'Satılık' : 'Kiralık'}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(property.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        statusBadges[property.status]?.className || 'bg-gray-50 text-gray-700 ring-gray-600/20'
                      }`}
                    >
                      {statusBadges[property.status]?.label || property.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Son Gelen Müşteri Talepleri */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-gray-500" />
              <h2 className="text-base font-semibold text-gray-900">Son İletişim Talepleri</h2>
            </div>
            <Link
              href="/admin/inquiries"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              Tümünü Gör <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-gray-100 overflow-hidden">
            {recentInquiries.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Henüz müşteri talebi bulunmuyor.
              </div>
            ) : (
              recentInquiries.map((inquiry) => (
                <div
                  key={inquiry.id}
                  className="flex items-start justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{inquiry.name}</span>
                      <span className="text-xs text-gray-400">({inquiry.phone})</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600 line-clamp-1 italic">
                      &ldquo;{inquiry.message}&rdquo;
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      {inquiry.property ? (
                        <span className="truncate text-blue-600 font-medium max-w-[200px]">
                          İlan: {inquiry.property.title}
                        </span>
                      ) : (
                        <span className="text-gray-400">Genel Bilgi Talebi</span>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(inquiry.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        statusBadges[inquiry.status]?.className || 'bg-gray-50 text-gray-700 ring-gray-600/20'
                      }`}
                    >
                      {statusBadges[inquiry.status]?.label || inquiry.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
