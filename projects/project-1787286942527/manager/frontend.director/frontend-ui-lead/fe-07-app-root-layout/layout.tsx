import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { RoleProvider } from '@/context/RoleContext';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Akıllı Atık & Geri Dönüşüm Lojistik Platformu',
  description: 'Sıfır atık hedefleri için IoT destekli filo, rota ve operasyon yönetim sistemi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="h-full bg-slate-50 antialiased">
      <body className={`${inter.className} min-h-full flex flex-col text-slate-900`}>
        <RoleProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </RoleProvider>
      </body>
    </html>
  );
}
