import React from 'react';
import Link from 'next/link';
import {
  Clock,
  Calendar,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  PlayCircle,
  Lock,
  AlertCircle,
  Award,
} from 'lucide-react';
import { Exam, Submission } from '@/types';

export type StudentExamStatus = 'ACTIVE' | 'UPCOMING' | 'COMPLETED' | 'EXPIRED';

export interface StudentExamWithSubmission extends Exam {
  submission?: Submission | null;
}

interface StudentQuizCardProps {
  exam: StudentExamWithSubmission;
}

export function getExamStatus(exam: StudentExamWithSubmission): StudentExamStatus {
  if (exam.submission) {
    return 'COMPLETED';
  }

  const now = new Date();
  const startTime = exam.startTime ? new Date(exam.startTime) : null;
  const endTime = exam.endTime ? new Date(exam.endTime) : null;

  if (startTime && now < startTime) {
    return 'UPCOMING';
  }

  if (endTime && now > endTime) {
    return 'EXPIRED';
  }

  return 'ACTIVE';
}

export function StudentQuizCard({ exam }: StudentQuizCardProps) {
  const status = getExamStatus(exam);

  const statusBadgeConfig = {
    ACTIVE: {
      label: 'Aktif Sınav',
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500 animate-pulse',
      icon: PlayCircle,
    },
    UPCOMING: {
      label: 'Yaklaşan',
      bg: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500',
      icon: Calendar,
    },
    COMPLETED: {
      label: 'Tamamlandı',
      bg: 'bg-violet-50 text-violet-700 border-violet-200',
      dot: 'bg-violet-500',
      icon: CheckCircle2,
    },
    EXPIRED: {
      label: 'Süresi Doldu',
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-rose-500',
      icon: AlertCircle,
    },
  };

  const currentBadge = statusBadgeConfig[status];
  const StatusIcon = currentBadge.icon;
  const questionCount = exam.questions?.length ?? exam._count?.questions ?? 0;

  const formatDate = (dateValue?: string | Date | null) => {
    if (!dateValue) return null;
    const d = new Date(dateValue);
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            <BookOpen className="h-3.5 w-3.5" />
            {exam.course?.code || 'Ders'}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${currentBadge.bg}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${currentBadge.dot}`} />
            <StatusIcon className="h-3.5 w-3.5" />
            {currentBadge.label}
          </span>
        </div>

        <div className="mt-3">
          <h3 className="line-clamp-2 text-base font-bold text-slate-900 group-hover:text-indigo-600">
            {exam.title}
          </h3>
          {exam.course?.title && (
            <p className="text-xs text-slate-500 mt-0.5">{exam.course.title}</p>
          )}
          {exam.description && (
            <p className="mt-2 line-clamp-2 text-xs text-slate-600 leading-relaxed">
              {exam.description}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-y border-slate-100 py-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{exam.durationMinutes} dakika</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{questionCount} Soru</span>
          </div>

          {exam.startTime && (
            <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>Başlangıç: {formatDate(exam.startTime)}</span>
            </div>
          )}
          {exam.endTime && (
            <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>Bitiş: {formatDate(exam.endTime)}</span>
            </div>
          )}
        </div>

        {status === 'COMPLETED' && exam.submission && (
          <div className="mt-3 rounded-lg bg-slate-50 p-2.5 flex items-center justify-between border border-slate-100">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-violet-600" />
              <span className="text-xs font-medium text-slate-700">Sınav Puanı</span>
            </div>
            <span className="text-sm font-bold text-violet-700">
              {exam.submission.score !== undefined && exam.submission.score !== null
                ? `${exam.submission.score} Puan`
                : 'İnceleniyor'}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 pt-2">
        {status === 'ACTIVE' && (
          <Link
            href={`/student/exams/${exam.id}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <PlayCircle className="h-4 w-4" />
            Sınava Başla
          </Link>
        )}

        {status === 'COMPLETED' && (
          <Link
            href={`/student/results/${exam.submission?.id || exam.id}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Sonucu Görüntüle
          </Link>
        )}

        {status === 'UPCOMING' && (
          <button
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400"
          >
            <Lock className="h-4 w-4" />
            Henüz Başlamadı
          </button>
        )}

        {status === 'EXPIRED' && (
          <button
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400"
          >
            <AlertCircle className="h-4 w-4" />
            Sınav Süresi Doldu
          </button>
        )}
      </div>
    </div>
  );
}
