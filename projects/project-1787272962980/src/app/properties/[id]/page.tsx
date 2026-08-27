import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  MapPin,
  BedDouble,
  Bath,
  Square,
  Calendar,
  Layers,
  Flame,
  Building2,
  Share2,
  Heart,
  CheckCircle2,
  Phone,
  Mail,
  Send,
  ShieldCheck,
  Compass,
  ArrowLeft
} from 'lucide-react';

interface PropertyDetailPageProps {
  params: {
    id: string;
  };
}

// Örnek / fallback veri seti
const mockProperty = {
  id: '1',
  title: 'Kadıköy Moda Sahilinde Panoramik Deniz Manzaralı Lüks 3+1 Daire',
  description: `Kadıköy'ün en seçkin lokasyonlarından biri olan Moda Sahili'nde, kesintisiz Adalar ve deniz manzarasına hakim, birinci sınıf malzeme kalitesiyle baştan sona yenilenmiş 3+1 daire.

Dairemiz brüt 165 m², net 140 m² kullanım alanına sahip olup güney ve batı cephelidir. Gün boyu doğal ışık almakta ve gün batımını doğrudan izleme imkanı sunmaktadır.

Bina kapalı otoparklı, 24 saat güvenlikli, çift asansörlü ve jeneratörlüdür. Toplu taşıma, vapur iskelesi ve sahil yürüyüş yollarına yürüme mesafesindedir.`,
  price: 18500000,
  currency: 'TRY',
  type: 'SATILIK',
  category: 'Konut / Daire',
  location: {
    city: 'İstanbul',
    district: 'Kadıköy',
    neighborhood: 'Caferağa Mah.',
    address: 'Moda Caddesi No: 42',
    lat: 40.9852,
    lng: 29.0278,
  },
  specs: {
    grossArea: 165,
    netArea: 140,
    rooms: '3+1',
    bathrooms: 2,
    buildingAge: '3 Yıl',
    floorLocation: '7. Kat',
    totalFloors: 10,
    heating: 'Yerden Isıtma (Doğalgaz)',
    balcony: 'Mevcut (2 Adet)',
    furnished: 'Eşyasız',
    dues: '1.200 TL',
    status: 'Boş / Taşınmaya Hazır',
    deedStatus: 'Kat Mülkiyetli',
    usableForLoan: 'Krediye Uygun',
  },
  interiorFeatures: [
    'Akıllı Ev Altyapısı',
    'Ankastre Mutfak',
    'Giyinme Odası',
    'Ebeveyn Banyosu',
    'Lamine Parke',
    'Spot & LED Aydınlatma',
    'Görüntülü Diafon',
    'Çelik Kapı',
    'Vestiyer',
    'Isıcam Konfor PVC',
  ],
  exteriorFeatures: [
    'Kapalı Otopark',
    'Açık Otopark',
    '24/7 Güvenlik & Kamera',
    'Çift Asansör',
    'Tam Güç Jeneratör',
    'Su Deposu & Hidrofor',
    'Isı ve Ses Yalıtımı',
    'Çocuk Oyun Parkı',
    'Yangın Merdiveni',
  ],
  images: [
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
  ],
  agent: {
    id: 'agent-1',
    name: 'Ahmet Yılmaz',
    title: 'Kıdemli Gayrimenkul Danışmanı',
    phone: '+90 (532) 123 45 67',
    email: 'ahmet.yilmaz@emlakofisi.com',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&q=80',
    company: 'Emlak Portalı Kurumsal Ofis',
  },
  similarProperties: [
    {
      id: '2',
      title: 'Fenerbahçe Sahile Yakın Sıfır 2+1 Lüks Daire',
      price: 14250000,
      location: 'İstanbul, Kadıköy, Fenerbahçe',
      rooms: '2+1',
      area: 110,
      image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80',
    },
    {
      id: '3',
      title: 'Caddebostan Barlar Sokağında Geniş 4+1 Dubleks',
      price: 26000000,
      location: 'İstanbul, Kadıköy, Caddebostan',
      rooms: '4+1',
      area: 220,
      image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=600&q=80',
    },
    {
      id: '4',
      title: 'Suadiye Bağdat Caddesi Üzerinde Yenilenmiş 3+1',
      price: 19800000,
      location: 'İstanbul, Kadıköy, Suadiye',
      rooms: '3+1',
      area: 150,
      image: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=600&q=80',
    },
  ],
};

