import React from 'react';
import Link from 'next/link';
import RegisterForm from '@/components/auth/RegisterForm';
import { BookOpen } from 'lucide-react';

export const metadata = {
  title: 'Öğretmen Kaydı | Öğretmen Portalı',
  description: 'Yeni öğretmen hesabı oluşturun',
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
            <BookOpen className="w-7 h-7" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-slate-900">
          Öğretmen Kaydı
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Zaten hesabınız var mı?{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            Giriş Yapın
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
