import { Property, Category, Inquiry, PropertyFilterParams } from '@/types/property';
import { SiteSettings } from '@/types/settings';
import { InquiryInput } from '@/lib/validations/inquiry';

interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: ApiPagination;
}

export interface AnalyticsData {
  totalProperties: number;
  publishedProperties: number;
  unpublishedProperties: number;
  featuredProperties: number;
  saleProperties: number;
  rentProperties: number;
  propertyStatusGroups: { status: string; _count: { status: number } }[];
  totalInquiries: number;
  inquiryStatusGroups: { status: string; _count: { status: number } }[];
  categoriesWithCount: (Category & { _count: { properties: number } })[];
  recentInquiries: Inquiry[];
  recentProperties: Property[];
}

class ApiError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function fetchClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: response.statusText };
    }

    throw new ApiError(
      errorData.error || errorData.message || 'Bir istek hatası oluştu.',
      response.status,
      errorData.details
    );
  }

  return response.json();
}

function buildQueryString(params: Record<string, any> = {}): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

// --- PROPERTIES API ---

export async function getProperties(
  params: PropertyFilterParams = {}
): Promise<PaginatedResponse<Property>> {
  const qs = buildQueryString(params);
  return fetchClient<PaginatedResponse<Property>>(`/properties${qs}`, {
    cache: 'no-store',
  });
}

export async function getPropertyByIdOrSlug(idOrSlug: string): Promise<{ data: Property }> {
  return fetchClient<{ data: Property }>(`/properties/${encodeURIComponent(idOrSlug)}`, {
    cache: 'no-store',
  });
}

export async function getFeaturedProperties(limit: number = 6): Promise<PaginatedResponse<Property>> {
  return getProperties({ featured: true, limit, isPublished: true });
}

export async function getRecentProperties(limit: number = 6): Promise<PaginatedResponse<Property>> {
  return getProperties({ limit, isPublished: true, sortBy: 'createdAt', sortOrder: 'desc' });
}

export async function createProperty(data: any): Promise<{ data: Property; message: string }> {
  return fetchClient<{ data: Property; message: string }>('/properties', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProperty(
  idOrSlug: string,
  data: any
): Promise<{ data: Property; message: string }> {
  return fetchClient<{ data: Property; message: string }>(
    `/properties/${encodeURIComponent(idOrSlug)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
}

export async function deleteProperty(idOrSlug: string): Promise<{ message: string }> {
  return fetchClient<{ message: string }>(
    `/properties/${encodeURIComponent(idOrSlug)}`,
    {
      method: 'DELETE',
    }
  );
}

// --- CATEGORIES API ---

export async function getCategories(): Promise<Category[]> {
  return fetchClient<Category[]>('/categories', {
    cache: 'no-store',
  });
}

export async function createCategory(data: Partial<Category>): Promise<{ data: Category; message: string }> {
  return fetchClient<{ data: Category; message: string }>('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- INQUIRIES API ---

export async function getInquiries(
  params: { q?: string; status?: string; propertyId?: string; page?: number; limit?: number } = {}
): Promise<PaginatedResponse<Inquiry>> {
  const qs = buildQueryString(params);
  return fetchClient<PaginatedResponse<Inquiry>>(`/inquiries${qs}`, {
    cache: 'no-store',
  });
}

export async function getInquiryById(id: string): Promise<{ data: Inquiry }> {
  return fetchClient<{ data: Inquiry }>(`/inquiries/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
}

export async function createInquiry(data: InquiryInput): Promise<{ data: Inquiry; message: string }> {
  return fetchClient<{ data: Inquiry; message: string }>('/inquiries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInquiryStatus(
  id: string,
  status: string
): Promise<{ data: Inquiry; message: string }> {
  return fetchClient<{ data: Inquiry; message: string }>(
    `/inquiries/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );
}

export async function deleteInquiry(id: string): Promise<{ message: string }> {
  return fetchClient<{ message: string }>(`/inquiries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// --- SETTINGS API ---

export async function getSettings(): Promise<{ success: boolean; data: SiteSettings }> {
  return fetchClient<{ success: boolean; data: SiteSettings }>('/settings', {
    cache: 'no-store',
  });
}

export async function updateSettings(settings: Partial<SiteSettings>): Promise<{ success: boolean; message: string }> {
  return fetchClient<{ success: boolean; message: string }>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// --- ANALYTICS API ---

export async function getAnalytics(): Promise<AnalyticsData> {
  return fetchClient<AnalyticsData>('/analytics', {
    cache: 'no-store',
  });
}
