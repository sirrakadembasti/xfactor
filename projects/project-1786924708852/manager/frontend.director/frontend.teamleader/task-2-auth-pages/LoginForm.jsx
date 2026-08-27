'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Eye, EyeOff, Lock, Mail, Loader2, LogIn, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'E-posta adresi gereklidir').email('Geçerli bir e-posta adresi giriniz'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
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
      // Simüle edilmiş giriş API çağrısı
      await new Promise((resolve) => setTimeout(resolve, 1200));
      
      // Örnek kontrol
      if (data.email.includes('pending')) {
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
        <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
          E-Posta Adresi
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Mail className="w-5 h-5" />
          </div>
          <input
            type="email"
            placeholder="ornek@okul.k12.tr"
            {...register('email')}
            className={`w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border ${ text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${' '}
              ${errors.email ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 dark:border-slate-700'}`}
          />
        </div>
        {errors.email && (
          <p className="text-xs text-red-500 mt-1 font-medium">{errors.email.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Şifre
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Şifremi Unuttum?
          </Link>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Lock className="w-5 h-5" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            {...register('password')}
            className={`w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-900 border ${ text-slate-900 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-sm ${' '}
              ${errors.password ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 dark:border-slate-700'}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-red-500 mt-1 font-medium">{errors.password.message}</p>
        )}
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="rememberMe"
          {...register('rememberMe')}
          className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
        />
        <label htmlFor="rememberMe" className="ml-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          Beni hatırla
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-md shadow-blue-500/20 transition duration-150 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Giriş Yapılıyor...</span>
          </>
        ) : (
          <>
            <LogIn className="w-5 h-5" />
            <span>Giriş Yap</span>
          </>
        )}
      </button>
    </form>
  );
}
