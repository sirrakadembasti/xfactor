import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Filter,
  Download,
  Edit2,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Phone,
  Mail,
  Calendar,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  BookOpen,
  Sparkles
} from 'lucide-react';
import StudentModal from '../../components/admin/StudentModal';
import StudentDetailModal from '../../components/admin/StudentDetailModal';

// Örnek Öğrenci Verileri
const INITIAL_STUDENTS = [
  {
    id: 'STU-1001',
    firstName: 'Ahmet',
    lastName: 'Yılmaz',
    email: 'ahmet.yilmaz@okul.k12.tr',
    phone: '+90 532 111 2233',
    gradeClass: '11-A',
    studentNumber: '2023001',
    gender: 'Erkek',
    birthDate: '2007-04-12',
    parentName: 'Mehmet Yılmaz',
    parentPhone: '+90 532 999 8877',
    status: 'Aktif',
    gpa: '3.85',
    attendanceRate: '96%',
    createdAt: '2023-09-01'
  },
  {
    id: 'STU-1002',
    firstName: 'Zeynep',
    lastName: 'Kaya',
    email: 'zeynep.kaya@okul.k12.tr',
    phone: '+90 533 222 3344',
    gradeClass: '10-B',
    studentNumber: '2023002',
    gender: 'Kız',
    birthDate: '2008-08-25',
    parentName: 'Ayşe Kaya',
    parentPhone: '+90 533 888 7766',
    status: 'Aktif',
    gpa: '3.92',
    attendanceRate: '98%',
    createdAt: '2023-09-01'
  },
  {
    id: 'STU-1003',
    firstName: 'Can',
    lastName: 'Demir',
    email: 'can.demir@okul.k12.tr',
    phone: '+90 534 333 4455',
    gradeClass: '12-C',
    studentNumber: '2022045',
    gender: 'Erkek',
    birthDate: '2006-01-15',
    parentName: 'Ali Demir',
    parentPhone: '+90 534 777 6655',
    status: 'Donduruldu',
    gpa: '2.70',
    attendanceRate: '78%',
    createdAt: '2022-09-01'
  },
  {
    id: 'STU-1004',
    firstName: 'Elif',
    lastName: 'Çelik',
    email: 'elif.celik@okul.k12.tr',
    phone: '+90 535 444 5566',
    gradeClass: '9-A',
    studentNumber: '2023104',
    gender: 'Kız',
    birthDate: '2009-11-03',
    parentName: 'Fatma Çelik',
    parentPhone: '+90 535 666 5544',
    status: 'Aktif',
    gpa: '3.45',
    attendanceRate: '92%',
    createdAt: '2023-09-01'
  },
  {
    id: 'STU-1005',
    firstName: 'Burak',
    lastName: 'Şahin',
    email: 'burak.sahin@okul.k12.tr',
    phone: '+90 536 555 6677',
    gradeClass: '11-B',
    studentNumber: '2023089',
    gender: 'Erkek',
    birthDate: '2007-06-30',
    parentName: 'Murat Şahin',
    parentPhone: '+90 536 555 4433',
    status: 'Pasif',
    gpa: '2.10',
    attendanceRate: '65%',
    createdAt: '2023-09-01'
  },
  {
    id: 'STU-1006',
    firstName: 'Selin',
    lastName: 'Öztürk',
    email: 'selin.ozturk@okul.k12.tr',
    phone: '+90 537 666 7788',
    gradeClass: '12-A',
    studentNumber: '2022012',
    gender: 'Kız',
    birthDate: '2006-09-18',
    parentName: 'Hasan Öztürk',
    parentPhone: '+90 537 444 3322',
    status: 'Aktif',
    gpa: '3.98',
    attendanceRate: '99%',
    createdAt: '2022-09-01'
  }
];

