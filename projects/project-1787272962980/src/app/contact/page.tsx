'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Building,
} from 'lucide-react';

interface FormData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Mesajınız iletilirken bir sorun oluştu.');
      }

      setStatus({
        type: 'success',
        message: 'Mesajınız başarıyla iletildi. En kısa sürede sizinle iletişime geçeceğiz.',
      });
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (err: any) {
      setStatus({
        type: 'error',
        message: err.message || 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyiniz.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
            <MessageSquare className="w-4 h-4" />
            Bize Ulaşın
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-serif text-slate-900">
            Size Nasıl Yardımcı Olabiliriz?
          </h1>
          <p className="text-slate-600 text-base sm:text-lg">
            Gayrimenkul arayışınız, portföy danışmanlığı veya diğer tüm sorularınız için uzman ekibimizle dilediğiniz an iletişime geçebilirsiniz.
          </p>
        </div>

        {/* Contact Info & Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Info Side (4 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-4">
                <Building className="w-5 h-5 text-blue-600" />
                İletişim Bilgilerimiz
              </h2>

              <div className="space-y-5 text-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Ofis Adresi</h3>
                    <p className="text-slate-600 mt-0.5 leading-relaxed">
                      Büyükdere Cad. No:142 Maslak, Sarıyer / İstanbul
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Telefon</h3>
                    <p className="text-slate-600 mt-0.5">
                      <a href="tel:+902120000000" className="hover:text-blue-600 transition">
                        +90 (212) 000 00 00
                      </a>
                    </p>
                    <p className="text-slate-600">
                      <a href="tel:+905320000000" className="hover:text-blue-600 transition">
                        +90 (532) 000 00 00
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">E-Posta</h3>
                    <p className="text-slate-600 mt-0.5">
                      <a href="mailto:info@prestijgayrimenkul.com" className="hover:text-blue-600 transition">
                        info@prestijgayrimenkul.com
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Çalışma Saatleri</h3>
                    <p className="text-slate-600 mt-0.5">
                      Pazartesi - Cumartesi: 09:00 - 19:00
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">Pazar: Randevu ile</p>
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp Callout */}
            <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-emerald-950">WhatsApp ile Hızlı İletişim</h3>
                <p className="text-xs text-emerald-700 mt-1">
                  Danışmanlarımıza anında WhatsApp üzerinden mesaj gönderin.
                </p>
              </div>
              <a
                href="https://wa.me/905320000000"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition whitespace-nowrap shadow-sm"
              >
                Mesaj Atın
              </a>
            </div>
          </div>

          {/* Form Side (7 cols) */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900 mb-6">
                Mesaj Formu
              </h2>

              {status.type && (
                <div
                  className={`mb-6 p-4 rounded-xl flex items-start gap-3 text-sm ${
                    status.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {status.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>{status.message}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Adınız Soyadınız <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Örn: Ahmet Yılmaz"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-slate-50/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Telefon Numaranız <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="05XX XXX XX XX"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-slate-50/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    E-Posta Adresiniz <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="ahmet@example.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-slate-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Mesajınız <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="message"
                    rows={5}
                    required
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="İlgilendiğiniz gayrimenkul veya danışmanlık konusu hakkında bilgi veriniz..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-slate-50/50 resize-y"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium transition shadow-sm"
                >
                  {loading ? (
                    <span>Gönderiliyor...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Mesajı Gönder</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Map Embed Section */}
        <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm">
          <div className="p-4 sm:p-6 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              Konum ve Harita
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Ofisimizi ziyaret etmek için harita yol tarifinden faydalanabilirsiniz.
            </p>
          </div>
          <div className="w-full h-80 sm:h-96 bg-slate-100">
            <iframe
              title="Ofis Konumu"
              src="https://maps.google.com/maps?q=Maslak%20Sarıyer%20İstanbul&t=&z=14&ie=UTF8&iwloc=&output=embed"
              className="w-full h-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
