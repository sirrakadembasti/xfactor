export type PropertyType = 'SALE' | 'RENT';
export type PropertyCategory = 'RESIDENTIAL' | 'COMMERCIAL' | 'LAND';

export interface PropertyImage {
  id: string;
  url: string;
  propertyId: string;
  createdAt: Date;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  price: number;
  type: PropertyType;
  category: PropertyCategory;
  city: string;
  district: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  areaSqMt: number;
  images: PropertyImage[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
