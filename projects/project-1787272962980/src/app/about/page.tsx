import React from 'react';
import Link from 'next/link';
import {
  Building2,
  Target,
  Eye,
  Award,
  Users,
  ShieldCheck,
  Clock,
  HeartHandshake,
  ArrowRight,
} from 'lucide-react';

export const metadata = {
  title: 'Hakkımızda | Prestij Gayrimenkul',
  description: 'Gayrimenkul sektöründe güven, şeffaflık ve uzmanlıkla hayallerinizdeki yaşam alanlarını ve karlı yatırım fırsatlarını sizlerle buluşturuyoruz.',
};

const stats = [
  { label: 'Yıllık Deneyim', value: '15+' },
  { label: 'Mutlu Müşteri', value: '3.500+' },
  { label: 'Başarılı Portföy Satışı', value: '5.000+' },
  { label: 'Uzman Gayrimenkul Danışmanı', value: '40+' },
];

const coreValues = [
  {
    icon: ShieldCheck,
    title: 'Şeffaflık ve Güven',
    description:
      'Tüm süreçlerimizde açık iletişim, yasal güvence ve etik değerlere tam bağlılık ile hareket ederiz.',
  },
  {
    icon: Award,
    title: 'Üstün Hizmet Kalitesi',
    description:
      'Piyasa dinamiklerini yakından takip eden uzman kadromuzla müşterilerimize en doğru analiz ve danışmanlığı sunarız.',
  },
  {
    icon: HeartHandshake,
    title: 'Müşteri Odaklılık',
    description:
      'Her müşterimizin beklenti ve hayallerini merkeze alarak kişiye ve kuruma özel çözümler geliştiririz.',
  },
  {
    icon: Clock,
    title: 'Hızlı ve Etkin Çözüm',
    description:
      'Geniş ağımız ve dijital altyapımız ile gayrimenkul alım, satım ve kiralama süreçlerinizi hızlandırırız.',
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Hero Section */}
      <section className="relative bg-slate-900 py-24 px-4 sm:px-6 lg:px-8 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="relative max-w-5xl mx-auto text-center space-y-6">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Building2 className="w-4 h-4" />
            Kurumsal Kimliğimiz
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white font-serif">
            Geleceğin Yaşam Alanlarını <br />
            <span className="text-blue-400">Güvenle İnşa Ediyoruz</span>
          </h1>
          <p className="max-w-3xl mx-auto text-lg sm:text-xl text-slate-300 leading-relaxed">
            Prestij Gayrimenkul olarak kurulduğumuz günden bu yana, modern şehircilik anlayışını ve karlı yatırım fırsatlarını titizlikle bir araya getiriyoruz.
          </p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 shadow-md border border-slate-100 text-center transition-transform hover:-translate-y-1"
            >
              <div className="text-3xl sm:text-4xl font-extrabold text-blue-600 mb-1">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-slate-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Story & Vision / Mission */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-6">
            <div className="inline-block text-sm font-semibold tracking-wider text-blue-600 uppercase">
              Hikayemiz
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 font-serif leading-tight">
              Sadece Gayrimenkul Değil, Kalıcı Değerler Üretiyoruz
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Sektördeki 15 yılı aşkın yolculuğumuzda, konut ve ticari gayrimenkul alanında binlerce aileyi ve yatırımcıyı doğru projelerle buluşturduk. Şeffaflık, güvenilirlik ve tarafsız danışmanlık prensiplerimizle bölgesel liderliğimizi sürdürüyoruz.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Teknolojik altyapımız, geniş portföy ağımız ve hukuki/finansal danışmanlık hizmetlerimizle alım-satım süreçlerinin her adımında yanınızdayız.
            </p>
            <div className="pt-2">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition shadow-sm"
              >
                Bizimle İletişime Geçin
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Misyonumuz</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Müşterilerimizin bütçelerine, hedeflerine ve hayallerine en uygun gayrimenkul çözümlerini tam şeffaflık, dürüstlük ve profesyonel rehberlik ile sunarak hayatlarını kolaylaştırmak.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Eye className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Vizyonumuz</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Gayrimenkul sektöründe müşteri memnuniyeti, teknolojik inovasyon ve sürdürülebilir danışmanlık standartlarını belirleyen, Türkiye’nin en güvenilir ve tercih edilen markası olmak.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values Section */}
      <section className="bg-slate-100/70 py-20 border-y border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <span className="text-sm font-semibold tracking-wider text-blue-600 uppercase">
              Temel İlkelerimiz
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 font-serif">
              Bizi Farklı Kılan Değerlerimiz
            </h2>
            <p className="text-slate-600">
              Her işlemimizde taviz vermediğimiz kurumsal prensiplerimiz ile sektörde fark yaratıyoruz.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {coreValues.map((value, idx) => {
              const Icon = value.icon;
              return (
                <div
                  key={idx}
                  className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow space-y-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{value.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {value.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-8 sm:p-12 text-white text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-8 shadow-xl">
          <div className="space-y-3 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold font-serif">
              Portföyünüzü Birlikte Değerlendirelim
            </h2>
            <p className="text-blue-100 text-sm sm:text-base leading-relaxed">
              Gayrimenkulünüzü satmak, kiralamak veya yeni bir yatırım fırsatı keşfetmek için uzman ekibimiz bir telefon uzağınızda.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
            <Link
              href="/properties"
              className="px-6 py-3 rounded-xl bg-white text-blue-900 font-semibold hover:bg-blue-50 transition shadow"
            >
              İlanları İncele
            </Link>
            <Link
              href="/contact"
              className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 border border-blue-400/30 transition"
            >
              İletişime Geç
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
