import React from 'react';
import { Flame, Clock, Award, Play } from 'lucide-react';

export default function DailyChallengeCard({ onStartChallenge }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
          <Flame className="w-4 h-4 fill-amber-400 text-amber-400 animate-bounce" />
          <span>Günün Görevi</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-full">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Yarın Yenileniyor</span>
        </div>
      </div>

      <h3 className="text-xl font-bold text-white mb-2">
        React Hooks & State Yönetimi
      </h3>
      
      <p className="text-sm text-slate-400 mb-6 leading-relaxed">
        10 sorudan oluşan bu özel testle useEffect ve useMemo hakimiyetini ölç. Tamamlayarak ekstra XP bonusu kazan!
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
        <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
          <Award className="w-5 h-5 text-amber-400" />
          <span>+500 XP Ödül</span>
        </div>

        <button
          onClick={onStartChallenge}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-indigo-600/30 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Mücadeleye Başla</span>
        </button>
      </div>
    </div>
  );
}
