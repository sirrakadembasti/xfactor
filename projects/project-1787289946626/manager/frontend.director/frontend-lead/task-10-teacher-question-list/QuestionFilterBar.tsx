import React from 'react';
import { Search, Filter, RotateCcw } from 'lucide-react';
import { QuestionType } from '@/types';

export interface QuestionFilterState {
  searchTerm: string;
  type: QuestionType | 'ALL';
  courseId: string;
  minPoints: string;
}

interface QuestionFilterBarProps {
  filters: QuestionFilterState;
  onFilterChange: (filters: QuestionFilterState) => void;
  onReset: () => void;
  courses?: Array<{ id: string; title: string; code: string }>;
}

export const QuestionFilterBar: React.FC<QuestionFilterBarProps> = ({
  filters,
  onFilterChange,
  onReset,
  courses = [],
}) => {
  const handleChange = (key: keyof QuestionFilterState, value: string) => {
    onFilterChange({
      ...filters,
      [key]: value,
    });
  };

  const isFiltered =
    filters.searchTerm.trim() !== '' ||
    filters.type !== 'ALL' ||
    filters.courseId !== '' ||
    filters.minPoints !== '';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm mb-6 space-y-4">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
          <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Soru Filtreleme ve Arama</span>
        </div>
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Filtreleri Temizle
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Arama Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Soru metninde ara..."
            value={filters.searchTerm}
            onChange={(e) => handleChange('searchTerm', e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Soru Tipi */}
        <div>
          <select
            value={filters.type}
            onChange={(e) => handleChange('type', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="ALL">Tüm Soru Tipleri</option>
            <option value="MULTIPLE_CHOICE">Çoktan Seçmeli</option>
            <option value="TRUE_FALSE">Doğru / Yanlış</option>
            <option value="OPEN_ENDED">Açık Uçlu / Klasik</option>
          </select>
        </div>

        {/* Ders Seçici */}
        <div>
          <select
            value={filters.courseId}
            onChange={(e) => handleChange('courseId', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="">Tüm Dersler</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} - {course.title}
              </option>
            ))}
          </select>
        </div>

        {/* Puan Filtresi */}
        <div>
          <select
            value={filters.minPoints}
            onChange={(e) => handleChange('minPoints', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          >
            <option value="">Tüm Puan Aralıkları</option>
            <option value="5">5 Puan ve Üzeri</option>
            <option value="10">10 Puan ve Üzeri</option>
            <option value="20">20 Puan ve Üzeri</option>
            <option value="50">50 Puan ve Üzeri</option>
          </select>
        </div>
      </div>
    </div>
  );
};
