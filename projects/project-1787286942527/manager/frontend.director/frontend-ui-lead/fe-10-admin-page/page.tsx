"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AdminStats } from "@/components/admin/AdminStats";
import { CourseManager } from "@/components/admin/CourseManager";
import { ClassroomManager } from "@/components/admin/ClassroomManager";
import { BookOpen, Users, LayoutDashboard } from "lucide-react";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "courses" | "classrooms">("overview");

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Yönetim Paneli
            </h1>
            <p className="text-sm text-muted-foreground">
              Kursları, sınıfları, eğitmen atamalarını ve platform istatistiklerini buradan yönetebilirsiniz.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "overview"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Genel Bakış
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("courses")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "courses"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Kurslar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("classrooms")}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "classrooms"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Users className="h-4 w-4" />
              Sınıflar
            </button>
          </div>
        </div>

        <AdminStats />

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Kurs Yönetimi</h2>
                  <p className="text-xs text-muted-foreground">Mevcut kursları ve modülleri inceleyin</p>
                </div>
              </div>
              <CourseManager />
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Sınıf ve Eğitmen Yönetimi</h2>
                  <p className="text-xs text-muted-foreground">Sınıf kontenjanları ve eğitmen atamaları</p>
                </div>
              </div>
              <ClassroomManager />
            </div>
          </div>
        )}

        {activeTab === "courses" && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-6 border-b border-border pb-4">
              <h2 className="text-lg font-semibold text-foreground">Tüm Kurslar</h2>
              <p className="text-xs text-muted-foreground">Kurs ekleme, düzenleme ve içerik modül yönetimi</p>
            </div>
            <CourseManager />
          </div>
        )}

        {activeTab === "classrooms" && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-6 border-b border-border pb-4">
              <h2 className="text-lg font-semibold text-foreground">Tüm Sınıflar</h2>
              <p className="text-xs text-muted-foreground">Aktif sınıflar, eğitmenler ve öğrenci kapasiteleri</p>
            </div>
            <ClassroomManager />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
