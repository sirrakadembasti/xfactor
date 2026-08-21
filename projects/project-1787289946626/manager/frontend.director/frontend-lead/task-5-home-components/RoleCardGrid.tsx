"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, GraduationCap, UserCheck, ArrowRight, Sparkles } from "lucide-react";
import { useAuth, UserRole } from "@/context/AuthContext";

interface RoleOption {
  role: UserRole;
  title: string;
  badge: string;
  description: string;
  icon: React.ElementType;
  color: {
    bg: string;
    border: string;
    hoverBorder: string;
    badgeBg: string;
    badgeText: string;
    iconBg: string;
    iconColor: string;
    buttonBg: string;
    buttonHover: string;
  };
  demoUser: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatar?: string;
  };
  redirectPath: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: "ADMIN",
    title: "Yönetici Girişi",
    badge: "Tam Yetki",
    description: "Okul yönetimi, kullanıcı denetimleri, sistem ayarları ve genel analitik raporlama.",
    icon: ShieldCheck,
    color: {
      bg: "bg-slate-900/60",
      border: "border-slate-800",
      hoverBorder: "hover:border-purple-500/50",
      badgeBg: "bg-purple-500/10",
      badgeText: "text-purple-400",
      iconBg: "bg-purple-500/15",
      iconColor: "text-purple-400",
      buttonBg: "bg-purple-600",
      buttonHover: "hover:bg-purple-500",
    },
    demoUser: {
      id: "demo-admin-1",
      name: "Dr. Selim Yılmaz",
      email: "admin@okul.k12.tr",
      role: "ADMIN",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
    },
    redirectPath: "/admin/dashboard",
  },
  {
    role: "TEACHER",
    title: "Öğretmen Girişi",
    badge: "Akademik Panel",
    description: "Ders programları, devamsızlık girişleri, notlandırma ve ödev takip araçları.",
    icon: GraduationCap,
    color: {
      bg: "bg-slate-900/60",
      border: "border-slate-800",
      hoverBorder: "hover:border-blue-500/50",
      badgeBg: "bg-blue-500/10",
      badgeText: "text-blue-400",
      iconBg: "bg-blue-500/15",
      iconColor: "text-blue-400",
      buttonBg: "bg-blue-600",
      buttonHover: "hover:bg-blue-500",
    },
    demoUser: {
      id: "demo-teacher-1",
      name: "Ayşe Kaya",
      email: "ayse.kaya@okul.k12.tr",
      role: "TEACHER",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    },
    redirectPath: "/teacher/dashboard",
  },
  {
    role: "STUDENT",
    title: "Öğrenci Girişi",
    badge: "Öğrenci Portalı",
    description: "Ders notları, ödev teslimleri, sınav takvimi ve kişisel performans takibi.",
    icon: UserCheck,
    color: {
      bg: "bg-slate-900/60",
      border: "border-slate-800",
      hoverBorder: "hover:border-emerald-500/50",
      badgeBg: "bg-emerald-500/10",
      badgeText: "text-emerald-400",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-400",
      buttonBg: "bg-emerald-600",
      buttonHover: "hover:bg-emerald-500",
    },
    demoUser: {
      id: "demo-student-1",
      name: "Can Demir",
      email: "can.demir@ogrenci.k12.tr",
      role: "STUDENT",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
    },
    redirectPath: "/student/dashboard",
  },
];

export const RoleCardGrid: React.FC = () => {
  const router = useRouter();
  const { login, user } = useAuth();

  const handleQuickLogin = (roleOption: RoleOption) => {
    login(roleOption.demoUser);
    router.push(roleOption.redirectPath);
  };

  return (
    <section className="w-full py-8">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-medium text-slate-300 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Hızlı Demo Giriş Portalı
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Rolünüzü Seçin ve Keşfe Başlayın
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          Sistemi test etmek için herhangi bir rol kartına tıklayarak doğrudan ilgili panele hızlı giriş yapabilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4">
        {ROLE_OPTIONS.map((item) => {
          const IconComponent = item.icon;
          const isActive = user?.role === item.role;

          return (
            <div
              key={item.role}
              className={`relative flex flex-col justify-between p-6 rounded-2xl border transition-all duration-300 backdrop-blur-sm group ${
                item.color.bg
              } ${item.color.border} ${item.color.hoverBorder} ${
                isActive ? "ring-2 ring-offset-2 ring-offset-slate-950 ring-indigo-500 shadow-lg shadow-indigo-500/10" : "shadow-md hover:shadow-xl"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${item.color.iconBg} ${item.color.iconColor}`}>
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border border-current/20 ${item.color.badgeBg} ${item.color.badgeText}`}>
                    {item.badge}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white group-hover:text-slate-100 transition-colors">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  {item.description}
                </p>

                <div className="mt-4 pt-4 border-t border-slate-800/80">
                  <div className="text-xs text-slate-500 mb-1 font-medium">Örnek Hesap:</div>
                  <div className="text-xs text-slate-300 font-semibold">{item.demoUser.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{item.demoUser.email}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleQuickLogin(item)}
                className={`mt-6 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-sm ${item.color.buttonBg} ${item.color.buttonHover}`}
              >
                <span>{isActive ? "Panele Devam Et" : "Tek Tıkla Giriş Yap"}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
