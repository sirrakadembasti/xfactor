import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0284c7',
};

export const metadata: Metadata = {
  title: {
    default: 'Emlak Portalı | Güvenilir Gayrimenkul Danışmanlığı',
    template: '%s | Emlak Portalı',
  },
  description:
    'Satılık ve kiralık daire, arsa, villa, iş yeri ve tüm gayrimenkul ilanları en uygun fırsatlarla sizleri bekliyor.',
  keywords: [
    'emlak',
    'gayrimenkul',
    'satılık daire',
    'kiralık daire',
    'arsa',
    'villa',
    'iş yeri',
    'emlak danışmanlığı',
  ],
  authors: [{ name: 'Emlak Portalı' }],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Emlak Portalı',
    title: 'Emlak Portalı | Güvenilir Gayrimenkul Danışmanlığı',
    description:
      'Hayalinizdeki gayrimenkulü keşfedin. Satılık ve kiralık en güncel portföyümüzle hizmetinizdeyiz.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`scroll-smooth ${inter.variable}`}>
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased selection:bg-sky-500 selection:text-white">
        <Header />
        <main className="flex-1 w-full">{children}</main>
        <Footer />
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}
