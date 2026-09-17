export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  status: number;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  status?: number;
  details?: unknown;
}

export class ApiError extends Error {
  public status: number;
  public details?: unknown;

  constructor(message: string, status: number = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...customConfig } = options;

  let url = endpoint;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const defaultHeaders: HeadersInit = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    Accept: 'application/json',
    ...headers,
  };

  const config: RequestInit = {
    ...customConfig,
    headers: defaultHeaders,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let errorMessage = `HTTP Hata: ${response.status} ${response.statusText}`;
      let errorDetails: unknown = null;

      try {
        const errorJson = (await response.json()) as ApiErrorResponse;
        errorMessage = errorJson.message || errorJson.error || errorMessage;
        errorDetails = errorJson.details || errorJson;
      } catch {
        // Yanıt JSON formatında değilse varsayılan mesaj kalır
      }

      throw new ApiError(errorMessage, response.status, errorDetails);
    }

    if (response.status === 204) {
      return null as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Bilinmeyen bir ağ hatası oluştu',
      500,
      error
    );
  }
}

export const api = {
  get: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'GET' }),

  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'POST', body }),

  put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PUT', body }),

  patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PATCH', body }),

  delete: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'DELETE' }),
};

export default api;
