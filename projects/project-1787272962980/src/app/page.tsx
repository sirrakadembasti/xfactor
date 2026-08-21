import React from 'react';
import { prisma } from '@/lib/prisma';
import { PropertyList } from '@/components/properties/PropertyList';
import { Property } from '@/types';

async function getProperties(): Promise<Property[]> {
  try {
    const data = await prisma.property.findMany({
      include: {
        images: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return data as Property[];
  } catch (error) {
    console.error('Veri çekilemedi:', error);
    return [];
  }
}

export default async function HomePage() {
  const properties = await getProperties();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Öne Çıkan Gayrimenkul İlanları
        </h1>
        <p className="mt-2 text-gray-600">
          Satılık ve kiralık en güncel portföyü inceleyin.
        </p>
      </div>

      <PropertyList properties={properties} />
    </div>
  );
}
