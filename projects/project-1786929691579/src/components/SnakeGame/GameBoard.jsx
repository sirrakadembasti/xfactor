import React from 'react';
import {
  Play,
  RotateCcw,
  Trophy,
  Sparkles,
  Zap,
  Scissors,
  Pause,
  ShieldAlert
} from 'lucide-react';

export default function GameBoard({
  gridSize = 20,
  snake = [],
  food = null,
  specialFood = null,
  obstacles = [],
  direction = { x: 1, y: 0 },
  isGameOver = false,
  isPaused = false,
  isStarted = false,
  score = 0,
  highScore = 0,
  isNewHighScore = false,
  stats = { applesEaten: 0, specialEaten: 0, stepsCount: 0 },
  activePowerUp = null,
  gameMode = 'classic',
  difficulty = 'medium',
  onStart = () => {},
  onRestart = () => {},
  onResume = () => {}
}) {
  const isSnakeSegment = (x, y) => {
    return snake.some((segment) => segment.x === x && segment.y === y);
  };

  const isHead = (x, y) => {
    return snake[0] && snake[0].x === x && snake[0].y === y;
  };

  const isObstacle = (x, y) => {
    return obstacles.some((obs) => obs.x === x && obs.y === y);
  };

  const renderEyeRotation = () => {
    if (direction.x === 1) return 'rotate-90';
    if (direction.x === -1) return '-rotate-90';
    if (direction.y === 1) return 'rotate-180';
    return 'rotate-0';
  };

  return (
    <div className="relative flex flex-col items-center justify-center select-none w-full max-w-lg mx-auto">
      {/* Game Grid Container */}
      <div
        className="relative bg-slate-900/90 backdrop-blur border-4 border-slate-700/60 rounded-2xl p-2 shadow-2xl overflow-hidden w-full aspect-square flex items-center justify-center"
        style={{
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(0, 0, 0, 0.4)'
        }}
      >
        {/* Grid Cells */}
        <div
          className="grid w-full h-full gap-[1px] bg-slate-800/40 rounded-lg overflow-hidden border border-slate-700/40"
          style={{
            gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`
          }}
        >
          {Array.from({ length: gridSize * gridSize }).map((_, index) => {
            const x = index % gridSize;
            const y = Math.floor(index / gridSize);

            const head = isHead(x, y);
            const inSnake = !head && isSnakeSegment(x, y);
            const isRegularFood = food && food.x === x && food.y === y;
            const isSpecFood = specialFood && specialFood.x === x && specialFood.y === y;
            const isObs = isObstacle(x, y);
            const isEvenCell = (x + y) % 2 === 0;

            return (
              <div
                key={`${x}-${y}`}
                className={`relative flex items-center justify-center transition-colors duration-75 ${
                  isEvenCell ? 'bg-slate-800/30' : 'bg-slate-800/60'
                }`}
              >
                {/* Obstacle Block */}
                {isObs && (
                  <div className="w-full h-full bg-slate-600 border border-slate-500 rounded-sm shadow-inner flex items-center justify-center">
                    <div className="w-1/2 h-1/2 bg-slate-700 rounded-xs" />
                  </div>
                )}

                {/* Regular Food (Red Apple) */}
                {isRegularFood && (
                  <div className="relative w-4/5 h-4/5 flex items-center justify-center animate-bounce duration-300">
                    <div className="w-full h-full bg-gradient-to-tr from-red-600 to-rose-400 rounded-full shadow-lg shadow-red-500/50 flex items-center justify-center">
                      <div className="w-2 h-2 bg-rose-200/60 rounded-full absolute top-1 left-1" />
                    </div>
                    <div className="absolute -top-1 right-1/3 w-1.5 h-2 bg-emerald-600 rounded-tr-full transform rotate-12" />
                  </div>
                )}

                {/* Special Food */}
                {isSpecFood && (
                  <div className="relative w-4/5 h-4/5 flex items-center justify-center animate-pulse duration-200">
                    {specialFood.type === 'golden' && (
                      <div className="w-full h-full bg-gradient-to-tr from-amber-500 via-yellow-300 to-amber-200 rounded-full shadow-lg shadow-yellow-500/80 flex items-center justify-center ring-2 ring-yellow-200 ring-offset-1 ring-offset-slate-900">
                        <Sparkles className="w-3 h-3 text-amber-900 animate-spin duration-1000" />
                      </div>
                    )}
                    {specialFood.type === 'speed' && (
                      <div className="w-full h-full bg-gradient-to-tr from-cyan-500 to-blue-400 rounded-full shadow-lg shadow-cyan-500/80 flex items-center justify-center ring-2 ring-cyan-200 ring-offset-1 ring-offset-slate-900">
                        <Zap className="w-3 h-3 text-cyan-950 fill-cyan-100" />
                      </div>
                    )}
                    {specialFood.type === 'shrink' && (
                      <div className="w-full h-full bg-gradient-to-tr from-purple-500 to-indigo-400 rounded-full shadow-lg shadow-purple-500/80 flex items-center justify-center ring-2 ring-purple-200 ring-offset-1 ring-offset-slate-900">
                        <Scissors className="w-3 h-3 text-purple-950 fill-purple-100" />
                      </div>
                    )}
                  </div>
                )}

                {/* Snake Head */}
                {head && (
                  <div
                    className={`relative w-full h-full rounded-md shadow-md bg-gradient-to-br from-emerald-400 to-emerald-600 border border-emerald-300 flex items-center justify-between p-0.5 transform transition-transform ${renderEyeRotation()}`}
                  >
                    <div className="w-1.5 h-1.5 bg-slate-900 rounded-full flex items-center justify-center">
                      <div className="w-0.5 h-0.5 bg-white rounded-full" />
                    </div>
                    <div className="w-1.5 h-1.5 bg-slate-900 rounded-full flex items-center justify-center">
                      <div className="w-0.5 h-0.5 bg-white rounded-full" />
                    </div>
                  </div>
                )}

                {/* Snake Body Segment */}
                {inSnake && (
                  <div className="w-[90%] h-[90%] bg-gradient-to-br from-emerald-500 to-teal-600 rounded-sm shadow-sm border border-emerald-400/30 flex items-center justify-center">
                    <div className="w-1/3 h-1/3 bg-emerald-300/30 rounded-full" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overlay 1: Game Ready / Start Screen */}
        {!isStarted && !isGameOver && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-fadeIn">
            <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full flex items-center justify-center mb-4 ring-8 ring-emerald-500/5">
              <Play className="w-10 h-10 text-emerald-400 fill-emerald-400 ml-1" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-wide mb-2">
              YILAN OYUNU
            </h2>
            <p className="text-slate-400 text-sm max-w-xs mb-6">
              Yön tuşları, WASD veya ekrandaki butonları kullanarak elmalari topla!
            </p>
            <button
              onClick={onStart}
              className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 text-base cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              Oyunu Başlat
            </button>
          </div>
        )}

        {/* Overlay 2: Paused Overlay */}
        {isStarted && isPaused && !isGameOver && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20 animate-fadeIn">
            <div className="w-16 h-16 bg-amber-500/10 border-2 border-amber-500/30 rounded-full flex items-center justify-center mb-4 ring-8 ring-amber-500/5">
              <Pause className="w-8 h-8 text-amber-400 fill-amber-400" />
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-wider mb-2">
              OYUN DURAKLATILDI
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Devam etmek için butona tıklayın veya [BOŞLUK] tuşuna basın.
            </p>
            <button
              onClick={onResume}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transform hover:-translate-y-0.5 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              Devam Et
            </button>
          </div>
        )}

        {/* Overlay 3: Game Over Overlay (Eksiksiz Tamamlanan Katman) */}
        {isGameOver && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 animate-fadeIn">
            {/* Header Icon */}
            <div className="w-16 h-16 bg-rose-500/10 border-2 border-rose-500/30 rounded-full flex items-center justify-center mb-3 ring-8 ring-rose-500/5 animate-pulse">
              <ShieldAlert className="w-8 h-8 text-rose-500" />
            </div>

            {/* Game Over Title */}
            <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-red-500 to-orange-400 tracking-tight mb-1 uppercase">
              Oyun Bitti
            </h2>
            <p className="text-slate-400 text-xs font-medium mb-4 uppercase tracking-widest">
              {gameMode === 'classic' ? 'Klasik Mod' : gameMode === 'portal' ? 'Duvar Geçiş Modu' : 'Engelli Mod'} • {difficulty.toUpperCase()}
            </p>

            {/* New High Score Banner */}
            {isNewHighScore && (
              <div className="mb-4 px-4 py-1.5 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center gap-1.5 text-amber-300 text-xs font-bold animate-bounce">
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400" />
                YENİ EN YÜKSEK SKOR!
              </div>
            )}

            {/* Score Stats Box */}
            <div className="w-full max-w-xs bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 mb-6 shadow-inner space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 font-medium">Toplam Skor:</span>
                <span className="text-2xl font-extrabold text-emerald-400">{score}</span>
              </div>
              <div className="h-px bg-slate-800 w-full" />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> En Yüksek Skor:
                </span>
                <span className="font-bold text-slate-200">{highScore}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Yenen Elmala r:</span>
                <span className="font-bold text-slate-200">{stats.applesEaten}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Özel Yemler:</span>
                <span className="font-bold text-slate-200">{stats.specialEaten}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Toplam Adım:</span>
                <span className="font-bold text-slate-200">{stats.stepsCount}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <button
                onClick={onRestart}
                className="flex-1 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Tekrar Oyna
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
