import React from 'react';
import { GRID_SIZE, FOOD_TYPES } from './useSnakeGame';
import { Play, Pause, RotateCcw, ShieldAlert, Award } from 'lucide-react';

export default function GameBoard({
  snake,
  direction,
  food,
  obstacles,
  status,
  score,
  highScore,
  onStart,
  onPause,
  onReset
}) {
  const head = snake[0];

  // Gözlerin yönüne göre konumlandırılması
  const getEyeStyles = () => {
    if (direction.x === 1) return 'top-1 right-1 flex-col space-y-1';
    if (direction.x === -1) return 'top-1 left-1 flex-col space-y-1';
    if (direction.y === 1) return 'bottom-1 left-1 flex-row space-x-1';
    return 'top-1 left-1 flex-row space-x-1'; // Default UP
  };

  return (
    <div className="relative aspect-square w-full max-w-[480px] bg-slate-900 border-2 border-slate-700/80 rounded-2xl shadow-2xl shadow-indigo-950/50 p-2 select-none overflow-hidden">
      {/* Grid Izgarası */}
      <div
        className="grid h-full w-full gap-0.5 rounded-lg bg-slate-950/80 p-1 relative"
        style={{
          gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`
        }}
      >
        {/* Arka plan ızgara deseni */}
        {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-900/40 rounded-[2px] transition-colors duration-200"
          />
        ))}

        {/* Engeller (Zor mod) */}
        {obstacles.map((obs, idx) => (
          <div
            key={`obs-${idx}`}
            style={{
              gridColumnStart: obs.x + 1,
              gridRowStart: obs.y + 1
            }}
            className="bg-slate-700 border border-slate-600 rounded-sm shadow-inner flex items-center justify-center animate-pulse"
          >
            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span>
          </div>
        ))}

        {/* Yem (Food) */}
        {food && (
          <div
            style={{
              gridColumnStart: food.x + 1,
              gridRowStart: food.y + 1
            }}
            className="relative flex items-center justify-center z-10"
          >
            <div className={`w-full h-full rounded-full ${food.color} ${food.glow} shadow-lg animate-bounce flex items-center justify-center border border-white/30`}>
              {food.type === FOOD_TYPES.GOLDEN.type && (
                <span className="text-[10px] font-extrabold text-amber-950">★</span>
              )}
              {food.type === FOOD_TYPES.SHRINK.type && (
                <span className="text-[9px] font-bold text-white">-</span>
              )}
              {food.type === FOOD_TYPES.SPEED.type && (
                <span className="text-[9px] font-bold text-black">⚡</span>
              )}
            </div>
          </div>
        )}

        {/* Yılanın Gövdesi ve Kafası */}
        {snake.map((segment, index) => {
          const isHead = index === 0;
          const isTail = index === snake.length - 1;
          const opacity = Math.max(0.4, 1 - index * 0.02);

          return (
            <div
              key={`snake-${index}`}
              style={{
                gridColumnStart: segment.x + 1,
                gridRowStart: segment.y + 1,
                opacity
              }}
              className={`relative rounded-sm transition-all duration-75 ${
                isHead
                  ? 'bg-gradient-to-br from-emerald-400 to-green-600 z-20 shadow-lg shadow-emerald-500/40 rounded-md'
                  : isTail
                  ? 'bg-emerald-600/80 rounded-full scale-90'
                  : 'bg-emerald-500 border border-emerald-400/20 shadow-sm'
              }`}
            >
              {/* Kafada Gözler */}
              {isHead && (
                <div className={`absolute flex items-center justify-around ${getEyeStyles()}`}>
                  <span className="w-1.5 h-1.5 bg-slate-950 rounded-full border border-white/60"></span>
                  <span className="w-1.5 h-1.5 bg-slate-950 rounded-full border border-white/60"></span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Oyuna Başla / Duraklat / Oyun Bitti Overlays */}
      {status === 'idle' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30 transition-all">
          <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mb-4 text-emerald-400 animate-pulse">
            <Play size={32} className="ml-1" />
          </div>
          <h3 className="text-2xl font-black text-white mb-2 tracking-wide">YILAN OYUNU</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-xs">
            Yön tuşları veya WASD ile hareket edin. Yemleri toplayarak büyüyün!
          </p>
          <button
            onClick={onStart}
            className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/30 transform hover:scale-105 transition-all active:scale-95"
          >
            Oyunu Başlat
          </button>
        </div>
      )}

      {status === 'paused' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
          <div className="w-14 h-14 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center mb-3 text-amber-400">
            <Pause size={28} />
          </div>
          <h3 className="text-xl font-bold text-white mb-4">Oyun Duraklatıldı</h3>
          <div className="flex space-x-3">
            <button
              onClick={onStart}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg shadow-md transition-all flex items-center gap-2"
            >
              <Play size={18} /> Devam Et
            </button>
            <button
              onClick={onReset}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-all flex items-center gap-2 border border-slate-700"
            >
              <RotateCcw size={18} /> Yeniden
            </button>
          </div>
        </div>
      )}

      {status === 'gameover' && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 animate-in fade-in zoom-in duration-200">
          <div className="w-14 h-14 bg-rose-500/20 border border-rose-500/40 rounded-full flex items-center justify-center mb-3 text-rose-400">
            <ShieldAlert size={30}