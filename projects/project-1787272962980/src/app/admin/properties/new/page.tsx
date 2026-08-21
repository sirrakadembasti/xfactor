import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PropertyForm } from '@/components/admin/PropertyForm';

export const metadata: Metadata = {
  title: 'Yeni İlan Ekle | Admin Paneli',
  description: 'Portföye yeni gayrimenkul ilanı ekleme sayfası.',
};

export default function NewPropertyPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/properties"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Yeni İlan Ekle
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sisteme yeni bir satılık veya kiralık gayrimenkul ilanı oluşturun.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <PropertyForm mode="create" />
      </div>
    </div>
  );
}
