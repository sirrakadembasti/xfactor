import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Araç Kiralama Sistemi',
  description: 'Modern, güvenilir ve hızlı araç kiralama ve filo yönetim platformu.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground selection:bg-primary selection:text-primary-foreground">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
