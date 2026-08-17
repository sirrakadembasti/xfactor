'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, School, BookOpen, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(2, { message: 'Ad soyad en az 2 karakter olmalıdır' }),
    email: z
      .string()
      .min(1, { message: 'E-posta adresi gereklidir' })
      .email({ message: 'Geçerli bir e-posta adresi giriniz' }),
    phone: z
      .string()
      .min(10, { message: 'Geçerli bir telefon numarası giriniz' }),
    branch: z
      .string()
      .min(1, { message: 'Lütfen branşınızı seçiniz' }),
    school: z
      .string()
      .min(2, { message: 'Okul adı en az 2 karakter olmalıdır' }),
    password: z
      .string()
      .min(6, { message: 'Şifre en az 6 karakter olmalıdır' }),
    confirmPassword: z
      .string()
      .min(1, { message: 'Şifre tekrarı gereklidir' }),
    terms: z.boolean().refine((val) => val === true, {
      message: 'Kullanım şartlarını ve gizlilik politikasını kabul etmelisiniz',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirmPassword'],
  });

const branches = [
  'Matematik',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Türk Dili ve Edebiyatı',
  'Tarih',
  'Coğrafya',
  'İngilizce',
  'Bilişim Teknolojileri',
  'İlköğretim Matematik',
  'Fen Bilimleri',
  'Sınıf Öğretmenliği',
  'Diğer',
];

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
      terms: false,
    },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setServerError('');
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      router.push('/pending-approval');
    } catch (err) {
      setServerError('Kayıt oluşturulurken bir sorun oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{serverError}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
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
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.fullName ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
          />
        </div>
        {errors.fullName && (
          <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          E-Posta Adresi
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Mail className="w-5 h-5" />
          </div>
          <input
            type="email"
            placeholder="ahmet@okul.com"
            {...register('email')}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Telefon Numarası
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Phone className="w-5 h-5" />
          </div>
          <input
            type="tel"
            placeholder="0555 555 55 55"
            {...register('phone')}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.phone ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
          />
        </div>
        {errors.phone && (
          <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Branş
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <select
              {...register('branch')}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.branch ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
            >
              <option value="">Branş Seçiniz</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          {errors.branch && (
            <p className="mt-1 text-xs text-red-600">{errors.branch.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Görev Yaptığı Okul
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <School className="w-5 h-5" />
            </div>
            <input
              type="text"
              placeholder="Atatürk Anadolu Lisesi"
              {...register('school')}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.school ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
            />
          </div>
          {errors.school && (
            <p className="mt-1 text-xs text-red-600">{errors.school.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
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
              className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
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
              className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className="flex items-start gap-2 cursor-pointer mt-2">
          <input
            type="checkbox"
            {...register('terms')}
            className="w-4 h-4 mt-0.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
          />
          <span className="text-xs text-slate-600">
            <a href="#" className="text-blue-600 hover:underline">Kullanım Şartları</a> ve <a href="#" className="text-blue-600 hover:underline">Gizlilik Politikası</a>'nı okudum ve kabul ediyorum.
          </span>
        </label>
        {errors.terms && (
          <p className="mt-1 text-xs text-red-600">{errors.terms.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 text-white font-medium text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Kayıt Oluşturuluyor...</span>
          </>
        ) : (
          <span>Kayıt Ol</span>
        )}
      </button>
    </form>
  );
}
