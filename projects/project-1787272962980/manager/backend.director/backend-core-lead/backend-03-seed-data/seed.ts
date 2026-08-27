import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Veritabanı tohumlama işlemi başlatılıyor...');

  // Mevcut verileri temizleme
  await prisma.inquiry.deleteMany();
  await prisma.property.deleteMany();
  await prisma.category.deleteMany();
  await prisma.setting.deleteMany();

  // 1. Kategoriler
  console.log('📁 Kategoriler oluşturuluyor...');
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Lüks Villa',
        slug: 'luks-villa',
        description: 'Özel havuzlu, geniş bahçeli ve modern mimariye sahip müstakil villalar',
        order: 1,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Rezidans & Daire',
        slug: 'rezidans-daire',
        description: 'Şehir merkezinde, güvenlikli ve sosyal donatılara sahip modern yaşam alanları',
        order: 2,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Yalı & Köşk',
        slug: 'yali-kosk',
        description: 'Boğaz hattında ve tarihi dokuda eşsiz prestijli gayrimenkuller',
        order: 3,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Penthouse & Çatı Dubleksi',
        slug: 'penthouse-cati-dubleksi',
        description: 'Panoramik şehir ve deniz manzaralı ayrıcalıklı çatı katları',
        order: 4,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Ticari & Ofis',
        slug: 'ticari-ofis',
        description: 'Merkezi lokasyonlarda yüksek kira getirili ticari mülkler ve plazalar',
        order: 5,
      },
    }),
  ]);

  const [villaCat, daireCat, yaliCat, penthouseCat, ticariCat] = categories;

  // 2. Gayrimenkuller
  console.log('🏡 Gayrimenkul ilanları oluşturuluyor...');
  const properties = await Promise.all([
    prisma.property.create({
      data: {
        title: 'Bodrum Yalıkavak Marina Manzaralı Sonsuzluk Havuzlu Taş Villa',
        slug: 'bodrum-yalikavak-sonsuzluk-havuzlu-tas-villa',
        description: 'Yalıkavak\'ın en prestijli lokasyonunda, kesintisiz gün batımı ve marina manzarasına sahip 6 yatak odalı akıllı villa. Doğal taş işçiliği, yerden ısıtma, özel spa alanı ve geniş peyzajlı bahçesi ile 4 mevsim yaşama uygundur.',
        price: 48500000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Bodrum, Muğla',
        address: 'Yalıkavak Mah. Tilkicik Koyu Yolu No: 18',
        bedrooms: 6,
        bathrooms: 7,
        area: 650,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Özel Sonsuzluk Havuzu',
          'Akıllı Ev Altyapısı',
          'Yerden Isıtma & VRF Klima',
          'Kapalı Otopark (3 Araç)',
          'Müştemilat',
          'Jeneratör',
          'Özel Güvenlik',
        ]),
        featured: true,
        isPublished: true,
        categoryId: villaCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Beşiktaş Bebek Sırtlarında Panoramik Boğaz Manzaralı Lüks Çatı Dubleksi',
        slug: 'besiktas-bebek-panoramik-bogaz-manzarali-cati-dubleksi',
        description: 'Bebek Koyu\'na hakim eşsiz terası, özel asansör girişi ve ödüllü mimari tasarımıyla öne çıkan penthouse. İtalyan mutfak, Gaggenau ankastreler ve lüks mermer kaplamalarla donatılmıştır.',
        price: 82000000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Beşiktaş, İstanbul',
        address: 'Bebek Mah. Cevdetpaşa Cad. No: 42',
        bedrooms: 4,
        bathrooms: 4,
        area: 380,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          '120 m² Teras Alanı',
          'Şömine',
          'Özel Asansör Kartı',
          'Giyinme Odası',
          'Sauna & Jakuzi',
          '24/7 Güvenlik',
        ]),
        featured: true,
        isPublished: true,
        categoryId: penthouseCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Çeşme Alaçatı Merkezde Tarihi Dokuda Butik Havuzlu Taş Konak',
        slug: 'cesme-alacati-tarihi-dokuda-havuzlu-tas-konak',
        description: 'Alaçatı\'nın otantik dokusunu modern konforla birleştiren, özenle restore edilmiş taş konak. Yüksek tavanlar, ferah iç avlu ve özel ısıtmalı havuz ile butik otel veya lüks konut kullanımına uygundur.',
        price: 27500000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Çeşme, İzmir',
        address: 'Alaçatı Mah. 12001 Sok. No: 9',
        bedrooms: 5,
        bathrooms: 5,
        area: 320,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Isıtmalı Havuz',
          'Özel İç Bahçe / Avlu',
          'Orijinal Alaçatı Taşı',
          'Kış Bahçesi',
          'Isı Pompası',
        ]),
        featured: true,
        isPublished: true,
        categoryId: villaCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Kadıköy Caddebostan Sahilinde Deniz Manzaralı Kiralık 3+1 Daire',
        slug: 'kadikoy-caddebostan-sahil-deniz-manzarali-kiralik-daire',
        description: 'Bağdat Caddesi ve sahil bandına yürüme mesafesinde, kapanmaz deniz ve Adalar manzaralı, yeni binada geniş salonlu ve balkonlu kiralık lüks daire.',
        price: 95000,
        currency: 'TRY',
        type: 'RENT',
        status: 'AVAILABLE',
        location: 'Kadıköy, İstanbul',
        address: 'Caddebostan Mah. Operatör Cemil Topuzlu Cad. No: 78',
        bedrooms: 3,
        bathrooms: 2,
        area: 175,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Deniz & Adalar Manzarası',
          'Kapalı Otopark',
          'Siemens Ankastre',
          'Geniş Balkon',
          'Ebeveyn Banyosu',
        ]),
        featured: false,
        isPublished: true,
        categoryId: daireCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Sarıyer Yeniköy\'de Denize Sıfır Tarihi Eser Tescilli Yalı',
        slug: 'sariyer-yenikoy-denize-sifir-tarihi-yali',
        description: 'İstanbul Boğazı\'nın en kıymetli noktasında, özel iskelesi ve tekne yanaşma alanı olan, 2. derece tarihi eser statüsünde restore edilmiş eşsiz yalı mülkü.',
        price: 240000000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Sarıyer, İstanbul',
        address: 'Yeniköy Mah. Köybaşı Cad. No: 104',
        bedrooms: 8,
        bathrooms: 8,
        area: 920,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Özel İskele',
          'Tekne Palamarı',
          'Tarihi Doku',
          'Geniş Rıhtım Alanı',
          'Güvenlik ve Kamera Sistemi',
          'Asansör',
        ]),
        featured: true,
        isPublished: true,
        categoryId: yaliCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Antalya Lara KemerAğzı Denize Yakın Müstakil Akıllı Villa',
        slug: 'antalya-lara-mustakil-akilli-villa',
        description: 'Havalimanına 15 dk, plajlara 5 dk mesafede, geniş bahçeli, özel yüzme havuzlu ve güneş enerjisi panelli modern sıfır villa.',
        price: 18500000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Muratpaşa, Antalya',
        address: 'Kemerağzı Mah. 3201 Sok. No: 12',
        bedrooms: 4,
        bathrooms: 3,
        area: 280,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1584738766473-61c083514bf4?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Özel Yüzme Havuzu',
          'Güneş Paneli Sistemi',
          'Otomatik Bahçe Sulama',
          'Barbekü Alanı',
          'Kamera Sistemi',
        ]),
        featured: false,
        isPublished: true,
        categoryId: villaCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Ankara Çankaya Çayyolu\'nda Güvenlikli Sitede Tripleks Villa',
        slug: 'ankara-cankaya-cayyolunda-guvenlikli-tripleks-villa',
        description: 'Çayyolu\'nun elit sitelerinden birinde, 700 m² arsa payı, kış bahçesi, sauna ve 2 araçlık kapalı garaj imkanı sunan masrafsız aile villası.',
        price: 22000000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Çankaya, Ankara',
        address: 'Alacaatlı Mah. Park Caddesi No: 45',
        bedrooms: 5,
        bathrooms: 4,
        area: 450,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Kış Bahçesi',
          'Sauna',
          'Site İçi Ortak Havuz',
          '2 Araçlık Kapalı Garaj',
          '7/24 Fiziki Güvenlik',
        ]),
        featured: false,
        isPublished: true,
        categoryId: villaCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Şişli Bomonti\'de Rezidans Kulesinde Yüksek Kat Kiralık 2+1',
        slug: 'sisli-bomonti-rezidans-kiralik-2-1',
        description: 'Merkezi konumda, metroya 5 dakika mesafede, full eşyalı ve tasarım mobilyalarla donatılmış, concierge hizmeti sunan lüks rezidans dairesi.',
        price: 65000,
        currency: 'TRY',
        type: 'RENT',
        status: 'AVAILABLE',
        location: 'Şişli, İstanbul',
        address: 'Cumhuriyet Mah. Kazım Orbay Cad. No: 22',
        bedrooms: 2,
        bathrooms: 2,
        area: 120,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Full Eşyalı',
          'Concierge & Vale',
          'Fitness & Kapalı Havuz',
          'Jeneratör',
          'Resepsiyon',
        ]),
        featured: false,
        isPublished: true,
        categoryId: daireCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Levent Büyükdere Caddesi Üzerinde Plaza Katı Ticari Ofis',
        slug: 'levent-buyukdere-caddesi-plaza-kati-ofis',
        description: 'Finans merkezinin kalbinde, metro bağlantılı A+ plazada, taşınmaya hazır, toplantı odaları ve yönetici odaları bölünmüş tam donanımlı ofis katı.',
        price: 350000,
        currency: 'TRY',
        type: 'RENT',
        status: 'AVAILABLE',
        location: 'Beşiktaş, İstanbul',
        address: 'Levent Mah. Büyükdere Cad. No: 195',
        bedrooms: 0,
        bathrooms: 4,
        area: 550,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'A+ Plaza Hizmeti',
          '10 Araçlık Otopark',
          'Yüksek Hızlı Fiber Altyapı',
          'VRF İklimlendirme',
          'Kartlı Geçiş Sistemi',
        ]),
        featured: true,
        isPublished: true,
        categoryId: ticariCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'İzmir Urla Keklicek\'te Zeytinlikler İçinde Ekolojik Malikane',
        slug: 'izmir-urla-keklicek-zeytinlikler-icinde-malikane',
        description: 'Urla Bağ Yolu\'na komşu, 4 dönüm organik zeytin bahçesi içerisinde, taş ve ahşap işçiliği ile inşa edilmiş, mahremiyeti yüksek özel mülk.',
        price: 36000000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Urla, İzmir',
        address: 'Keklicek Mah. Bağlar Mevkii No: 7',
        bedrooms: 5,
        bathrooms: 5,
        area: 520,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          '4.000 m² Arsa',
          'Güneş Paneli Elektrik Üretimi',
          'Artezyen Kuyusu',
          'Organik Zeytinlik',
          'Geniş Veranda',
        ]),
        featured: true,
        isPublished: true,
        categoryId: villaCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Fethiye Göcek\'te Marina Yürüyüş Mesafesinde Lüks Dubleks',
        slug: 'fethiye-gocek-marina-yakininda-luks-dubleks',
        description: 'Yatçıların gözdesi Göcek\'te, ortak büyük havuzlu elit sitede, yemyeşil çam ormanı manzaralı ve marinaya birkaç dakikalık yürüme mesafesinde daire.',
        price: 14500000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Fethiye, Muğla',
        address: 'Göcek Mah. Çarşı Yolu No: 14',
        bedrooms: 3,
        bathrooms: 2,
        area: 160,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Büyük Yüzme Havuzu',
          'Marinaya 300 Metre',
          'Klima Tüm Odalarda',
          'Peyzajlı Bahçe',
        ]),
        featured: false,
        isPublished: true,
        categoryId: daireCat.id,
      },
    }),
    prisma.property.create({
      data: {
        title: 'Üsküdar Kandilli\'de Boğaz Manzaralı Özel Bahçeli Köşk',
        slug: 'uskudar-kandilli-bogaz-manzarali-ozel-bahceli-kosk',
        description: 'Kandilli\'nin tarihi atmosferinde, asırlık çam ağaçları ve Boğaz köprüsü manzarası eşliğinde restore edilmiş 3 katlı müstakil köşk.',
        price: 115000000,
        currency: 'TRY',
        type: 'SALE',
        status: 'AVAILABLE',
        location: 'Üsküdar, İstanbul',
        address: 'Kandilli Mah. Rasathane Cad. No: 55',
        bedrooms: 6,
        bathrooms: 5,
        area: 720,
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
        ]),
        features: JSON.stringify([
          'Kesintisiz Boğaz Manzarası',
          'Geniş Özel Koruluk',
          'Tarihi Tavan Süslemeleri',
          'Müştemilat Binası',
          'Kapalı Garaj',
        ]),
        featured: true,
        isPublished: true,
        categoryId: yaliCat.id,
      },
    }),
  ]);

  // 3. Müşteri Talepleri / Inquiries
  console.log('📬 Örnek müşteri talepleri oluşturuluyor...');
  await Promise.all([
    prisma.inquiry.create({
      data: {
        name: 'Ahmet Yılmaz',
        email: 'ahmet.yilmaz@example.com',
        phone: '+90 532 111 22 33',
        message: 'Yalıkavak villası için hafta sonu yerinde inceleme randevusu talep ediyorum.',
        status: 'PENDING',
        propertyId: properties[0].id,
      },
    }),
    prisma.inquiry.create({
      data: {
        name: 'Selin Demir',
        email: 'selin.demir@example.com',
        phone: '+90 544 555 66 77',
        message: 'Bebek dubleksi için vatandaşlığa uygunluk ve ekspertiz raporu durumu hakkında bilgi alabilir miyim?',
        status: 'CONTACTED',
        propertyId: properties[1].id,
      },
    }),
    prisma.inquiry.create({
      data: {
        name: 'Murat Kaya',
        email: 'murat.kaya@example.com',
        phone: '+90 505 888 99 00',
        message: 'Genel portföyünüz ve İzmir bölgesindeki yeni projeleriniz hakkında bilgilendirme bülteni istiyorum.',
        status: 'PENDING',
      },
    }),
  ]);

  // 4. CMS Sistem Ayarları
  console.log('⚙️ CMS ayarları oluşturuluyor...');
  const defaultSettings = [
    { key: 'site_name', value: 'PrimeEstate Türkiye', type: 'TEXT' },
    { key: 'site_tagline', value: 'Seçkin Yaşam Alanları & Prestijli Gayrimenkuller', type: 'TEXT' },
    { key: 'site_description', value: 'Türkiye\'nin en seçkin lokasyonlarında lüks villa, rezidans, yalı ve ticari gayrimenkul danışmanlığı.', type: 'TEXT' },
    { key: 'contact_phone', value: '+90 (212) 345 67 89', type: 'TEXT' },
    { key: 'contact_email', value: 'info@primeestate.com.tr', type: 'TEXT' },
    { key: 'contact_address', value: 'Zorlu Center, Levazım Mah. Koru Sok. No:2 Beşiktaş / İstanbul', type: 'TEXT' },
    { key: 'contact_whatsapp', value: '+90 532 999 88 77', type: 'TEXT' },
    { key: 'social_instagram', value: 'https://instagram.com/primeestate', type: 'TEXT' },
    { key: 'social_linkedin', value: 'https://linkedin.com/company/primeestate', type: 'TEXT' },
    { key: 'social_youtube', value: 'https://youtube.com/@primeestate', type: 'TEXT' },
    { key: 'hero_title', value: 'Hayalinizdeki Prestijli Yaşamı Keşfedin', type: 'TEXT' },
    { key: 'hero_subtitle', value: 'İstanbul\'dan Bodrum\'a, Türkiye\'nin en ayrıcalıklı gayrimenkul portföyü ile hayallerinizi gerçeğe dönüştürün.', type: 'TEXT' },
    { key: 'featured_properties_title', value: 'Öne Çıkan Seçkin İlanlar', type: 'TEXT' },
    { key: 'currency_default', value: 'TRY', type: 'TEXT' },
  ];

  for (const s of defaultSettings) {
    await prisma.setting.create({
      data: s,
    });
  }

  console.log('✅ Veritabanı başarıyla tohumlandı!');
}

main()
  .catch((e) => {
    console.error('❌ Seed işleminde hata oluştu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
