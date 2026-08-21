export interface SiteSettings {
  siteName?: string;
  siteTitle?: string;
  siteDescription?: string;
  companyName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  phone?: string;
  phoneSecondary?: string;
  email?: string;
  address?: string;
  mapEmbedUrl?: string;
  whatsappNumber?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  youtubeUrl?: string;
  defaultCurrency?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImageUrl?: string;
  aboutTitle?: string;
  aboutText?: string;
  footerText?: string;
  [key: string]: any;
}

export interface SettingItem {
  id: string;
  key: string;
  value: string;
  type?: string | null;
  description?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SettingsResponse {
  success: boolean;
  data: SiteSettings;
  raw?: SettingItem[];
  message?: string;
}
