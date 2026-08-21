import React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Filter,
  Search,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Award,
  AlertTriangle
} from 'lucide-react';

interface StudentResult {
  id: string;
  studentNumber: string;
  name: string;
  classroom: string;
  correct: number;
  incorrect: number;
  empty: number;
  score: number;
  net: number;
  rank: number;
}

const mockStudentResults: StudentResult[] = [
  { id: '1', studentNumber: '101', name: 'Ahmet Yılmaz', classroom: '11-A', correct: 28, incorrect: 2, empty: 0, score: 93.3, net: 27.5, rank: 1 },
  { id: '2', studentNumber: '102', name: 'Zeynep Kaya', classroom: '11-A', correct: 27, incorrect: 3, empty: 0, score: 90.0, net: 26.25, rank: 2 },
  { id: '3', studentNumber: '103', name: 'Mehmet Demir', classroom: '11-B', correct: 25, incorrect: 4, empty: 1, score: 83.3, net: 24.0, rank: 3 },
  { id: '4', studentNumber: '104', name: 'Ayşe Çelik', classroom: '11-A', correct: 24, incorrect: 5, empty: 1, score: 80.0, net: 22.75, rank: 4 },
  { id: '5', studentNumber: '105', name: 'Can Özkan', classroom: '11-C', correct: 22, incorrect: 6, empty: 2, score: 73.3, net: 20.5, rank: 5 },
  { id: '6', studentNumber: '106', name: 'Elif Şahin', classroom: '11-B', correct: 20, incorrect: 8, empty: 2, score: 66.7, net: 18.0, rank: 6 },
  { id: '7', studentNumber: '107', name: 'Burak Koç', classroom: '11-C', correct: 18, incorrect: 9, empty: 3, score: 60.0, net: 15.75, rank: 7 }
];

interface TopicAnalysis {
  topic: string;
  successRate: number;
  questionCount: number;
  status: 'good' | 'average' | 'poor';
}

const topicAnalyses: TopicAnalysis[] = [
  { topic: 'Vektörler ve Kuvvet Dengesi', successRate: 88, questionCount: 6, status: 'good' },
  { topic: 'Bağıl Hareket ve Nehir Problemleri', successRate: 74, questionCount: 8, status: 'average' },
  { topic: 'Newton\'un Hareket Yasaları', successRate: 62, questionCount: 10, status: 'poor' },
  { topic: 'Bir Boyutta Sabit İvmeli Hareket', successRate: 81, questionCount: 6, status: 'good' }
];

export default function TeacherResultsPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 space-y-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Geri Dönüş ve Başlık */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              href="/teacher"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Öğretmen Paneline Dön
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Sınav Sonuç ve Performans Analizi</h1>
            <p className="text-slate-500 text-sm">
              Sınav kazanım istatistikleri, sınıf sıralaması ve detaylı öğrenci karne metrikleri.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Excel / PDF İndir
            </button>
          </div>
        </div>

        {/* Filtre Barı */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Sınav Seçimi</label>
            <select className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="1">11. Sınıf Fizik 1. Dönem 2. Yazılı</option>
              <option value="2">TYT Deneme Sınavı - 4</option>
              <option value="3">Vektörler ve Bağıl Hareket Mini Test</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Şube / Sınıf Filtresi</label>
            <select className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="all">Tüm Şubeler (11-A, 11-B, 11-C)</option>
              <option value="11-A">11-A</option>
              <option value="11-B">11-B</option>
              <option value="11-C">11-C</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Öğrenci Ara</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="İsim veya Numara..."
                className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filtreleri Uygula
            </button>
          </div>
        </div>

        {/* Metrik Özetleri */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Katılan Öğrenci</span>
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">58 / 60</p>
            <p className="text-xs text-emerald-600 mt-1 font-medium">%96.6 Katılım Oranı</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Sınav Ortalaması</span>
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">78.50 Puan</p>
            <p className="text-xs text-slate-500 mt-1">En Yüksek: 93.3 | En Düşük: 46.0</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Ortalama Net</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">22.45 Net</p>
            <p className="text-xs text-slate-500 mt-1">30 Soru Üzerinden</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Kritik Konu</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-sm font-bold text-slate-900 mt-2 truncate">Newton Hareket Yasaları</p>
            <p className="text-xs text-rose-600 mt-1 font-medium">%62 Başarı Seviyesi (Düşük)</p>
          </div>
        </div>

        {/* Konu Analiz Dağılımı */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Kazanım ve Konu Bazlı Başarı Dağılımı</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topicAnalyses.map((t, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{t.topic}</span>
                  <span className="text-xs font-bold text-slate-600">%{t.successRate}</span>
                </div>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      t.successRate >= 80
                        ? 'bg-emerald-500'
                        : t.successRate >= 70
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${t.successRate}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">Toplam {t.questionCount} soru soruldu.</p>
              </div>
            ))}
          </div>
        </div>

        {/* Öğrenci Başarı Sıralama Tablosu */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Öğrenci Başarı ve Sonuç Listesi</h2>
            <span className="text-xs text-slate-500">Toplam {mockStudentResults.length} kayıt listelendi</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Sıra</th>
                  <th className="py-3.5 px-4">Öğrenci</th>
                  <th className="py-3.5 px-4">Şube</th>
                  <th className="py-3.5 px-4 text-center">Doğru</th>
                  <th className="py-3.5 px-4 text-center">Yanlış</th>
                  <th className="py-3.5 px-4 text-center">Boş</th>
                  <th className="py-3.5 px-4 text-center">Net</th>
                  <th className="py-3.5 px-4 text-right">Puan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mockStudentResults.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                          st.rank === 1
                            ? 'bg-amber-100 text-amber-800 font-bold'
                            : st.rank === 2
                            ? 'bg-slate-200 text-slate-700 font-bold'
                            : st.rank === 3
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'text-slate-600'
                        }`}
                      >
                        {st.rank}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-medium text-slate-900">{st.name}</p>
                        <p className="text-xs text-slate-400">No: {st.studentNumber}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">{st.classroom}</td>
                    <td className="py-3.5 px-4 text-center text-emerald-600 font-semibold">{st.correct}</td>
                    <td className="py-3.5 px-4 text-center text-rose-600 font-semibold">{st.incorrect}</td>
                    <td className="py-3.5 px-4 text-center text-slate-400">{st.empty}</td>
                    <td className="py-3.5 px-4 text-center font-bold text-slate-800">{st.net.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-indigo-600">%{st.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