export default function StudentsManagement() {
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('Tümü');
  const [selectedStatus, setSelectedStatus] = useState('Tümü');
  const [selectedStudents, setSelectedStudents] = useState([]);
  
  // Modal Durumları
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Sayfalama
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Sınıf Listesi
  const classOptions = ['Tümü', '9-A', '10-B', '11-A', '11-B', '12-A', '12-C'];

  // Filtreleme Mantığı
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesSearch =
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentNumber.includes(searchTerm);

      const matchesClass = selectedClass === 'Tümü' || student.gradeClass === selectedClass;
      const matchesStatus = selectedStatus === 'Tümü' || student.status === selectedStatus;

      return matchesSearch && matchesClass && matchesStatus;
    });
  }, [students, searchTerm, selectedClass, selectedStatus]);

  // Sayfalama Hesabı
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage]);

  // Seçim İşlemleri
  const toggleSelectAll = () => {
    if (selectedStudents.length === paginatedStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(paginatedStudents.map((s) => s.id));
    }
  };

  const toggleSelectStudent = (id) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Ekleme veya Güncelleme
  const handleSaveStudent = (formData) => {
    if (formData.id) {
      // Düzenleme
      setStudents((prev) =>
        prev.map((s) => (s.id === formData.id ? { ...s, ...formData } : s))
      );
    } else {
      // Yeni Ekleme
      const newStudent = {
        ...formData,
        id: `STU-${1000 + students.length + 1}`,
        studentNumber: `${2023100 + students.length + 1}`,
        createdAt: new Date().toISOString().split('T')[0]
      };
      setStudents((prev) => [newStudent, ...prev]);
    }
    setIsAddEditModalOpen(false);
    setCurrentStudent(null);
  };

  // Silme İşlemi
  const handleDeleteStudent = (id) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setDeleteConfirmId(null);
    setSelectedStudents((prev) => prev.filter((item) => item !== id));
  };

  // Toplu Silme
  const handleBulkDelete = () => {
    if (window.confirm(`${selectedStudents.length} öğrenciyi silmek istediğinize emin misiniz?`)) {
      setStudents((prev) => prev.filter((s) => !selectedStudents.includes(s.id)));
      setSelectedStudents([]);
    }
  };

  // CSV İndirme
  const handleExportCSV = () => {
    const headers = ['Öğrenci No,Ad,Soyad,Sınıf,E-posta,Telefon,Veli,Durum,GNO\n'];
    const rows = filteredStudents.map(
      (s) => `${s.studentNumber},${s.firstName},${s.lastName},${s.gradeClass},${s.email},${s.phone},${s.parentName},${s.status},${s.gpa}`
    );
    const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ogrenciler_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Durum Rozet Rengi
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Aktif':
        return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20';
      case 'Pasif':
        return 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20';
      case 'Donduruldu':
        return 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20';
      default:
        return 'bg-slate-50 text-slate-700 ring-1 ring-slate-600/20';
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen text-slate-800">
      {/* Başlık ve Üst Eylemler */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-indigo-600" />
            Öğrenci Yönetimi
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tüm öğrencileri listeleyin, ekleyin, bilgilerini güncelleyin veya durumlarını yönetin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Dışa Aktar (CSV)
          </button>
          <button
            onClick={() => {
              setCurrentStudent(null);
              setIsAddEditModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition shadow-sm shadow-indigo-200"
          >
            <Plus className="w-4 h-4" />
            Yeni Öğrenci Ekle
          </button>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Toplam Öğrenci</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{students.length}</h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Aktif Öğrenciler</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">
              {students.filter((s) => s.status === 'Aktif').length}
            </h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pasif / Donduran</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">
              {students.filter((s) => s.status !== 'Aktif').length}
            </h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <UserX className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Genel GNO Ortalaması</p>
            <h3 className="text-2xl font-bold text-indigo-600 mt-1">
              {(students.reduce((acc, curr) => acc + parseFloat(curr.gpa || 0), 0) / (students.length || 1)).toFixed(2)}
            </h3>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Arama ve Filtreleme Alanı */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Ad, e-posta veya öğrenci no ile ara..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 focus:bg-white transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Sınıf Filtresi */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600">Sınıf:</span>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setCurrentPage(1);
              }}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {classOptions.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          {/* Durum Filtresi */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Durum:</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="Tümü">Tümü</option>
              <option value="Aktif">Aktif</option>
              <option value="Pasif">Pasif</option>
              <option value="Donduruldu">Donduruldu</option>
            </select>
          </div>

          {/* Toplu Silme Butonu */}
          {selectedStudents.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-sm font-medium hover:bg-rose-100 transition"
            >
              <Trash2 className="w-4 h-4" />
              Seçilenleri Sil ({selectedStudents.length})
            </button>
          )}
        </div>
      </div>

      {/* Öğrenci Tablosu */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      paginatedStudents.length > 0 &&
                      selectedStudents.length === paginatedStudents.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                </th>
                <th className="p-4">Öğrenci</th>
                <th className="p-4">Öğrenci No</th>
                <th className="p-4">Sınıf</th>
                <th className="p-4">İletişim</th>
                <th className="p-4">Veli Bilgisi</th>
                <th className="p-4">GNO</th>
                <th className="p-4">Durum</th>
                <th className="p-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {paginatedStudents.length > 0 ? (
                paginatedStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={() => toggleSelectStudent(student.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase">
                          {student.firstName[0]}
                          {student.lastName[0]}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">
                            {student.firstName} {student.lastName}
                          </div>
                          <div className="text-xs text-slate-400">{student.gender}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-600">
                      {student.studentNumber}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        {student.gradeClass}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col text-xs space-y-0.5">
                        <span className="flex items-center gap-1 text-slate-600">
                          <Mail className="w-3.5 h-3.5 text-slate-400" /> {student.email}
                        </span>
                        <span className="flex items-center gap-1 text-slate-500">
                          <Phone className="w-3.5 h-3.5 text-slate-400" /> {student.phone}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-xs">
                      <div className="font-medium text-slate-800">{student.parentName}</div>
                      <div className="text-slate-500">{student.parentPhone}</div>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-slate-900">{student.gpa}</span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusBadge(
                          student.status
                        )}`}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setCurrentStudent(student);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Detay Gör"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setCurrentStudent(student);
                            setIsAddEditModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          title="Düzenle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(student.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400 text-sm">
                    Arama kriterlerine uygun öğrenci bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Alt Sayfalama (Pagination) */}
        <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 text-sm text-slate-500">
          <div>
            Toplam <span className="font-semibold text-slate-800">{filteredStudents.length}</span> kayıttan{' '}
            <span className="font-semibold text-slate-800">
              {filteredStudents.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
            </span>{' '}
            -{' '}
            <span className="font-semibold text-slate-800">
              {Math.min(currentPage * itemsPerPage, filteredStudents.length)}
            </span>{' '}
            arası gösteriliyor.
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
              className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm bg-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-medium text-slate-700">
              {currentPage} / {totalPages || 1}
            </span>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm bg-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Ekle / Düzenle Modalı */}
      {isAddEditModalOpen && (
        <StudentModal
          student={currentStudent}
          onClose={() => {
            setIsAddEditModalOpen(false);
            setCurrentStudent(null);
          }}
          onSave={handleSaveStudent}
        />
      )}

      {/* Detay Görüntüleme Modalı */}
      {isDetailModalOpen && currentStudent && (
        <StudentDetailModal
          student={currentStudent}
          onClose={() => {
            setIsDetailModalOpen(false);
            setCurrentStudent(null);
          }}
        />
      )}

      {/* Silme Onay Diyaloğu */}