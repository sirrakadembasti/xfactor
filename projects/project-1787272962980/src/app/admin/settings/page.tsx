'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Save, Globe, Phone, Palette, Sparkles, Loader2 } from 'lucide-react';

interface SiteSettings {
  siteName: string;
  siteTitle: string;
  siteDescription: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  address: string;
  workingHours: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  linkedinUrl: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaText: string;
  heroImageUrl: string;
  logoUrl: string;
  faviconUrl: string;
}

const defaultSettings: SiteSettings = {
  siteName: 'RentACar Pro',
  siteTitle: 'Lüks & Konforlu Araç Kiralama Hizmetleri',
  siteDescription: 'En yeni model araçlar, uygun fiyatlar ve 7/24 destek ile güvenli araç kiralama deneyimi.',
  contactEmail: 'info@rentacarpro.com',
  contactPhone: '+90 (212) 555 01 23',
  whatsappNumber: '+90 (532) 555 01 23',
  address: 'Büyükdere Cad. No: 124 Levent, Beşiktaş / İstanbul',
  workingHours: 'Pzt - Paz: 08:00 - 20:00',
  facebookUrl: 'https://facebook.com',
  instagramUrl: 'https://instagram.com',
  twitterUrl: 'https://twitter.com',
  linkedinUrl: 'https://linkedin.com',
  heroHeadline: 'Yolculuğunuza Güven ve Konforla Başlayın',
  heroSubheadline: 'Geniş araç filomuzla bütçenize ve tarzınıza en uygun aracı dakikalar içinde kiralayın.',
  heroCtaText: 'Hemen Araç Bul',
  heroImageUrl: '/images/hero-car.jpg',
  logoUrl: '/images/logo.png',
  faviconUrl: '/favicon.ico',
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      }
    } catch (error) {
      console.error('Ayarlar yüklenirken hata oluştu:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error('Kayıt başarısız');

      toast.success('Site ayarları başarıyla güncellendi.');
    } catch (error) {
      console.error(error);
      toast.error('Ayarlar kaydedilirken bir hata meydana geldi.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Site ve CMS Ayarları</h1>
          <p className="text-muted-foreground">
            Web sitenizin genel içeriklerini, iletişim ve marka bilgilerini buradan yönetin.
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Değişiklikleri Kaydet
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="general" className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="general" className="gap-2">
              <Globe className="h-4 w-4" /> Genel & SEO
            </TabsTrigger>
            <TabsTrigger value="hero" className="gap-2">
              <Sparkles className="h-4 w-4" /> Hero & Vitrin
            </TabsTrigger>
            <TabsTrigger value="contact" className="gap-2">
              <Phone className="h-4 w-4" /> İletişim & Konum
            </TabsTrigger>
            <TabsTrigger value="brand" className="gap-2">
              <Palette className="h-4 w-4" /> Logo & Medya
            </TabsTrigger>
          </TabsList>

          {/* Genel & SEO */}
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Genel Site Bilgileri</CardTitle>
                <CardDescription>Arama motorlarında ve tarayıcı sekmesinde görüntülenecek bilgiler.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="siteName">Site Adı</Label>
                  <Input
                    id="siteName"
                    name="siteName"
                    value={settings.siteName}
                    onChange={handleChange}
                    placeholder="Örn: RentACar Pro"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="siteTitle">Varsayılan Sayfa Başlığı (SEO Title)</Label>
                  <Input
                    id="siteTitle"
                    name="siteTitle"
                    value={settings.siteTitle}
                    onChange={handleChange}
                    placeholder="Örn: Lüks & Ekonomik Araç Kiralama"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="siteDescription">Meta Açıklaması (Description)</Label>
                  <Textarea
                    id="siteDescription"
                    name="siteDescription"
                    rows={3}
                    value={settings.siteDescription}
                    onChange={handleChange}
                    placeholder="Arama motorlarında görünecek kısa açıklama"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hero & Vitrin */}
          <TabsContent value="hero" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ana Sayfa Hero Alanı</CardTitle>
                <CardDescription>Ana sayfadaki karşılama bannerı metin ve buton içerikleri.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="heroHeadline">Ana Başlık (Headline)</Label>
                  <Input
                    id="heroHeadline"
                    name="heroHeadline"
                    value={settings.heroHeadline}
                    onChange={handleChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="heroSubheadline">Alt Başlık / Açıklama</Label>
                  <Textarea
                    id="heroSubheadline"
                    name="heroSubheadline"
                    rows={3}
                    value={settings.heroSubheadline}
                    onChange={handleChange}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="heroCtaText">Buton Metni (CTA)</Label>
                    <Input
                      id="heroCtaText"
                      name="heroCtaText"
                      value={settings.heroCtaText}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="heroImageUrl">Banner Görsel URL</Label>
                    <Input
                      id="heroImageUrl"
                      name="heroImageUrl"
                      value={settings.heroImageUrl}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* İletişim & Konum */}
          <TabsContent value="contact" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>İletişim & Sosyal Medya</CardTitle>
                <CardDescription>Müşterilerinize sunulan irtibat kanalları.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="contactEmail">E-Posta Adresi</Label>
                    <Input
                      id="contactEmail"
                      name="contactEmail"
                      type="email"
                      value={settings.contactEmail}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contactPhone">Telefon Numarası</Label>
                    <Input
                      id="contactPhone"
                      name="contactPhone"
                      value={settings.contactPhone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="whatsappNumber">WhatsApp Destek Hattı</Label>
                    <Input
                      id="whatsappNumber"
                      name="whatsappNumber"
                      value={settings.whatsappNumber}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="workingHours">Çalışma Saatleri</Label>
                    <Input
                      id="workingHours"
                      name="workingHours"
                      value={settings.workingHours}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="address">Ofis / Merkez Adresi</Label>
                  <Textarea
                    id="address"
                    name="address"
                    rows={2}
                    value={settings.address}
                    onChange={handleChange}
                  />
                </div>

                <div className="pt-2">
                  <h4 className="mb-3 text-sm font-semibold">Sosyal Medya Bağlantıları</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="facebookUrl">Facebook</Label>
                      <Input
                        id="facebookUrl"
                        name="facebookUrl"
                        value={settings.facebookUrl}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="instagramUrl">Instagram</Label>
                      <Input
                        id="instagramUrl"
                        name="instagramUrl"
                        value={settings.instagramUrl}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="twitterUrl">Twitter (X)</Label>
                      <Input
                        id="twitterUrl"
                        name="twitterUrl"
                        value={settings.twitterUrl}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="linkedinUrl">LinkedIn</Label>
                      <Input
                        id="linkedinUrl"
                        name="linkedinUrl"
                        value={settings.linkedinUrl}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logo & Medya */}
          <TabsContent value="brand" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Marka Görselleri</CardTitle>
                <CardDescription>Logo ve site ikonu bağlantıları.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="logoUrl">Site Logosu URL</Label>
                  <Input
                    id="logoUrl"
                    name="logoUrl"
                    value={settings.logoUrl}
                    onChange={handleChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="faviconUrl">Favicon URL</Label>
                  <Input
                    id="faviconUrl"
                    name="faviconUrl"
                    value={settings.faviconUrl}
                    onChange={handleChange}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  );
}
