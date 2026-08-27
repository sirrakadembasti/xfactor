import React from 'react';
import Link from 'next/link';
import { Clock, Mail, ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react';

export const metadata = { me: 'Onay Bekliyor | Öğretmen Portalı' };

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-xl border border-slate-100 dark:border-slate-800 relative overflow-hidden">
          {/* Top Decorative Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />

          {/* Icon Badge */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-500 mb-6 border border-amber-200 dark:border-amber-900">
            <Clock className="w-10 h-10 animate-pulse" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Kayıt Başvurunuz Alındı
          </h1>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 mb-4">
            <ShieldAlert className="w-3.5 h-3.5" />
            Yönetici Onayı Bekleniyor
          </div>

          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6">
            Öğretmen hesabı başvurunuz başarıyla oluşturulmuştur. Güvenlik ve doğrulama süreçlerimiz kapsamında hesabınız yöneticilerimiz tarafından incelenmektedir.
          </p>

          {/* Informational Checklist */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-left mb-6 space-y-2 text-xs text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>Başvuru formunuz sisteme kaydedildi.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>Hesabınız onaylandığında e-posta ile bilgilendirileceksiniz.</span>
            </div>
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <span>Herhangi bir sorunuz için <strong>destek@portal.k12.tr</strong> adresinden bize ulaşabilirsiniz.</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 font-medium text-sm rounded-xl transition duration-150 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Giriş Sayfasına Dön</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
