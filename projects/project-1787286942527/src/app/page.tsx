'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function HomePage() {
  const { currentRole } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (currentRole === 'DRIVER') {
      router.replace('/driver');
    } else if (currentRole === 'DISPATCHER') {
      router.replace('/dispatcher');
    } else if (currentRole === 'ADMIN') {
      router.replace('/admin');
    }
  }, [currentRole, router]);

  return (
    <DashboardLayout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-600">
          Yetki seviyenize göre çalışma alanınız yükleniyor...
        </p>
      </div>
    </DashboardLayout>
  );
}
