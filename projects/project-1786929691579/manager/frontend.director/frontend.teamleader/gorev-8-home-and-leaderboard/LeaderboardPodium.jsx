import React from 'react';
import { Crown, Medal, Flame } from 'lucide-react';

export default function LeaderboardPodium({ topThree = [] }) {
  if (!topThree || topThree.length < 3) return null;

  const first = topThree[0];
  const second = topThree[1];
  const third = topThree[2];

  return (
    <div className="grid grid-cols-3 gap-3 md:gap-6 items-end my-8 max-w-2xl mx-auto px-2">
      {/* 2. Sıra - Gümüş */}
      <div className="flex flex-col items-center">
        <div className="relative mb-3 flex flex-col items-center">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full ring-4 ring-slate-400/50 p-1 bg-slate-800 shadow-xl relative overflow-hidden">
            <img src={second.avatar} alt={second.name} className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="absolute -bottom-2 bg-slate-400 text-slate-950 font-black text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
            <Medal className="w-3 h-3" /> #2
          </div>
        </div>
        <div className="text-center mb-2">
          <div className="text-xs md:text-sm font-bold text-white truncate max-w-[90px] md:max-w-[120px]">{second.name}</div>
          <div className="text-[11px] text-indigo-300 font-extrabold">{second.xp.toLocaleString()} XP</div>
        </div>
        <div className="w-full h-28 md:h-36 bg-gradient-to-t from-slate-800 to-slate-700/80 rounded-t-2xl border-t border-slate-600/50 flex flex-col items-center justify-center p-2">
          <span className="text-2xl font-black text-slate-400">2</span>
        </div>
      </div>

      {/* 1. Sıra - Altın */}
      <div className="flex flex-col items-center -mt-6">
        <div className="relative mb-3 flex flex-col items-center">
          <Crown className="w-7 h-7 text-amber-400 absolute -top-7 animate-bounce" />
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full ring-4 ring-amber-400 p-1 bg-slate-800 shadow-2xl shadow-amber-500/20 relative overflow-hidden">
            <img src={first.avatar} alt={first.name} className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="absolute -bottom-2 bg-amber-400 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md">
            <Crown className="w-3 h-3 fill-current" /> #1
          </div>
        </div>
        <div className="text-center mb-2">
          <div className="text-sm md:text-base font-extrabold text-amber-300 truncate max-w-[100px] md:max-w-[140px]">{first.name}</div>
          <div className="text-xs text-amber-400 font-extrabold">{first.xp.toLocaleString()} XP</div>
        </div>
        <div className="w-full h-36 md:h-44 bg-gradient-to-t from-amber-950/60 via-amber-900/40 to-amber-600/30 rounded-t-2xl border-t-2 border-amber-400 flex flex-col items-center justify-center p-2 shadow-inner">
          <span className="text-3xl font-black text-amber-400">1</span>
        </div>
      </div>

      {/* 3. Sıra - Bronz */}
      <div className="flex flex-col items-center">
        <div className="relative mb-3 flex flex-col items-center">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full ring-4 ring-amber-700/50 p-1 bg-slate-800 shadow-xl relative overflow-hidden">
            <img src={third.avatar} alt={third.name} className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="absolute -bottom-2 bg-amber-700 text-amber-100 font-black text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
            <Medal className="w-3 h-3" /> #3
          </div>
        </div>
        <div className="text-center mb-2">
          <div className="text-xs md:text-sm font-bold text-white truncate max-w-[90px] md:max-w-[120px]">{third.name}</div>
          <div className="text-[11px] text-indigo-300 font-extrabold">{third.xp.toLocaleString()} XP</div>
        </div>
        <div className="w-full h-24 md:h-32 bg-gradient-to-t from-slate-800 to-amber-950/40 rounded-t-2xl border-t border-amber-800/40 flex flex-col items-center justify-center p-2">
          <span className="text-2xl font-black text-amber-700">3</span>
        </div>
      </div>
    </div>
  );
}
