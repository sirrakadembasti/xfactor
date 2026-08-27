'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Phone,
  BookOpen,
  Building,
  Loader2,
  UserPlus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

const BRANCH_OPTIONS = [
  'Matematik',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Türk Dili ve Edebiyatı',
  'Tarih',
  'Coğrafya',
  'İngilizce',
  'İlkokul / Sınıf Öğretmenliği',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'Rehberlik / PDR',
  'Diğer',
];

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Ad Soyad en az 2 karakter olmalıdır'),
    email: z.string().min(1, 'E-posta adresi gereklidir').email('Geçerli bir e-posta adresi giriniz'),
    phone: z.string().min(10, 'Telefon numarası en az 10 haneli olmalıdır'),
    branch: z.string().min(1, 'Lütfen branşınızı seçiniz'),
    school: z.string().min(2, 'Okul veya kurum bilgisi gereklidir'),
    password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
    confirmPassword: z.string().min(6, 'Şifre tekrarı gereklidir'),
    termsAccepted: z.boolean().refine((val) => val === true, {
      message: 'Kullanım şartlarını ve gizlilik politikasını kabul etmelisiniz',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Şifreler birbiriyle eşleşmiyor',
    path: ['confirmPassword'],
  });

export default function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      branch: '',
      school: '',
      password: '',
      confirmPassword: '',
      termsAccepted: false,
    },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setServerError('');

    try {
      // Simüle edilmiş başvuru/kayıt isteği
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      // Başarılı kayıt sonrası onay bekliyor sayfasına yönlendir
      router.push('/pending-approval');
    } catch (err) {
      setServerError('Kayıt oluşturulurken bir hata meydana geldi. Lütfen tekrar deneyiniz.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Ad Soyad */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Ad Soyad
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <User className="w-5 h-5" />
          </div>
          <input
            type="text"
            placeholder="Ahmet Yılmaz"
            {...register('fullName')}
            className={`w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${
              errors.fullName ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
            }`}
          />
        </div>
        {errors.fullName && (
          <p className="text-xs text-red-500 mt-1 font-medium">{errors.fullName.message}</p>
        )}
      </div>

      {/* E-posta & Telefon Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            E-Posta
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-5 h-5" />
            </div>
            <input
              type="email"
              placeholder="ahmet@okul.k12.tr"
              {...register('email')}
              className={`w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${
                errors.email ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
          </div>
          {errors.email && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Telefon
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Phone className="w-5 h-5" />
            </div>
            <input
              type="tel"
              placeholder="0555 123 4567"
              {...register('phone')}
              className={`w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${
                errors.phone ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
          </div>
          {errors.phone && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.phone.message}</p>
          )}
        </div>
      </div>

      {/* Branş & Okul Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Branş
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <select
              {...register('branch')}
              className={`w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm appearance-none ${
                errors.branch ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <option value="">Branş Seçiniz</option>
              {BRANCH_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          {errors.branch && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.branch.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Okul / Kurum
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Building className="w-5 h-5" />
            </div>
            <input
              type="text"
              placeholder="Atatürk Anadolu Lisesi"
              {...register('school')}
              className={`w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${
                errors.school ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
          </div>
          {errors.school && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.school.message}</p>
          )}
        </div>
      </div>

      {/* Şifre & Şifre Tekrar Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Şifre
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-5 h-5" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              {...register('password')}
              className={`w-full pl-10 pr-10 py-2 bg-white dark:bg-slate-900 border text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${
                errors.password ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Şifre Tekrarı
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-5 h-5" />
            </div>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••"
              {...register('confirmPassword')}
              className={`w-full pl-10 pr-10 py-2 bg-white dark:bg-slate-900 border text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${
                errors.confirmPassword ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.confirmPassword.message}</p>
          )}
        </div>
      </div>

      {/* Şartlar ve Koşullar Checkbox */}
      <div className="pt-1">
        <div className="flex items-start">
          <input
            type="checkbox"
            id="termsAccepted"
            {...register('termsAccepted')}
            className="mt-1 w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
          />
          <label htmlFor="termsAccepted" className="ml-2 text-xs text-slate-600 dark:text-slate-400">
            <a href="#" className="text-blue-600 hover:underline">Kullanım Şartları</a> ve{' '}
            <a href="#" className="text-blue-600 hover:underline">Gizlilik Politikası</a>'nı okudum ve kabul ediyorum.
          </label>
        </div>
        {errors.termsAccepted && (
          <p className="text-xs text-red-500 mt-1 font-medium">{errors.termsAccepted.message}</p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 transition duration-150 disabled:opacity-70 disabled:cursor-not-allowed text-sm mt-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Başvuru Gönderiliyor...</span>
          </>
        ) : (
          <>
            <UserPlus className="w-5 h-5" />
            <span>Öğretmen Hesabı Oluştur</span>
          </>
        )}
      </button>
    </form>
  );
}
