import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: any;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    [key: string]: any;
  };
}

export function successResponse<T>(
  data?: T,
  message?: string,
  status = 200,
  meta?: ApiResponse['meta']
) {
  const body: ApiResponse<T> = {
    success: true,
    ...(message && { message }),
    ...(data !== undefined && { data }),
    ...(meta && { meta }),
  };
  return NextResponse.json(body, { status });
}

export function errorResponse(
  message: string,
  status = 400,
  errors?: any
) {
  const body: ApiResponse = {
    success: false,
    message,
    ...(errors && { errors }),
  };
  return NextResponse.json(body, { status });
}

export function validationErrorResponse(errors: any, message = 'Girdi doğrulama hatası') {
  return errorResponse(message, 422, errors);
}

export function unauthorizedResponse(message = 'Yetkisiz erişim') {
  return errorResponse(message, 401);
}

export function forbiddenResponse(message = 'Bu işlem için yetkiniz bulunmamaktadır') {
  return errorResponse(message, 403);
}

export function notFoundResponse(message = 'İstenen kaynak bulunamadı') {
  return errorResponse(message, 404);
}

export function internalServerErrorResponse(message = 'Sunucu hatası oluştu', error?: any) {
  if (process.env.NODE_ENV !== 'production' && error) {
    console.error('API Internal Server Error:', error);
  }
  return errorResponse(message, 500);
}
