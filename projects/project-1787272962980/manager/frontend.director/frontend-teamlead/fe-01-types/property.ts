export type PropertyType = 'SALE' | 'RENT';

export type PropertyStatus = 'AVAILABLE' | 'SOLD' | 'RENTED' | 'PENDING';

export type InquiryStatus = 'PENDING' | 'CONTACTED' | 'CLOSED';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  order: number;
  propertyCount?: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Property {
  id: string;
  title: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  type: PropertyType;
  status: PropertyStatus;
  location: string;
  address?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  images: string[];
  features: string[];
  featured: boolean;
  isPublished: boolean;
  categoryId: string;
  category?: Category;
  inquiries?: Inquiry[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PropertyCardItem {
  id: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
  type: PropertyType;
  status: PropertyStatus;
  location: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  images: string[];
  featured: boolean;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  createdAt: Date | string;
}

export interface PropertyFilterParams {
  q?: string;
  type?: PropertyType;
  status?: PropertyStatus;
  categoryId?: string;
  categorySlug?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  minArea?: number;
  maxArea?: number;
  featured?: boolean;
  isPublished?: boolean;
  sortBy?: 'price' | 'createdAt' | 'area';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: InquiryStatus;
  propertyId?: string | null;
  property?: PropertyCardItem | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface InquiryFormData {
  name: string;
  email: string;
  phone: string;
  message: string;
  propertyId?: string | null;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}
