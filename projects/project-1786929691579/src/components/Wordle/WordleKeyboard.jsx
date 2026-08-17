import React from 'react';

const KEYBOARD_ROWS = [
  ['Q', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
  ['ENTER', 'Z', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç', 'DELETE']
];

export default function WordleKeyboard({ onChar, onEnter, onDelete, letterStatuses }) {
  const getKeyClass = (key) => {
    const status = letterStatuses[key];
    let base = "flex items-center justify-center font-bold rounded cursor-pointer transition-colors select-none text-sm sm:text-base ";
    
    if (key === 'ENTER' || key === 'DELETE') {
      return base + "px-3 py-3 bg-slate-700 hover:bg-slate-600 text-xs sm:text-sm text-slate-200 col-span-2";
    }

    if (status === 'correct') {
      return base + "py-3 bg-emerald-600 text-white";
    } else if (status === 'present') {
      return base + "py-3 bg-amber-500 text-white";
    } else if (status === 'absent') {
      return base + "py-3 bg-slate-800 text-slate-500 border border-slate-700";
    }

    return base + "py-3 bg-slate-700 hover:bg-slate-600 text-slate-100";
  };

  return (
    <div className="flex flex-col gap-2 max-w-lg mx-auto w-full px-2 my-4">
      {KEYBOARD_ROWS.map((row, rIdx) => (
        <div key={rIdx} className="flex justify-center gap-1 sm:gap-1.5 w-full">
          {row.map((key) => (
            <button
              key={key}
              onClick={() => {
                if (key === 'ENTER') onEnter();
                else if (key === 'DELETE') onDelete();
                else onChar(key);
              }}
              className={getKeyClass(key)}
              style={{ minWidth: key.length > 1 ? '3.5rem' : '2rem', flex: 1 }}
            >
              {key === 'DELETE' ? '⌫' : key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
