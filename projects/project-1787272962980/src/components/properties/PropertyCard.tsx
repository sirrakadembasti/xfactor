import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Property } from '@/types';

interface PropertyCardProps {
  property: Property;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  const mainImage = property.images[0]?.url || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80';
  
  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-100 flex flex-col">
      <div className="relative h-48 w-full bg-gray-100">
        <img
          src={mainImage}
          alt={property.title}
          className="w-full h-full object-cover"
        />
        <span className="absolute top-3 left-3 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded">
          {property.type === 'SALE' ? 'Satılık' : 'Kiralık'}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            {property.category === 'RESIDENTIAL' ? 'Konut' : property.category === 'COMMERCIAL' ? 'Ticari' : 'Arsa'}
          </p>
          <h3 className="text-lg font-semibold text-gray-900 line-clamp-1 mb-2">
            {property.title}
          </h3>
          <p className="text-sm text-gray-600 line-clamp-2 mb-4">
            {property.description}
          </p>
        </div>

        <div>
          <div className="flex items-center text-sm text-gray-500 mb-3 space-x-4">
            <span>{property.city}, {property.district}</span>
            <span>•</span>
            <span>{property.areaSqMt} m²</span>
            <span>•</span>
            <span>{property.bedrooms} Oda</span>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <span className="text-xl font-bold text-blue-600">
              {property.price.toLocaleString('tr-TR')} ₺
            </span>
            <Link
              href={`/ilanlar/${property.id}`}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Detayları Gör →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
