import React, { useEffect } from 'react';
import { Delete, CornerDownLeft } from 'lucide-react';
import { toTurkishUpper } from '../../utils/wordleWords';

const KEYBOARD_ROWS = [
  ['E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
  ['ENTER', 'Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', 'BACKSPACE']
];

export default function Keyboard({ onKeyPress, letterStatuses }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      
      if (e.key === 'Enter') {
        onKeyPress('ENTER');
      } else if (e.key === 'Backspace') {
        onKeyPress('BACKSPACE');
      } else {
        const upperChar = toTurkishUpper(e.key);
        if (/^[A-ZÇĞİÖŞÜ]$/.test(upperChar)) {
          onKeyPress(upperChar);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKeyPress]);

  const getKeyStyle = (key) => {
    const status = letterStatuses[key];
    if (status === 'correct') return 'bg-emerald-600 text-white hover:bg-emerald-700';
    if (status === 'present') return 'bg-amber-500 text-white hover:bg-amber-600';
    if (status === 'absent') return 'bg-slate-400 dark:bg-slate-800 text-slate-200 opacity-60';
    return 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600';
  };

  return (
    <div className="w-full max-w-lg mx-auto px-1 py-2 select-none">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1 my-1 touch-manipulation">
          {row.map((key) => {
            const isEnter = key === 'ENTER';
            const isDelete = key === 'BACKSPACE';
            const isSpecial = isEnter || isDelete;

            return (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className={`
                  h-12 flex items-center justify-center font-bold text-sm sm:text-base rounded-md transition-all active:scale-95
                  ${isSpecial ? 'px-3 sm:px-4 text-xs bg-slate-300 dark:bg-slate-600 text-slate-900 dark:text-white' : 'w-8 sm:w-10'}
                  ${!isSpecial ? getKeyStyle(key) : ''}
                `}
              >
                {isEnter && <span className="flex items-center gap-1"><CornerDownLeft className="w-4 h-4" /> <span className="hidden sm:inline">GİRİŞ</span></span>}
                {isDelete && <Delete className="w-5 h-5" />}
                {!isSpecial && key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
