import React from 'react';
import { Play, Trophy, Flame, Sparkles, ArrowRight } from 'lucide-react';

export default function HeroSection({ onStartQuiz, onViewLeaderboard }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 p-8 md:p-12 text-white shadow-2xl mb-8">
      {/* Arka Plan Dekorasyon Parıltıları */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-purple-200 mb-6">
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>Yazılım Bilgini Test Et ve Zirveye Tırman!</span>
        </div>

        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-purple-200">
          Bilgini Göster, <br className="hidden sm:inline" /> Leaderboard'da Lider Ol!
        </h1>

        <p className="text-indigo-100/80 text-base md:text-lg mb-8 max-w-2xl font-normal leading-relaxed">
          Günlük quiz görevlerini tamamla, tecrübe puanları (XP) kazan, serini koru ve en iyi yazılımcılar arasındaki yerini al.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={onStartQuiz}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-gray-950 font-bold text-sm shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Hemen Oyuna Başla</span>
          </button>

          <button
            onClick={onViewLeaderboard}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm backdrop-blur-md transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <Trophy className="w-5 h-5 text-amber-300" />
            <span>Sıralamayı İncele</span>
            <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
          </button>
        </div>
      </div>
    </div>
  );
}
