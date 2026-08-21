import React from 'react';
import { Metadata } from 'next';
import { AdminMetrics } from '@/components/admin/AdminMetrics';
import { UserManagementTable } from '@/components/admin/UserManagementTable';
import { Shield, RefreshCw } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Admin Paneli | Otomobil & Kullanıcı Yönetimi',
  description: 'Sistem metrikleri, kullanıcı yetkilendirme ve genel yönetim paneli.',
};

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Yönetim Paneli
              </h1>
              <p className="text-sm text-slate-500">
                Sistem genel durumu, kullanıcı verileri ve operasyonel metrikler
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4 text-slate-500" />
              Verileri Yenile
            </button>
          </div>
        </div>

        {/* Metrics Section */}
        <section aria-labelledby="metrics-heading" className="space-y-4">
          <h2 id="metrics-heading" className="text-lg font-semibold text-slate-900">
            Genel Bakış ve İstatistikler
          </h2>
          <AdminMetrics />
        </section>

        {/* User Management Section */}
        <section aria-labelledby="users-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="users-heading" className="text-lg font-semibold text-slate-900">
              Kullanıcı Yönetimi
            </h2>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <UserManagementTable />
          </div>
        </section>
      </div>
    </div>
  );
}
