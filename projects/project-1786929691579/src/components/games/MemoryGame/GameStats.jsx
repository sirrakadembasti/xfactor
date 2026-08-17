import React from 'react';

export default function GameStats({
  moves,
  timer,
  score,
  combo,
  hintsLeft,
  onUseHint,
  isMuted,
  onToggleMute,
  isPaused,
  onTogglePause,
  onReset,
  highScore
}) {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 border border-slate-700/60 shadow-xl mb-6 text-white">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40 flex flex-col items-center justify-center">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Süre</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-cyan-400">{formatTime(timer)}</span>
        </div>

        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40 flex flex-col items-center justify-center">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Hamle</span>
          <span className="text-xl sm:text-2xl font-bold text-amber-400">{moves}</span>
        </div>

        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40 flex flex-col items-center justify-center relative overflow-hidden">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Skor</span>
          <span className="text-xl sm:text-2xl font-bold text-emerald-400">{score}</span>
          {combo > 1 && (
            <span className="absolute top-1 right-2 text-[10px] font-extrabold px-1.5 py-0.5 bg-amber-500 text-slate-950 rounded-full animate-bounce">
              {combo}x Seri
            </span>
          )}
        </div>

        <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40 flex flex-col items-center justify-center">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">En Yüksek</span>
          <span className="text-xl sm:text-2xl font-bold text-purple-400">{highScore}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/50 pt-3">
        <button
          onClick={onUseHint}
          disabled={hintsLeft <= 0 || isPaused}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            hintsLeft > 0 && !isPaused
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40'
              : 'bg-slate-700/40 text-slate-500 cursor-not-allowed border border-slate-700/30'
          }`}
        >
          💡 İpucu ({hintsLeft})
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-600/40"
            title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button
            onClick={onTogglePause}
            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-600/40 text-sm font-medium flex items-center gap