'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'E-posta adresi gereklidir' })
    .email({ message: 'Geçerli bir e-posta adresi giriniz' }),
  password: z
    .string()
    .min(6, { message: 'Şifre en az 6 karakter olmalıdır' }),
  rememberMe: z.boolean().optional(),
});

export default function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setServerError('');
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      if (data.email === 'pending@okul.com') {
        router.push('/pending-approval');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setServerError('Giriş yapılırken bir hata oluştu. Lütfen bilgilerinizi kontrol edin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{serverError}</span>
        </div>
      )}

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
            placeholder="ornek@okul.com"
            {...register('email')}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-slate-900 text-sm focus:outline-none focus:ring-2 transition-all ${errors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-100 bg-red-50/30' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100 bg-white'}`}
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-700">
            Şifre
          </label>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert('Şifre sıfırlama bağlantısı e-posta adresinize gönderilecektir.');
            }}
            className="text-xs text-blue-600 hover:text-blue-500 font-medium"
          >
            Şifremi Unuttum?
          </a>
        </div>
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

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...register('rememberMe')}
            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600">Beni Hatırla</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 text-white font-medium text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Giriş Yapılıyor...</span>
          </>
        ) : (
          <span>Giriş Yap</span>
        )}
      </button>
    </form>
  );
}
