import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  BadgeCheck,
  Users,
  Clock,
  Star,
  PhoneCall,
  Calendar,
  MessageCircle,
  Quote,
} from 'lucide-react';

interface WhyUsReviewsProps {
  phone?: string;
  whatsappNumber?: string;
}

const features = [
  {
    icon: ShieldCheck,
    title: 'Güvenli & Şeffaf Süreç',
    description:
      'Tüm tapu, sözleşme ve hukuki aşamalarda tam şeffaflık ve sıfır risk prensibiyle yanınızdayız.',
  },
  {
    icon: BadgeCheck,
    title: 'Doğrulanmış Portföy',
    description:
      'Sitemizdeki her mülk, danışmanlarımız tarafından bizzat yerinde incelenmiş ve ekspertizi yapılmıştır.',
  },
  {
    icon: Users,
    title: 'Uzman Danışman Kadrosu',
    description:
      'Bölgesel pazar dinamiklerine ve yatırım trendlerine hakim lisanslı profesyonellerle çalışın.',
  },
  {
    icon: Clock,
    title: 'Hızlı & Kolay Randevu',
    description:
      'Zamanınız değerli. Tek tıkla müsaitlik takvimine göre yerinde veya online sunum planlayın.',
  },
];

const reviews = [
  {
    name: 'Murat Karaarslan',
    role: 'Yatırımcı / Girişimci',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment:
      'Bodrum\'da aradığım yazlık villayı sadece 1 hafta içinde bulduk. Tapu sürecindeki hızları ve dürüst yaklaşımları için tüm ekibe teşekkür ederim.',
    property: 'Bodrum Lüks Villa',
  },
  {
    name: 'Selin & Can Yılmaz',
    role: 'Ev Sahibi',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment:
      'Kadıköy\'deki dairemizi değerinde ve çok kısa sürede sattılar. Sürecin her adımında bilgilendirildik. Kesinlikle tavsiye ediyoruz.',
    property: 'Kadıköy 3+1 Daire',
  },
  {
    name: 'Av. Ahmet Demir',
    role: 'Hukuk Danışmanı',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    rating: 5,
    comment:
      'Ofis taşınma sürecimizde ihtiyaçlarımızı nokta atışı analiz edip bize en verimli lokasyonda bir plaza katı sundular. Çok profesyoneller.',
    property: 'Levent Ofis Katı',
  },
];

export const WhyUsReviews: React.FC<WhyUsReviewsProps> = ({
  phone = '+90 (212) 555 0123',
  whatsappNumber = '905550000000',
}) => {
  return (
    <div className="bg-white">
      {/* NEDEN BİZ BÖLÜMÜ */}
      <section className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-sm font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            Avantajlarımız
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-3">
            Neden Bizi Tercih Etmelisiniz?
          </h2>
          <p className="text-slate-600 mt-3 text-base">
            Doğru gayrimenkul yatırımı ve hayalinizdeki yuvaya ulaşmanız için profesyonel çözümler sunuyoruz.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-md shadow-blue-500/20">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* MÜŞTERİ YORUMLARI BÖLÜMÜ */}
      <section className="py-16 md:py-24 bg-slate-900 text-white relative overflow-hidden">
        {/* Dekoratif Arka Plan Işıkları */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-sm font-semibold uppercase tracking-wider text-blue-400 bg-blue-950/80 border border-blue-800/50 px-3 py-1 rounded-full">
              Memnuniyet Garantisi
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mt-3">
              Müşterilerimiz Ne Diyor?
            </h2>
            <p className="text-slate-400 mt-3 text-base">
              Bizi tercih eden yüzlerce mutlu müşteri ve yatırımcımızın deneyimleri.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {reviews.map((rev, index) => (
              <div
                key={index}
                className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/60 p-7 rounded-2xl flex flex-col justify-between hover:border-slate-600 transition duration-300 relative"
              >
                <Quote className="absolute top-6 right-6 w-8 h-8 text-slate-700/40 pointer-events-none" />
                <div>
                  <div className="flex items-center gap-1 text-amber-400 mb-4">
                    {[...Array(rev.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6 italic">
                    &ldquo;{rev.comment}&rdquo;
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-slate-700/60">
                  <div
                    className="w-11 h-11 rounded-full bg-cover bg-center border border-slate-600 shadow-sm flex-shrink-0"
                    style={{ backgroundImage: `url(${rev.avatar})` }}
                  />
                  <div className="overflow-hidden">
                    <h4 className="text-sm font-bold text-white truncate">
                      {rev.name}
                    </h4>
                    <p className="text-xs text-slate-400 truncate">
                      {rev.role} • <span className="text-blue-400">{rev.property}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HIZLI RANDEVU & CTA BANNER */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 rounded-3xl p-8 md:p-12 text-white shadow-xl flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden">
            {/* Süsleme Çemberleri */}
            <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-white/10 rounded-full blur-2xl pointer-events-none" />

            <div className="space-y-3 max-w-2xl text-center lg:text-left z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold tracking-wide">
                <Calendar className="w-3.5 h-3.5" />
                Ücretsiz Danışmanlık
              </span>
              <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Hayalinizdeki Evi Birlikte Bulalım
              </h3>
              <p className="text-blue-100 text-sm md:text-base leading-relaxed">
                Aradığınız kriterleri bize iletin, size en uygun satılık veya kiralık gayrimenkulleri hazırlayalım.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 z-10 w-full lg:w-auto">
              <Link
                href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm shadow-md hover:shadow-emerald-500/25 transition-all duration-200 w-full sm:w-auto"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp\'tan Yazın
              </Link>
              <Link
                href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white text-blue-900 hover:bg-slate-100 font-semibold text-sm shadow-md transition-all duration-200 w-full sm:w-auto"
              >
                <PhoneCall className="w-4 h-4 text-blue-600" />
                Hemen Arayın
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
