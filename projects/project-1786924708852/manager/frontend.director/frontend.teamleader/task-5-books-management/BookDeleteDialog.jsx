import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function BookDeleteDialog({ isOpen, onClose, onConfirm, bookTitle }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-full flex-shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-800">
              Kitabı Sil
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              <strong className="font-semibold text-slate-900">{bookTitle}</strong> isimli kitabı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
          >
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}
