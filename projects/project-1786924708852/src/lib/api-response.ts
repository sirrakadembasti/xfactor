import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: any;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function successResponse<T>(data: T, message?: string, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    {
      success: true,
      message,
      data,
    },
    { status }
  );
}

export function paginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number; totalPages: number },
  message?: string,
  status = 200
) {
  return NextResponse.json<ApiResponse<T[]>>(
    {
      success: true,
      message,
      data,
      pagination,
    },
    { status }
  );
}

export function errorResponse(message: string, error?: any, status = 400) {
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      message,
      error,
    },
    { status }
  );
}

export function validationErrorResponse(error: any) {
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      message: 'Doğrulama hatası',
      error: error.errors || error,
    },
    { status: 422 }
  );
}

export function unauthorizedResponse(message = 'Yetkisiz erişim') {
  return errorResponse(message, null, 401);
}

export function forbiddenResponse(message = 'Bu işlem için yetkiniz yok') {
  return errorResponse(message, null, 403);
}

export function notFoundResponse(message = 'Kaynak bulunamadı') {
  return errorResponse(message, null, 404);
}
