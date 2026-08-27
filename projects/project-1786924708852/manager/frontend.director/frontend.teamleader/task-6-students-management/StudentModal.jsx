import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Calendar, BookOpen, Shield, MapPin } from 'lucide-react';

export default function StudentModal({ isOpen, onClose, onSave, student }) {
  const [formData, setFormData] = useState({
    studentNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: 'Erkek',
    grade: '10. Sınıf',
    section: '10-A',
    status: 'active',
    feeStatus: 'paid',
    birthDate: '',
    address: '',
    guardian: {
      name: '',
      relation: 'Anne',
      phone: '',
      email: ''
    }
  });

  useEffect(() => {
    if (student) {
      setFormData({
        ...student,
        guardian: student.guardian || { name: '', relation: 'Anne', phone: '', email: '' }
      });
    } else {
      setFormData({
        studentNumber: `2024${Math.floor(100 + Math.random() * 900)}`,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        gender: 'Erkek',
        grade: '10. Sınıf',
        section: '10-A',
        status: 'active',
        feeStatus: 'paid',
        birthDate: '2008-01-01',
        address: '',
        guardian: {
          name: '',
          relation: 'Veli',
          phone: '',
          email: ''
        }
      });
    }
  }, [student, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8 transform transition-all">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-semibold">
              {student ? 'Öğrenci Bilgilerini Düzenle' : 'Yeni Öğrenci Kaydı'}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Personal Information */}
          <div>
            <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <User className="w-4 h-4" /> Kişisel Bilgiler
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Öğrenci No</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50"
                  value={formData.studentNumber}
                  onChange={(e) => setFormData({ ...formData, studentNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Cinsiyet</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="Erkek">Erkek</option>
                  <option value="Kız">Kız</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ad</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Ahmet"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Soyad</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Yılmaz"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">E-Posta Adresi</label>
                <input
                  type="email"
                  required
                  placeholder="ogrenci@okul.k12.tr"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  placeholder="+90 5XX XXX XX XX"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Doğum Tarihi</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Durumu</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Aktif</option>
                  <option value="pending">Beklemede</option>
                  <option value="inactive">Pasif</option>
                  <option value="graduated">Mezun</option>
                </select>
              </div>
            </div>
          </div>

          {/* Academic Information */}
          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" /> Akademik & Sınıf Bilgileri
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sınıf Seviyesi</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                >
                  <option value="9. Sınıf">9. Sınıf</option>
                  <option value="10. Sınıf">10. Sınıf</option>
                  <option value="11. Sınıf">11. Sınıf</option>
                  <option value="12. Sınıf">12. Sınıf</option>
                  <option value="Mezun">Mezun</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Şube</label>
                <input
                  type="text"
                  placeholder="Örn: 10-A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.section}
                  onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ödeme Durumu</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                  value={formData.feeStatus}
                  onChange={(e) => setFormData({ ...formData, feeStatus: e.target.value })}
                >
                  <option value="paid">Ödendi</option>
                  <option value="pending">Ödeme Bekliyor</option>
                  <option value="overdue">Gecikmiş Ödeme</option>
                </select>
              </div>
            </div>
          </div>

          {/* Guardian Information */}
          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Shield className="w-4 h-4" /> Veli / İletişim Kişisi Bilgileri
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Veli Ad Soyad</label>
                <input
                  type="text"
                  placeholder="Örn: Mehmet Yılmaz"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.guardian.name}
                  onChange={(e) => setFormData({ ...formData, guardian: { ...formData.guardian, name: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Yakınlık Derecesi</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                  value={formData.guardian.relation}
                  onChange={(e) => setFormData({ ...formData, guardian: { ...formData.guardian, relation: e.target.value } })}
                >
                  <option value="Anne">Anne</option>
                  <option value="Baba">Baba</option>
                  <option value="Vasi">Vasi</option>
                  <option value="Diğer">Diğer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Veli Telefon</label>
                <input
                  type="tel"
                  placeholder="+90 5XX XXX XX XX"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.guardian.phone}
                  onChange={(e) => setFormData({ ...formData, guardian: { ...formData.guardian, phone: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Veli E-Posta</label>
                <input
                  type="email"
                  placeholder="veli@email.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  value={formData.guardian.email}
                  onChange={(e) => setFormData({ ...formData, guardian: { ...formData.guardian, email: e.target.value } })}
                />
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div className="pt-4 border-t border-slate-200">
            <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-600" /> Adres Bilgisi
            </label>
            <textarea
              rows={2}
              placeholder="Açık adres yazınız..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors text-sm shadow-sm shadow-indigo-200"
            >
              {student ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
