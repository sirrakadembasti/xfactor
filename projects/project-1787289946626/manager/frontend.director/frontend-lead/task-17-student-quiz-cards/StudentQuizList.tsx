'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, BookOpenCheck, AlertCircle } from 'lucide-react';
import {
  StudentQuizCard,
  StudentExamWithSubmission,
  StudentExamStatus,
  getExamStatus,
} from '@/components/student/StudentQuizCard';

interface StudentQuizListProps {
  exams: StudentExamWithSubmission[];
  isLoading?: boolean;
}
type FilterTab = 'ALL' | StudentExamStatus;

export function StudentQuizList({ exams = [], isLoading = false }: StudentQuizListProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string>('ALL');

  const courses = useMemo(() => {
    const courseMap = new Map<string, string>();
    exams.forEach((item) => {
      if (item.course?.id && item.course?.title) {
        courseMap.set(item.course.id, item.course.title);
      }
    });
    return Array.from(courseMap.entries()).map(([id, title]) => ({ id, title }));
  }, [exams]);

  const counts = useMemo(() => {
    const c = {
      ALL: exams.length,
      ACTIVE: 0,
      UPCOMING: 0,
      COMPLETED: 0,
      EXPIRED: 0,
    };
    exams.forEach((exam) => {
      const status = getExamStatus(exam);
      c[status] = (c[status] || 0) + 1;
    });
    return c;
  }, [exams]);

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      const status = getExamStatus(exam);
      const matchesTab = activeTab === 'ALL' || status === activeTab;

      const matchesSearch =
        exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (exam.description && exam.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (exam.course?.code && exam.course.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (exam.course?.title && exam.course.title.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCourse = selectedCourse === 'ALL' || exam.courseId === selectedCourse;

      return matchesTab && matchesSearch && matchesCourse;
    });
  }, [exams, activeTab, searchQuery, selectedCourse]);

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'ALL', label: 'Tüm Sınavlar', count: counts.ALL },
    { id: 'ACTIVE', label: 'Aktif', count: counts.ACTIVE },
    { id: 'UPCOMING', label: 'Yaklaşan', count: counts.UPCOMING },
    { id: 'COMPLETED', label: 'Tamamlanan', count: counts.COMPLETED },
    { id: 'EXPIRED', label: 'Süresi Dolan', count: counts.EXPIRED },
  ];

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="h-12 w-full animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 rounded-xl border border-slate-200 bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Filtre ve Arama Çubuğu */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Durum Sekmeleri */}
        <div className="flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-1.5">
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                }`}
              >
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Arama ve Ders Seçimi */}
        <div className="flex flex-1 items-center gap-2 sm:max-w-md sm:justify-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sınav veya ders ara..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {courses.length > 0 && (
            <div className="relative">
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs font-medium text-slate-700 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">Tüm Dersler</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Sınav Kartları Grid */}
      {filteredExams.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredExams.map((exam) => (
            <StudentQuizCard key={exam.id} exam={exam} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-16 px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
            {searchQuery ? <AlertCircle className="h-6 w-6" /> : <BookOpenCheck className="h-6 w-6" />}
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            {searchQuery ? 'Aramanıza uygun sınav bulunamadı' : 'Kayıtlı sınav bulunmuyor'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {searchQuery
              ? 'Farklı anahtar kelimeler deneyebilir veya filtreleme kriterlerini sıfırlayabilirsiniz.'
              : 'Seçili kategoride henüz sınav oluşturulmamış veya bu derslere kayıtlı değilsiniz.'}
          </p>
          {(searchQuery || selectedCourse !== 'ALL' || activeTab !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCourse('ALL');
                setActiveTab('ALL');
              }}
              className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
            >
              Filtreleri Temizle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
