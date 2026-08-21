import React from 'react';
import { RoleCardGrid } from '@/components/home/RoleCardGrid';
import { PlatformStats } from '@/components/home/PlatformStats';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-12">
        <header className="text-center space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            İhale ve Lojistik Yönetim Platformu
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            Filo yönetimi, ihale takibi, sürücü operasyonları ve transfer süreçlerinizi tek merkezden güvenle yönetin.
          </p>
        </header>

        <section aria-label="Platform İstatistikleri">
          <PlatformStats />
        </section>

        <section aria-label="Kullanıcı Rolleri ve Modüller" className="space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">
              Rol Tabanlı Erişim Panelleri
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              İşlem yapmak istediğiniz yetkili modülü seçiniz.
            </p>
          </div>
          <RoleCardGrid />
        </section>
      </div>
    </main>
  );
}
