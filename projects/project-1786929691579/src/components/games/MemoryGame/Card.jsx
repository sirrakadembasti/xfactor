import React from 'react';

export default function Card({ card, onClick, disabled, themeColor }) {
  const isFlipped = card.isFlipped || card.isMatched || card.isPeeked;

  return (
    <div
      onClick={() => !disabled && !isFlipped && onClick(card)}
      className={`relative h-24 sm:h-28 md:h-32 w-full cursor-pointer select-none perspective-1000 ${
        card.isMatched ? 'opacity-85 scale-95 transition-all duration-300' : 'hover:scale-105 transition-transform duration-200'
      }`}
      style={{ perspective: '1000px' }}
    >
      <div
        className="w-full h-full relative transition-transform duration-500 rounded-2xl shadow-lg border border-white/20"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Ön Yüz (Kapalı Kart) */}
        <div
          className={`absolute inset-0 w-full h-full rounded-2xl flex flex-col items-center justify-center bg-gradient-to-br ${themeColor} shadow-inner border border-white/30 backdrop-blur-md`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold border border-white/40 shadow-sm">
            ?
          </div>
        </div>

        {/* Arka Yüz (Açık Kart) */}
        <div
          className={`absolute inset-0 w-full h-full rounded-2xl flex items-center justify-center bg-slate-900/90 border-2 ${
            card.isMatched
              ? 'border-emerald-400 bg-emerald-950/40 shadow-emerald-500/20 shadow-lg'
              : 'border-indigo-400/60 shadow-indigo-500/20 shadow-lg'
          }`}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <span className="text-4xl sm:text-5xl transform transition-transform duration-300 drop-shadow-md">
            {card.content}
          </span>
        </div>
      </div>
    </div>
  );
}
