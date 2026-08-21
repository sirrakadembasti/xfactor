"use client";

import React from "react";
import { Shield, GraduationCap, BookOpen, Check } from "lucide-react";
import { useRole, Role } from "@/context/RoleContext";
import { Badge } from "@/components/ui/Badge";

interface RoleOption {
  id: Role;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeVariant: "default" | "secondary" | "outline" | "destructive" | "success" | "warning";
  badgeText: string;
  description: string;
}

const ROLES: RoleOption[] = [
  {
    id: "ADMIN",
    label: "Yönetici",
    icon: Shield,
    badgeVariant: "destructive",
    badgeText: "Admin",
    description: "Tüm sistem yönetimi",
  },
  {
    id: "TEACHER",
    label: "Öğretmen",
    icon: BookOpen,
    badgeVariant: "warning",
    badgeText: "Eğitmen",
    description: "Soru ve sınav üretimi",
  },
  {
    id: "STUDENT",
    label: "Öğrenci",
    icon: GraduationCap,
    badgeVariant: "default",
    badgeText: "Öğrenci",
    description: "Sınav çözme ve karne",
  },
];

export function RoleSwitcher() {
  const { currentRole, setRole } = useRole();

  return (
    <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-inner">
      {ROLES.map((roleOption) => {
        const Icon = roleOption.icon;
        const isActive = currentRole === roleOption.id;

        return (
          <button
            key={roleOption.id}
            onClick={() => setRole(roleOption.id)}
            type="button"
            title={roleOption.description}
            className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 select-none ${
              isActive
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200/80 dark:border-slate-700"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/50"
            }`}
          >
            <Icon className={`w-3.5 h-3.5 transition-colors ${isActive ? "text-primary-600 dark:text-primary-400" : "text-slate-400"}`} />
            <span className="hidden sm:inline font-semibold">{roleOption.label}</span>
            {isActive && (
              <span className="inline-flex items-center">
                <Badge variant={roleOption.badgeVariant} size="sm" className="ml-1 text-[10px] px-1.5 py-0 uppercase tracking-wider font-bold">
                  {roleOption.badgeText}
                </Badge>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