export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { id } = params;
  
  if (!id) {
    notFound();
  }

  const property = mockProperty;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 text-slate-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Navigasyon / Geri Dön */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/properties"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-blue-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Tüm İlanlara Dön
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Share2 className="h-4 w-4" />
              Paylaş
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 shadow-sm transition hover:bg-rose-50"
            >
              <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
              Favorilere Ekle
            </button>
          </div>
        </div>

        {/* Başlık ve Fiyat Özeti */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                {property.type}
              </span>
              <span className="rounded-md bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                {property.category}
              </span>
              <span className="text-xs text-slate-500">İlan No: #{property.id.padStart(6, '0')}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl lg:text-4xl">
              {property.title}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-4 w-4 text-blue-600" />
              {property.location.neighborhood}, {property.location.district}, {property.location.city}
            </p>
          </div>
          <div className="text-left md:text-right">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Fiyat</span>
            <div className="text-3xl font-extrabold text-blue-600">
              {formatCurrency(property.price)}
            </div>
          </div>
        </div>

        {/* Fotoğraf Galerisi */}
        <div className="mb-10 grid grid-cols-1 gap-2 overflow-hidden rounded-2xl md:h-[480px] md:grid-cols-4 md:grid-rows-2">
          <div className="relative h-72 md:col-span-2 md:row-span-2 md:h-full">
            <Image
              src={property.images[0]}
              alt={property.title}
              fill
              priority
              className="object-cover transition duration-300 hover:scale-105"
            />
          </div>
          {property.images.slice(1, 5).map((img, idx) => (
            <div key={idx} className="relative hidden h-full overflow-hidden md:block">
              <Image
                src={img}
                alt={`${property.title} - ${idx + 2}`}
                fill
                className="object-cover transition duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>

        {/* Ana İçerik ve Yan Panel */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Sol Kolon - İlan Detayları */}
          <div className="space-y-8 lg:col-span-2">
            {/* Öne Çıkan Özellikler Şeridi */}
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                  <Square className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Net / Brüt Alan</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {property.specs.netArea} m² / {property.specs.grossArea} m²
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                  <BedDouble className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Oda Sayısı</p>
                  <p className="text-sm font-semibold text-slate-800">{property.specs.rooms}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                  <Bath className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Banyo</p>
                  <p className="text-sm font-semibold text-slate-800">{property.specs.bathrooms} Banyo</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Bulunduğu Kat</p>
                  <p className="text-sm font-semibold text-slate-800">{property.specs.floorLocation}</p>
                </div>
              </div>
            </div>

            {/* İlan Detay Özellikler Tablosu */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900">İlan Özellikleri</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500 flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /> Bina Yaşı</dt>
                  <dd className="font-medium text-slate-800">{property.specs.buildingAge}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500 flex items-center gap-2"><Layers className="h-4 w-4 text-slate-400" /> Toplam Kat</dt>
                  <dd className="font-medium text-slate-800">{property.specs.totalFloors}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500 flex items-center gap-2"><Flame className="h-4 w-4 text-slate-400" /> Isıtma Tipi</dt>
                  <dd className="font-medium text-slate-800">{property.specs.heating}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500 flex items-center gap-2"><Compass className="h-4 w-4 text-slate-400" /> Balkon</dt>
                  <dd className="font-medium text-slate-800">{property.specs.balcony}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Eşya Durumu</dt>
                  <dd className="font-medium text-slate-800">{property.specs.furnished}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Kullanım Durumu</dt>
                  <dd className="font-medium text-slate-800">{property.specs.status}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Tapu Durumu</dt>
                  <dd className="font-medium text-slate-800">{property.specs.deedStatus}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Krediye Uygunluk</dt>
                  <dd className="font-medium text-emerald-600 font-semibold flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4" /> {property.specs.usableForLoan}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2 sm:col-span-2">
                  <dt className="text-slate-500">Aidat Tutarı</dt>
                  <dd className="font-medium text-slate-800">{property.specs.dues}</dd>
                </div>
              </dl>
            </div>

            {/* Açıklama */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900">İlan Açıklaması</h2>
              <div className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {property.description}
              </div>
            </div>

            {/* İç ve Dış Özellikler Checklist */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-bold text-slate-900">Donanım ve Özellikler</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">İç Özellikler</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {property.interiorFeatures.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">Bina ve Dış Özellikler</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {property.exteriorFeatures.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Harita / Konum */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-bold text-slate-900">Konum</h2>
              <p className="mb-4 text-sm text-slate-500">{property.location.address}, {property.location.district} / {property.location.city}</p>
              <div className="relative h-64 w-full overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
                <div className="flex h-full w-full flex-col items-center justify-center bg-slate-200 text-slate-500">
                  <MapPin className="h-8 w-8 text-rose-500 animate-bounce" />
                  <p className="mt-2 text-sm font-medium">{property.location.neighborhood}, {property.location.district}</p>
                  <span className="text-xs text-slate-400">(Harita Koordinatları: {property.location.lat}, {property.location.lng})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sağ Kolon - Danışman Formu & İletişim Kartı */}
          <div className="space-y-6 lg:col-span-1">
            <div className="sticky top-6 space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full border border-slate-200">
                    <Image
                      src={property.agent.avatar}
                      alt={property.agent.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{property.agent.name}</h3>
                    <p className="text-xs text-slate-500">{property.agent.title}</p>
                    <p className="mt-1 text-xs font-semibold text-blue-600">{property.agent.company}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <a
                    href={`tel:${property.agent.phone}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <Phone className="h-4 w-4" />
                    Danışmanı Ara
                  </a>
                  <a
                    href={`mailto:${property.agent.email}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Mail className="h-4 w-4" />
                    E-Posta Gönder
                  </a>
                </div>

                {/* Hızlı Bilgi & Teklif Formu */}
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <h4 className="mb-3 text-sm font-bold text-slate-900">Bilgi Alın / Mesaj Gönder</h4>
                  <form className="space-y-3">
                    <div>
                      <label htmlFor="name" className="sr-only">Adınız Soyadınız</label>
                      <input
                        type="text"
                        id="name"
                        placeholder="Adınız Soyadınız"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="sr-only">Telefon Numaranız</label>
                      <input
                        type="tel"
                        id="phone"
                        placeholder="Telefon Numaranız"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="message" className="sr-only">Mesajınız</label>
                      <textarea
                        id="message"
                        rows={3}
                        defaultValue={`Merhaba, "${property.title}" ilanı hakkında detaylı bilgi almak istiyorum.`}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <Send className="h-4 w-4" />
                      Mesajı Gönder
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Benzer İlanlar Bölümü */}
        <div className="mt-16 border-t border-slate-200 pt-10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Benzer İlanlar</h2>
              <p className="text-sm text-slate-500">Aynı bölgede ilginizi çekebilecek alternatif gayrimenkuller</p>
            </div>
            <Link
              href="/properties"
              className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Hepsini Gör &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {property.similarProperties.map((simProp) => (
              <Link
                key={simProp.id}
                href={`/properties/${simProp.id}`}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                  <Image
                    src={simProp.image}
                    alt={simProp.title}
                    fill
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <div className="text-lg font-bold text-blue-600">
                    {formatCurrency(simProp.price)}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-600">
                    {simProp.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-1">{simProp.location}</p>
                  <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <BedDouble className="h-3.5 w-3.5 text-slate-400" />
                      {simProp.rooms}
                    </span>
                    <span className="flex items-center gap-1">
                      <Square className="h-3.5 w-3.5 text-slate-400" />
                      {simProp.area} m²
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
