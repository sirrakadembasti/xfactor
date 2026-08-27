import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PropertyForm } from '@/components/admin/PropertyForm';
import { prisma } from '@/lib/prisma';

interface EditPropertyPageProps {
  params: Promise<{ id: string }> | { id: string };
}

export async function generateMetadata({
  params,
}: EditPropertyPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const property = await prisma.property.findUnique({
    where: { id: resolvedParams.id },
    select: { title: true },
  });

  if (!property) {
    return {
      title: 'İlan Bulunamadı | Admin Paneli',
    };
  }

  return {
    title: `${property.title} Düzenle | Admin Paneli`,
    description: 'İlan bilgilerini güncelleme sayfası.',
  };
}

export default async function EditPropertyPage({
  params,
}: EditPropertyPageProps) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      category: true,
    },
  });

  if (!property) {
    notFound();
  }

  const initialData = {
    ...property,
    images: typeof property.images === 'string' ? JSON.parse(property.images || '[]') : property.images,
    features: typeof property.features === 'string' ? JSON.parse(property.features || '[]') : property.features,
  };

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
              İlanı Düzenle
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">{property.title}</span> başlıklı ilanı güncelliyorsunuz.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <PropertyForm mode="edit" initialData={initialData} />
      </div>
    </div>
  );
}
