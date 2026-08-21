'use client';

import React from 'react';
import { Award, Calendar, Clock, User } from 'lucide-react';

interface ReportHeaderProps {
  examTitle: string;
  studentName: string;
  completedAt: string;
  durationMinutes: number;
}

export function ReportHeader({
  examTitle,
  studentName,
  completedAt,
  durationMinutes,
}: ReportHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 mb-2">
          <Award className="w-3.5 h-3.5" /> Resmi Karne ve Sınav Raporu
        </span>
        <h1 className="text-2xl font-bold text-slate-900">{examTitle}</h1>
        <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
          <User className="w-4 h-4 text-slate-400" /> Öğrenci: <strong className="text-slate-800">{studentName}</strong>
        </p>
      </div>

      <div className="flex sm:flex-col items-end gap-1.5 text-xs text-slate-500 font-mono">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" /> {completedAt}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" /> Süre: {durationMinutes} dk
        </span>
      </div>
    </div>
  );
}
