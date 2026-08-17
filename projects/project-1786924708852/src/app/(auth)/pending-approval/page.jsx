import React from 'react';
import Link from 'next/link';
import { Clock, CheckCircle2, ArrowLeft, Mail, ShieldAlert } from 'lucide-react';

export const metadata = {
  title: 'Onay Bekleniyor | Öğretmen Portalı',
  description: 'Hesabınız yönetici onayı bekliyor',
};

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 rounded-2xl border border-slate-100 text-center">
          <div className="mx-auto w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4 border border-amber-200">
            <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Hesap Onayı Bekleniyor
          </h2>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-6">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>İnceleme Aşamasında</span>
          </div>

          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            Kaydınız başarıyla tamamlandı. Güvenlik ve doğrulama amacıyla hesabınız şu an yönetici onayındadır. Onay süreci tamamlandığında bilgilendirileceksiniz.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left mb-6 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700">
                <strong>Kayıt İsteği Alındı:</strong> Bilgileriniz sistemimize iletildi.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700">
                <strong>Yönetici İncelemesi:</strong> Genellikle 1-24 saat sürmektedir.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              href="/login"
              className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Giriş Sayfasına Dön
            </Link>

            <a
              href="mailto:destek@okul.com"
              className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-xl transition-colors"
            >
              <Mail className="w-4 h-4" />
              Destek ile İletişime Geç
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
