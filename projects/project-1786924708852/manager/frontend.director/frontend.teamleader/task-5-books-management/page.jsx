'use client';

import React, { useState, useMemo } from 'react';
import BookSearchFilter from '@/components/books/BookSearchFilter';
import BookTable from '@/components/books/BookTable';
import BookFormModal from '@/components/books/BookFormModal';
import BookDeleteDialog from '@/components/books/BookDeleteDialog';
import { CheckCircle2 } from 'lucide-react';

const INITIAL_CATEGORIES = [
  'Edebiyat / Roman',
  'Tarih & Araştırma',
  'Bilim & Teknoloji',
  'Felsefe & Psikoloji',
  'Kişisel Gelişim',
  'Sanat & Tasarım'
];

const INITIAL_BOOKS = [
  {
    id: '1',
    title: 'Nutuk',
    author: 'Mustafa Kemal Atatürk',
    isbn: '978-975-16-0153-7',
    category: 'Tarih & Araştırma',
    publisher: 'Türk Tarih Kurumu',
    publicationYear: 1927,
    totalCopies: 10,
    availableCopies: 6,
    status: 'Mevcut',
    coverUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=300',
    description: 'Mustafa Kemal Atatürk\'ün 1919-1927 yılları arasındaki tarihi gelişmeleri kaleme aldığı ölümsüz eseri.'
  },
  {
    id: '2',
    title: 'Saatleri Ayarlama Enstitüsü',
    author: 'Ahmet Hamdi Tanpınar',
    isbn: '978-975-99-5481-0',
    category: 'Edebiyat / Roman',
    publisher: 'Dergâh Yayınları',
    publicationYear: 1961,
    totalCopies: 5,
    availableCopies: 2,
    status: 'Mevcut',
    coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=300',
    description: 'Doğu ile Batı arasında bocalayan Türk toplumunun mizahi bir dille eleştirisi.'
  },
  {
    id: '3',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    isbn: '978-0132350884',
    category: 'Bilim & Teknoloji',
    publisher: 'Prentice Hall',
    publicationYear: 2008,
    totalCopies: 4,
    availableCopies: 0,
    status: 'Tükendi',
    coverUrl: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=300',
    description: 'Yazılım geliştiriciler için daha temiz ve sürdürülebilir kod yazma rehberi.'
  },
  {
    id: '4',
    title: 'İnce Memed 1',
    author: 'Yaşar Kemal',
    isbn: '978-975-08-0720-7',
    category: 'Edebiyat / Roman',
    publisher: 'Yapı Kredi Yayınları',
    publicationYear: 1955,
    totalCopies: 8,
    availableCopies: 4,
    status: 'Mevcut',
    coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=300',
    description: 'Ağalık düzenine başkaldıran Çukurovalı Efe Memed\'in destansı öyküsü.'
  },
  {
    id: '5',
    title: 'Suç ve Ceza',
    author: 'Fyodor Dostoyevski',
    isbn: '978-975-07-1938-8',
    category: 'Edebiyat / Roman',
    publisher: 'Can Yayınları',
    publicationYear: 1866,
    totalCopies: 3,
    availableCopies: 0,
    status: 'Bakımda',
    coverUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=300',
    description: 'Raskolnikov\'un vicdan azabı ve psikolojik hesaplaşmalarını konu alan dünya klasiği.'
  }
];

export default function BooksPage() {
  const [books, setBooks] = useState(INITIAL_BOOKS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Admin yetkisi kontrolü
  const [isAdmin] = useState(true);

  // Modal ve Bildirim durumları
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Filtreleme Mantığı
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const matchesSearch =
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.isbn.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = !selectedCategory || book.category === selectedCategory;
      const matchesStatus = !selectedStatus || book.status === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [books, searchQuery, selectedCategory, selectedStatus]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedStatus('');
  };

  const handleOpenAddModal = () => {
    setSelectedBook(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (book) => {
    setSelectedBook(book);
    setIsFormModalOpen(true);
  };

  const handleOpenDeleteModal = (book) => {
    setSelectedBook(book);
    setIsDeleteModalOpen(true);
  };

  const handleFormSubmit = (data) => {
    if (selectedBook) {
      setBooks((prev) =>
        prev.map((b) => (b.id === selectedBook.id ? { ...b, ...data } : b))
      );
      showToast('Kitap bilgileri başarıyla güncellendi.');
    } else {
      const newBook = {
        ...data,
        id: Date.now().toString()
      };
      setBooks((prev) => [newBook, ...prev]);
      showToast('Yeni kitap kataloğa eklendi.');
    }
    setIsFormModalOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (selectedBook) {
      setBooks((prev) => prev.filter((b) => b.id !== selectedBook.id));
      showToast('Kitap başarıyla silindi.');
    }
    setIsDeleteModalOpen(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-800 text-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Kitap Kataloğu</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-full">
              {books.length} Kitap
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Kütüphane arşivindeki tüm kitapları listeleyin, arayın ve yönetin.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <BookSearchFilter
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        categories={INITIAL_CATEGORIES}
        onReset={handleResetFilters}
        isAdmin={isAdmin}
        onAddNew={handleOpenAddModal}
      />

      {/* Books Table */}
      <BookTable
        books={filteredBooks}
        onEdit={handleOpenEditModal}
        onDelete={handleOpenDeleteModal}
        isAdmin={isAdmin}
      />

      {/* Add / Edit Form Modal */}
      <BookFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        initialData={selectedBook}
        categories={INITIAL_CATEGORIES}
      />

      {/* Delete Confirmation Modal */}
      <BookDeleteDialog
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        bookTitle={selectedBook?.title || ''}
      />
    </div>
  );
}
