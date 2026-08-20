import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiResponse, PaginatedResponse } from "@/types";

export function apiSuccess<T>(data: T, message?: string, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message && { message }),
    },
    { status }
  );
}

export function apiPaginated<T>(
  data: T[],
  pagination: PaginatedResponse<T>["pagination"],
  message?: string,
  status = 200
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      pagination,
      ...(message && { message }),
    },
    { status }
  );
}

export function apiError(error: string, status = 400, details?: unknown): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(details ? { message: typeof details === "string" ? details : JSON.stringify(details) } : {}),
    },
    { status }
  );
}

export function handleApiError(error: unknown): NextResponse<ApiResponse> {
  console.error("[API Error]:", error);

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const message = issue ? `${issue.path.join(".")}: ${issue.message}` : "Geçersiz istek parametreleri.";
    return apiError(message, 422);
  }

  if (error instanceof Error) {
    if ("code" in error && error.code === "P2002") {
      return apiError("Bu kayıt zaten mevcut.", 409);
    }
    if ("code" in error && error.code === "P2025") {
      return apiError("İstenen kayıt bulunamadı.", 404);
    }
    return apiError(error.message || "Sunucu hatası meydana geldi.", 500);
  }

  return apiError("Beklenmeyen bir sunucu hatası oluştu.", 500);
}
