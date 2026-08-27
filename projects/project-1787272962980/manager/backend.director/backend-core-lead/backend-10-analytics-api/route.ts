import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [
      totalProperties,
      publishedProperties,
      unpublishedProperties,
      featuredProperties,
      saleProperties,
      rentProperties,
      propertyStatusGroups,
      totalInquiries,
      inquiryStatusGroups,
      categoriesWithCount,
      recentInquiries,
      recentProperties,
    ] = await Promise.all([
      prisma.property.count(),
      prisma.property.count({ where: { isPublished: true } }),
      prisma.property.count({ where: { isPublished: false } }),
      prisma.property.count({ where: { featured: true } }),
      prisma.property.count({ where: { type: 'SALE' } }),
      prisma.property.count({ where: { type: 'RENT' } }),
      prisma.property.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.inquiry.count(),
      prisma.inquiry.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: {
              properties: true,
            },
          },
        },
        orderBy: {
          properties: {
            _count: 'desc',
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
      prisma.property.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          slug: true,
          price: true,
          currency: true,
          type: true,
          status: true,
          featured: true,
          isPublished: true,
          createdAt: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const statusDistribution = {
      AVAILABLE: 0,
      SOLD: 0,
      RENTED: 0,
      PENDING: 0,
    };
    propertyStatusGroups.forEach((group) => {
      if (group.status in statusDistribution) {
        statusDistribution[group.status as keyof typeof statusDistribution] = group._count.status;
      }
    });

    const inquiryDistribution = {
      PENDING: 0,
      CONTACTED: 0,
      CLOSED: 0,
    };
    inquiryStatusGroups.forEach((group) => {
      if (group.status in inquiryDistribution) {
        inquiryDistribution[group.status as keyof typeof inquiryDistribution] = group._count.status;
      }
    });

    const safeRate = (count: number, total: number) => {
      if (!total || total === 0) return 0;
      return Number(((count / total) * 100).toFixed(1));
    };

    const categoryDistribution = categoriesWithCount.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      count: category._count.properties,
      percentage: safeRate(category._count.properties, totalProperties),
    }));

    const responseData = {
      summary: {
        totalProperties,
        publishedProperties,
        unpublishedProperties,
        featuredProperties,
        totalInquiries,
        pendingInquiries: inquiryDistribution.PENDING,
        contactedInquiries: inquiryDistribution.CONTACTED,
        closedInquiries: inquiryDistribution.CLOSED,
        totalCategories: categoriesWithCount.length,
      },
      typeDistribution: {
        sale: saleProperties,
        rent: rentProperties,
        salePercentage: safeRate(saleProperties, totalProperties),
        rentPercentage: safeRate(rentProperties, totalProperties),
      },
      statusDistribution: {
        available: statusDistribution.AVAILABLE,
        sold: statusDistribution.SOLD,
        rented: statusDistribution.RENTED,
        pending: statusDistribution.PENDING,
      },
      rates: {
        publishedRate: safeRate(publishedProperties, totalProperties),
        featuredRate: safeRate(featuredProperties, totalProperties),
        inquiryPendingRate: safeRate(inquiryDistribution.PENDING, totalInquiries),
      },
      categoryDistribution,
      recentInquiries,
      recentProperties,
    };

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error('İstatistikler alınırken hata oluştu:', error);
    return NextResponse.json(
      { error: 'Analitik verileri yüklenirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}
