import { NextResponse } from "next/server";
import type { NextRequest } from "next/request";
import { verifyToken, SESSION_COOKIE_NAME } from "@/lib/session";

const PROTECTED_ROUTES = ["/dashboard", "/admin", "/profile", "/tasks"];
const ADMIN_ONLY_ROUTES = ["/admin", "/api/admin"];
const AUTH_ROUTES = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ONLY_ROUTES.some((route) => pathname.startsWith(route));
  const isApiRoute = pathname.startsWith("/api/");

  // Giriş yapmış kullanıcı auth sayfalarına (login/register) gitmek isterse
  if (session && isAuthRoute) {
    const redirectPath = session.role === "ADMIN" ? "/admin" : "/dashboard";
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  // Korumalı rota kontrolü (giriş yapılmamışsa)
  if (!session && (isProtectedRoute || isAdminRoute)) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: "Yetkilendirme gerekli. Lütfen giriş yapın." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin yetki kontrolü
  if (isAdminRoute && session?.role !== "ADMIN") {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: "Bu işlem için yönetici yetkisi gereklidir." },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
