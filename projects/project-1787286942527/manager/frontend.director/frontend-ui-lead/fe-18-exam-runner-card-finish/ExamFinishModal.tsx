import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ExamFinishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  isTimeExpired?: boolean;
  stats: {
    totalQuestions: number;
    answeredCount: number;
    unansweredCount: number;
  };
}

export const ExamFinishModal: React.FC<ExamFinishModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  isTimeExpired = false,
  stats,
}) => {
  const hasUnanswered = stats.unansweredCount > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting && !isTimeExpired) {
          onClose();
        }
      }}
      title={isTimeExpired ? 'Süre Doldu!' : 'Sınavı Tamamla'}
    >
      <div className="space-y-4 text-slate-700 dark:text-slate-300 text-sm">
        {isTimeExpired ? (
          <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
            <div className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Sınav için tanınan süre sona erdi.
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
                Mevcut yanıtlarınız sisteme kaydedilecek ve değerlendirilecektir.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-slate-600 dark:text-slate-400">
            Sınavı bitirmek ve yanıtlarınızı göndermek istediğinizden emin misiniz? Gönderdikten sonra yanıtlarınızı değiştiremezsiniz.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-center">
          <div className="space-y-1">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Toplam</span>
            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{stats.totalQuestions}</span>
          </div>
          <div className="space-y-1 border-x border-slate-200 dark:border-slate-700/60">
            <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">Cevaplanan</span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.answeredCount}</span>
          </div>
          <div className="space-y-1">
            <span className="block text-xs font-medium text-amber-600 dark:text-amber-400">Boş</span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats.unansweredCount}</span>
          </div>
        </div>

        {!isTimeExpired && hasUnanswered && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>
              Henüz işaretlenmemiş <strong>{stats.unansweredCount}</strong> soru bulunmaktadır.
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {!isTimeExpired && (
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Sınava Dön
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          onClick={onConfirm}
          isLoading={isSubmitting}
          className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[130px] shadow-sm"
        >
          {isSubmitting ? 'Gönderiliyor...' : 'Sınavı Tamamla'}
        </Button>
      </div>
    </Modal>
  );
};
