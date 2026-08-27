import React from 'react';
import Link from 'next/link';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Clock,
  ChevronRight,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  ShieldCheck
} from 'lucide-react';

const quickLinks = [
  { name: 'Ana Sayfa', href: '/' },
  { name: 'Satılık İlanlar', href: '/ilanlar?type=SALE' },
  { name: 'Kiralık İlanlar', href: '/ilanlar?type=RENT' },
  { name: 'Öne Çıkan Portföy', href: '/ilanlar?featured=true' },
  { name: 'Kurumsal', href: '/kurumsal' },
  { name: 'İletişim & Talep', href: '/iletisim' },
];

const propertyCategories = [
  { name: 'Satılık Daire', href: '/ilanlar?type=SALE' },
  { name: 'Kiralık Daire', href: '/ilanlar?type=RENT' },
  { name: 'Satılık Villa & Müstakil', href: '/ilanlar?type=SALE' },
  { name: 'Ticari & Ofis', href: '/ilanlar' },
  { name: 'Arsa & Arazi', href: '/ilanlar' },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Column 1: Brand Info */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-500 transition-colors">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-white tracking-tight">
                  ESTATE<span className="text-blue-500">PRO</span>
                </span>
                <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase">
                  Gayrimenkul & Danışmanlık
                </span>
              </div>
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed">
              Hayalinizdeki gayrimenkulü bulmanız için güvenilir, şeffaf ve profesyonel çözümler sunuyoruz.
            </p>
            {/* Social Media Links */}
            <div className="pt-2 flex items-center space-x-3">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-600 transition-all"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-600 transition-all"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-600 transition-all"
                aria-label="Twitter"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-600 transition-all"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-white text-base font-semibold mb-4 tracking-wide">
              Hızlı Bağlantılar
            </h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors flex items-center group"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-blue-500 mr-1.5 opacity-75 group-hover:translate-x-0.5 transition-transform" />
                    <span>{link.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Categories & Portfolios */}
          <div>
            <h3 className="text-white text-base font-semibold mb-4 tracking-wide">
              Portföy Kategorileri
            </h3>
            <ul className="space-y-2.5">
              {propertyCategories.map((cat) => (
                <li key={cat.name}>
                  <Link
                    href={cat.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors flex items-center group"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-blue-500 mr-1.5 opacity-75 group-hover:translate-x-0.5 transition-transform" />
                    <span>{cat.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Contact Information */}
          <div>
            <h3 className="text-white text-base font-semibold mb-4 tracking-wide">
              İletişim & Ofis
            </h3>
            <ul className="space-y-3.5 text-sm">
              <li className="flex items-start gap-3 text-slate-400">
                <MapPin className="w-4 h-4 text-blue-500 mt-1 shrink-0" />
                <span>Levent Mah. Büyükdere Cad. No:123/A Şişli, İstanbul</span>
              </li>
              <li className="flex items-center gap-3 text-slate-400">
                <Phone className="w-4 h-4 text-blue-500 shrink-0" />
                <a
                  href="tel:+902120000000"
                  className="hover:text-white transition-colors"
                >
                  +90 (212) 000 00 00
                </a>
              </li>
              <li className="flex items-center gap-3 text-slate-400">
                <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                <a
                  href="mailto:info@estatepro.com"
                  className="hover:text-white transition-colors"
                >
                  info@estatepro.com
                </a>
              </li>
              <li className="flex items-center gap-3 text-slate-400">
                <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                <span>Pzt - Cmt: 09:00 - 18:30</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-slate-800 bg-slate-950/60 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>
            &copy; {currentYear} EstatePro Gayrimenkul. Tüm hakları saklıdır.
          </p>
          <div className="flex items-center space-x-6">
            <Link href="/kurumsal" className="hover:text-white transition-colors">
              Gizlilik Politikası
            </Link>
            <Link href="/kurumsal" className="hover:text-white transition-colors">
              Kullanım Şartları
            </Link>
            <Link
              href="/admin"
              className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Yönetim Girişi</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
