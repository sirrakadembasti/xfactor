import React from 'react';
import {
  Trophy,
  Award,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Zap,
  Sparkles,
  Scissors
} from 'lucide-react';

export default function ScoreBoard({
  score = 0,
  highScore = 0,
  activePowerUp = null,
  soundEnabled = true,
  onToggleSound = () => {},
  isPaused = false,
  isStarted = false,
  isGameOver = false,
  onTogglePause = () => {}
}) {
  return (
    <div className="w-full max-w-lg bg-slate-900/90 border border-slate-700/60 rounded-2xl p-4 shadow-xl backdrop-blur-md mb-4 flex flex-col gap-3">
      {/* Top Bar: Scores & Audio Toggle */}
      <div className="flex items-center justify-between gap-2">
        {/* Current Score */}
        <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-2 flex-1">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Skor
            </div>
            <div className="text-xl font-black text-white leading-tight">
              {score}
            </div>
          </div>
        </div>

        {/* High Score */}
        <div className="flex items-center gap-3 bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-2 flex-1">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              En Yüksek
            </div>
            <div className="text-xl font-black text-amber-400 leading-tight">
              {highScore}
            </div>
          </div>
        </div>

        {/* Quick Controls Buttons */}
        <div className="flex items-center gap-1.5">
          {isStarted && !isGameOver && (
            <button
              onClick={onTogglePause}
              title={isPaused ? 'Devam Et' : 'Duraklat'}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition-all hover:text-white cursor-pointer"
            >
              {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
            </button>
          )}

          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'}`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>
        </div>
      </div>

      {/* Active Power-up Badge */}