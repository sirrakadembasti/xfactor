import React from 'react';
import { Edit2, Trash2, BookOpen, Eye } from 'lucide-react';

export default function BookTable({ books, onEdit, onDelete, onViewDetails, isAdmin }) {
  const getStatusBadge = (status, availableCopies) => {
    if (status === 'Bakımda') {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded-full border border-amber-200">
          Bakımda
        </span>
      );
    }
    if (availableCopies === 0 || status === 'Tükendi') {
      return (
        <span className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 rounded-full border border-red-200">
          Tükendi
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full border border-emerald-200">
        Mevcut ({availableCopies})
      </span>
    );
  };

  if (!books || books.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Kitap Bulunamadı</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Arama kriterlerinize uygun kitap kaydı bulunamadı. Lütfen arama veya filtrelerinizi kontrol edin.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500 tracking-wider">
              <th className="px-6 py-4">Kitap Bilgisi</th>
              <th className="px-6 py-4">Kategori</th>
              <th className="px-6 py-4">ISBN</th>
              <th className="px-6 py-4">Stok (Mevcut/Toplam)</th>
              <th className="px-6 py-4">Durum</th>
              <th className="px-6 py-4 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {books.map((book) => (
              <tr key={book.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="w-10 h-14 object-cover rounded shadow-xs border border-slate-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-14 bg-indigo-100 text-indigo-600 rounded flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {book.title.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h4 className="font-semibold text-slate-800 line-clamp-1">{book.title}</h4>
                      <p className="text-xs text-slate-500">{book.author}</p>
                      {book.publicationYear && (
                        <p className="text-xs text-slate-400 mt-0.5">{book.publisher} • {book.publicationYear}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-md">
                    {book.category}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-600">
                  {book.isbn}
                </td>
                <td className="px-6 py-4">
                  <span className="font-medium text-slate-800">{book.availableCopies}</span>
                  <span className="text-slate-400"> / {book.totalCopies}</span>
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(book.status, book.availableCopies)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onViewDetails && onViewDetails(book)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Detay Göster"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => onEdit(book)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Düzenle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(book)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
