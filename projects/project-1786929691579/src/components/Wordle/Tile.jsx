import React from 'react';

export default function Tile({ letter, status, position, isRevealed, isBouncing }) {
  let statusStyles = 'border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';

  if (isRevealed) {
    if (status === 'correct') {
      statusStyles = 'bg-emerald-600 text-white border-emerald-600';
    } else if (status === 'present') {
      statusStyles = 'bg-amber-500 text-white border-amber-500';
    } else if (status === 'absent') {
      statusStyles = 'bg-slate-500 dark:bg-slate-700 text-white border-slate-500 dark:border-slate-700';
    }
  } else if (letter) {
    statusStyles = 'border-2 border-slate-500 dark:border-slate-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-white scale-105 transition-transform';
  }

  const animationStyle = isRevealed
    ? { animationDelay: `${position * 250}ms` }
    : {};

  return (
    <div
      style={animationStyle}
      className={`
        w-12 h-12 sm:w-14 sm:h-14 font-extrabold text-2xl sm:text-3xl flex items-center justify-center select-none rounded-lg shadow-sm transition-all duration-300
        ${statusStyles}
        ${isRevealed ? 'animate-flip' : ''}
        ${isBouncing ? 'animate-bounce' : ''}
      `}
    >
      {letter}
    </div>
  );
}
