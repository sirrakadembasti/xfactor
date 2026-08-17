import React, { useState } from 'react';
import { X, User, BookOpen, Award, Clock, Phone, Mail, MapPin, Shield, CheckCircle, AlertCircle, Calendar } from 'lucide-react';

export default function StudentDetailModal({ isOpen, onClose, student }) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!isOpen || !student) return null;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Aktif</span>;
      case 'pending':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"><Clock className="w-3 h-3" /> Beklemede</span>;
      case 'inactive':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Pasif</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800">{status}</span>;
    }
  }