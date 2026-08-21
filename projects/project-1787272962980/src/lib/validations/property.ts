import { z } from 'zod';

export const propertySchema = z.object({
  title: z.string().min(5, 'Başlık en az 5 karakter olmalıdır').max(100),
  description: z.string().min(10, 'Açıklama en az 10 karakter olmalıdır'),
  price: z.number().positive('Fiyat pozitif bir değer olmalıdır'),
  type: z.enum(['SALE', 'RENT'], {
    errorMap: () => ({ message: 'Geçersiz ilan türü' }),
  }),
  category: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'LAND'], {
    errorMap: () => ({ message: 'Geçersiz kategori' }),
  }),
  city: z.string().min(2, 'Şehir zorunludur'),
  district: z.string().min(2, 'İlçe zorunludur'),
  address: z.string().min(5, 'Açık adres zorunludur'),
  bedrooms: z.number().int().min(0, 'Oda sayısı negatif olamaz'),
  bathrooms: z.number().int().min(0, 'Banyo sayısı negatif olamaz'),
  areaSqMt: z.number().positive('Metrekare pozitif bir değer olmalıdır'),
  images: z.array(z.string().url('Geçerli bir resim URL\'i giriniz')).min(1, 'En az 1 resim yüklemelisiniz'),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;
