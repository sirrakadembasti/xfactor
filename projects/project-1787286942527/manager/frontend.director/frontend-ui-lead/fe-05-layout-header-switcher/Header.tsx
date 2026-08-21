"use client";

import React from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Bell, Search, LogOut, Sparkles, User, Menu } from "lucide-react";
import { RoleSwitcher } from "@/components/layout/RoleSwitcher";
import { Badge } from "@/components/ui/Badge";
import { useRole } from "@/context/RoleContext";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { data: session } = useSession();
  const { currentRole } = useRole();

  const roleBadgeMap: Record<string, { label: string; variant: "destructive" | "warning" | "default" }> = {
    ADMIN: { label: "Yönetici Modu", variant: "destructive" },
    TEACHER: { label: "Öğretmen Modu", variant: "warning" },
    STUDENT: { label: "Öğrenci Modu", variant: "default" },
  };

  const activeRoleBadge = roleBadgeMap[currentRole] || roleBadgeMap.STUDENT;

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      {/* Sol Bölüm: Menü butonu & Başlık / Arama */}
      <div className="flex items-center gap-3 md:gap-4">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 md:hidden focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Menüyü Aç"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white shadow-md shadow-primary-500/20">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg tracking-tight">QuizAI</span>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          <div className="relative w-64 lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 select-none pointer-events-none" />
            <input
              type="search"
              placeholder="Sınav, konu veya soru ara..."
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-primary-400 dark:focus:bg-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Sağ Bölüm: Role Switcher & Bildirim & Profil */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Rol Değiştirici Bileşen */}
        <RoleSwitcher />

        {/* Aktif Rol Rozeti (Masaüstü) */}
        <div className="hidden xl:block">
          <Badge variant={activeRoleBadge.variant} size="sm" className="font-medium shadow-xs">
            {activeRoleBadge.label}
          </Badge>
        </div>

        {/* Bildirim Butonu */}
        <button
          type="button"
          className="relative inline-flex items-center justify-center rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          aria-label="Bildirimler"
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
          </span>
        </button>

        {/* Kullanıcı Profili ve Oturum Kontrolü */}
        {session?.user ? (
          <div className="flex items-center gap-2 sm:gap-3 border-l border-slate-200 pl-2 dark:border-slate-700 sm:pl-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300 ring-2 ring-primary-500/20">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "Kullanıcı"}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </div>
              <div className="hidden text-left lg:block">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                  {session.user.name || "İsimsiz Kullanıcı"}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {session.user.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              title="Çıkış Yap"
              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 dark:border-slate-700 sm:pl-3">
            <Link
              href="/auth/login"
              className="rounded-lg bg-primary-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition-all"
            >
              Giriş Yap
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
