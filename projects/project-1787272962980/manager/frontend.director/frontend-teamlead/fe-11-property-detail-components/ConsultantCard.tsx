'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Phone,
  Mail,
  MessageCircle,
  Send,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Clock,
} from 'lucide-react';

interface ConsultantInfo {
  name?: string;
  title?: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  whatsappNumber?: string;
}

interface ConsultantCardProps {
  propertyId?: string;
  propertyTitle?: string;
  consultant?: ConsultantInfo;
}

export function ConsultantCard({
  propertyId,
  propertyTitle = 'İlan',
  consultant = {},
}: ConsultantCardProps) {
  const {
    name = 'Gayrimenkul Danışmanı',
    title = 'Yetkili Satış & Kiralama Temsilcisi',
    phone = '+90 555 123 4567',
    email = 'info@emlakfirmasi.com',
    avatarUrl = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80',
    whatsappNumber = '+905551234567',
  } = consultant;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: `Merhaba, "${propertyTitle}" başlıklı ilanınız hakkında detaylı bilgi ve randevu talep etmek istiyorum.`,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const cleanWhatsapp = (whatsappNumber || phone).replace(/[^0-9]/g, '');
  const whatsappMessage = encodeURIComponent(
    `Merhaba, "${propertyTitle}" ilanı ile ilgili bilgi almak istiyorum.`
  );
  const whatsappLink = `https://wa.me/${cleanWhatsapp}?text=${whatsappMessage}`;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          propertyId: propertyId || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Mesajınız iletilirken bir hata oluştu.');
      }

      setStatus('success');
      setFormData({
        name: '',
        email: '',
        phone: '',
        message: `Merhaba, "${propertyTitle}" başlıklı ilanınız hakkında bilgi almak istiyorum.`,
      });
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Lütfen tüm alanları doğru doldurduğunuzdan emin olun.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      {/* Danışman Başlık & Bilgi Kartı */}
      <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-blue-600/10">
          <Image
            src={avatarUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-gray-900">
            {name}
          </h3>
          <p className="truncate text-xs text-gray-500">{title}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Doğrulanmış Temsilci</span>
          </div>
        </div>
      </div>

      {/* Hızlı İletişim Butonları */}
      <div className="grid grid-cols-2 gap-2.5 py-4">
        <a
          href={`tel:${phone.replace(/\s+/g, '')}`}
          className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Phone className="h-3.5 w-3.5 text-blue-600" />
          <span>Hemen Ara</span>
        </a>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-600"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span>WhatsApp</span>
        </a>
      </div>

      {/* İletişim Bilgileri */}
      <div className="space-y-1.5 border-b border-gray-100 pb-4 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-gray-400" />
          <span>{phone}</span>
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{email}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          <span>Çalışma Saatleri: 09:00 - 19:00</span>
        </div>
      </div>

      {/* Randevu & Talep Formu */}
      <div className="pt-5">
        <h4 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Calendar className="h-4 w-4 text-blue-600" />
          <span>Randevu ve Bilgi Talebi</span>
        </h4>

        {status === 'success' && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
            <div>
              Talebiniz başarıyla iletildi. Danışmanımız en kısa sürede sizinle
              iletişime geçecektir.
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
            <div>{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Adınız Soyadınız *"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <input
                type="tel"
                name="phone"
                required
                value={formData.phone}
                onChange={handleChange}
                placeholder="Telefon Numaranız *"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <div>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="E-posta Adresiniz *"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <textarea
              name="message"
              rows={3}
              required
              value={formData.message}
              onChange={handleChange}
              placeholder="Mesajınız veya randevu tarihi tercihiniz..."
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{isSubmitting ? 'Gönderiliyor...' : 'Talep Gönder'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
