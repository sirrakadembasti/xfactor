import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import './globals.css';

export const metadata = {
  title: 'Emlak Platformu - Güvenilir İlanlar',
  description: 'Hayalinizdeki satılık veya kiralık gayrimenkulü bulun.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="bg-gray-50 min-h-screen flex flex-col text-gray-900">
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <footer className="bg-white border-t border-gray-200 py-6 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} EmlakHub. Tüm hakları saklıdır.
        </footer>
      </body>
    </html>
  );
}
