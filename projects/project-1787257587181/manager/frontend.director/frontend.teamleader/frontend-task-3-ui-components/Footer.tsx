import React from 'react';

export interface FooterLinkGroup {
  title: string;
  links: { label: string; href: string }[];
}

export interface FooterProps {
  appName?: string;
  description?: string;
  linkGroups?: FooterLinkGroup[];
}

export const Footer: React.FC<FooterProps> = ({
  appName = 'Platform',
  description = 'Gelişmiş dijital çözümler ve modern web teknolojileri platformu.',
  linkGroups = [
    {
      title: 'Ürün',
      links: [
        { label: 'Özellikler', href: '#' },
        { label: 'Entegrasyonlar', href: '#' },
        { label: 'Fiyatlandırma', href: '#' },
        { label: 'Yol Haritası', href: '#' }
      ]
    },
    {
      title: 'Kaynaklar',
      links: [
        { label: 'Dokümantasyon', href: '#' },
        { label: 'Rehberler', href: '#' },
        { label: 'API Durumu', href: '#' },
        { label: 'Topluluk', href: '#' }
      ]
    },
    {
      title: 'Şirket',
      links: [
        { label: 'Hakkımızda', href: '#' },
        { label: 'Kariyer', href: '#' },
        { label: 'Gizlilik Politikası', href: '#' },
        { label: 'Kullanım Şartları', href: '#' }
      ]
    }
  ]
}) => {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 dark:bg-gray-900 dark:border-gray-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                {appName.charAt(0)}
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {appName}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Link Groups */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 md:col-span-3">
            {linkGroups.map((group, idx) => (
              <div key={idx} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-200">
                  {group.title}
                </h4>
                <ul className="space-y-2.5">
                  {group.links.map((link, linkIdx) => (
                    <li key={linkIdx}>
                      <a
                        href={link.href}
                        className="text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} {appName}. Tüm hakları saklıdır.
          </p>
          <div className="flex space-x-6 text-sm text-gray-500 dark:text-gray-400">
            <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">Gizlilik</a>
            <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">Şartlar</a>
            <a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">Güvenlik</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
