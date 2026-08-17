import React from 'react';

export default function StatsModal({ isOpen, onClose, stats, solution, isGameOver, onRestart }) {
  if (!isOpen) return null;

  const winPercentage = stats.gamesPlayed > 0
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
    : 0;

  const maxDistribution = Math.max(...Object.values(stats.guessDistribution), 1);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl font-bold p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          ✕
        </button>

        <h2 className="text-2xl font-black text-center mb-6 text-emerald-400 uppercase tracking-wider">
          İstatistikler
        </h2>

        {/* Genel İstatistik Kutusudur */}
        <div className="grid grid-cols-4 gap-2 text-center mb-8 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
          <div>
            <div className="text-2xl font-extrabold text-white">{stats.gamesPlayed}</div>
            <div className="text-xs text-slate-400 mt-1">Oynanan</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-400">{winPercentage}%</div>
            <div className="text-xs text-slate-400 mt-1">Kazanma</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-400">{stats.currentStreak}</div>
            <div className="text-xs text-slate-400 mt-1">Seri</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-purple-400">{stats.maxStreak}</div>
            <div className="text-xs text-slate-400 mt-1">Maks Seri</div>
          </div>
        </div>

        {/* Tahmin Dağılımı Grafiği */}
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
          Tahmin Dağılımı
        </h3>
        <div className="space-y-2 mb-6">
          {[1, 2, 3, 4, 5, 6].map((num) => {
            const count = stats.guessDistribution[num] || 0;
            const widthPercentage = Math.max((count / maxDistribution) * 100, 8);

            return (
              <div key={num} className="flex items-center gap-2 text-xs">
                <span className="w-3 font-bold text-slate-400">{num}</span>
                <div className="flex-1 bg-slate-800/80 rounded-md overflow-hidden h-6 flex items-center p-1">
                  <div
                    className={`h-full rounded text-right pr-2 flex items-center justify-end font-bold text-white transition-all duration-500 ${
                      count > 0 ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                    style={{ width: `${widthPercentage}%` }}
                  >
                    {count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Oyun Sonu Bilgisi ve Yeni Oyun Butonu */}
        {isGameOver && (
          <div className="mt-6 border-t border-slate-800 pt-4 flex flex-col items-center gap-3">
            <div className="text-center">
              <span className="text-xs text-slate-400 block">GİZLİ KELİME:</span>
              <span className="text-xl font-black text-amber-400 tracking-widest">{solution}</span>
            </div>
            <button
              onClick={onRestart}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl text-white transition-all transform active:scale-95 shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
            >
              <span>🔄</span> Yeni Oyun Başlat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
