'use client';

import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { QuestionBankList as QuestionBank } from '@/components/teacher/QuestionBankList';
import { QuizStudioModal as QuizStudio } from '@/components/teacher/QuizStudioModal';
import { ExamAnalyticsCard as ExamAnalytics } from '@/components/teacher/ExamAnalyticsCard';
import {
  Layers,
  Sparkles,
  BarChart3,
  BookOpen,
  GraduationCap,
  HelpCircle,
  FileQuestion,
} from 'lucide-react';

type TeacherTab = 'questions' | 'studio' | 'analytics';

interface TabConfig {
  id: TeacherTab;
  label: string;
  description: string;
  icon: React.ElementType;
  badge?: string;
}

const TABS: TabConfig[] = [
  {
    id: 'questions',
    label: 'Soru Bankası',
    description: 'Müfredat ve zorluk düzeyine göre soru deposu yönetimi',
    icon: BookOpen,
  },
  {
    id: 'studio',
    label: 'Quiz Stüdyosu',
    description: 'Yapay zekâ destekli ve manuel sınav/test hazırlama',
    icon: Sparkles,
    badge: 'AI Destekli',
  },
  {
    id: 'analytics',
    label: 'Sınav Analizleri',
    description: 'Öğrenci ve sınıf bazlı başarı, kazanım ve soru analitiği',
    icon: BarChart3,
  },
];

export default function TeacherPortalPage() {
  const [activeTab, setActiveTab] = useState<TeacherTab>('questions');

  return (
    <DashboardLayout requiredRole="TEACHER">
      <div className="space-y-6 pb-12">
        {/* Başlık ve Karşılama Kartı */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-6 text-white shadow-xl md:p-8">
          <div className="relative z-10 max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-md">
              <GraduationCap className="h-4 w-4 text-blue-200" />
              <span>Öğretmen Yönetim Merkezi</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">
              Eğitim ve Ölçme Değerlendirme Stüdyosu
            </h1>
            <p className="text-sm text-blue-100/90 md:text-base">
              Soru havuzunuzu genişletin, yapay zekâ asistanıyla saniyeler içinde sınavlar oluşturun
              ve detaylı öğrenci kazanım analizleriyle ders veriminizi artırın.
            </p>
          </div>

          {/* Dekoratif Işık Efektleri */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 right-1/3 h-48 w-48 rounded-full bg-purple-500/20 blur-2xl" />
        </div>

        {/* Sekme Menüsü (Tab Navigation) */}
        <div className="border-b border-gray-200 bg-white px-4 pt-3 shadow-sm sm:rounded-xl sm:border dark:border-gray-800 dark:bg-gray-900">
          <nav className="-mb-px flex flex-wrap gap-2 sm:gap-6" aria-label="Öğretmen Modülleri">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative inline-flex items-center gap-2.5 border-b-2 px-3 py-3.5 text-sm font-semibold transition-all duration-200 sm:px-4 ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 ${
                      isActive
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300'
                    }`}
                  />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sekme İçerikleri */}
        <div className="transition-opacity duration-300">
          {activeTab === 'questions' && (
            <section aria-labelledby="question-bank-section">
              <QuestionBank />
            </section>
          )}

          {activeTab === 'studio' && (
            <section aria-labelledby="quiz-studio-section">
              <QuizStudio />
            </section>
          )}

          {activeTab === 'analytics' && (
            <section aria-labelledby="exam-analytics-section">
              <ExamAnalytics />
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
