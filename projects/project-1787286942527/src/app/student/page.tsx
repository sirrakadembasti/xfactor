'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  BookOpen,
  CheckCircle,
  Clock,
  Award,
  ArrowRight,
  AlertCircle,
  Calendar,
  FileText,
  BarChart2,
  Play
} from 'lucide-react';

interface StudentStats {
  totalExams: number;
  completedExams: number;
  activeExams: number;
  averageScore: number;
}

interface ExamItem {
  id: string;
  title: string;
  courseName: string;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  questionCount: number;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  score?: number;
  maxScore?: number;
}

export default function StudentDashboardPage() {
  const [stats, setStats] = useState<StudentStats>({
    totalExams: 8,
    completedExams: 5,
    activeExams: 2,
    averageScore: 78.5
  });

  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [exams, setExams] = useState<ExamItem[]>([
    {
      id: 'exam-1',
      title: 'Veri Yapıları ve Algoritmalar Vize',
      courseName: 'Bilgisayar Mühendisliği',
      durationMinutes: 60,
      startDate: new Date(Date.now() - 3600000).toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
      questionCount: 25,
      status: 'ACTIVE'
    },
    {
      id: 'exam-2',
      title: 'Veritabanı Sistemleri Quiz 2',
      courseName: 'Yazılım Mühendisliği',
      durationMinutes: 30,
      startDate: new Date(Date.now() + 7200000).toISOString(),
      endDate: new Date(Date.now() + 172800000).toISOString(),
      questionCount: 15,
      status: 'UPCOMING'
    },
    {
      id: 'exam-3',
      title: 'İşletim Sistemleri Ara Sınav',
      courseName: 'Bilgisayar Mühendisliği',
      durationMinutes: 75,
      startDate: new Date(Date.now() - 604800000).toISOString(),
      endDate: new Date(Date.now() - 518400000).toISOString(),
      questionCount: 30,
      status: 'COMPLETED',
      score: 84,
      maxScore: 100
    },
    {
      id: 'exam-4',
      title: 'Yapay Zekaya Giriş Final Projesi Testi',
      courseName: 'Yapay Zeka Mühendisliği',
      durationMinutes: 90,
      startDate: new Date(Date.now() - 1209600000).toISOString(),
      endDate: new Date(Date.now() - 1123200000).toISOString(),
      questionCount: 40,
      status: 'COMPLETED',
      score: 73,
      maxScore: 100
    }
  ]);

  const activeExams = exams.filter((e) => e.status === 'ACTIVE' || e.status === 'UPCOMING');
  const completedExams = exams.filter((e) => e.status === 'COMPLETED');

  return (
    <DashboardLayout role="STUDENT">
      <div className="space-y-8">
        {/* Başlık Bölümü */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Öğrenci Portalı
            </h1>
            <p className="text-sm sm:text-base text-slate-500 mt-1">
              Sınavlarınıza katılın, performansınızı ve geçmiş sonuçlarınızı takip edin.
            </p>
          </div>
        </div>

        {/* İstatistik Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Aktif Sınavlar</span>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{stats.activeExams}</span>
              <span className="text-xs text-blue-600 font-medium">giriş yapılabilir</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Tamamlanan</span>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{stats.completedExams}</span>
              <span className="text-xs text-slate-500 font-medium">/ {stats.totalExams} sınav</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Başarı Ortalaması</span>
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">%{stats.averageScore}</span>
              <span className="text-xs text-emerald-600 font-medium">+2.4% son sınav</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Toplam Ders</span>
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">4</span>
              <span className="text-xs text-slate-500 font-medium">kayıtlı müfredat</span>
            </div>
          </div>
        </div>

        {/* Sekmeler ve Sınav Listesi */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-6 pt-4">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('active')}
                className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'active'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Play className="w-4 h-4" />
                Aktif ve Yaklaşan Sınavlar ({activeExams.length})
              </button>
              <button
                onClick={() => setActiveTab('completed')}
                className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'completed'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                Tamamlanan Sınavlar ({completedExams.length})
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'active' ? (
              activeExams.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeExams.map((exam) => (
                    <div
                      key={exam.id}
                      className="border border-slate-200 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all flex flex-col justify-between bg-slate-50/50"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                            {exam.courseName}
                          </span>
                          {exam.status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              Devam Ediyor
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                              Yakında
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-slate-900 line-clamp-1">
                          {exam.title}
                        </h3>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <span>{exam.durationMinutes} Dakika</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <span>{exam.questionCount} Soru</span>
                          </div>
                          <div className="flex items-center gap-1.5 col-span-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span>
                              Bitiş: {new Date(exam.endDate).toLocaleDateString('tr-TR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {exam.status === 'ACTIVE' ? 'Sınav süresi başladı' : 'Başlangıç tarihi bekleniyor'}
                        </span>
                        <Link
                          href={`/exam/${exam.id}`}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors ${
                            exam.status === 'ACTIVE'
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed pointer-events-none'
                          }`}
                        >
                          Sınava Başla
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-800">Aktif Sınav Bulunmuyor</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Şu an katılmanız gereken planlanmış bir aktif sınavınız yok.
                  </p>
                </div>
              )
            ) : (
              completedExams.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Sınav Adı</th>
                        <th className="py-3 px-4">Ders</th>
                        <th className="py-3 px-4">Soru Sayısı</th>
                        <th className="py-3 px-4">Puan</th>
                        <th className="py-3 px-4 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {completedExams.map((exam) => (
                        <tr key={exam.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-medium text-slate-900">
                            {exam.title}
                          </td>
                          <td className="py-3.5 px-4">{exam.courseName}</td>
                          <td className="py-3.5 px-4">{exam.questionCount} Soru</td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              {exam.score} / {exam.maxScore}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link
                              href={`/student/results/${exam.id}`}
                              className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 gap-1"
                            >
                              Raporu Gör
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-800">Geçmiş Sınav Bulunamadı</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Henüz tamamlanmış bir sınav sonucunuz bulunmuyor.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
