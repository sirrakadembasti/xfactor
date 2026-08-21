import React from 'react';
import Link from 'next/link';

interface RoleCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  badgeText: string;
  badgeColor: string;
}

const RoleCard: React.FC<RoleCardProps> = ({
  title,
  description,
  href,
  icon,
  badgeText,
  badgeColor,
}) => {
  return (
    <Link
      href={href}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            {icon}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}
          >
            {badgeText}
          </span>
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {title}
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>
      <div className="mt-6 flex items-center text-sm font-semibold text-indigo-600 dark:text-indigo-400">
        Giriş Yap / Keşfet
        <svg
          className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
          />
        </svg>
      </div>
    </Link>
  );
};

export const RoleCardGrid: React.FC = () => {
  const roles = [
    {
      title: 'Öğrenci Paneli',
      description:
        'Kayıtlı sınavlarınıza katılın, anlık süre takibiyle testleri çözün ve performans raporlarınızı inceleyin.',
      href: '/student',
      badgeText: 'Öğrenci',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 14l9-5-9-5-9 5 9 5z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
          />
        </svg>
      ),
    },
    {
      title: 'Öğretmen Paneli',
      description:
        'Soru havuzunu yönetin, çoktan seçmeli yeni sınavlar tasarlayın ve sınıf bazlı başarı istatistiklerini izleyin.',
      href: '/teacher',
      badgeText: 'Eğitmen',
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      ),
    },
    {
      title: 'Yönetici Paneli',
      description:
        'Tüm kullanıcıları, sınıfları, rolleri ve platform geneli analitik verileri tek merkezden yönetin.',
      href: '/admin',
      badgeText: 'Admin',
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
      ),
    },
  ];

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Rolünüze Göre Başlayın
          </h2>
          <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
            Sanal Okul ekosisteminde size uygun yönetim ve öğrenme alanına geçiş yapın.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {roles.map((role) => (
            <RoleCard key={role.title} {...role} />
          ))}
        </div>
      </div>
    </section>
  );
};
