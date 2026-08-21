"use client";

import React from "react";
import { Users, GraduationCap, BookOpen, CheckCircle2, TrendingUp } from "lucide-react";

interface StatItem {
  id: string;
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: React.ElementType;
  color: string;
}

const STATS_DATA: StatItem[] = [
  {
    id: "students",
    label: "Kayıtlı Öğrenci",
    value: "1,450+",
    change: "+%12 bu dönem",
    isPositive: true,
    icon: Users,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  {
    id: "teachers",
    label: "Eğitim Kadrosu",
    value: "86",
    change: "Aktif Branşlar",
    isPositive: true,
    icon: GraduationCap,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  {
    id: "courses",
    label: "Ders & Şube",
    value: "124",
    change: "Müfredat Tam Uyumlu",
    isPositive: true,
    icon: BookOpen,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    id: "success_rate",
    label: "Sınav Başarı Ortalaması",
    value: "%89.4",
    change: "+%4.2 artış",
    isPositive: true,
    icon: CheckCircle2,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
];

export const PlatformStats: React.FC = () => {
  return (
    <section className="w-full py-8 border-y border-slate-800/80 bg-slate-900/40 backdrop-blur-sm my-6">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {STATS_DATA.map((stat) => {
            const IconComponent = stat.icon;
            return (
              <div
                key={stat.id}
                className="p-4 md:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-400">
                    {stat.label}
                  </span>
                  <div className={`p-2 rounded-lg border ${stat.color}`}>
                    <IconComponent className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <div className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                    {stat.value}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-slate-400">
                    {stat.isPositive && (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400 inline" />
                    )}
                    <span className={stat.isPositive ? "text-emerald-400/90" : "text-slate-400"}>
                      {stat.change}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
