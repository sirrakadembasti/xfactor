import React from 'react';

const evaluateGuess = (guess, solution) => {
  const res = Array(5).fill('absent');
  const solArr = solution.split('');
  const guessArr = guess.split('');

  // İlk geçiş: Doğru yerdeki harfler (correct)
  guessArr.forEach((letter, i) => {
    if (letter === solArr[i]) {
      res[i] = 'correct';
      solArr[i] = null;
    }
  });

  // İkinci geçiş: Yanlış yerdeki harfler (present)
  guessArr.forEach((letter, i) => {
    if (res[i] !== 'correct' && solArr.includes(letter)) {
      res[i] = 'present';
      solArr[solArr.indexOf(letter)] = null;
    }
  });

  return res;
};

export default function WordleGrid({ guesses, currentGuess, turn, solution }) {
  const rows = Array.from({ length: 6 });

  return (
    <div className="grid grid-rows-6 gap-2 my-4 max-w-xs mx-auto p-2">
      {rows.map((_, rowIndex) => {
        const isSubmitted = rowIndex < turn;
        const isCurrent = rowIndex === turn;
        const guess = isSubmitted ? guesses[rowIndex] : (isCurrent ? currentGuess : '');
        const statuses = isSubmitted ? evaluateGuess(guess, solution) : [];

        return (
          <div key={rowIndex} className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, colIndex) => {
              const letter = guess[colIndex] || '';
              const status = statuses[colIndex];

              let bgColor = 'bg-slate-800 border-slate-700 text-white';
              if (isSubmitted) {
                if (status === 'correct') bgColor = 'bg-emerald-600 border-emerald-500 text-white font-bold';
                else if (status === 'present') bgColor = 'bg-amber-500 border-amber-400 text-white font-bold';
                else bgColor = 'bg-slate-700 border-slate-600 text-slate-300';
              } else if (letter) {
                bgColor = 'bg-slate-700 border-slate-500 text-white font-bold scale-105';
              }

              return (
                <div
                  key={colIndex}
                  className={`w-12 h-12 sm:w-14 sm:h-14 border-2 flex items-center justify-center text-xl sm:text-2xl font-black rounded uppercase transition-all duration-300 select-none ${bgColor}`}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
