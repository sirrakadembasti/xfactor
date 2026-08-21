'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface QuizTimerProps {
  initialSeconds: number;
  onTimeExpire?: () => void;
  isPaused?: boolean;
  className?: string;
}

export const QuizTimer: React.FC<QuizTimerProps> = ({
  initialSeconds,
  onTimeExpire,
  isPaused = false,
  className = '',
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(initialSeconds);

  useEffect(() => {
    setTimeLeft(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (isPaused || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onTimeExpire) {
            onTimeExpire();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, timeLeft, onTimeExpire]);

  const isCritical = timeLeft <= 60 && timeLeft > 0;
  const isExpired = timeLeft === 0;

  const formattedTime = useMemo(() => {
    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [timeLeft]);

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-sm font-semibold transition-all duration-300 ${
        isExpired
          ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800'
          : isCritical
          ? 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700 shadow-sm shadow-amber-500/20'
          : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-200 dark:border-zinc-700'
      } ${className}`}
    >
      {isCritical ? (
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-bounce" />
      ) : (
        <Clock className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
      )}
      <span className="tabular-nums tracking-wide">{formattedTime}</span>
      {isCritical && !isExpired && (
        <span className="text-xs uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400 hidden sm:inline">
          Son Dakika!
        </span>
      )}
      {isExpired && (
        <span className="text-xs uppercase font-bold tracking-wider text-red-600 dark:text-red-400 hidden sm:inline">
          Süre Doldu
        </span>
      )}
    </div>
  );
};
