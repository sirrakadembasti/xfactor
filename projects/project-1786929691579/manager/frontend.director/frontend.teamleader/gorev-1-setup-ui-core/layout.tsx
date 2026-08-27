import React from 'react';
import type { Metadata } from 'next';
import { APP_NAME, APP_DESCRIPTION } from '@/lib/constants';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="h-full">
      <body className="h-full bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        <div className="min-h-full flex flex-col">{children}</div>
      </body>
    </html>
  );
}
